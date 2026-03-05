// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelVault}   from "../src/SentinelVault.sol";
import {SimpleMockDEX}   from "../src/SimpleMockDEX.sol";

/// @title  DeploySepolia — Deploy SentinelVault + SimpleMockDEX on Ethereum Sepolia testnet
///
/// Addresses sourced from:
///   Aave V3 Sepolia — https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses
///   WETH / USDC     — Aave testnet token list (same faucet tokens used in Aave UI)
///
/// Usage:
///   forge script script/DeploySepolia.s.sol \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast --verify \
///     --private-key $PRIVATE_KEY
///
/// After deployment:
///   1. Get testnet WETH + USDC from https://app.aave.com/faucet/ (switch to Sepolia)
///   2. Transfer USDC to MockDEX so it can fulfil swap requests
///   3. vault.supplyToAave(wethAmount)
///   4. vault.borrowFromAave(usdcAmount)
///   5. vault.setForwarder(<KeystoneForwarder on Sepolia>) — when address is known
///   6. Update risk-assessment/config.staging.json: vaultAddress
contract DeploySepolia is Script {

    // ── Aave V3 Sepolia ───────────────────────────────────────────────────────
    address constant AAVE_POOL = 0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951;

    // ── Testnet token addresses (Aave-issued faucet tokens) ───────────────────
    address constant WETH = 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c;
    address constant USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;

    // ── CRE KeystoneForwarder on Sepolia ──────────────────────────────────────
    // Set once Chainlink publishes the forwarder address for the hackathon DON.
    // Until then, keep address(0) — only the deployer (owner) can call onReport().
    address constant FORWARDER   = address(0);

    // ── Chainlink ETH/USD price feed on Sepolia ───────────────────────────────
    address constant PRICE_FEED  = 0x694AA1769357215DE4FAC081bf1f309aDC325306;

    // ── MockDEX rate: 3 000 USDC (6 dec) per 1 WETH (18 dec) ─────────────────
    uint256 constant WETH_USDC_RATE = 3_000 * 1e6; // = 3_000_000_000

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("=== Deploying to Ethereum Sepolia ===");
        console.log("Deployer  :", deployer);
        console.log("Chain ID  :", block.chainid);

        vm.startBroadcast(deployerKey);

        // ── 1. Deploy SimpleMockDEX ───────────────────────────────────────────
        // Uniswap V3 testnet pools have no guaranteed WETH/USDC liquidity,
        // so we use a fixed-rate mock for demo purposes.
        SimpleMockDEX mockDex = new SimpleMockDEX();
        mockDex.setRate(WETH, USDC, WETH_USDC_RATE);
        console.log("SimpleMockDEX      :", address(mockDex));
        console.log("  WETH->USDC rate  : 3000 USDC per WETH");

        // ── 2. Deploy SentinelVault ────────────────────────────────────────────
        SentinelVault vault = new SentinelVault(
            AAVE_POOL,
            address(mockDex), // swap router — replace with Uniswap if pools become available
            WETH,
            USDC,
            FORWARDER,
            PRICE_FEED        // Chainlink ETH/USD
        );
        console.log("SentinelVault      :", address(vault));
        console.log("  Owner            :", vault.owner());
        console.log("  Chain ID stored  :", vault.DEPLOYED_CHAIN_ID());

        vm.stopBroadcast();

        // ── Post-deploy instructions ──────────────────────────────────────────
        console.log("");
        console.log("=== NEXT STEPS (Sepolia) ===");
        console.log("1. Get testnet tokens from Aave faucet:");
        console.log("   https://app.aave.com/faucet/  (network: Sepolia)");
        console.log("");
        console.log("2. Fund MockDEX with USDC so it can pay out swaps:");
        console.log("   IERC20(USDC).transfer(", address(mockDex), ", <amount>)");
        console.log("");
        console.log("3. Transfer WETH to vault and set up Aave position:");
        console.log("   IERC20(WETH).transfer(", address(vault), ", <amount>)");
        console.log("   vault.supplyToAave(<wethAmount>)");
        console.log("   vault.borrowFromAave(<usdcAmount>)");
        console.log("");
        console.log("4. (Later) Set CRE forwarder once address is published:");
        console.log("   vault.setForwarder(<KeystoneForwarder>)");
        console.log("");
        console.log("5. Update config.staging.json:");
        console.log("   vaultAddress:", address(vault));
        console.log("   registryAddress: 0x1980F9a92e97C63468f1cDA533900d0D50a33058");
    }
}
