import { NextResponse } from 'next/server'
import { ethers }       from 'ethers'
import { CHAINS }       from '@/lib/contracts'

export const dynamic = 'force-dynamic'

// Target HF after borrowing: 1.35 (expressed as × 10000)
const TARGET_HF_BPS = BigInt(13500)

const VAULT_ABI = [
  'function borrowFromAave(uint256 amount) external',
  'function getPosition() view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiqThreshold, uint256 ltv, uint256 healthFactor)',
  'function owner() view returns (address)',
]

export async function POST(req: Request) {
  const body = await req.json() as { chain?: string }
  const chainKey = body.chain

  const chain = chainKey ? CHAINS[chainKey as keyof typeof CHAINS] : undefined
  if (!chain) {
    return NextResponse.json({ error: 'Invalid chain. Use "sepolia" or "base".' }, { status: 400 })
  }

  const rawKey = process.env.PRIVATE_KEY
  if (!rawKey) {
    return NextResponse.json(
      { error: 'PRIVATE_KEY not set. Create dashboard/.env.local with PRIVATE_KEY=<your-key>.' },
      { status: 500 }
    )
  }
  const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`

  try {
    const provider = new ethers.JsonRpcProvider(chain.rpc)
    const signer   = new ethers.Wallet(privateKey, provider)
    const vault    = new ethers.Contract(chain.vault, VAULT_ABI, signer)

    const [colBefore, debtBefore, availBefore, liqThreshold, , hfBefore] =
      await vault.getPosition() as [bigint, bigint, bigint, bigint, bigint, bigint]

    if (colBefore === BigInt(0)) {
      return NextResponse.json(
        { error: 'Vault has no collateral. Supply WETH to vault first via supplyToAave().' },
        { status: 400 }
      )
    }

    // HF = (collateral × liqThreshold) / (debt × 10000)
    // → targetDebt = (collateral × liqThreshold) / (targetHF × 10000)
    const targetDebtBase = (colBefore * liqThreshold) / TARGET_HF_BPS

    if (targetDebtBase <= debtBefore) {
      return NextResponse.json({
        status:        'already_risky',
        message:       `HF is already below target (1.35). Position is risky — ready to trigger CRE action.`,
        healthFactor:  hfBefore.toString(),
        debt:          debtBefore.toString(),
        collateral:    colBefore.toString(),
      })
    }

    const extraDebtBase   = targetDebtBase - debtBefore
    const extraBorrowUsdc = extraDebtBase / BigInt(100)   // 8-dec USD → 6-dec USDC
    const availUsdc       = availBefore / BigInt(100)
    const actualBorrow    = extraBorrowUsdc < availUsdc ? extraBorrowUsdc : availUsdc

    if (actualBorrow === BigInt(0)) {
      return NextResponse.json(
        { error: 'No additional borrow capacity — vault is already at max LTV.' },
        { status: 400 }
      )
    }

    const tx      = await vault.borrowFromAave(actualBorrow)
    const receipt = await tx.wait() as { hash: string }

    const [colAfter, debtAfter, , , , hfAfter] =
      await vault.getPosition() as [bigint, bigint, bigint, bigint, bigint, bigint]

    return NextResponse.json({
      status:       'success',
      chain:        chain.label,
      txHash:       receipt.hash,
      borrowedUsdc: ethers.formatUnits(actualBorrow, 6),
      before: {
        healthFactor: hfBefore.toString(),
        debt:         debtBefore.toString(),
        collateral:   colBefore.toString(),
      },
      after: {
        healthFactor: hfAfter.toString(),
        debt:         debtAfter.toString(),
        collateral:   colAfter.toString(),
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
