import { NextResponse } from 'next/server'
import { ethers }       from 'ethers'
import { CHAINS }       from '@/lib/contracts'

export const dynamic = 'force-dynamic'

const LOG_ABI = [
  `function getLog(uint256 id) view returns (
    tuple(
      string   action,
      uint256  riskScore,
      uint256  healthFactorBefore,
      uint256  healthFactorAfter,
      uint256  swappedWeth,
      uint256  receivedUsdc,
      uint256  repaidUsdc,
      uint256  withdrawnWeth,
      uint256  timestamp,
      bool     swapSucceeded
    )
  )`,
]

async function fetchChainLogs(chain: (typeof CHAINS)[keyof typeof CHAINS]) {
  const provider = new ethers.JsonRpcProvider(chain.rpc)
  const vault    = new ethers.Contract(chain.vault, LOG_ABI, provider)

  const logs = []
  for (let i = 0; ; i++) {
    try {
      const log = await vault.getLog(i)
      logs.push({
        id:                 i,
        action:             log.action as string,
        riskScore:          log.riskScore.toString(),
        healthFactorBefore: log.healthFactorBefore.toString(),
        healthFactorAfter:  log.healthFactorAfter.toString(),
        swappedWeth:        log.swappedWeth.toString(),
        receivedUsdc:       log.receivedUsdc.toString(),
        repaidUsdc:         log.repaidUsdc.toString(),
        withdrawnWeth:      log.withdrawnWeth.toString(),
        timestamp:          log.timestamp.toString(),
        swapSucceeded:      log.swapSucceeded as boolean,
      })
    } catch {
      break // reached end of array
    }
  }

  return {
    chain:  chain.key,
    label:  chain.label,
    color:  chain.color,
    vault:  chain.vault,
    explorer: chain.explorer,
    logs:   logs.reverse(), // newest first
  }
}

export async function GET() {
  const results = await Promise.allSettled(
    Object.values(CHAINS).map(fetchChainLogs)
  )
  const data = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean)
  return NextResponse.json({ data, timestamp: Date.now() })
}
