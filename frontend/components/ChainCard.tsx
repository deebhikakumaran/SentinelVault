'use client'

import { formatUSD, formatHFDisplay, formatHF, hfColor, ltvUtilisation, actionColor, actionBg, formatRelativeTime } from '@/lib/formatters'

type Position = {
  totalCollateralBase:  string
  totalDebtBase:        string
  currentLiqThreshold:  string
  ltv:                  string
  healthFactor:         string
}

type ActionLog = {
  action:             string
  riskScore:          string
  healthFactorBefore: string
  healthFactorAfter:  string
  timestamp:          string
  swapSucceeded:      boolean
}

interface ChainCardProps {
  label:     string
  color:     string
  vault:     string
  explorer:  string
  position:  Position | null
  latestLog: ActionLog | null
}

// Circular HF gauge (270° arc)
function HFGauge({ hfRaw }: { hfRaw: string }) {
  const hf     = formatHF(hfRaw)
  const hfDisp = formatHFDisplay(hfRaw)
  const color  = hfColor(hf)

  const cx = 70, cy = 70, r = 54
  const circumference = 2 * Math.PI * r
  const arcLen = circumference * 0.75  // 270° arc

  const fraction = isFinite(hf) ? Math.min(hf / 3, 1) : 1
  const filled   = fraction * arcLen

  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <defs>
          <filter id={`glow-${color.replace('#', '')}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Track arc (270°, dark) */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#1a2540"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference - arcLen}`}
          transform={`rotate(135 ${cx} ${cy})`}
        />

        {/* Filled arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform={`rotate(135 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.8s ease' }}
        />

        {/* Tick marks at 1.2, 1.5, 2.0 */}
        {[1.2, 1.5, 2.0].map((v) => {
          const a  = (135 + (v / 3) * 270) * (Math.PI / 180)
          const x1 = cx + (r - 7)  * Math.cos(a)
          const y1 = cy + (r - 7)  * Math.sin(a)
          const x2 = cx + (r + 4) * Math.cos(a)
          const y2 = cy + (r + 4) * Math.sin(a)
          const tc = v <= 1.2 ? '#ff2d55' : v <= 1.5 ? '#ffd60a' : '#3a4d6b'
          return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tc} strokeWidth="2" />
        })}

        {/* Center HF value */}
        <text
          x={cx} y={cy - 6}
          textAnchor="middle"
          fill={color}
          fontFamily="JetBrains Mono, monospace"
          fontSize="22"
          fontWeight="700"
        >
          {hfDisp}
        </text>
        <text
          x={cx} y={cy + 12}
          textAnchor="middle"
          fill="#3a4d6b"
          fontFamily="Orbitron, monospace"
          fontSize="7"
          letterSpacing="2"
        >
          HEALTH FACTOR
        </text>

        {/* Bottom labels */}
        <text x="16" y="128" textAnchor="middle" fill="#3a4d6b" fontFamily="JetBrains Mono" fontSize="9">0</text>
        <text x="124" y="128" textAnchor="middle" fill="#3a4d6b" fontFamily="JetBrains Mono" fontSize="9">3+</text>
      </svg>
    </div>
  )
}

// LTV utilisation bar
function LTVBar({ debt, collateral }: { debt: string; collateral: string }) {
  const util = ltvUtilisation(debt, collateral)
  const color = util > 80 ? '#ff2d55' : util > 70 ? '#ffd60a' : '#00d4ff'

  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="sv-label">LTV UTILISATION</span>
        <span className="sv-num text-xs" style={{ color, fontSize: '0.7rem' }}>
          {util.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: 'var(--sv-dim)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${util}%`,
            background: `linear-gradient(90deg, #00d4ff, ${color})`,
            boxShadow:  `0 0 6px ${color}`,
            transition: 'width 0.8s ease',
          }}
        />
      </div>
    </div>
  )
}

export default function ChainCard({ label, color, vault, explorer, position, latestLog }: ChainCardProps) {
  const hf = position ? formatHF(position.healthFactor) : null
  const status = hf === null ? 'loading' : !isFinite(hf!) ? 'safe' : hf < 1.2 ? 'danger' : hf < 1.5 ? 'warning' : 'safe'
  const glowClass = status === 'danger' ? 'sv-glow-red' : status === 'safe' ? 'sv-glow-green' : ''

  return (
    <div className={`sv-card ${glowClass} p-5 flex flex-col gap-4`}>

      {/* Chain header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          />
          <span className="sv-display font-semibold text-sm" style={{ color: 'var(--sv-text)' }}>
            {label}
          </span>
        </div>
        <a
          href={`${explorer}/address/${vault}`}
          target="_blank" rel="noopener noreferrer"
          className="sv-label hover:text-sv-blue transition-colors"
          style={{ fontSize: '0.6rem' }}
        >
          {vault.slice(0, 6)}…{vault.slice(-4)} ↗
        </a>
      </div>

      {/* HF Gauge */}
      {position
        ? <HFGauge hfRaw={position.healthFactor} />
        : (
          <div className="flex items-center justify-center h-[140px]">
            <div className="sv-label animate-pulse">LOADING...</div>
          </div>
        )
      }

      {/* Position metrics */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'COLLATERAL', value: position ? formatUSD(position.totalCollateralBase) : '—' },
          { label: 'DEBT',       value: position ? formatUSD(position.totalDebtBase)       : '—' },
        ].map(({ label: l, value }) => (
          <div key={l} className="space-y-0.5">
            <div className="sv-label">{l}</div>
            <div className="sv-num font-semibold" style={{ color: 'var(--sv-text)', fontSize: '1.05rem' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* LTV bar */}
      {position && (
        <LTVBar debt={position.totalDebtBase} collateral={position.totalCollateralBase} />
      )}

      {/* Latest action */}
      <div className="sv-divider" />
      <div className="flex items-center justify-between">
        <span className="sv-label">LAST ACTION</span>
        {latestLog
          ? (
            <div className="flex items-center gap-2">
              <span
                className="sv-badge"
                style={{
                  color:            actionColor(latestLog.action),
                  borderColor:      actionColor(latestLog.action),
                  background:       actionBg(latestLog.action),
                }}
              >
                {latestLog.action}
              </span>
              <span className="sv-num text-xs" style={{ color: 'var(--sv-dim)', fontSize: '0.65rem' }}>
                {formatRelativeTime(latestLog.timestamp)}
              </span>
            </div>
          )
          : <span className="sv-num text-xs" style={{ color: 'var(--sv-dim)' }}>No actions yet</span>
        }
      </div>
    </div>
  )
}
