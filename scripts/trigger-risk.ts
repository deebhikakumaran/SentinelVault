/**
 * trigger-risk.ts
 *
 * Demo script: borrow additional USDC from a vault to push HF below 1.5
 * (into the "risky" territory that triggers CRE REBALANCE/DELEVERAGE actions).
 *
 * Usage: cd scripts && npx ts-node trigger-risk.ts <chain> [action]
 *   chain:  sepolia | base
 *   action: rebalance | deleverage | emergency  (default: deleverage)
 *
 * Example:
 *   npx ts-node trigger-risk.ts sepolia rebalance
 *   npx ts-node trigger-risk.ts base emergency
 *
 * Requires: PRIVATE_KEY in ../.env (no 0x prefix)
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';
import addresses from './addresses.json';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

// HF targets per action (in bps, i.e. HF × 10000):
//   rebalance  → HF ~1.40 (riskScore ≥ 50, triggers REBALANCE)
//   deleverage → HF ~1.15 (riskScore ≥ 70, triggers DELEVERAGE)
//   emergency  → HF ~1.05 (riskScore ≥ 85, triggers EMERGENCY_EXIT)
const ACTION_HF_MAP: Record<string, bigint> = {
  rebalance:  14000n, // 1.40 × 10000
  deleverage: 11500n, // 1.15 × 10000
  emergency:  10500n, // 1.05 × 10000
};

// ─────────────────────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────────────────────

const VAULT_ABI = [
  'function withdrawCollateralFromAave(uint256 wethAmount) external',
  'function getPosition() view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiqThreshold, uint256 ltv, uint256 healthFactor)',
  'function owner() view returns (address)',
];

const POOL_ABI = [
  'function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
];

const ATOKEN_ABI = ['function balanceOf(address) view returns (uint256)'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatHF(hf: bigint): string {
  if (hf >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')) return '∞';
  const val = Number(hf) / 1e18;
  const str = val.toFixed(3);
  if (val < 1.2)  return `🔴 ${str}`;
  if (val < 1.5)  return `🟡 ${str}`;
  return              `🟢 ${str}`;
}

function usd8(base: bigint): string {
  return '$' + (Number(base) / 1e8).toFixed(2);
}

function riskAction(hf: bigint): string {
  if (hf >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')) return 'HOLD (no debt)';
  const val = Number(hf) / 1e18;
  if (val < 1.05) return 'EMERGENCY_EXIT (≥ 85 pts)';
  if (val < 1.2)  return 'DELEVERAGE     (≥ 70 pts, HF critical)';
  if (val < 1.5)  return 'REBALANCE/DELEVERAGE  (HF in danger zone)';
  return              'HOLD (HF healthy)';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const chainArg  = process.argv[2]?.toLowerCase();
  const actionArg = (process.argv[3]?.toLowerCase() ?? 'deleverage') as string;

  if (!chainArg || !['sepolia', 'base'].includes(chainArg)) {
    console.error('Usage: npx ts-node trigger-risk.ts <sepolia|base> [rebalance|deleverage|emergency]');
    process.exit(1);
  }

  if (!ACTION_HF_MAP[actionArg]) {
    console.error(`Unknown action "${actionArg}". Valid: rebalance | deleverage | emergency`);
    process.exit(1);
  }

  const TARGET_HF_BPS = ACTION_HF_MAP[actionArg];
  const ACTION_LABEL: Record<string, string> = {
    rebalance:  'REBALANCE (riskScore ≥ 50)',
    deleverage: 'DELEVERAGE (riskScore ≥ 70)',
    emergency:  'EMERGENCY_EXIT (riskScore ≥ 85)',
  };
  const TARGET_ACTION = ACTION_LABEL[actionArg];

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not set in .env');

  const cfg = addresses[chainArg as keyof typeof addresses] as {
    label: string; rpc: string; vault: string; chainId: number;
  };

  console.log(`\nSentinelVault — trigger risk on ${cfg.label}`);
  console.log(`vault:  ${cfg.vault}`);
  console.log(`action: ${actionArg} → targeting ${TARGET_ACTION}`);

  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const signer   = new ethers.Wallet(privateKey, provider);
  const vault    = new ethers.Contract(cfg.vault, VAULT_ABI, signer);

  // Verify ownership
  const owner: string = await vault.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not vault owner (owner = ${owner})`);
  }

  // ── Before state ───────────────────────────────────────────────────────────
  const [colBefore, debtBefore, , liqThreshold, , hfBefore]: bigint[] =
    await vault.getPosition();

  console.log('\n── BEFORE ───────────────────────────────────────────────────────');
  console.log(`  Collateral      : ${usd8(colBefore)}`);
  console.log(`  Debt            : ${usd8(debtBefore)}`);
  console.log(`  Health Factor   : ${formatHF(hfBefore)}`);
  console.log(`  CRE would trigger: ${riskAction(hfBefore)}`);

  if (colBefore === 0n) {
    throw new Error(
      'Vault has no collateral — run setup-positions.ts first.'
    );
  }

  // ── Calculate WETH to withdraw to push HF to TARGET_HF_BPS ───────────────
  // HF = (collateral × liqThreshold) / (debt × 10000)
  // targetCollateral = (targetHF × debt × 10000) / liqThreshold
  // withdrawBase = collateral - targetCollateral  (8-dec USD)
  // withdrawWeth = withdrawBase × 1e10 / ethPriceUsd  (18-dec WETH, ethPriceUsd e.g. 3000)
  if (debtBefore === 0n) {
    throw new Error('Vault has no debt — run setup-positions.ts first.');
  }

  const targetColBase = (TARGET_HF_BPS * debtBefore) / liqThreshold;

  if (targetColBase >= colBefore) {
    const currentHfStr = (Number(hfBefore) / 1e18).toFixed(3);
    console.log(`\nHF is already ${currentHfStr} — below or at target ${Number(TARGET_HF_BPS) / 10000}.`);
    console.log(`Position is already in "${actionArg}" territory. Run test-action.ts to simulate CRE response.`);
    console.log('  To reset: run setup-positions.ts again.');
    return;
  }

  const withdrawBase = colBefore - targetColBase; // 8-dec USD to remove

  // Derive WETH amount from the vault's aToken balance — avoids any external price oracle.
  // withdrawWeth = aWethBalance × withdrawBase / colBefore  (proportional USD fraction)
  const cfgFull = cfg as unknown as { aavePool: string; weth: string };
  const pool     = new ethers.Contract(cfgFull.aavePool, POOL_ABI, provider);
  const reserve  = await pool.getReserveData(cfgFull.weth);
  const aToken   = new ethers.Contract(reserve.aTokenAddress, ATOKEN_ABI, provider);
  const aWethBal: bigint = await aToken.balanceOf(cfg.vault);
  const withdrawWeth = (aWethBal * withdrawBase) / colBefore; // 18-dec WETH

  if (withdrawWeth === 0n) {
    throw new Error('Calculated withdraw amount is 0 — position may already be at target HF.');
  }

  console.log(`\n── WITHDRAWING COLLATERAL ────────────────────────────────────────`);
  console.log(`  Withdraw WETH  : ${ethers.formatEther(withdrawWeth)} WETH (~${(Number(withdrawBase) / 1e8).toFixed(2)} USD)`);
  console.log(`  Target HF      : ~${(Number(TARGET_HF_BPS) / 10000).toFixed(2)}`);
  console.log(`  Expected action: ${TARGET_ACTION}`);
  console.log('  Sending tx…');

  const tx = await vault.withdrawCollateralFromAave(withdrawWeth);
  const receipt = await tx.wait();
  console.log(`  Confirmed: ${receipt.hash}`);

  // ── After state ────────────────────────────────────────────────────────────
  const [colAfter, debtAfter, , , , hfAfter]: bigint[] = await vault.getPosition();

  console.log('\n── AFTER ────────────────────────────────────────────────────────');
  console.log(`  Collateral      : ${usd8(colAfter)}`);
  console.log(`  Debt            : ${usd8(debtAfter)}`);
  console.log(`  Health Factor   : ${formatHF(hfAfter)}`);
  console.log(`  CRE will trigger: ${riskAction(hfAfter)}`);

  console.log('\n── DEMO READY ───────────────────────────────────────────────────');
  console.log(`  Vault HF is now in "${actionArg}" territory.`);
  console.log(`  CRE will score risk and call vault.onReport() with ${TARGET_ACTION}.`);
  console.log(`\n  To simulate the CRE callback immediately, run:`);
  console.log(`    cre workflow simulate risk-assessment --target staging-settings --broadcast`);
  console.log(`\n  To reset: run setup-positions.ts again.`);
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
