# System Architecture

SentinelVault is designed to act as an autonomous, multi-chain protection layer for DeFi positions. It constantly monitors your Aave V3 health across various networks and intervenes *only* when critical risk thresholds are crossed.

This document breaks down how the system is built, focusing on the Chainlink CRE workflow, the smart contracts, and the interactions between them.

---

## The Core Components

SentinelVault's architecture is split into two primary environments:
1.  **Off-Chain Engine (Chainlink DON):** The "Brain" that reads data, calculates risk, and decides what to do.
2.  **On-Chain Vaults & Registry:** The "Muscles" and "Memory" that execute protective actions and store immutable audit logs.

### 1. The Multi-Chain Strategy

Modern DeFi is fragmented across multiple Layer 2s. Managing risk on just one chain is no longer sufficient. SentinelVault addresses this by moving the assessment logic entirely off-chain using the **Chainlink Capability Runtime Environment (CRE)**.

*   **Continuous Polling:** Every 5 minutes, a `CronCapability` triggers the workflow.
*   **Multi-Chain Reads:** Using the `EVMClient`, the workflow calls the `getUserAccountData` function on the Aave V3 Pool contract across all configured chains (e.g., Sepolia and Base Sepolia) *in parallel*.
*   **Centralized Risk Assessment:** Instead of running complex logic on the blockchain (which is expensive and limited), the CRE aggregates the debt, collateral, and Health Factor across all chains into a single unified view.

### 2. The Smart Contracts

SentinelVault relies on two main smart contracts deployed on the blockchain.

#### `SentinelVault.sol` (The Muscle)
Deployed individually on every chain you want to protect (e.g., one on Sepolia, one on Base Sepolia).

*   **The Entry Point:** The vault receives instructions via the `onReport()` function, which can only be called by an authorized `KeystoneForwarder` (the Chainlink DON).
*   **Atomic Execution:** When a rescue action is triggered, the vault performs a sequence of steps in **one single atomic transaction**:
    1.  **Withdraw:** `AAVE_POOL.withdraw()` pulls WETH collateral from your Aave position. It uses `_safeWithdrawAmount()` to calculate exactly how much it can pull without dropping your Health Factor below a safe limit (1.2).
    2.  **Swap:** It calls `SWAP_ROUTER.exactInputSingle()` (Uniswap V3) to swap the WETH into USDC. It features an MEV slippage guard using a Chainlink ETH/USD price feed to calculate the `amountOutMinimum`.
    3.  **Repay:** Finally, `AAVE_POOL.repay()` sends the USDC back to Aave to pay down your variable-rate debt.
*   **Graceful Fallbacks:** If the decentralized exchange has no liquidity or the swap reverts for any reason, the transaction *does not revert*. The vault catches the error and simply holds the withdrawn WETH. This ensures that you at least have the collateral safe, rather than failing the entire transaction and leaving you exposed to liquidation.

#### `SentinelRegistry.sol` (The Memory)
Deployed only once (currently on Sepolia).

*   **Immutable Audit Log:** Every time the risk engine calculates a score, it writes a report to this registry using `EVMClient.writeReport()`.
*   **Transparency:** It logs the exact timestamp, the Risk Score, the action taken, the worst Health Factor across all chains, and the total debt. This provides a transparent, tamper-proof history of why SentinelVault took action.

---

## Data Flow: From Trigger to Execution

Here is the step-by-step lifecycle of a 5-minute cron tick:

1.  **Trigger:** The 5-minute Cron wakes up the `main.ts` workflow.
2.  **Read:** The workflow fetches Aave account data from Sepolia and Base Sepolia.
3.  **Intel Fetch:** Inside the Chainlink TEE (Trusted Execution Environment), the workflow fetches live market data from CryptoCompare to gauge market sentiment.
4.  **Compute:** The workflow feeds the on-chain Aave data and off-chain market sentiment into the deterministic risk scoring algorithm.
5.  **Log:** The workflow formats the result and signs a payload. The `KeystoneForwarder` writes this to `SentinelRegistry.sol` on Sepolia.
6.  **Act (Conditional):** If the calculated Risk Score is ≥ 50, the workflow identifies the chain with the worst Health Factor. It signs a secondary payload instructing that specific chain's `SentinelVault` to execute a protective action (`REBALANCE`, `DELEVERAGE`, or `EMERGENCY_EXIT`).
7.  **Settle:** The targeted vault executes the atomic `Withdraw -> Swap -> Repay` sequence, restoring the Health Factor to a safe level.
