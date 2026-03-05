/**
 * test-action.ts
 *
 * Simulates the CRE KeystoneForwarder calling onReport() on a vault.
 * Encodes the report payload, calls vault.onReport(metadata, report),
 * then decodes the ActionExecuted event and prints before/after position.
 *
 * Usage: cd scripts && npx ts-node test-action.ts <chain> <action>
 *   chain:  sepolia | base
 *   action: EMERGENCY_EXIT | DELEVERAGE | REBALANCE | SWAP_TO_STABLE | HOLD
 *
 * Examples:
 *   npx ts-node test-action.ts sepolia DELEVERAGE
 *   npx ts-node test-action.ts base    REBALANCE
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

const VALID_ACTIONS = ['EMERGENCY_EXIT', 'DELEVERAGE', 'REBALANCE', 'SWAP_TO_STABLE', 'HOLD'] as const;
type Action = typeof VALID_ACTIONS[number];

// Risk scores matching CLAUDE.md thresholds
const RISK_SCORES: Record<Action, number> = {
  EMERGENCY_EXIT: 90,
  DELEVERAGE    : 75,
  REBALANCE     : 60,
  SWAP_TO_STABLE: 55,
  HOLD          : 20,
};

// ─────────────────────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────────────────────

const VAULT_ABI = [
  'function onReport(bytes calldata metadata, bytes calldata report) external',
  'function getPosition() view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiqThreshold, uint256 ltv, uint256 healthFactor)',
  'function getBalances() view returns (uint256 wethBal, uint256 usdcBal, uint256 ethBal)',
  'function owner() view returns (address)',
  'function forwarder() view returns (address)',
  // Events
  'event ActionExecuted(uint256 indexed logId, string action, uint256 riskScore, uint256 hfBefore, uint256 hfAfter, uint256 swappedWeth, uint256 receivedUsdc, uint256 repaidUsdc, uint256 withdrawnWeth, bool swapSucceeded, uint256 timestamp)',
  'event ReportReceived(bytes metadata, bytes report, uint256 timestamp)',
  'event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event SwapSkipped(address tokenIn, uint256 amountIn, string reason)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatHF(hf: bigint): string {
  if (hf >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')) return '∞';
  return (Number(hf) / 1e18).toFixed(4);
}

function formatHFColored(hf: bigint): string {
  if (hf >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')) return '∞';
  const val = Number(hf) / 1e18;
  const str = val.toFixed(4);
  if (val < 1.2)  return `🔴 ${str}`;
  if (val < 1.5)  return `🟡 ${str}`;
  return              `🟢 ${str}`;
}

function usd8(base: bigint): string {
  return '$' + (Number(base) / 1e8).toFixed(4);
}

/**
 * Encode the CRE report payload.
 * Matches abi.decode(report, (string, uint256, uint256, uint256)) in SentinelVault.onReport()
 */
