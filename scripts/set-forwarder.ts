/**
 * set-forwarder.ts
 *
 * Sets the simulation MockKeystoneForwarder address on both SentinelVault deployments
 * (Sepolia + Base Sepolia). Each chain uses its own forwarder address.
 *
 * Simulation forwarders (cre workflow simulate --broadcast):
 *   Sepolia:      0x15fc6ae953e024d975e77382eeec56a9101f9f88
 *   Base Sepolia: 0x82300bd7c3958625581cc2f77bc6464dcecdf3e5
 *
 * Usage:
 *   cd scripts
 *   npx ts-node set-forwarder.ts [--dry-run]
 *
 * Pass --dry-run to simulate without sending transactions.
 *
 * Requires: PRIVATE_KEY in ../.env (no 0x prefix)
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as path from 'path';
import addresses from './addresses.json';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const VAULT_ABI = [
  'function setForwarder(address _forwarder) external',
  'function forwarder() view returns (address)',
  'function owner() view returns (address)',
  'event ForwarderUpdated(address indexed oldForwarder, address indexed newForwarder)',
];

// CRE simulation forwarders (MockKeystoneForwarder) per chain
// Source: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
const SIMULATION_FORWARDERS: Record<string, string> = {
  sepolia: '0x15fc6ae953e024d975e77382eeec56a9101f9f88',
  base:    '0x82300bd7c3958625581cc2f77bc6464dcecdf3e5',
};

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not set in .env');

  console.log('\nSentinelVault — Set Simulation Forwarders (MockKeystoneForwarder)');
  console.log(`Dry run : ${dryRun}\n`);

  const chains = [
    { key: 'sepolia', ...addresses.sepolia },
    { key: 'base',    ...addresses.base    },
  ];

  for (const chain of chains) {
    const newForwarder = ethers.getAddress(SIMULATION_FORWARDERS[chain.key]);
    console.log(`── ${chain.label} ─────────────────────────────────────────────`);
    console.log(`   vault       : ${chain.vault}`);
    console.log(`   forwarder   : ${newForwarder}`);
    console.log(`   rpc         : ${chain.rpc}`);

    const provider = new ethers.JsonRpcProvider(chain.rpc);
    const signer   = new ethers.Wallet(privateKey, provider);
    const vault    = new ethers.Contract(chain.vault, VAULT_ABI, signer);

    // Verify ownership
    const owner: string = await vault.owner();
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
      console.error(`   ERROR: Signer ${signer.address} is not the vault owner (${owner})`);
      console.error('   Skipping this chain.');
      continue;
    }

    const currentForwarder: string = await vault.forwarder();
    console.log(`   current forwarder : ${currentForwarder}`);

    if (currentForwarder.toLowerCase() === newForwarder.toLowerCase()) {
      console.log('   Already set — skipping.');
      console.log();
      continue;
    }

    if (dryRun) {
      console.log(`   [DRY RUN] Would call setForwarder(${newForwarder})`);
      console.log();
      continue;
    }

    try {
      const tx = await vault.setForwarder(newForwarder);
      console.log(`   tx sent  : ${tx.hash}`);
      const receipt: ethers.TransactionReceipt = await tx.wait();
      console.log(`   confirmed: block ${receipt.blockNumber}, gas ${receipt.gasUsed.toLocaleString()}`);

      // Parse ForwarderUpdated event
      const iface = new ethers.Interface(VAULT_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === 'ForwarderUpdated') {
            console.log(`   ForwarderUpdated: ${parsed.args[0]} → ${parsed.args[1]}`);
          }
        } catch { /* non-vault log */ }
      }

      // Verify on-chain
      const updated: string = await vault.forwarder();
      if (updated.toLowerCase() === newForwarder.toLowerCase()) {
        console.log(`   verified : forwarder is now ${updated}`);
      } else {
        console.error(`   WARNING: on-chain forwarder is ${updated}, expected ${newForwarder}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ERROR calling setForwarder: ${msg}`);
    }

    console.log();
  }

  console.log('Done. Both vaults are now authorized to accept CRE reports.');
  console.log('Next step: run `cre workflow simulate risk-assessment --target staging-settings --broadcast`');
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
