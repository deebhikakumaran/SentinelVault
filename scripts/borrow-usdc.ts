/**
 * borrow-usdc.ts
 *
 * Borrow USDC from the vault to increase debt.
 *
 * Usage:
 *   npx ts-node borrow-usdc.ts <sepolia|base> <amount>
 *
 * Example:
 *   npx ts-node borrow-usdc.ts base 10
 */

import { ethers } from "ethers"
import * as dotenv from "dotenv"
import * as path from "path"
import addresses from "./addresses.json"

dotenv.config({ path: path.resolve(__dirname, "..", ".env") })

const VAULT_ABI = [
  "function borrowFromAave(uint256 amount) external",
  "function owner() view returns (address)"
]

async function main() {

  const chain = process.argv[2]
  const amount = process.argv[3]

  if (!chain || !amount) {
    console.log("Usage: npx ts-node borrow-usdc.ts <sepolia|base> <amount>")
    process.exit(1)
  }

  const cfg = addresses[chain as keyof typeof addresses]

  const provider = new ethers.JsonRpcProvider(cfg.rpc)
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  const vault = new ethers.Contract(cfg.vault, VAULT_ABI, signer)

  const owner = await vault.owner()

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signer is not vault owner")
  }

  const usdcAmount = ethers.parseUnits(amount, 6)

  console.log(`Borrowing ${amount} USDC from ${cfg.label}`)

  const tx = await vault.borrowFromAave(usdcAmount)

  console.log("Transaction sent:", tx.hash)

  await tx.wait()

  console.log("Borrow successful")
}

main().catch(console.error)