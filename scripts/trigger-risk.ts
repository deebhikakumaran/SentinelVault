/**
 * trigger-risk.ts
 *
 * Demo script: borrow additional USDC from a vault to push HF below 1.5
 * (into the "risky" territory that triggers CRE REBALANCE/DELEVERAGE actions).
 *
 * Usage: cd scripts && npx ts-node trigger-risk.ts <chain>
 *   chain: sepolia | base
 *
 * Example:
 *   npx ts-node trigger-risk.ts sepolia
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

// After this script runs, HF will be pushed down to ~1.35
// CRE risk scoring: HF < 1.5 → 15+ pts; HF < 1.2 → 45 pts
// HF 1.35 is well into DELEVERAGE territory (riskScore will be >= 70)
const TARGET_HF_BPS = 13500n; // 1.35 × 10000

// ─────────────────────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────────────────────

const VAULT_ABI = [
  'function borrowFromAave(uint256 amount) external',
  'function getPosition() view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiqThreshold, uint256 ltv, uint256 healthFactor)',
  'function owner() view returns (address)',
];

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
  const chainArg = process.argv[2]?.toLowerCase();
  if (!chainArg || !['sepolia', 'base'].includes(chainArg)) {
    console.error('Usage: npx ts-node trigger-risk.ts <sepolia|base>');
    process.exit(1);
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not set in .env');

  const cfg = addresses[chainArg as keyof typeof addresses] as {
    label: string; rpc: string; vault: string; chainId: number;
  };

  console.log(`\nSentinelVault — trigger risk on ${cfg.label}`);
  console.log(`vault: ${cfg.vault}`);

  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const signer   = new ethers.Wallet(privateKey, provider);
  const vault    = new ethers.Contract(cfg.vault, VAULT_ABI, signer);

  // Verify ownership
  const owner: string = await vault.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not vault owner (owner = ${owner})`);
  }

  // ── Before state ───────────────────────────────────────────────────────────
  const [colBefore, debtBefore, availBefore, liqThreshold, , hfBefore]: bigint[] =
    await vault.getPosition();

  console.log('\n── BEFORE ───────────────────────────────────────────────────────');
  console.log(`  Collateral      : ${usd8(colBefore)}`);
  console.log(`  Debt            : ${usd8(debtBefore)}`);
  console.log(`  Available borrow: ${usd8(availBefore)}`);
  console.log(`  Health Factor   : ${formatHF(hfBefore)}`);
  console.log(`  CRE would trigger: ${riskAction(hfBefore)}`);

  if (colBefore === 0n) {
    throw new Error(
      'Vault has no collateral — run setup-positions.ts first.'
    );
  }

  // ── Calculate extra borrow to push HF to TARGET_HF_BPS ────────────────────
  // HF = (collateral × liqThreshold) / (debt × 10000)
  // targetDebt = (collateral × liqThreshold) / (targetHF × 10000)
  // where liqThreshold is in bps (e.g. 8250) and TARGET_HF_BPS = 13500 (1.35 × 10000)
  const targetDebtBase = (colBefore * liqThreshold) / TARGET_HF_BPS;
  const currentDebtBase = debtBefore;

  if (targetDebtBase <= currentDebtBase) {
    const currentHfStr = (Number(hfBefore) / 1e18).toFixed(3);
    console.log(`\nHF is already ${currentHfStr} — below or at target ${Number(TARGET_HF_BPS) / 10000}.`);
    console.log('Position is already in risky territory. Run test-action.ts to simulate CRE response.');
    return;
  }

  const extraDebtBase = targetDebtBase - currentDebtBase;
  const extraBorrowUsdc = extraDebtBase / 100n; // 8-dec USD → 6-dec USDC

  // Cap at available borrows (can't borrow more than Aave allows)
  const availBase = availBefore; // availableBorrowsBase from getUserAccountData
  const availUsdc = availBase / 100n;
  const actualBorrowUsdc = extraBorrowUsdc < availUsdc ? extraBorrowUsdc : availUsdc;

  if (actualBorrowUsdc === 0n) {
    throw new Error('No additional borrow capacity — already at maximum LTV.');
  }

  console.log(`\n── BORROWING ─────────────────────────────────────────────────────`);
  console.log(`  Extra borrow: ${ethers.formatUnits(actualBorrowUsdc, 6)} USDC`);
  console.log(`  Target HF  : ~${(Number(TARGET_HF_BPS) / 10000).toFixed(2)}`);
  console.log('  Sending tx…');

  const tx = await vault.borrowFromAave(actualBorrowUsdc);
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
  console.log('  The vault health factor is now in risky territory.');
  console.log(`  When CRE polls Aave next cycle, it will score risk ≥ 50 and`);
  console.log(`  call vault.onReport() with REBALANCE or DELEVERAGE action.`);
  console.log(`\n  To simulate the CRE callback immediately, run:`);
  console.log(`    npx ts-node test-action.ts ${chainArg} DELEVERAGE`);
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
