import { NextResponse }  from 'next/server'
import { ethers }        from 'ethers'
import { REGISTRY, REGISTRY_ABI } from '@/lib/contracts'

export const dynamic = 'force-dynamic'

const MAX_ENTRIES = 10

export async function GET() {
  try {
    const provider  = new ethers.JsonRpcProvider(REGISTRY.rpc)
    const registry  = new ethers.Contract(REGISTRY.address, REGISTRY_ABI, provider)

    const countBig: bigint = await registry.getAssessmentCount()
    const count = Number(countBig)

    if (count === 0) {
      return NextResponse.json({ assessments: [], count: 0, timestamp: Date.now() })
    }

    const start = Math.max(0, count - MAX_ENTRIES)
    const indices = Array.from({ length: count - start }, (_, i) => start + i)

    const settled = await Promise.allSettled(
      indices.map((i) => registry.getAssessment(i))
    )

    const assessments = settled
      .map((r, i) => {
        if (r.status !== 'fulfilled') return null
        const v = r.value
        return {
          index:       start + i,
          riskScore:   Number(v.riskScore),
          action:      v.action as string,
          healthFactor: v.healthFactor.toString(),
          totalDebtUsd: v.totalDebtUsd.toString(),
          worstChain:  v.worstChain as string,
          timestamp:   v.timestamp.toString(),
        }
      })
      .filter(Boolean)
      .reverse() // newest first

    return NextResponse.json({ assessments, count, timestamp: Date.now() })
  } catch (err) {
    console.error('[assessments] fetch error:', err)
    return NextResponse.json({ assessments: [], count: 0, timestamp: Date.now(), error: String(err) })
  }
}