function encodeReport(action: string, riskScore: number, healthFactor: bigint, ts: number): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'uint256', 'uint256', 'uint256'],
    [action, BigInt(riskScore), healthFactor, BigInt(ts)],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const chainArg  = process.argv[2]?.toLowerCase();
  const actionArg = process.argv[3]?.toUpperCase() as Action | undefined;

  if (!chainArg || !['sepolia', 'base'].includes(chainArg)) {
    console.error('Usage: npx ts-node test-action.ts <sepolia|base> <action>');
    console.error('Actions:', VALID_ACTIONS.join(' | '));
    process.exit(1);
  }

  if (!actionArg || !VALID_ACTIONS.includes(actionArg)) {
    console.error(`Invalid action "${actionArg}". Valid: ${VALID_ACTIONS.join(', ')}`);
    process.exit(1);
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not set in .env');

  const cfg = addresses[chainArg as keyof typeof addresses] as {
    label: string; rpc: string; vault: string; weth: string; usdc: string; chainId: number;
  };

  console.log(`\nSentinelVault — test onReport() on ${cfg.label}`);
  console.log(`vault  : ${cfg.vault}`);
  console.log(`action : ${actionArg}  (riskScore = ${RISK_SCORES[actionArg]})`);

  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const signer   = new ethers.Wallet(privateKey, provider);
  const vault    = new ethers.Contract(cfg.vault, VAULT_ABI, signer);
  const weth     = new ethers.Contract(cfg.weth,  ERC20_ABI, provider);
  const usdc     = new ethers.Contract(cfg.usdc,  ERC20_ABI, provider);

  // Verify ownership (onReport is onlyAuthorized = owner or forwarder)
  const owner:     string = await vault.owner();
  const forwarder: string = await vault.forwarder();
  const isOwner    = owner.toLowerCase()     === signer.address.toLowerCase();
  const isForwarder = forwarder !== ethers.ZeroAddress &&
                      forwarder.toLowerCase() === signer.address.toLowerCase();

  if (!isOwner && !isForwarder) {
    throw new Error(
      `Signer ${signer.address} is not authorized.\n` +
      `  vault owner    : ${owner}\n` +
      `  vault forwarder: ${forwarder}`,
    );
  }
  console.log(`caller : ${signer.address}  (${isOwner ? 'owner' : 'forwarder'})`);

  // ── Before state ───────────────────────────────────────────────────────────
  const [colBefore, debtBefore, , , , hfBefore]: bigint[] = await vault.getPosition();
  const wethBefore: bigint = await weth.balanceOf(cfg.vault);
  const usdcBefore: bigint = await usdc.balanceOf(cfg.vault);

  console.log('\n── BEFORE ───────────────────────────────────────────────────────');
  console.log(`  Collateral  : ${usd8(colBefore)}`);
  console.log(`  Debt        : ${usd8(debtBefore)}`);
  console.log(`  Health F.   : ${formatHFColored(hfBefore)}`);
  console.log(`  Vault WETH  : ${ethers.formatEther(wethBefore)}`);
  console.log(`  Vault USDC  : ${ethers.formatUnits(usdcBefore, 6)}`);

  if (colBefore === 0n && actionArg !== 'HOLD') {
    console.warn('\n  ⚠ Vault has no collateral — protective actions will be no-ops.');
    console.warn('  Run setup-positions.ts first for a meaningful demo.');
  }

  // ── Build and send report ─────────────────────────────────────────────────
  const ts     = Math.floor(Date.now() / 1000);
  const report = encodeReport(actionArg, RISK_SCORES[actionArg], hfBefore, ts);
  const metadata = '0x'; // empty — KeystoneForwarder normally provides workflow metadata

  console.log('\n── SENDING REPORT ───────────────────────────────────────────────');
  console.log(`  metadata: ${metadata}  (empty, owner-direct call)`);
  console.log(`  report  : ${report.slice(0, 66)}…  (${report.length / 2 - 1} bytes)`);
  console.log('  Sending tx…');

  let receipt: ethers.TransactionReceipt;
  try {
    const tx = await vault.onReport(metadata, report);
    receipt  = await tx.wait();
    console.log(`  Confirmed: ${receipt.hash}`);
    console.log(`  Gas used : ${receipt.gasUsed.toLocaleString()}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`onReport() reverted: ${msg}`);
  }

  // ── Parse events ──────────────────────────────────────────────────────────
  console.log('\n── EVENTS ───────────────────────────────────────────────────────');

  const iface = new ethers.Interface(VAULT_ABI);
  let actionEventFound = false;

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;

      switch (parsed.name) {
        case 'ActionExecuted': {
          actionEventFound = true;
          const [
            logId, action, riskScore,
            hfB, hfA,
            swappedWeth, receivedUsdc, repaidUsdc, withdrawnWeth,
            swapSucceeded, timestamp,
          ] = parsed.args;
          console.log(`  ActionExecuted (logId=${logId})`);
          console.log(`    action        : ${action}`);
          console.log(`    riskScore     : ${riskScore}`);
          console.log(`    hfBefore      : ${formatHF(hfB as bigint)}`);
          console.log(`    hfAfter       : ${formatHF(hfA as bigint)}`);
          console.log(`    withdrawnWeth : ${ethers.formatEther(withdrawnWeth as bigint)} WETH`);
          console.log(`    swappedWeth   : ${ethers.formatEther(swappedWeth as bigint)} WETH`);
          console.log(`    receivedUsdc  : ${ethers.formatUnits(receivedUsdc as bigint, 6)} USDC`);
          console.log(`    repaidUsdc    : ${ethers.formatUnits(repaidUsdc as bigint, 6)} USDC`);
          console.log(`    swapSucceeded : ${swapSucceeded}`);
          console.log(`    timestamp     : ${new Date(Number(timestamp) * 1000).toISOString()}`);
          break;
        }
        case 'SwapExecuted': {
          const [tokenIn, tokenOut, amtIn, amtOut] = parsed.args;
          console.log(`  SwapExecuted: ${ethers.formatEther(amtIn as bigint)} WETH → ${ethers.formatUnits(amtOut as bigint, 6)} USDC`);
          console.log(`    tokenIn : ${tokenIn}`);
          console.log(`    tokenOut: ${tokenOut}`);
          break;
        }
        case 'SwapSkipped': {
          const [tokenIn, amtIn, reason] = parsed.args;
          console.log(`  SwapSkipped: ${ethers.formatEther(amtIn as bigint)} WETH — ${reason}`);
          break;
        }
        case 'ReportReceived':
          console.log(`  ReportReceived: ts=${parsed.args[2]}`);
          break;
      }
    } catch {
      // Log from a different contract (e.g. Aave) — skip silently
    }
  }

  if (!actionEventFound) {
    console.log('  (no ActionExecuted event — check if vault has a position)');
  }

  // ── After state ────────────────────────────────────────────────────────────
  const [colAfter, debtAfter, , , , hfAfter]: bigint[] = await vault.getPosition();
  const wethAfter: bigint = await weth.balanceOf(cfg.vault);
  const usdcAfter: bigint = await usdc.balanceOf(cfg.vault);

  console.log('\n── AFTER ────────────────────────────────────────────────────────');
  console.log(`  Collateral  : ${usd8(colAfter)}`);
  console.log(`  Debt        : ${usd8(debtAfter)}`);
  console.log(`  Health F.   : ${formatHFColored(hfAfter)}`);
  console.log(`  Vault WETH  : ${ethers.formatEther(wethAfter)}`);
  console.log(`  Vault USDC  : ${ethers.formatUnits(usdcAfter, 6)}`);

  // ── Delta summary ──────────────────────────────────────────────────────────
  console.log('\n── DELTA ────────────────────────────────────────────────────────');

  const hfBeforeNum = hfBefore >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')
    ? Infinity : Number(hfBefore) / 1e18;
  const hfAfterNum  = hfAfter  >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')
    ? Infinity : Number(hfAfter)  / 1e18;

  const hfDelta = isFinite(hfBeforeNum) && isFinite(hfAfterNum)
    ? (hfAfterNum - hfBeforeNum).toFixed(4)
    : 'N/A';

  const debtDelta   = debtBefore - debtAfter;
  const wethDelta   = wethAfter  - wethBefore;
  const usdcDelta   = usdcAfter  - usdcBefore;

  console.log(`  HF change   : ${hfBeforeNum === Infinity ? '∞' : hfBeforeNum.toFixed(4)}  →  ${hfAfterNum === Infinity ? '∞' : hfAfterNum.toFixed(4)}  (${Number(hfDelta) >= 0 ? '+' : ''}${hfDelta})`);
  console.log(`  Debt repaid : ${usd8(debtDelta >= 0n ? debtDelta : 0n)}`);
  console.log(`  WETH change : ${Number(ethers.formatEther(wethDelta >= 0n ? wethDelta : -wethDelta)) * (wethDelta >= 0n ? 1 : -1)} WETH`);
  console.log(`  USDC change : ${ethers.formatUnits(usdcDelta >= 0n ? usdcDelta : -usdcDelta, 6)} USDC ${usdcDelta >= 0n ? '(gained)' : '(spent)'}`);

  console.log(`\n✓ ${actionArg} action executed successfully on ${cfg.label}`);
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
