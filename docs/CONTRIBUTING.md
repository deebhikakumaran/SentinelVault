# Contributing to SentinelVault

First, thank you for your interest in contributing to SentinelVault! We aim to build a robust, transparent, and resilient safety net for DeFi users, and community contributions are a huge part of that.

This document outlines the standard procedures for developing, testing, and submitting code to the repository.

---

## 1. Local Development Setup

To get started, you'll need to set up both the Solidity smart contract environment and the TypeScript/Bun workflow environment.

### Prerequisites
*   [Foundry](https://getfoundry.sh/)
*   [Node.js](https://nodejs.org/) (v18+)
*   [Bun](https://bun.sh/)

### Clone and Install
```bash
git clone https://github.com/your-repo/SentinelVault.git
cd SentinelVault

# Install contract dependencies
cd contracts
forge install

# Install workflow dependencies
cd ../risk-assessment
bun install

# Install dashboard dependencies
cd ../dashboard
npm install
```

---

## 2. Coding Standards

We strive for clean, readable, and highly documented code.

### Smart Contracts (Solidity)
*   We use Solidity `^0.8.24`.
*   All contracts must follow the official [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html).
*   Use NatSpec formatting for all public and external functions (`@notice`, `@dev`, `@param`, `@return`).
*   Before committing, **always run the Foundry formatter**:
    ```bash
    cd contracts
    forge fmt
    ```

### Workflow and Scripts (TypeScript)
*   Use strict typing wherever possible.
*   Prefer `const` over `let`.
*   Ensure all CRE workflow logic remains strictly deterministic (no `Math.random()` or unstable time-based logic outside of passed block timestamps).

---

## 3. Testing

Code must be exhaustively tested before it can be merged. The project currently has a passing suite of 15 unit tests covering the core Vault logic.

### Running Smart Contract Tests
Our tests rely on Foundry. We utilize forks to test against real-world Aave implementations where necessary.

```bash
cd contracts
forge test
```

To see detailed gas reports and traces for failed tests:
```bash
forge test -vvvv
```

### Simulating the Workflow
Before pushing changes to the `main.ts` risk engine, run the CRE simulator to verify the data parsing and decision logic:

```bash
cd risk-assessment
cre workflow simulate risk-assessment --target staging-settings
```

---

## 4. Submitting a Pull Request (PR)

1.  **Branching:** Create a new branch from `main` with a descriptive name (e.g., `feature/add-arbitrum-support` or `fix/rebalance-logic`).
2.  **Commit Messages:** Use clear, concise commit messages. (e.g., "fix: update LTV threshold for rebalance action").
3.  **Documentation:** If you add a new feature or change core logic, update the relevant files in the `/docs` folder (`RISK_ENGINE.md`, `ARCHITECTURE.md`, etc.).
4.  **Tests:** Include new tests in `/contracts/test` for any smart contract modifications.
5.  **Review:** Open the PR and request a review. Ensure all CI checks (if configured) pass.

We look forward to seeing your contributions!
