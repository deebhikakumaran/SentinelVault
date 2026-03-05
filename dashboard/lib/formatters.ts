// Formatting helpers for DeFi values

/** Aave base units are 8-decimal USD → divide by 1e8 for dollars */
export function formatUSD(base: string | bigint): string {
  const n = typeof base === 'string' ? BigInt(base) : base
  const dollars = Number(n) / 1e8
  if (dollars === 0) return '$0.00'
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`
  if (dollars >= 1_000)     return `$${(dollars / 1_000).toFixed(2)}K`
  return `$${dollars.toFixed(2)}`
}

/** Health factor is 18-decimal (1e18 = HF of 1.0) */
export function formatHF(raw: string | bigint): number {
  const n = typeof raw === 'string' ? BigInt(raw) : raw
  // Max uint256 ≈ 1.15e77; Aave returns this when no debt
  if (n >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')) return Infinity
  return Number(n) / 1e18
}

export function formatHFDisplay(raw: string | bigint): string {
  const hf = formatHF(raw)
  if (!isFinite(hf)) return '∞'
  return hf.toFixed(4)
}

export function hfColor(hf: number): string {
  if (!isFinite(hf)) return '#00ff88'
  if (hf < 1.2) return '#ff2d55'
  if (hf < 1.5) return '#ffd60a'
  return '#00ff88'
}

export function hfStatus(hf: number): 'safe' | 'warning' | 'danger' {
  if (!isFinite(hf)) return 'safe'
  if (hf < 1.2) return 'danger'
  if (hf < 1.5) return 'warning'
  return 'safe'
}

/** LTV from Aave basis points (e.g. 6500 = 65%) */
export function formatLTV(ltv: string | bigint, threshold: string | bigint): number {
  const l = typeof ltv === 'string' ? Number(ltv) : Number(ltv)
  const t = typeof threshold === 'string' ? Number(threshold) : Number(threshold)
  if (t === 0) return 0
  return Math.min((l / t) * 100, 100)
}

/** Current LTV utilisation = debt / collateral */
export function ltvUtilisation(debt: string | bigint, collateral: string | bigint): number {
  const d = typeof debt === 'string' ? BigInt(debt) : debt
  const c = typeof collateral === 'string' ? BigInt(collateral) : collateral
  if (c === 0n) return 0
  return Math.min(Number((d * 10000n) / c) / 100, 100)
}

export function actionColor(action: string): string {
  switch (action) {
    case 'EMERGENCY_EXIT': return '#ff2d55'
    case 'DELEVERAGE':     return '#ff6b35'
    case 'REBALANCE':      return '#ffd60a'
    case 'SWAP_TO_STABLE': return '#00d4ff'
    default:               return '#00ff88' // HOLD
  }
}

export function actionBg(action: string): string {
  switch (action) {
    case 'EMERGENCY_EXIT': return 'rgba(255, 45, 85, 0.15)'
    case 'DELEVERAGE':     return 'rgba(255, 107, 53, 0.15)'
    case 'REBALANCE':      return 'rgba(255, 214, 10, 0.15)'
    case 'SWAP_TO_STABLE': return 'rgba(0, 212, 255, 0.15)'
    default:               return 'rgba(0, 255, 136, 0.12)'
  }
}

export function riskColor(score: number): string {
  if (score >= 85) return '#ff2d55'
  if (score >= 70) return '#ff6b35'
  if (score >= 50) return '#ffd60a'
  return '#00ff88'
}

export function riskAction(score: number): string {
  if (score >= 85) return 'EMERGENCY_EXIT'
  if (score >= 70) return 'DELEVERAGE'
  if (score >= 50) return 'REBALANCE'
  return 'HOLD'
}

export function formatTimestamp(ts: string | number): string {
  const ms = typeof ts === 'string' ? Number(ts) * 1000 : ts
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function formatRelativeTime(ts: string | number): string {
  const ms   = typeof ts === 'string' ? Number(ts) * 1000 : ts
  const diff = Date.now() - ms
  const s    = Math.floor(diff / 1000)
  if (s < 60)  return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ms).toLocaleDateString()
}
