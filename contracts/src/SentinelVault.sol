// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20}          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/// @notice CRE consumer contract interface — KeystoneForwarder calls onReport()
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @notice Aave V3 Pool — subset used by SentinelVault
interface IAaveV3Pool {
    function getUserAccountData(address user) external view returns (
        uint256 totalCollateralBase,
        uint256 totalDebtBase,
        uint256 availableBorrowsBase,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    );
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external;
}

/// @notice Uniswap V3 SwapRouter exactInputSingle — also implemented by SimpleMockDEX
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Chainlink V3 aggregator — minimal subset for ETH/USD price reads
interface AggregatorV3Interface {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SentinelVault
// ─────────────────────────────────────────────────────────────────────────────

/// @title  SentinelVault — Per-chain CRE receiver + Aave position manager
/// @notice Deployed once per chain. KeystoneForwarder (or owner for testing) calls
///         onReport() with ABI-encoded (action, riskScore, healthFactor, timestamp).
///         Vault executes the protective action atomically:
///           EMERGENCY_EXIT → withdraw collateral + swap to USDC + repay all debt
///           DELEVERAGE     → withdraw 50 % of safe collateral + swap + repay
///           REBALANCE      → withdraw 25 % of safe collateral + swap + repay
///           HOLD           → no-op, log only
///
/// @dev    Swap fallback: if the swap router reverts (e.g. no Uniswap liquidity on testnet),
///         the withdrawal is held as WETH in the vault — the tx never reverts.
///         Pass address(0) for _swapRouter to skip swaps entirely.
///
/// Cross-chain: each chain gets its own vault instance. CRE workflow calls
///   writeReport() on each chain's vault independently. No cross-chain messaging
///   inside this contract is needed.
contract SentinelVault is IReceiver, ReentrancyGuard {

    // ──────────────────────────────────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────────────────────────────────

    uint256 private constant MAX_UINT             = type(uint256).max;
    uint256 private constant VARIABLE_RATE        = 2;     // Aave variable borrow mode
    uint24  private constant UNISWAP_FEE          = 3000;  // 0.3 % fee tier (WETH/USDC pool)
    uint256 private constant PRICE_FEED_STALENESS = 3600;  // 1 hour — max acceptable Chainlink answer age

    // ──────────────────────────────────────────────────────────────────────────
    // Immutable — set once at deploy time per chain
    // ──────────────────────────────────────────────────────────────────────────

    IAaveV3Pool            public immutable AAVE_POOL;
    ISwapRouter            public immutable SWAP_ROUTER;        // Uniswap V3 SwapRouter or SimpleMockDEX
    AggregatorV3Interface  public immutable PRICE_FEED;         // Chainlink ETH/USD feed; address(0) = manual only
    address                public immutable WETH;
    address                public immutable USDC;
    uint256                public immutable DEPLOYED_CHAIN_ID;

    // ──────────────────────────────────────────────────────────────────────────
    // Mutable state
    // ──────────────────────────────────────────────────────────────────────────

    address public owner;
    address public pendingOwner;
    /// @notice KeystoneForwarder address authorised to call onReport().
    ///         Set to address(0) to allow only the owner (useful for local testing).
    address public forwarder;

    /// @notice ETH price in USD used to convert Aave base-unit collateral → WETH.
    ///         Aave base units = 8-decimal USD, so: wethAmount = baseUnits * 1e10 / ethPriceUsd.
    ///         Update with setEthPriceUsd() when market price drifts significantly.
    uint256 public ethPriceUsd = 3_000;      // ETH price in USD (admin-updated)
    uint256 public maxSlippageBps = 500;     // Max swap slippage in basis pts (default 5%)

    // ──────────────────────────────────────────────────────────────────────────
    // Audit log
    // ──────────────────────────────────────────────────────────────────────────

    struct ActionLog {
        string  action;
        uint256 riskScore;
        uint256 healthFactorBefore;  // 1e18 = HF of 1.0
        uint256 healthFactorAfter;
        uint256 swappedWeth;         // WETH sent to router
        uint256 receivedUsdc;        // USDC received from router (0 if swap skipped)
        uint256 repaidUsdc;          // USDC repaid to Aave
        uint256 withdrawnWeth;       // WETH withdrawn from Aave
        uint256 timestamp;
        bool    swapSucceeded;
    }

    ActionLog[] public actionLogs;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    event ReportReceived(bytes metadata, bytes report, uint256 timestamp);

    event ActionExecuted(
        uint256 indexed logId,
        string  action,
        uint256 riskScore,
        uint256 hfBefore,
        uint256 hfAfter,
        uint256 swappedWeth,
        uint256 receivedUsdc,
        uint256 repaidUsdc,
        uint256 withdrawnWeth,
        bool    swapSucceeded,
        uint256 timestamp
    );

    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice Emitted when swap is skipped (router = address(0), zero amount, or swap revert)
    event SwapSkipped(address tokenIn, uint256 amountIn, string reason);

    event ForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);
    event EthPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event SlippageUpdated(uint256 bps);

