'use client'

import { formatUSD, formatHFDisplay, formatHF, actionColor, actionBg, riskColor, formatTimestamp, formatRelativeTime } from '@/lib/formatters'

type Assessment = {
  index:        number
  riskScore:    number
  action:       string
  healthFactor: string
  totalDebtUsd: string
  worstChain:   string
  timestamp:    string
}

interface ActionLogProps {
  assessments: Assessment[]
  count:       number
}

function RiskBadge({ score }: { score: number }) {
  const color = riskColor(score)
  return (
    <span
      className="sv-num font-bold inline-flex items-center justify-center rounded"
      style={{
        color,
        background:  `${color}18`,
        border:      `1px solid ${color}44`,
        fontSize:    '0.7rem',
        padding:     '2px 6px',
        minWidth:    '32px',
      }}
    >
      {score}
    </span>
  )
}

export default function ActionLog({ assessments, count }: ActionLogProps) {
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(assessments, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `sentinel-assessments-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="sv-card p-5 flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="sv-label">AUDIT LOG</span>
          <span
            className="sv-num text-xs px-2 py-0.5 rounded"
            style={{ color: 'var(--sv-blue)', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', fontSize: '0.65rem' }}
          >
            {count} TOTAL
          </span>
        </div>
        <button
          onClick={handleExport}
          disabled={assessments.length === 0}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-all"
          style={{
            background:  'rgba(0,212,255,0.08)',
            border:      '1px solid rgba(0,212,255,0.2)',
            color:       assessments.length > 0 ? 'var(--sv-blue)' : 'var(--sv-dim)',
            fontFamily:  'Orbitron, monospace',
            fontSize:    '0.6rem',
            letterSpacing: '0.08em',
            cursor:      assessments.length > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          ↓ EXPORT JSON
        </button>
      </div>

      {/* Log entries */}
      {assessments.length === 0
        ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="sv-label animate-pulse">AWAITING FIRST ASSESSMENT</div>
            <div className="text-xs" style={{ color: 'var(--sv-dim)' }}>
              Registry will populate after first CRE cron trigger
            </div>
          </div>
        )
        : (
          <div className="flex flex-col gap-0 -mx-1">
            {/* Column headers */}
            <div
              className="grid items-center px-3 py-2 text-left"
              style={{
                gridTemplateColumns: '56px 1fr 68px 80px 80px',
                gap: '12px',
              }}
            >
              {['SCORE', 'ACTION', 'HEALTH F.', 'CHAIN', 'TIME'].map(h => (
                <span key={h} className="sv-label" style={{ fontSize: '0.58rem' }}>{h}</span>
              ))}
            </div>

            <div className="sv-divider" />

            {assessments.map((a, i) => {
              const hf    = formatHF(a.healthFactor)
              const color = actionColor(a.action)
              return (
                <div
                  key={a.index}
                  className="grid items-center px-3 py-2.5 rounded transition-colors"
                  style={{
                    gridTemplateColumns: '56px 1fr 68px 80px 80px',
                    gap:        '12px',
                    background: i === 0 ? actionBg(a.action) : 'transparent',
                    borderLeft: i === 0 ? `2px solid ${color}` : '2px solid transparent',
                    animation:  i === 0 ? 'fade-up 0.4s ease-out' : undefined,
                  }}
                >
                  <RiskBadge score={a.riskScore} />

                  <span
                    className="sv-display font-semibold"
                    style={{ color, fontSize: '0.65rem', letterSpacing: '0.06em' }}
                  >
                    {a.action}
                  </span>

                  <span className="sv-num" style={{ color: 'var(--sv-text)', fontSize: '0.78rem' }}>
                    {isFinite(hf) ? hf.toFixed(3) : '∞'}
                  </span>

                  <span
                    className="sv-num truncate"
                    style={{ color: 'var(--sv-muted)', fontSize: '0.7rem' }}
                  >
                    {a.worstChain || 'none'}
                  </span>

                  <span
                    className="sv-num"
                    style={{ color: 'var(--sv-dim)', fontSize: '0.68rem' }}
                    title={formatTimestamp(a.timestamp)}
                  >
                    {formatRelativeTime(a.timestamp)}
                  </span>
                </div>
              )
            })}
          </div>
        )
      }

      {/* SentinelRegistry address */}
      <div className="sv-divider" />
      <div className="flex items-center justify-between">
        <span className="sv-label">SENTINELREGISTRY</span>
        <a
          href="https://sepolia.etherscan.io/address/0xb246C21e878A1276B21761F9d946eC91Fb1Da73e"
          target="_blank" rel="noopener noreferrer"
          className="sv-num hover:text-sv-blue transition-colors"
          style={{ fontSize: '0.65rem', color: 'var(--sv-dim)' }}
        >
          0xb246…a73e ↗ (Sepolia)
        </a>
      </div>
    </div>
  )
}
