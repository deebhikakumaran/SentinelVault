import { NextResponse } from 'next/server'
import { ethers }       from 'ethers'
import { CHAINS, VAULT_ABI } from '@/lib/contracts'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results = await Promise.allSettled(
    Object.values(CHAINS).map(async (chain) => {
      const provider = new ethers.JsonRpcProvider(chain.rpc)
      const vault    = new ethers.Contract(chain.vault, VAULT_ABI, provider)

      const [positionResult, latestLogResult] = await Promise.allSettled([
        vault.getPosition(),
        vault.getLatestLog(),
      ])

      return {
        key:      chain.key,
        label:    chain.label,
        color:    chain.color,
        vault:    chain.vault,
        explorer: chain.explorer,

        position: positionResult.status === 'fulfilled'
          ? {
              totalCollateralBase:  positionResult.value.totalCollateralBase.toString(),
              totalDebtBase:        positionResult.value.totalDebtBase.toString(),
              availableBorrowsBase: positionResult.value.availableBorrowsBase.toString(),
              currentLiqThreshold:  positionResult.value.currentLiqThreshold.toString(),
              ltv:                  positionResult.value.ltv.toString(),
              healthFactor:         positionResult.value.healthFactor.toString(),
            }
          : null,

        latestLog: latestLogResult.status === 'fulfilled'
          ? {
              action:              latestLogResult.value.action,
              riskScore:           latestLogResult.value.riskScore.toString(),
              healthFactorBefore:  latestLogResult.value.healthFactorBefore.toString(),
              healthFactorAfter:   latestLogResult.value.healthFactorAfter.toString(),
              swappedWeth:         latestLogResult.value.swappedWeth.toString(),
              receivedUsdc:        latestLogResult.value.receivedUsdc.toString(),
              repaidUsdc:          latestLogResult.value.repaidUsdc.toString(),
              withdrawnWeth:       latestLogResult.value.withdrawnWeth.toString(),
              timestamp:           latestLogResult.value.timestamp.toString(),
              swapSucceeded:       latestLogResult.value.swapSucceeded,
            }
          : null,
      }
    })
  )

  const data = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean)

  return NextResponse.json({ data, timestamp: Date.now() })
}
