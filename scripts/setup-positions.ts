/**
 * setup-positions.ts
 *
 * For each chain (Sepolia, Base Sepolia):
 *   1. Ensures the vault holds enough WETH (via Aave faucet or ETH wrapping)
 *   2. Supplies 0.5 WETH as collateral into Aave
 *   3. Borrows USDC to target health factor ~1.75
 *   4. Prints position summary table
 *
 * Usage: cd scripts && npx ts-node setup-positions.ts
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

const SUPPLY_WETH   = ethers.parseEther('0.5');      // 0.5 WETH collateral
const FAUCET_MINT   = ethers.parseEther('1.0');       // 1 WETH from faucet (buffer)
const TARGET_HF_BPS = 17500n;                         // 1.75 × 10000 (target health factor)

// ─────────────────────────────────────────────────────────────────────────────
// ABIs (minimal)
// ─────────────────────────────────────────────────────────────────────────────

const VAULT_ABI = [
  'function supplyToAave(uint256 amount) external',
  'function borrowFromAave(uint256 amount) external',
  'function getPosition() view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiqThreshold, uint256 ltv, uint256 healthFactor)',
  'function getBalances() view returns (uint256 wethBal, uint256 usdcBal, uint256 ethBal)',
  'function owner() view returns (address)',
];

const WETH_ABI = [
  'function deposit() payable',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

const FAUCET_ABI = [
  'function mint(address token, address to, uint256 amount) external returns (uint256)',
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChainConfig {
  label: string;
  chainId: number;
  rpc: string;
  vault: string;
  aavePool: string;
  weth: string;
  usdc: string;
  faucet: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatHF(hf: bigint): string {
  // Aave returns MaxUint256 when there is no debt (HF = ∞)
  if (hf >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')) {
    return '∞';
  }
  return (Number(hf) / 1e18).toFixed(3);
}

function formatUSD(base: bigint): string {
  // Aave base units: 8-decimal USD. e.g. $1500 = 150_000_000_000
  return '$' + (Number(base) / 1e8).toFixed(2);
}

/**
 * Ensure the vault holds WETH for collateral supply.
 * Strategy 1: Aave testnet faucet (mints directly to vault — no ETH cost).
 * Strategy 2: signer wraps available ETH (balance − gas reserve) → transfers to vault.
 *
 * Returns the vault's actual WETH balance after the operation.
 * Wraps whatever the signer can afford rather than requiring an exact amount,
 * so this works on testnet wallets with small balances (e.g. 0.08–0.1 ETH).
 */
