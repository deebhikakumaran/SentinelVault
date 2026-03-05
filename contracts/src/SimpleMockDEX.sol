// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title  SimpleMockDEX — Uniswap V3 SwapRouter-compatible mock for testnets
/// @notice Implements the same `exactInputSingle` interface as Uniswap V3 SwapRouter.
///         Used on testnets where Uniswap V3 pools may have no liquidity.
///
/// @dev    How to use:
///           1. Deploy MockDEX
///           2. Call setRate(WETH, USDC, 3000e6)  — 3 000 USDC per 1 WETH
///           3. Fund MockDEX with USDC testnet tokens (get from Aave faucet)
///           4. Pass MockDEX address as `_swapRouter` in SentinelVault constructor
///
///         Rate encoding:
///           rate = amountOut per 1e18 amountIn (same decimals as tokenOut)
///           e.g. WETH(18) → USDC(6):  rate = 3000 * 1e6 = 3_000_000_000
///           e.g. USDC(6)  → WETH(18): rate = (1e18 * 1e18) / (3000 * 1e6)
///
///         Security: owner-only admin; intended for testnet use only.
contract SimpleMockDEX {

    address public owner;

    /// @notice Exchange rate: tokenOut per 1e18 tokenIn.
    ///         rates[tokenIn][tokenOut] = amountOut per 1e18 amountIn
    mapping(address => mapping(address => uint256)) public rates;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    event RateSet(address indexed tokenIn, address indexed tokenOut, uint256 rate);
    event MockSwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );
    event Withdrawn(address indexed token, uint256 amount);

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() internal view {
        require(msg.sender == owner, "MockDEX: not owner");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Set the swap rate between two tokens.
    /// @param tokenIn   Input token address
    /// @param tokenOut  Output token address
    /// @param rate      Amount of tokenOut per 1e18 tokenIn
    ///                  Example: WETH→USDC at $3000: rate = 3000 * 1e6 = 3_000_000_000
    function setRate(address tokenIn, address tokenOut, uint256 rate) external onlyOwner {
        require(tokenIn  != address(0), "MockDEX: zero tokenIn");
        require(tokenOut != address(0), "MockDEX: zero tokenOut");
        require(rate     > 0,           "MockDEX: zero rate");
        rates[tokenIn][tokenOut] = rate;
        emit RateSet(tokenIn, tokenOut, rate);
    }

    /// @notice Withdraw tokens held by the DEX (recovery or top-up management)
    function withdraw(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner, amount), "MockDEX: transfer failed");
        emit Withdrawn(token, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "MockDEX: zero address");
        owner = newOwner;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ISwapRouter — exactInputSingle (Uniswap V3 compatible)
    // ──────────────────────────────────────────────────────────────────────────

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

    /// @notice Swap exact tokenIn for tokenOut at the configured fixed rate.
    /// @dev    Caller must have approved this contract to spend `params.amountIn` of tokenIn.
    ///         The DEX must hold sufficient tokenOut balance (pre-fund it before use).
    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut) {
        require(block.timestamp <= params.deadline,           "MockDEX: deadline passed");
        require(params.amountIn > 0,                          "MockDEX: zero amountIn");
        require(params.recipient != address(0),               "MockDEX: zero recipient");

        uint256 rate = rates[params.tokenIn][params.tokenOut];
        require(rate > 0, "MockDEX: no rate configured for this pair");

        // amountOut = amountIn * rate / 1e18
        amountOut = (params.amountIn * rate) / 1e18;
        require(amountOut > 0,                                "MockDEX: zero output amount");
        require(amountOut >= params.amountOutMinimum,         "MockDEX: slippage exceeded");
        require(
            IERC20(params.tokenOut).balanceOf(address(this)) >= amountOut,
            "MockDEX: insufficient liquidity - fund DEX with tokenOut"
        );

        // Pull tokenIn from caller
        require(
            IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn),
            "MockDEX: tokenIn transfer failed"
        );

        // Send tokenOut to recipient
        require(
            IERC20(params.tokenOut).transfer(params.recipient, amountOut),
            "MockDEX: tokenOut transfer failed"
        );

        emit MockSwapExecuted(params.tokenIn, params.tokenOut, params.amountIn, amountOut, params.recipient);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View
    // ──────────────────────────────────────────────────────────────────────────

    /// @notice Preview how much tokenOut you'd receive for a given amountIn
    function previewSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut) {
        uint256 rate = rates[tokenIn][tokenOut];
        if (rate == 0 || amountIn == 0) return 0;
        return (amountIn * rate) / 1e18;
    }

    /// @notice Check if the DEX has enough tokenOut liquidity for a swap
    function hasLiquidity(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (bool) {
        uint256 rate = rates[tokenIn][tokenOut];
        if (rate == 0) return false;
        uint256 needed = (amountIn * rate) / 1e18;
        return IERC20(tokenOut).balanceOf(address(this)) >= needed;
    }
}
