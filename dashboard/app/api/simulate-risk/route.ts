import { NextResponse } from 'next/server'
import { ethers }       from 'ethers'
import { CHAINS, VAULT_ABI } from '@/lib/contracts'

export const dynamic = 'force-dynamic'

// Read-only: explains what a risk simulation WOULD do.
// Actual execution requires a private key and is handled by scripts/trigger-risk.ts
export async function POST() {
  try {
    const positions = await Promise.allSettled(
      Object.values(CHAINS).map(async (chain) => {
        const provider = new ethers.JsonRpcProvider(chain.rpc)
        const vault    = new ethers.Contract(chain.vault, VAULT_ABI, provider)
        const pos      = await vault.getPosition()
        return {
          chain:        chain.label,
          healthFactor: pos.healthFactor.toString(),
          debt:         pos.totalDebtBase.toString(),
          collateral:   pos.totalCollateralBase.toString(),
        }
      })
    )

    const currentPositions = positions
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(Boolean)

    return NextResponse.json({
      status:  'read-only',
      message: 'Simulation requires PRIVATE_KEY. Run: cd scripts && npx ts-node trigger-risk.ts sepolia',
      currentPositions,
      steps: [
        '1. Borrow additional USDC from Aave (lowers Health Factor)',
        '2. Wait for CRE cron trigger (≤5 min)',
        '3. CRE workflow detects elevated risk score',
        '4. SentinelVault.onReport() called by KeystoneForwarder',
        '5. Vault executes: withdraw WETH → swap to USDC → repay debt',
        '6. Health Factor recovers to safe range',
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