async function ensureVaultWeth(
  signer: ethers.Wallet,
  cfg: ChainConfig,
  targetAmount: bigint,
): Promise<bigint> {
  const GAS_RESERVE = ethers.parseEther('0.01');
  const weth = new ethers.Contract(cfg.weth, WETH_ABI, signer);
  const vaultBal: bigint = await weth.balanceOf(cfg.vault);

  if (vaultBal >= targetAmount) {
    console.log(`     vault already holds ${ethers.formatEther(vaultBal)} WETH — skipping mint`);
    return vaultBal;
  }

  const needed = targetAmount - vaultBal;

  // Strategy 1: Aave faucet (mint directly to vault)
  if (cfg.faucet) {
    try {
      console.log(`     trying Aave faucet (${cfg.faucet})…`);
      const faucet = new ethers.Contract(cfg.faucet, FAUCET_ABI, signer);
      const tx = await faucet.mint(cfg.weth, cfg.vault, FAUCET_MINT);
      const receipt = await tx.wait();
      console.log(`     faucet minted ${ethers.formatEther(FAUCET_MINT)} WETH → vault  (tx ${receipt.hash.slice(0, 10)}…)`);
      return await weth.balanceOf(cfg.vault);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.log(`     faucet failed: ${msg}`);
      console.log(`     falling back to WETH.deposit()…`);
    }
  }

  // Strategy 2a: signer already has WETH (e.g. minted via Aave UI faucet) — transfer directly.
  const signerWeth: bigint = await weth.balanceOf(signer.address);
  if (signerWeth > 0n) {
    const toTransfer = signerWeth < needed ? signerWeth : needed;
    console.log(`     signer holds ${ethers.formatEther(signerWeth)} WETH — transferring ${ethers.formatEther(toTransfer)} to vault…`);
    const transferTx = await weth.transfer(cfg.vault, toTransfer);
    await transferTx.wait();
    console.log(`     transferred ${ethers.formatEther(toTransfer)} WETH to vault`);
    return await weth.balanceOf(cfg.vault);
  }

  // Strategy 2b: wrap available ETH from signer via WETH.deposit().
  // If balance < needed + GAS_RESERVE, wrap what we can rather than failing hard.
  // NOTE: some chains (e.g. Base Sepolia) use a bridged WETH where deposit() accepts ETH
  // but does NOT mint ERC20 tokens. We verify the balance increased after the call.

  // Base Sepolia's WETH is a bridged token: deposit() accepts ETH but does NOT mint ERC20.
  // Skip deposit() entirely and prompt the user to bridge ETH or use the Aave faucet.
  const BRIDGED_WETH = '0x4200000000000000000000000000000000000006';
  if (cfg.weth.toLowerCase() === BRIDGED_WETH.toLowerCase()) {
    throw new Error(
      `${cfg.label}: WETH (${cfg.weth}) is a bridged token — deposit() does not mint ERC20.\n` +
      `  Bridge more ETH to Base Sepolia, or mint testnet WETH from the Aave faucet:\n` +
      `    https://app.aave.com/faucet/?marketName=proto_base_sepolia_v3`,
    );
  }

  const signerEth = await signer.provider!.getBalance(signer.address);
  if (signerEth <= GAS_RESERVE) {
    throw new Error(`${cfg.label}: signer only has ${ethers.formatEther(signerEth)} ETH — not enough even for gas`);
  }

  const available = signerEth - GAS_RESERVE;
  const toWrap    = available < needed ? available : needed;  // min(available, needed)

  if (toWrap < needed) {
    console.log(
      `     ⚠ signer has ${ethers.formatEther(signerEth)} ETH; ` +
      `wrapping ${ethers.formatEther(toWrap)} (target was ${ethers.formatEther(needed)})`,
    );
  } else {
    console.log(`     wrapping ${ethers.formatEther(toWrap)} ETH → WETH…`);
  }

  const depositTx = await weth.deposit({ value: toWrap });
  await depositTx.wait();

  // Verify deposit() actually minted WETH — on chains like Base Sepolia, deposit() can
  // accept ETH via fallback without minting ERC20 tokens (bridged WETH model).
  const wethAfterDeposit: bigint = await weth.balanceOf(signer.address);
  if (wethAfterDeposit < toWrap) {
    throw new Error(
      `deposit() succeeded but WETH balance did not increase ` +
      `(got ${ethers.formatEther(wethAfterDeposit)} WETH, expected ${ethers.formatEther(toWrap)}).\n` +
      `  This chain's WETH is a bridged token and cannot be wrapped locally.\n` +
      `  ➜ Mint testnet WETH from the Aave faucet UI:\n` +
      `    https://app.aave.com/faucet/?marketName=proto_${cfg.label.includes('Base') ? 'base_sepolia' : 'arbitrum_sepolia'}_v3\n` +
      `  Then re-run this script — it will transfer from your wallet automatically.`,
    );
  }

  const transferTx = await weth.transfer(cfg.vault, toWrap);
  await transferTx.wait();
  console.log(`     transferred ${ethers.formatEther(toWrap)} WETH to vault`);

  return await weth.balanceOf(cfg.vault);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-chain setup
// ─────────────────────────────────────────────────────────────────────────────

async function setupChain(cfg: ChainConfig, privateKey: string): Promise<{
  chain: string;
  collateralUSD: string;
  debtUSD: string;
  hf: string;
  vault: string;
  borrowedUsdc: string;
}> {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${cfg.label}  (chainId ${cfg.chainId})`);
  console.log(`  vault: ${cfg.vault}`);

  const provider = new ethers.JsonRpcProvider(cfg.rpc);
  const signer   = new ethers.Wallet(privateKey, provider);
  const vault    = new ethers.Contract(cfg.vault, VAULT_ABI, signer);

  // Verify ownership
  const ownerAddr: string = await vault.owner();
  if (ownerAddr.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer ${signer.address} is NOT the vault owner (owner = ${ownerAddr}). ` +
      `Check PRIVATE_KEY in .env.`,
    );
  }

  // ── Step 1: check existing position ───────────────────────────────────────
  const [colBefore, debtBefore, , , , hfBefore]: bigint[] = await vault.getPosition();

  if (colBefore > 0n) {
    console.log(
      `  existing position: collateral ${formatUSD(colBefore)}  ` +
      `debt ${formatUSD(debtBefore)}  HF ${formatHF(hfBefore)}`,
    );
  }

  // ── Step 2: supply WETH (up to SUPPLY_WETH, capped by available balance) ──
  if (colBefore === 0n) {
    console.log(`  Step 1/2  — getting WETH for vault…`);
    const vaultWeth = await ensureVaultWeth(signer, cfg, SUPPLY_WETH);

    const supplyAmount = vaultWeth < SUPPLY_WETH ? vaultWeth : SUPPLY_WETH;
    console.log(`  Step 2/2  — calling vault.supplyToAave(${ethers.formatEther(supplyAmount)} WETH)…`);
    const supplyTx = await vault.supplyToAave(supplyAmount);
    const supplyRcpt = await supplyTx.wait();
    console.log(`     supplied  (tx ${supplyRcpt.hash.slice(0, 10)}…)`);
  } else {
    console.log(`  collateral already set — skipping supply step`);
  }

  // ── Step 3: borrow USDC for target HF ~1.75 ───────────────────────────────
  const [colAfterSupply, debtAfterSupply, , liqThreshold]: bigint[] = await vault.getPosition();

  if (debtAfterSupply === 0n) {
    // targetDebt = (collateral × liqThreshold) / (targetHF × 10000)
    // liqThreshold is in bps (e.g. 8250 = 82.5%)
    // Divide result by 100 to convert 8-dec USD → 6-dec USDC
    const targetDebtBase = (colAfterSupply * liqThreshold) / TARGET_HF_BPS;
    const borrowUsdc     = targetDebtBase / 100n;

    console.log(`  borrowing ${ethers.formatUnits(borrowUsdc, 6)} USDC (target HF 1.75)…`);
    const borrowTx = await vault.borrowFromAave(borrowUsdc);
    const borrowRcpt = await borrowTx.wait();
    console.log(`     borrowed  (tx ${borrowRcpt.hash.slice(0, 10)}…)`);
  } else {
    console.log(`  debt already set — skipping borrow step`);
  }

  // ── Step 4: read final position ───────────────────────────────────────────
  const [colFinal, debtFinal, , , , hfFinal]: bigint[] = await vault.getPosition();
  const [wethBal, usdcBal]: bigint[] = await (async () => {
    const r: bigint[] = await vault.getBalances();
    return r;
  })();

  const weth = new ethers.Contract(cfg.weth, ERC20_ABI, provider);
  const usdc = new ethers.Contract(cfg.usdc, ERC20_ABI, provider);
  const vaultWeth: bigint = await weth.balanceOf(cfg.vault);
  const vaultUsdc: bigint = await usdc.balanceOf(cfg.vault);

  console.log(`\n  ✓ Final position:`);
  console.log(`     Collateral : ${formatUSD(colFinal)} (${ethers.formatUnits(colFinal, 8)} base)`);
  console.log(`     Debt       : ${formatUSD(debtFinal)}`);
  console.log(`     Health F.  : ${formatHF(hfFinal)}`);
  console.log(`     Vault WETH : ${ethers.formatEther(vaultWeth)} WETH`);
  console.log(`     Vault USDC : ${ethers.formatUnits(vaultUsdc, 6)} USDC`);

  return {
    chain        : cfg.label,
    collateralUSD: formatUSD(colFinal),
    debtUSD      : formatUSD(debtFinal),
    hf           : formatHF(hfFinal),
    vault        : cfg.vault,
    borrowedUsdc : ethers.formatUnits(vaultUsdc, 6),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not set in .env');

  console.log('SentinelVault — setup Aave positions across 2 testnets');
  console.log(`Deployer: 0x${Buffer.from(
    new ethers.Wallet(privateKey).address.slice(2),
    'hex',
  ).toString('hex').toUpperCase()}`);

  const chains = [
    addresses.sepolia as ChainConfig,
    addresses.base    as ChainConfig,
  ];

  const rows: Awaited<ReturnType<typeof setupChain>>[] = [];

  for (const cfg of chains) {
    try {
      const row = await setupChain(cfg, privateKey);
      rows.push(row);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  ERROR on ${cfg.label}: ${msg}`);
      rows.push({
        chain        : cfg.label,
        collateralUSD: 'ERROR',
        debtUSD      : 'ERROR',
        hf           : 'ERROR',
        vault        : cfg.vault,
        borrowedUsdc : 'ERROR',
      });
    }
  }

  // ── Summary table ──────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(90)}`);
  console.log('POSITION SUMMARY');
  console.log('═'.repeat(90));
  console.log(
    'Chain'.padEnd(20) +
    'Collateral'.padEnd(14) +
    'Debt'.padEnd(12) +
    'Health F.'.padEnd(12) +
    'Vault USDC'.padEnd(14) +
    'Vault Address',
  );
  console.log('─'.repeat(90));
  for (const r of rows) {
    console.log(
      r.chain.padEnd(20) +
      r.collateralUSD.padEnd(14) +
      r.debtUSD.padEnd(12) +
      r.hf.padEnd(12) +
      r.borrowedUsdc.padEnd(14) +
      r.vault,
    );
  }
  console.log('═'.repeat(90));
  console.log('\nDone. Run verify-positions.ts to confirm all chains are healthy.');
}

main().catch((err) => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
