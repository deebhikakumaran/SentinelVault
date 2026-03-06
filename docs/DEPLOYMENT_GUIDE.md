# Deployment Guide

This guide provides step-by-step instructions on how to set up, deploy, and verify the SentinelVault infrastructure. The project is split into the Solidity smart contracts (Foundry) and the off-chain Chainlink CRE workflow (Bun).

---

## Prerequisites

Ensure you have the following installed on your system:
*   [Foundry](https://getfoundry.sh/) (for `forge`, `cast`, `anvil`)
*   [Node.js](https://nodejs.org/) (v18 or higher)
*   [Bun](https://bun.sh/) (Package manager required for CRE SDK)

---

## 1. Environment Setup

Create a `.env` file in the root of the project (or inside `/contracts`) and configure your RPC URLs, private keys, and Etherscan API keys.

```env
# RPC Endpoints
SEPOLIA_RPC_URL="https://rpc.sepolia.org"
BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"

# Wallet
PRIVATE_KEY="your_deployer_wallet_private_key"

# Verification
ETHERSCAN_API_KEY="your_etherscan_key"
BASESCAN_API_KEY="your_basescan_key"
```

## 2. Deploying the Smart Contracts

We use Foundry scripts to deploy the contracts securely. 

Navigate to the `contracts` directory:
```bash
cd contracts
```

### Deploying the Registry (Sepolia Only)
The `SentinelRegistry` acts as the global audit log and should be deployed on Sepolia.

```bash
forge script script/DeployRegistry.s.sol:DeployRegistryScript \
    --rpc-url $SEPOLIA_RPC_URL \
    --broadcast \
    --verify \
    -vvvv
```

### Deploying the Vaults
Deploy the `SentinelVault` on all target chains (e.g., Sepolia and Base Sepolia). The deployment scripts automatically hook up the local Aave testnet pools and the Mock DEX.

**On Sepolia:**
```bash
forge script script/DeploySepolia.s.sol:DeploySepoliaScript \
    --rpc-url $SEPOLIA_RPC_URL \
    --broadcast \
    --verify \
    -vvvv
```

**On Base Sepolia:**
```bash
forge script script/DeployBaseSepolia.s.sol:DeployBaseSepoliaScript \
    --rpc-url $BASE_SEPOLIA_RPC_URL \
    --broadcast \
    --verify \
    -vvvv
```

*Note: Save the deployed contract addresses. You will need them to configure the CRE workflow.*

---

## 3. Configuring the CRE Workflow

Navigate to the `risk-assessment` directory:
```bash
cd risk-assessment
bun install
```

### Managing Secrets
Because we use the `ConfidentialHTTPClient` to fetch market data, you must provide your CryptoCompare API key via the Chainlink CRE secrets manager.

Create a `secrets.yaml` file in the `risk-assessment` directory:
```yaml
secretsNames:
  marketDataApiKey:
    - YOUR_ACTUAL_CRYPTOCOMPARE_API_KEY
```
*(Ensure this file is never committed to Git).*

### Updating Configuration
Edit `config.staging.json` (or `config.production.json`).
Update the following fields with your newly deployed contract addresses:
*   `owner`: Your deployer wallet address.
*   `chains[0].vaultAddress`: Your Sepolia SentinelVault address.
*   `chains[1].vaultAddress`: Your Base Sepolia SentinelVault address.
*   `registry.address`: Your SentinelRegistry address.

---

## 4. Deploying the Workflow

First, test the workflow locally using the simulator to ensure data fetching and risk logic work correctly:

```bash
cre workflow simulate risk-assessment --target staging-settings
```

If the simulation succeeds, deploy the workflow to the Chainlink CRE gateway:

```bash
cre workflow deploy risk-assessment --target staging-settings
```

---

## 5. Post-Deployment: Setting the Forwarder

Once the workflow is deployed, Chainlink will assign a specific `KeystoneForwarder` address that is authorized to write reports on your behalf. 

You must tell your deployed Vaults and Registry to accept commands *only* from this forwarder.

Navigate to the `scripts` folder:
```bash
cd scripts
npm install
```

Use the utility script to update the forwarder address on your contracts:
```bash
npx ts-node set-forwarder.ts <THE_KEYSTONE_FORWARDER_ADDRESS>
```

Your SentinelVault is now fully armed and autonomous!
