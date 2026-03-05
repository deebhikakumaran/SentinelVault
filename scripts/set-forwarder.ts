/**
 * set-forwarder.ts
 *
 * Sets the KeystoneForwarder address on both SentinelVault deployments
 * (Sepolia + Base Sepolia) after CRE workflow deployment.
 *
 * The KeystoneForwarder address is obtained from the CRE gateway after deploying
 * the workflow. It authorizes the DON to call onReport() on the vault.
 *
 * Usage:
 *   cd scripts
 *   npx ts-node set-forwarder.ts <forwarder-address>
 *
 * Example:
 *   npx ts-node set-forwarder.ts 0xAbCd...1234
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

async function main(): Promise<void> {
  const forwarderArg = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!forwarderArg || !ethers.isAddress(forwarderArg)) {
    console.error('Usage: npx ts-node set-forwarder.ts <forwarder-address> [--dry-run]');
    console.error('Example: npx ts-node set-forwarder.ts 0xAbCd...1234');
    process.exit(1);
  }

  const newForwarder = ethers.getAddress(forwarderArg); // checksummed

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not set in .env');

  console.log('\nSentinelVault — Set KeystoneForwarder');
  console.log(`New forwarder : ${newForwarder}`);
  console.log(`Dry run       : ${dryRun}\n`);

  const chains = [
    { key: 'sepolia', ...addresses.sepolia },
    { key: 'base',    ...addresses.base    },
  ];

  for (const chain of chains) {
    console.log(`── ${chain.label} ─────────────────────────────────────────────`);
    console.log(`   vault    : ${chain.vault}`);
    console.log(`   rpc      : ${chain.rpc}`);

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

  console.log('Done. Both vaults are now authorized to accept CRE reports from the DON.');
  console.log('Next step: wait for the first cron tick and check SentinelRegistry.');
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