    // ──────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    /// @dev Accepts calls from owner (direct testing) or the registered KeystoneForwarder
    modifier onlyAuthorized() {
        _onlyAuthorized();
        _;
    }

    function _onlyOwner() internal view {
        require(msg.sender == owner, "SentinelVault: not owner");
    }

    function _onlyAuthorized() internal view {
        require(
            msg.sender == owner ||
            (forwarder != address(0) && msg.sender == forwarder),
            "SentinelVault: caller not authorized"
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    /// @param _aavePool    Aave V3 Pool on this chain
    /// @param _swapRouter  Uniswap V3 SwapRouter or SimpleMockDEX; pass address(0) to skip swaps
    /// @param _weth        WETH token on this chain
    /// @param _usdc        USDC token on this chain
    /// @param _forwarder   CRE KeystoneForwarder; pass address(0) to allow only owner calls
    /// @param _priceFeed   Chainlink ETH/USD AggregatorV3; pass address(0) to use manual ethPriceUsd only
    constructor(
        address _aavePool,
        address _swapRouter,
        address _weth,
        address _usdc,
        address _forwarder,
        address _priceFeed
    ) {
        require(_aavePool != address(0), "SentinelVault: zero aavePool");
        require(_weth     != address(0), "SentinelVault: zero weth");
        require(_usdc     != address(0), "SentinelVault: zero usdc");

        AAVE_POOL        = IAaveV3Pool(_aavePool);
        SWAP_ROUTER      = ISwapRouter(_swapRouter);
        PRICE_FEED       = AggregatorV3Interface(_priceFeed);
        WETH             = _weth;
        USDC             = _usdc;
        forwarder        = _forwarder;
        owner            = msg.sender;
        DEPLOYED_CHAIN_ID = block.chainid;

        // Pre-approve Aave pool
        IERC20(_weth).approve(_aavePool, MAX_UINT);
        IERC20(_usdc).approve(_aavePool, MAX_UINT);

        // Pre-approve swap router if set
        if (_swapRouter != address(0)) {
            IERC20(_weth).approve(_swapRouter, MAX_UINT);
            IERC20(_usdc).approve(_swapRouter, MAX_UINT);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CRE RECEIVER — IReceiver
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Entry point called by KeystoneForwarder (or owner for testing).
    /// @param metadata  Forwarder metadata (workflow ID, DON ID, report ID…)
    /// @param report    ABI-encoded: (string action, uint256 riskScore, uint256 healthFactor, uint256 timestamp)
    function onReport(
        bytes calldata metadata,
        bytes calldata report
    ) external override onlyAuthorized nonReentrant {

        emit ReportReceived(metadata, report, block.timestamp);

        // Decode CRE report — healthFactor and reportTs from the report are intentionally
        // ignored: the vault reads live HF from Aave for accuracy, and uses block.timestamp.
        string  memory action;
        uint256        riskScore;
        (action, riskScore, , ) = abi.decode(report, (string, uint256, uint256, uint256));

        (, , , , , uint256 hfBefore) = AAVE_POOL.getUserAccountData(address(this));

        uint256 swappedWeth;
        uint256 receivedUsdc;
        uint256 repaidUsdc;
        uint256 withdrawnWeth;
        bool    swapOk;

        // Hash once; compare against compile-time keccak256 string literals.
        // Using inline assembly avoids the intermediate bytes(action) allocation.
        bytes32 h;
        assembly {
            h := keccak256(add(action, 32), mload(action))
        }

        if (h == keccak256("EMERGENCY_EXIT")) {
            (repaidUsdc, withdrawnWeth, swapOk) = _emergencyExit();
        } else if (h == keccak256("DELEVERAGE")) {
            (swappedWeth, receivedUsdc, repaidUsdc, withdrawnWeth, swapOk) = _deleverage(50);
        } else if (h == keccak256("REBALANCE")) {
            (swappedWeth, receivedUsdc, repaidUsdc, withdrawnWeth, swapOk) = _deleverage(25);
        } else if (h == keccak256("SWAP_TO_STABLE")) {
            (swappedWeth, receivedUsdc, withdrawnWeth, swapOk) = _swapCollateralToStable(30);
        }
        // HOLD → no-op, emit event with zero amounts

        (, , , , , uint256 hfAfter) = AAVE_POOL.getUserAccountData(address(this));

        uint256 id = actionLogs.length;
        actionLogs.push(ActionLog({
            action:             action,
            riskScore:          riskScore,
            healthFactorBefore: hfBefore,
            healthFactorAfter:  hfAfter,
            swappedWeth:        swappedWeth,
            receivedUsdc:       receivedUsdc,
            repaidUsdc:         repaidUsdc,
            withdrawnWeth:      withdrawnWeth,
            timestamp:          block.timestamp,
            swapSucceeded:      swapOk
        }));

        emit ActionExecuted(
            id, action, riskScore,
            hfBefore, hfAfter,
            swappedWeth, receivedUsdc, repaidUsdc, withdrawnWeth,
            swapOk, block.timestamp
        );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PROTECTIVE ACTIONS (internal)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Full exit: repay as much debt as possible, then withdraw remaining collateral.
    ///         If swap fails, the withdrawn WETH stays in the vault (no revert).
    function _emergencyExit() internal returns (
        uint256 totalRepaid,
        uint256 totalWithdrawn,
        bool    anySwapOk
    ) {
        (, uint256 totalDebtBase, , , , ) = AAVE_POOL.getUserAccountData(address(this));

        if (totalDebtBase > 0) {
            // Pass 1: use any WETH already sitting in the vault
            uint256 wethBal = IERC20(WETH).balanceOf(address(this));
            if (wethBal > 0) {
                (uint256 usdcOut, bool ok) = _trySwap(WETH, USDC, wethBal);
                if (ok) { anySwapOk = true; totalRepaid += _repayDebt(usdcOut); }
            }

            // Pass 2: withdraw safe collateral, swap, repay
            (, totalDebtBase, , , , ) = AAVE_POOL.getUserAccountData(address(this));
            if (totalDebtBase > 0) {
                uint256 safeAmount = _safeWithdrawAmount(80);
                if (safeAmount > 0) {
                    uint256 got = AAVE_POOL.withdraw(WETH, safeAmount, address(this));
                    totalWithdrawn += got;
                    (uint256 usdcOut, bool ok) = _trySwap(WETH, USDC, got);
                    if (ok) { anySwapOk = true; totalRepaid += _repayDebt(usdcOut); }
                }
            }

            // Pass 3: drain remaining collateral regardless of debt status.
            (, totalDebtBase, , , , ) = AAVE_POOL.getUserAccountData(address(this));
            if (totalDebtBase == 0) {
                // Debt fully cleared — withdraw everything that remains.
                uint256 rest = AAVE_POOL.withdraw(WETH, MAX_UINT, address(this));
                totalWithdrawn += rest;
            } else {
                // Swap(s) failed — debt remains.  Drain 100 % of what Aave still
                // allows (HF ≥ 1.2 enforced by _safeWithdrawAmount) so the vault
                // holds maximum WETH for the next CRE-triggered retry.
                uint256 remainder = _safeWithdrawAmount(100);
                if (remainder > 0) {
                    uint256 got = AAVE_POOL.withdraw(WETH, remainder, address(this));
                    totalWithdrawn += got;
                }
            }
        } else {
            // No debt — withdraw everything
            totalWithdrawn = AAVE_POOL.withdraw(WETH, MAX_UINT, address(this));
            anySwapOk = true; // trivially succeeded (no swap needed)
        }
    }

    /// @notice Withdraw `percent` % of safe collateral, swap to USDC, repay debt.
    ///         If swap fails, WETH stays in vault (no revert).
    function _deleverage(uint256 percent) internal returns (
        uint256 swapIn,
        uint256 swapOut,
        uint256 repaid,
        uint256 withdrawn,
        bool    swapOk
    ) {
        uint256 safeAmount = _safeWithdrawAmount(percent);
        if (safeAmount == 0) return (0, 0, 0, 0, false);

        withdrawn = AAVE_POOL.withdraw(WETH, safeAmount, address(this));
        swapIn    = withdrawn;

        (swapOut, swapOk) = _trySwap(WETH, USDC, withdrawn);
        if (swapOut > 0) repaid = _repayDebt(swapOut);
        // If swap failed: withdrawn WETH held in vault, repaid = 0
    }

    /// @notice Withdraw `percent` % of safe collateral and swap to USDC (no debt repay).
    function _swapCollateralToStable(uint256 percent) internal returns (
        uint256 swapIn,
        uint256 swapOut,
        uint256 withdrawn,
        bool    swapOk
    ) {
        uint256 safeAmount = _safeWithdrawAmount(percent);
        if (safeAmount == 0) return (0, 0, 0, false);

        withdrawn = AAVE_POOL.withdraw(WETH, safeAmount, address(this));
        swapIn    = withdrawn;

        (swapOut, swapOk) = _trySwap(WETH, USDC, withdrawn);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SWAP — graceful fallback
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Attempt swap via SWAP_ROUTER. If it reverts (e.g. no liquidity on testnet),
    ///         emit SwapSkipped and return (0, false) — the vault holds tokenIn instead.
    function _trySwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut, bool success) {
        if (address(SWAP_ROUTER) == address(0)) {
            emit SwapSkipped(tokenIn, amountIn, "no router configured - holding WETH");
            return (0, false);
        }
        if (amountIn == 0) {
            emit SwapSkipped(tokenIn, amountIn, "zero amount");
            return (0, false);
        }

        // MEV slippage guard: floor = ethPriceUsd-derived expected output × (1 − maxSlippageBps).
        // Only applied for WETH→USDC (the only swap this vault performs).
        // ethPriceUsd is 8-dec-agnostic integer; WETH 18-dec → USDC 6-dec requires /1e12.
        uint256 minOut = 0;
        if (tokenIn == WETH && tokenOut == USDC) {
            uint256 expectedOut = (amountIn * _getEthPriceUsd()) / 1e12;
            minOut = (expectedOut * (10_000 - maxSlippageBps)) / 10_000;
        }

        ISwapRouter.ExactInputSingleParams memory p = ISwapRouter.ExactInputSingleParams({
            tokenIn:           tokenIn,
            tokenOut:          tokenOut,
            fee:               UNISWAP_FEE,
            recipient:         address(this),
            deadline:          block.timestamp + 300,
            amountIn:          amountIn,
            amountOutMinimum:  minOut,               // MEV sandwich guard (see above)
            sqrtPriceLimitX96: 0
        });

        try SWAP_ROUTER.exactInputSingle(p) returns (uint256 out) {
            amountOut = out;
            success   = true;
            emit SwapExecuted(tokenIn, tokenOut, amountIn, out);
        } catch {
            // Swap failed — WETH remains in vault; tx does NOT revert
            emit SwapSkipped(tokenIn, amountIn, "swap reverted - holding WETH in vault");
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // AAVE HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Returns ETH price as a plain USD integer (e.g. 3000).
    ///         Prefers live Chainlink feed; falls back to admin-set ethPriceUsd when:
    ///         - no feed configured (address(0))
    ///         - answer is non-positive
    ///         - data is stale (> PRICE_FEED_STALENESS seconds old)
    ///         - feed call reverts (e.g. Tenderly fork without oracle)
    function _getEthPriceUsd() internal view returns (uint256) {
        if (address(PRICE_FEED) == address(0)) return ethPriceUsd;
        try PRICE_FEED.latestRoundData() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            if (answer > 0 && block.timestamp - updatedAt <= PRICE_FEED_STALENESS) {
                // forge-lint: disable-next-line(unsafe-typecast)
                return uint256(answer) / 1e8;  // 8-dec Chainlink answer → plain integer USD
            }
        } catch {}
        return ethPriceUsd;  // manual fallback
    }

    /// @notice Compute the maximum WETH that can be withdrawn while keeping HF >= 1.2.
    /// @dev    Aave base units are 8-decimal USD. Conversion: weth = base * 1e10 / ethPriceUsd.
    ///         `percent` applies to the available (above-minimum) collateral.
    function _safeWithdrawAmount(uint256 percent) internal view returns (uint256) {
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            uint256 currentLiqThreshold,
            ,
        ) = AAVE_POOL.getUserAccountData(address(this));

        if (totalCollateralBase == 0) return 0;
        if (totalDebtBase == 0)       return MAX_UINT; // no debt → full withdrawal safe

        // Minimum collateral to keep HF >= 1.2
        // HF = (collateral * liqThreshold/10000) / debt  =>  minCollateral = debt * 12000 / liqThreshold
        uint256 minCollateral = (totalDebtBase * 12_000) / currentLiqThreshold;
        if (totalCollateralBase <= minCollateral) return 0;

        uint256 available    = totalCollateralBase - minCollateral;
        uint256 withdrawBase = (available * percent) / 100;

        // Convert from Aave base (8-dec USD) to WETH (18-dec)
        // withdrawBase [USD, 8 dec] / ethPriceUsd [USD] = WETH [1, 8 dec] → * 1e10 → WETH [18 dec]
        return (withdrawBase * 1e10) / _getEthPriceUsd();
    }

    /// @notice Repay Aave variable-rate USDC debt. Returns actual amount repaid.
    function _repayDebt(uint256 usdcAmount) internal returns (uint256 repaid) {
        if (usdcAmount == 0) return 0;
        repaid = AAVE_POOL.repay(USDC, usdcAmount, VARIABLE_RATE, address(this));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // POSITION MANAGEMENT (owner only — for setup and testing)
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Supply WETH as collateral into Aave on behalf of this vault.
    ///         Requires WETH to already be held by this contract (transfer first).
    ///         MAX_UINT approval for AAVE_POOL is set in the constructor — do not re-approve here.
    function supplyToAave(uint256 amount) external onlyOwner {
        AAVE_POOL.supply(WETH, amount, address(this), 0);
    }

    /// @notice Borrow USDC from Aave (variable rate) on behalf of this vault
    function borrowFromAave(uint256 amount) external onlyOwner {
        AAVE_POOL.borrow(USDC, amount, VARIABLE_RATE, 0, address(this));
    }

    /// @notice Withdraw WETH collateral from Aave back to this vault.
    ///         Used by demo scripts to lower the health factor without relying on borrow limits.
    ///         Pass type(uint256).max to withdraw all available collateral.
    function withdrawCollateralFromAave(uint256 wethAmount) external onlyOwner {
        AAVE_POOL.withdraw(WETH, wethAmount, address(this));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Update the CRE KeystoneForwarder address.
    ///         Set to address(0) to restrict onReport() to owner only (testing mode).
    function setForwarder(address _forwarder) external onlyOwner {
        emit ForwarderUpdated(forwarder, _forwarder);
        forwarder = _forwarder;
    }

    /// @notice Update the ETH price assumption used in _safeWithdrawAmount.
    ///         Must be called if ETH price moves >20 % from current setting.
    function setEthPriceUsd(uint256 _price) external onlyOwner {
        require(_price > 0, "SentinelVault: invalid price");
        emit EthPriceUpdated(ethPriceUsd, _price);
        ethPriceUsd = _price;
    }

    /// @notice Update the maximum swap slippage tolerance.
    /// @param bps Basis points (100 = 1%). Hard cap at 5000 (50%) as sanity guard.
    function setMaxSlippage(uint256 bps) external onlyOwner {
        require(bps <= 5000, "SentinelVault: slippage > 50%");
        maxSlippageBps = bps;
        emit SlippageUpdated(bps);
    }

    /// @notice Re-approve swap router and Aave pool (useful if approvals were consumed)
    function refreshApprovals() external onlyOwner {
        IERC20(WETH).approve(address(AAVE_POOL), MAX_UINT);
        IERC20(USDC).approve(address(AAVE_POOL), MAX_UINT);
        if (address(SWAP_ROUTER) != address(0)) {
            IERC20(WETH).approve(address(SWAP_ROUTER), MAX_UINT);
            IERC20(USDC).approve(address(SWAP_ROUTER), MAX_UINT);
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SentinelVault: zero address");
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "SentinelVault: not pending owner");
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // VIEW
    // ══════════════════════════════════════════════════════════════════════════

    /// @notice Current Aave position for this vault
    function getPosition() external view returns (
        uint256 totalCollateralBase,
        uint256 totalDebtBase,
        uint256 availableBorrowsBase,
        uint256 currentLiqThreshold,
        uint256 ltv,
        uint256 healthFactor
    ) {
        return AAVE_POOL.getUserAccountData(address(this));
    }

    function getLog(uint256 id) external view returns (ActionLog memory) {
        require(id < actionLogs.length, "SentinelVault: invalid log ID");
        return actionLogs[id];
    }

    function getLatestLog() external view returns (ActionLog memory) {
        require(actionLogs.length > 0, "SentinelVault: no logs yet");
        return actionLogs[actionLogs.length - 1];
    }

    function getBalances() external view returns (uint256 wethBal, uint256 usdcBal, uint256 ethBal) {
        wethBal = IERC20(WETH).balanceOf(address(this));
        usdcBal = IERC20(USDC).balanceOf(address(this));
        ethBal  = address(this).balance;
    }

    /// @notice Allow vault to receive plain ETH (e.g. from WETH.withdraw)
    receive() external payable {}
}
