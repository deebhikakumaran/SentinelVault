// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SentinelRegistry} from "../src/SentinelRegistry.sol";

/// @title  DeployRegistry — Deploy SentinelRegistry on Ethereum Sepolia
///
/// @notice SentinelRegistry is the onchain audit log for all CRE risk assessments.
///         It is deployed once on Sepolia and written to by the CRE workflow on
///         every cron trigger, regardless of risk level.
///
/// @dev    KEYSTONE_FORWARDER is set to address(0) until Chainlink publishes the
///         forwarder address for the hackathon DON. In the meantime, only the
///         deployer (owner) can call onReport() — matching the SentinelVault pattern.
///
/// Usage:
///   forge script script/DeployRegistry.s.sol \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast --verify \
///     --private-key $PRIVATE_KEY
///
/// After deployment:
///   1. Update risk-assessment/config.staging.json: registry.address
///   2. (Later) Call registry.setForwarder(<KeystoneForwarder on Sepolia>) when known
contract DeployRegistry is Script {

    // ── CRE Simulation Forwarder on Sepolia (MockKeystoneForwarder) ───────────
    // Used with `cre workflow simulate --broadcast`.
    // Source: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
    // Update to production KeystoneForwarder if workflow is ever live-deployed.
    address constant FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("=== Deploying SentinelRegistry to Ethereum Sepolia ===");
        console.log("Deployer  :", deployer);
        console.log("Chain ID  :", block.chainid);

        vm.startBroadcast(deployerKey);

        SentinelRegistry registry = new SentinelRegistry(FORWARDER);

        console.log("SentinelRegistry   :", address(registry));
        console.log("  Owner            :", registry.owner());
        console.log("  Forwarder        :", registry.forwarder());

        vm.stopBroadcast();

        console.log("");
        console.log("=== NEXT STEPS ===");
        console.log("1. Update config.staging.json:");
        console.log("   registry.address:", address(registry));
        console.log("");
        console.log("2. (Later) Call registry.setForwarder(<productionForwarder>) if switching to live deployment");
    }
}
