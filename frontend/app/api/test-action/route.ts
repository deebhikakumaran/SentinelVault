import { NextResponse } from 'next/server'
import { ethers }       from 'ethers'
import { CHAINS }       from '@/lib/contracts'

export const dynamic = 'force-dynamic'

const RISK_SCORES: Record<string, number> = {
  EMERGENCY_EXIT: 90,
  DELEVERAGE:     75,
  REBALANCE:      60,
  SWAP_TO_STABLE: 55,
  HOLD:           20,
}

const VAULT_ABI = [
  'function onReport(bytes calldata metadata, bytes calldata report) external',
  'function getPosition() view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiqThreshold, uint256 ltv, uint256 healthFactor)',
  'function owner() view returns (address)',
  'event ActionExecuted(uint256 indexed logId, string action, uint256 riskScore, uint256 hfBefore, uint256 hfAfter, uint256 swappedWeth, uint256 receivedUsdc, uint256 repaidUsdc, uint256 withdrawnWeth, bool swapSucceeded, uint256 timestamp)',
  'event SwapSkipped(address tokenIn, uint256 amountIn, string reason)',
]

export async function POST(req: Request) {
  const body = await req.json() as { chain?: string; action?: string }
  const { chain: chainKey, action } = body

  const chain = chainKey ? CHAINS[chainKey as keyof typeof CHAINS] : undefined
  if (!chain) {
    return NextResponse.json({ error: 'Invalid chain. Use "sepolia" or "base".' }, { status: 400 })
  }
  if (!action || !(action in RISK_SCORES)) {
    return NextResponse.json(
      { error: `Invalid action. Use: ${Object.keys(RISK_SCORES).join(', ')}` },
      { status: 400 }
    )
  }

  const rawKey = process.env.PRIVATE_KEY
  if (!rawKey) {
    return NextResponse.json(
      { error: 'PRIVATE_KEY not set. Create frontend/.env.local with PRIVATE_KEY=<your-key>.' },
      { status: 500 }
    )
  }
  const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`

  try {
    const provider = new ethers.JsonRpcProvider(chain.rpc)
    const signer   = new ethers.Wallet(privateKey, provider)
    const vault    = new ethers.Contract(chain.vault, VAULT_ABI, signer)

    const posBefore = await vault.getPosition() as [bigint, bigint, bigint, bigint, bigint, bigint]
    const hfBefore  = posBefore[5]
    const colBefore = posBefore[0]
    const debtBefore = posBefore[1]

    // Encode CRE report payload — matches abi.decode in SentinelVault.onReport()
    const riskScore = RISK_SCORES[action]
    const ts        = Math.floor(Date.now() / 1000)
    const report    = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'uint256', 'uint256', 'uint256'],
      [action, BigInt(riskScore), hfBefore, BigInt(ts)],
    )

    const tx      = await vault.onReport('0x', report)
    const receipt = await tx.wait() as { hash: string; logs: ethers.Log[] }

    const posAfter = await vault.getPosition() as [bigint, bigint, bigint, bigint, bigint, bigint]
    const hfAfter  = posAfter[5]
    const colAfter = posAfter[0]
    const debtAfter = posAfter[1]

    // Parse events for UI summary
    const iface   = new ethers.Interface(VAULT_ABI)
    const events: string[] = []
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log)
        if (!parsed) continue
        if (parsed.name === 'ActionExecuted') {
          const withdrawnWeth = parsed.args[8] as bigint
          const receivedUsdc  = parsed.args[6] as bigint
          const repaidUsdc    = parsed.args[7] as bigint
          const swapOk        = parsed.args[9] as boolean
          const swappedWeth   = parsed.args[5] as bigint
          if (withdrawnWeth > BigInt(0))
            events.push(`Withdrew ${ethers.formatEther(withdrawnWeth)} WETH from Aave`)
          if (swapOk && receivedUsdc > BigInt(0))
            events.push(`Swapped → received ${ethers.formatUnits(receivedUsdc, 6)} USDC`)
          else if (swappedWeth > BigInt(0))
            events.push('Swap attempted — WETH held in vault (swap skipped/failed)')
          if (repaidUsdc > BigInt(0))
            events.push(`Repaid ${ethers.formatUnits(repaidUsdc, 6)} USDC to Aave`)
        } else if (parsed.name === 'SwapSkipped') {
          events.push(`Swap skipped: ${parsed.args[2] as string}`)
        }
      } catch { /* non-vault log */ }
    }

    return NextResponse.json({
      status: 'success',
      chain:  chain.label,
      action,
      txHash: receipt.hash,
      events,
      before: {
        healthFactor: hfBefore.toString(),
        collateral:   colBefore.toString(),
        debt:         debtBefore.toString(),
      },
      after: {
        healthFactor: hfAfter.toString(),
        collateral:   colAfter.toString(),
        debt:         debtAfter.toString(),
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
