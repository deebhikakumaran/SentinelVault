// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SentinelVault}    from "../src/SentinelVault.sol";
import {SimpleMockDEX}    from "../src/SimpleMockDEX.sol";
import {SentinelRegistry} from "../src/SentinelRegistry.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal ERC-20 mock (no external dependencies, fully controllable in tests)
// ─────────────────────────────────────────────────────────────────────────────
contract MockERC20 {
    string  public name;
    string  public symbol;
    uint8   public decimals;
    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _dec) {
        name = _name; symbol = _symbol; decimals = _dec;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply    += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MockERC20: bal");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "MockERC20: bal");
        if (allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "MockERC20: allowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Aave V3 Pool mock
// ─────────────────────────────────────────────────────────────────────────────
contract MockAavePool {
    uint256 public totalCollateralBase;
    uint256 public totalDebtBase;
    uint256 public currentLiqThreshold = 8500; // 85 %
    uint256 public healthFactor;

    address public weth;
    address public usdc;

    constructor(address _weth, address _usdc) { weth = _weth; usdc = _usdc; }

    function setPosition(uint256 col, uint256 debt, uint256 liq, uint256 hf) external {
        totalCollateralBase = col;
        totalDebtBase       = debt;
        currentLiqThreshold = liq;
        healthFactor        = hf;
    }

    function getUserAccountData(address) external view returns (
        uint256, uint256, uint256, uint256, uint256, uint256
    ) {
        return (totalCollateralBase, totalDebtBase, 0, currentLiqThreshold, 6500, healthFactor);
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        uint256 bal = MockERC20(asset).balanceOf(address(this));
        if (amount == type(uint256).max) amount = bal;
        if (amount > bal) amount = bal;
        MockERC20(asset).transfer(to, amount);
        uint256 reduced = (amount * 3_000) / 1e10;
        totalCollateralBase = totalCollateralBase > reduced ? totalCollateralBase - reduced : 0;
        return amount;
    }

    function repay(address asset, uint256 amount, uint256, address) external returns (uint256) {
        MockERC20(asset).transferFrom(msg.sender, address(this), amount);
        totalDebtBase = totalDebtBase > amount ? totalDebtBase - amount : 0;
        return amount;
    }

    function supply(address asset, uint256 amount, address, uint16) external {
        MockERC20(asset).transferFrom(msg.sender, address(this), amount);
        totalCollateralBase += (amount * 3_000) / 1e10;
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address onBehalfOf) external {
        MockERC20(asset).transfer(onBehalfOf, amount);
        totalDebtBase += amount;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SentinelVault — unit tests (no fork, fully mocked)
// ─────────────────────────────────────────────────────────────────────────────
contract SentinelVaultTest is Test {

    // Contracts under test
    SentinelVault vault;
    SimpleMockDEX dex;
    MockAavePool  aave;
    MockERC20     weth;
    MockERC20     usdc;

    // Test actors
    address owner     = address(this);
    address forwarder = makeAddr("forwarder");
    address attacker  = makeAddr("attacker");

    // Position in Aave base units (8-dec USD)
    uint256 constant COL_USD = 600_000_000_000; // $6 000
    uint256 constant DEBT_USD = 100_000_000_000; // $1 000
    uint256 constant LIQ_THR  = 8500;            // 85 %
    uint256 constant HF_HEALTHY = 5_100_000_000_000_000_000; // 5.1

    // Events (redeclared here so emit compiles in test context)
    event ActionExecuted(
        uint256 indexed logId, string action, uint256 riskScore,
        uint256 hfBefore, uint256 hfAfter,
        uint256 swappedWeth, uint256 receivedUsdc, uint256 repaidUsdc,
        uint256 withdrawnWeth, bool swapSucceeded, uint256 timestamp
    );
    event SwapSkipped(address tokenIn, uint256 amountIn, string reason);
    event ForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);
    event EthPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event SlippageUpdated(uint256 bps);

    // ── helpers ─────────────────────────────────────────────────────────────

    function _report(string memory action, uint256 score) internal view returns (bytes memory) {
        return abi.encode(action, score, HF_HEALTHY, block.timestamp);
    }

    // ── setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        usdc = new MockERC20("USD Coin",      "USDC",  6);
        aave = new MockAavePool(address(weth), address(usdc));
        dex  = new SimpleMockDEX();

        // DEX: 3 000 USDC per 1 WETH
        dex.setRate(address(weth), address(usdc), 3_000 * 1e6);

        // Fund the DEX with USDC liquidity (so swaps succeed)
        usdc.mint(address(dex), 100_000e6);

        // Fund mock Aave pool with WETH (vault withdraws from here)
        weth.mint(address(aave), 100 ether);
        usdc.mint(address(aave), 100_000e6);

        // Deploy vault (owner = address(this), no forwarder yet, no price feed)
        vault = new SentinelVault(
            address(aave),
            address(dex),
            address(weth),
            address(usdc),
            address(0),   // forwarder
            address(0)    // price feed
        );

        // Set a healthy position
        aave.setPosition(COL_USD, DEBT_USD, LIQ_THR, HF_HEALTHY);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. DELEVERAGE: withdraws WETH, swaps, repays debt
    // ─────────────────────────────────────────────────────────────────────────

    function testOnReportDeleverage() public {
        vault.onReport(bytes(""), _report("DELEVERAGE", 75));

        SentinelVault.ActionLog memory log = vault.getLatestLog();
        assertEq(log.action,    "DELEVERAGE");
        assertEq(log.riskScore, 75);
        assertTrue(log.swapSucceeded,    "swap should succeed with funded DEX");
        assertGt(log.withdrawnWeth, 0,   "should withdraw WETH from Aave");
        assertGt(log.repaidUsdc, 0,      "should repay USDC debt");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. EMERGENCY_EXIT: drains collateral, swaps, repays
    // ─────────────────────────────────────────────────────────────────────────

    function testOnReportEmergencyExit() public {
        vault.onReport(bytes(""), _report("EMERGENCY_EXIT", 90));

        SentinelVault.ActionLog memory log = vault.getLatestLog();
        assertEq(log.action,    "EMERGENCY_EXIT");
        assertTrue(log.swapSucceeded || log.withdrawnWeth > 0, "should have acted");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Swap fallback: zero router → SwapSkipped, tx does NOT revert
    // ─────────────────────────────────────────────────────────────────────────

    function testSwapFallback() public {
        // Vault with no DEX
        SentinelVault noSwap = new SentinelVault(
            address(aave), address(0), address(weth), address(usdc), address(0), address(0)
        );

        // Expect at least one SwapSkipped event
        vm.expectEmit(false, false, false, false, address(noSwap));
        emit SwapSkipped(address(weth), 0, "");

        noSwap.onReport(bytes(""), _report("DELEVERAGE", 75));

        SentinelVault.ActionLog memory log = noSwap.getLatestLog();
        assertFalse(log.swapSucceeded, "swap must not succeed without router");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. _safeWithdrawAmount keeps HF ≥ 1.2 (indirectly via withdrawal size)
    // ─────────────────────────────────────────────────────────────────────────

    function testSafeWithdrawAmount() public {
        // Tighter position: $3 000 col, $1 500 debt, HF ≈ 1.7
        aave.setPosition(300_000_000_000, 150_000_000_000, LIQ_THR, 1_700_000_000_000_000_000);

        vault.onReport(bytes(""), _report("DELEVERAGE", 70));

        SentinelVault.ActionLog memory log = vault.getLatestLog();
        assertGt(log.withdrawnWeth, 0, "safe amount should be > 0");
        assertGt(log.repaidUsdc, 0,    "debt should be partially repaid");

        // Verify no collateral was over-drawn (mock's totalCollateralBase should still > 0)
        (uint256 colAfter,,,,, ) = aave.getUserAccountData(address(vault));
        assertGt(colAfter, 0, "collateral should remain (HF guard)");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Access control: only owner or forwarder can call onReport()
    // ─────────────────────────────────────────────────────────────────────────

    function testOnlyForwarderOrOwner() public {
        bytes memory r = _report("HOLD", 10);

        // Attacker is rejected
        vm.prank(attacker);
        vm.expectRevert("SentinelVault: caller not authorized");
        vault.onReport(bytes(""), r);

        // After setting forwarder, forwarder is accepted
        vault.setForwarder(forwarder);
        vm.prank(forwarder);
        vault.onReport(bytes(""), r);

        // Owner is always accepted
        vault.onReport(bytes(""), r);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. HOLD action: no-op, logs correctly
    // ─────────────────────────────────────────────────────────────────────────

    function testHoldAction() public {
        vault.onReport(bytes(""), _report("HOLD", 20));

        SentinelVault.ActionLog memory log = vault.getLatestLog();
        assertEq(log.action,       "HOLD");
        assertEq(log.withdrawnWeth, 0);
        assertEq(log.repaidUsdc,    0);
        assertFalse(log.swapSucceeded);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. REBALANCE (25 %) withdraws less than DELEVERAGE (50 %)
    // ─────────────────────────────────────────────────────────────────────────

    function testRebalanceWithdrawsLessThanDeleverage() public {
        vault.onReport(bytes(""), _report("DELEVERAGE", 75));
        uint256 delevWeth = vault.getLatestLog().withdrawnWeth;

        aave.setPosition(COL_USD, DEBT_USD, LIQ_THR, HF_HEALTHY);

        vault.onReport(bytes(""), _report("REBALANCE", 55));
        uint256 rebalWeth = vault.getLatestLog().withdrawnWeth;

        assertGt(delevWeth, rebalWeth, "DELEVERAGE should withdraw more than REBALANCE");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. setForwarder emits event, non-owner cannot call it
    // ─────────────────────────────────────────────────────────────────────────

    function testSetForwarder() public {
        assertEq(vault.forwarder(), address(0));

        vm.expectEmit(true, true, false, false, address(vault));
        emit ForwarderUpdated(address(0), forwarder);
        vault.setForwarder(forwarder);

        assertEq(vault.forwarder(), forwarder);

        vm.prank(attacker);
        vm.expectRevert("SentinelVault: not owner");
        vault.setForwarder(attacker);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. setEthPriceUsd validation
    // ─────────────────────────────────────────────────────────────────────────

    function testSetEthPriceUsd() public {
        assertEq(vault.ethPriceUsd(), 3_000);

        vm.expectEmit(false, false, false, true, address(vault));
        emit EthPriceUpdated(3_000, 4_000);
        vault.setEthPriceUsd(4_000);

        assertEq(vault.ethPriceUsd(), 4_000);

        vm.expectRevert("SentinelVault: invalid price");
        vault.setEthPriceUsd(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. Zero debt position: EMERGENCY_EXIT withdraws all without debt repay
    // ─────────────────────────────────────────────────────────────────────────

    function testEmergencyExitNoDebt() public {
        aave.setPosition(COL_USD, 0, LIQ_THR, type(uint256).max);

        vault.onReport(bytes(""), _report("EMERGENCY_EXIT", 90));

        SentinelVault.ActionLog memory log = vault.getLatestLog();
        assertEq(log.action,    "EMERGENCY_EXIT");
        assertGt(log.withdrawnWeth, 0, "should withdraw collateral when no debt");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SentinelRegistry — unit tests
// ─────────────────────────────────────────────────────────────────────────────
contract SentinelRegistryTest is Test {

    SentinelRegistry registry;

    address forwarder = makeAddr("forwarder");
    address attacker  = makeAddr("attacker");

    event AssessmentLogged(
        uint8  indexed riskScore,
        string  action,
        uint256 healthFactor,
        uint256 totalDebtUsd,
        string  worstChain,
        uint256 timestamp
    );

    function setUp() public {
        registry = new SentinelRegistry(forwarder);
    }

    function _reg(uint8 score, string memory action, string memory chain)
        internal pure returns (bytes memory)
    {
        return abi.encode(score, action, uint256(2e18), uint256(500e8), chain);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Registry stores assessment from owner and forwarder
    // ─────────────────────────────────────────────────────────────────────────

    function testRegistryStoresFromOwner() public {
        vm.expectEmit(true, false, false, false, address(registry));
        emit AssessmentLogged(65, "REBALANCE", 2e18, 500e8, "sepolia", block.timestamp);

        registry.onReport(bytes(""), _reg(65, "REBALANCE", "sepolia"));

        (uint8 rs, string memory act,,, string memory chain, ) = registry.getLatestAssessment();
        assertEq(rs,    65);
        assertEq(act,   "REBALANCE");
        assertEq(chain, "sepolia");
    }

    function testRegistryStoresFromForwarder() public {
        vm.prank(forwarder);
        registry.onReport(bytes(""), _reg(85, "EMERGENCY_EXIT", "base-sepolia"));

        (uint8 rs, string memory act,,,, ) = registry.getLatestAssessment();
        assertEq(rs,  85);
        assertEq(act, "EMERGENCY_EXIT");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Attacker is rejected
    // ─────────────────────────────────────────────────────────────────────────

    function testRegistryUnauthorized() public {
        vm.prank(attacker);
        vm.expectRevert("Unauthorized: Not the Forwarder or Owner");
        registry.onReport(bytes(""), _reg(50, "HOLD", "none"));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Multiple entries accumulate in order
    // ─────────────────────────────────────────────────────────────────────────

    function testRegistryMultipleAssessments() public {
        for (uint8 i = 0; i < 5; i++) {
            registry.onReport(bytes(""), _reg(i * 10, "HOLD", "sepolia"));
        }
        assertEq(registry.getAssessmentCount(), 5);
        assertEq(registry.getAssessment(3).riskScore, 30);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // getLatestAssessment reverts on empty state
    // ─────────────────────────────────────────────────────────────────────────

    function testRegistryEmptyReverts() public {
        vm.expectRevert("SentinelRegistry: no assessments yet");
        registry.getLatestAssessment();
    }
}
