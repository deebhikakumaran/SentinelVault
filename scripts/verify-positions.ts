/**
 * verify-positions.ts
 *
 * Read-only: polls all 2 vault Aave positions and prints a formatted table.
 * No wallet / signing required.
 *
 * Usage: cd scripts && npx ts-node verify-positions.ts
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';
import addresses from './addresses.json';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─────────────────────────────────────────────────────────────────────────────
// ABIs (minimal, read-only)
// ─────────────────────────────────────────────────────────────────────────────

const VAULT_ABI = [
  'function getPosition() view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiqThreshold, uint256 ltv, uint256 healthFactor)',
  'function getBalances() view returns (uint256 wethBal, uint256 usdcBal, uint256 ethBal)',
  'function owner() view returns (address)',
  'function forwarder() view returns (address)',
  'function ethPriceUsd() view returns (uint256)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatHF(hf: bigint): string {
  if (hf >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')) {
    return '     ∞';
  }
  const val = Number(hf) / 1e18;
  const str = val.toFixed(3);
  // Color-code: <1.2 danger, <1.5 warning, >=1.5 ok
  if (val < 1.2)  return `🔴 ${str}`;
  if (val < 1.5)  return `🟡 ${str}`;
  return              `🟢 ${str}`;
}

function usd8(base: bigint): string {
  return '$' + (Number(base) / 1e8).toFixed(2);
}

function ltvPct(ltv: bigint): string {
  return (Number(ltv) / 100).toFixed(1) + '%';
}

interface Row {
  chain: string;
  collateral: string;
  debt: string;
  available: string;
  ltv: string;
  hf: string;
  vaultWeth: string;
  vaultUsdc: string;
  vaultEth: string;
  vault: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-chain query
// ─────────────────────────────────────────────────────────────────────────────

async function queryChain(cfg: typeof addresses.sepolia): Promise<Row> {
  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const vault    = new ethers.Contract(cfg.vault, VAULT_ABI, provider);
  const weth     = new ethers.Contract(cfg.weth,  ERC20_ABI, provider);
  const usdc     = new ethers.Contract(cfg.usdc,  ERC20_ABI, provider);

  const [
    totalCollateralBase,
    totalDebtBase,
    availableBorrowsBase,
    ,
    ltv,
    healthFactor,
  ]: bigint[] = await vault.getPosition();

  const [wethBal, usdcBal, ethBal]: bigint[] = await vault.getBalances();

  // Sanity-check via direct ERC20 balanceOf (in case getBalances has a stale view)
  const wethToken: bigint = await weth.balanceOf(cfg.vault);
  const usdcToken: bigint = await usdc.balanceOf(cfg.vault);

  return {
    chain    : (cfg as { label: string }).label,
    collateral: usd8(totalCollateralBase),
    debt      : usd8(totalDebtBase),
    available : usd8(availableBorrowsBase),
    ltv       : ltvPct(ltv),
    hf        : formatHF(healthFactor),
    vaultWeth : ethers.formatEther(wethToken),
    vaultUsdc : ethers.formatUnits(usdcToken, 6),
    vaultEth  : ethers.formatEther(ethBal),
    vault     : cfg.vault,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('SentinelVault — position verification');
  console.log(new Date().toISOString());
  console.log();

  const chains = [addresses.sepolia, addresses.base];

  // Query all chains in parallel
  const results = await Promise.allSettled(
    chains.map((cfg) => queryChain(cfg as typeof addresses.sepolia)),
  );

  const rows: Row[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`Error on ${chains[i].label}: ${r.reason}`);
    return {
      chain    : (chains[i] as { label: string }).label,
      collateral: 'ERROR',
      debt      : 'ERROR',
      available : 'ERROR',
      ltv       : 'ERROR',
      hf        : 'ERROR',
      vaultWeth : 'ERROR',
      vaultUsdc : 'ERROR',
      vaultEth  : 'ERROR',
      vault     : chains[i].vault,
    };
  });

  // ── Detailed per-chain printout ────────────────────────────────────────────
  for (const r of rows) {
    console.log(`${'─'.repeat(60)}`);
    console.log(`${r.chain}`);
    console.log(`  Vault         : ${r.vault}`);
    console.log(`  Collateral    : ${r.collateral}`);
    console.log(`  Debt          : ${r.debt}`);
    console.log(`  Available bor : ${r.available}`);
    console.log(`  Current LTV   : ${r.ltv}`);
    console.log(`  Health Factor : ${r.hf}`);
    console.log(`  Vault WETH    : ${r.vaultWeth}`);
    console.log(`  Vault USDC    : ${r.vaultUsdc}`);
    console.log(`  Vault ETH     : ${r.vaultEth}`);
  }

  // ── Summary table ──────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(86)}`);
  console.log('SUMMARY TABLE');
  console.log('═'.repeat(86));
  const H = 'Chain'.padEnd(20) + 'Collateral'.padEnd(12) + 'Debt'.padEnd(12) +
            'Avail.Bor'.padEnd(12) + 'LTV'.padEnd(8) + 'Health Factor'.padEnd(16) +
            'Vault WETH';
  console.log(H);
  console.log('─'.repeat(86));
  for (const r of rows) {
    console.log(
      r.chain.padEnd(20) +
      r.collateral.padEnd(12) +
      r.debt.padEnd(12) +
      r.available.padEnd(12) +
      r.ltv.padEnd(8) +
      r.hf.padEnd(16) +
      r.vaultWeth,
    );
  }
  console.log('═'.repeat(86));

  // ── Risk status ────────────────────────────────────────────────────────────
  console.log('\nRisk thresholds:  HOLD < 1.5  |  REBALANCE ≥ 1.5  |  DELEVERAGE ≥ 1.2  |  EMERGENCY_EXIT < 1.2');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
