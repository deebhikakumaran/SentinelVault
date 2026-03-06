# The Risk Engine

The Risk Engine is the core intelligence of SentinelVault. It is a strictly deterministic algorithm that evaluates your cross-chain Aave positions against real-time market sentiment to produce a **Risk Score between 0 and 100**.

Unlike opaque machine learning models, SentinelVault's scoring system is 100% transparent, mathematically reproducible, and explicitly defined in code.

---

## How the Score is Calculated

The final Risk Score is the sum of points accumulated across four key risk vectors. The higher the score, the closer the system is to triggering a protective action.

### 1. Health Factor (0 to 45 Points)
*The most critical metric. How close is the position to hard liquidation right now?*

We evaluate the worst Health Factor (HF) across all monitored chains.
*   **HF < 1.05:** `+45 points` (Critical Danger)
*   **HF < 1.10:** `+35 points`
*   **HF < 1.20:** `+25 points`
*   **HF < 1.50:** `+15 points`
*   **HF < 2.00:** `+8 points`
*   **HF ≥ 2.00:** `+2 points` (Safe)

### 2. LTV (Loan-to-Value) Utilization (0 to 25 Points)
*How heavily leveraged is the entire cross-chain portfolio?*

We sum the total collateral and total debt across all chains to find the global LTV.
*   **Global LTV > 85%:** `+25 points`
*   **Global LTV > 80%:** `+20 points`
*   **Global LTV > 75%:** `+15 points`
*   **Global LTV > 70%:** `+8 points`

### 3. Market Sentiment (0 to 20 Points)
*Are we in a stable market or a cascading crash?*

This is the predictive element. We fetch data for 10 key crypto assets via the CryptoCompare API. We calculate a baseline "Sentiment Score" (0-100, where 0 is extreme fear) based on four factors:
1.  **Average Market Direction:** (e.g., if the average drop is >10%, subtract 30 points).
2.  **Market Breadth:** Are most assets red? (e.g., if >90% of assets are down, subtract 15 points).
3.  **Contagion Risk:** What is the worst single drop? (e.g., if one asset dropped >30%, subtract 20 points).
4.  **Protocol Health:** How is the AAVE token performing? A crash in AAVE implies liquidation pressure.

We then translate that 0-100 Sentiment Score into Risk Points:
*   **Sentiment ≤ 10 (Extreme Fear):** `+20 points`
*   **Sentiment ≤ 25:** `+15 points`
*   **Sentiment ≤ 40:** `+8 points`
*   **Sentiment ≤ 60:** `+3 points`

### 4. Chain Concentration (0 to 10 Points)
*How complex is the portfolio?*

Managing debt on multiple chains introduces bridging delays and higher systemic risk.
*   **Debt on ≥ 3 chains:** `+10 points`
*   **Debt on 2 chains:** `+5 points`
*   **Debt on 1 chain:** `+2 points`

---

## Action Thresholds

Once the total Risk Score is calculated, the workflow maps the score to a specific, predefined action.

| Score Range | Action | What the Vault Does |
| :--- | :--- | :--- |
| **0 – 49** | `HOLD` | **Nothing.** Logs the assessment to the Registry and sleeps. |
| **50 – 69** | `REBALANCE` | **Mild Protection.** Withdraws 25% of your available safe collateral, swaps to stablecoins, and repays debt. |
| **70 – 84** | `DELEVERAGE` | **Aggressive Protection.** Withdraws 50% of your available safe collateral, swaps, and repays. |
| **85 – 100** | `EMERGENCY_EXIT` | **Total Rescue.** Uses any WETH lying around, drains 80% of safe collateral to clear as much debt as possible, and finally withdraws all remaining collateral out of the Aave protocol entirely. |

### The Safe Withdrawal Guarantee

When the vault takes action, it relies on a function called `_safeWithdrawAmount(percent)`. 
This function calculates exactly how much collateral is required to maintain a Health Factor of `1.2`. It then takes the *remainder* (the "safe" excess collateral) and applies the percentage (e.g., 25% for `REBALANCE`).

This guarantees that SentinelVault's interventions will never accidentally cause a liquidation by withdrawing too much collateral too quickly.