// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelVault}   from "../src/SentinelVault.sol";
import {SimpleMockDEX}   from "../src/SimpleMockDEX.sol";

/// @title  DeployBaseSepolia — Deploy SentinelVault + SimpleMockDEX on Base Sepolia testnet
///
/// Addresses sourced from:
///   Aave V3 Base Sepolia  — https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses
///   WETH                  — canonical Base Sepolia WETH (0x4200…0006)
///   USDC                  — Aave testnet USDC on Base Sepolia
///
/// Usage:
///   forge script script/DeployBaseSepolia.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify \
///     --private-key $PRIVATE_KEY
///
/// After deployment:
///   1. Get testnet WETH + USDC from https://app.aave.com/faucet/ (network: Base Sepolia)
///      OR bridge from Sepolia via the official Base bridge
///   2. Transfer USDC to MockDEX so it can fulfil swap requests
///   3. vault.supplyToAave(wethAmount)
///   4. vault.borrowFromAave(usdcAmount)
///   5. vault.setForwarder(<KeystoneForwarder on Base Sepolia>) — when address is known
///   6. Update risk-assessment/config.staging.json: vaultAddress for Base Sepolia chain
contract DeployBaseSepolia is Script {

    // ── Aave V3 Base Sepolia ──────────────────────────────────────────────────
    address constant AAVE_POOL = 0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b;

    // ── Token addresses ───────────────────────────────────────────────────────
    // WETH: canonical wrapped ETH on Base (same address as Base mainnet)
    address constant WETH = 0x4200000000000000000000000000000000000006;
    // USDC: Aave testnet USDC on Base Sepolia
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    // ── CRE KeystoneForwarder on Base Sepolia ─────────────────────────────────
    address constant FORWARDER   = address(0);

    // ── Chainlink ETH/USD price feed on Base Sepolia ──────────────────────────
    address constant PRICE_FEED  = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;

    // ── MockDEX rate: 3 000 USDC (6 dec) per 1 WETH (18 dec) ─────────────────
    uint256 constant WETH_USDC_RATE = 3_000 * 1e6;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("=== Deploying to Base Sepolia ===");
        console.log("Deployer  :", deployer);
        console.log("Chain ID  :", block.chainid);

        vm.startBroadcast(deployerKey);

        // ── 1. Deploy SimpleMockDEX ───────────────────────────────────────────
        SimpleMockDEX mockDex = new SimpleMockDEX();
        mockDex.setRate(WETH, USDC, WETH_USDC_RATE);
        console.log("SimpleMockDEX      :", address(mockDex));
        console.log("  WETH->USDC rate  : 3000 USDC per WETH");

        // ── 2. Deploy SentinelVault ────────────────────────────────────────────
        SentinelVault vault = new SentinelVault(
            AAVE_POOL,
            address(mockDex),
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
        console.log("=== NEXT STEPS (Base Sepolia) ===");
        console.log("1. Get testnet tokens from Aave faucet:");
        console.log("   https://app.aave.com/faucet/  (network: Base Sepolia)");
        console.log("");
        console.log("2. Fund MockDEX with USDC:");
        console.log("   IERC20(USDC).transfer(", address(mockDex), ", <amount>)");
        console.log("");
        console.log("3. Transfer WETH to vault and set up Aave position:");
        console.log("   IERC20(WETH).transfer(", address(vault), ", <amount>)");
        console.log("   vault.supplyToAave(<wethAmount>)");
        console.log("   vault.borrowFromAave(<usdcAmount>)");
        console.log("");
        console.log("4. (Later) Set CRE forwarder:");
        console.log("   vault.setForwarder(<KeystoneForwarder on Base Sepolia>)");
        console.log("");
        console.log("5. Update config.staging.json with vault address:", address(vault));
    }
}
