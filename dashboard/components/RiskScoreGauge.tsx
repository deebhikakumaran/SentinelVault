'use client'

import { riskColor, riskAction, actionColor, actionBg } from '@/lib/formatters'

interface RiskScoreGaugeProps {
  score:    number | null
  worstHF:  number | null
  chains:   number
}

export default function RiskScoreGauge({ score, worstHF, chains }: RiskScoreGaugeProps) {
  const s      = score ?? 0
  const color  = riskColor(s)
  const action = riskAction(s)

  // Semi-circle geometry: center at (120, 110), radius 88
  const cx = 120, cy = 110, r = 88

  // Track path: left to right, 180° arc (top half)
  const trackD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`

  // Filled arc: score 0→100 maps to 0→180°
  const fraction  = s / 100
  const angleRad  = Math.PI * (1 - fraction) // starts at π (left) and sweeps to 0 (right)
  const arcEndX   = cx + r * Math.cos(angleRad)
  const arcEndY   = cy - r * Math.sin(angleRad)
  const largeArc  = fraction > 0.5 ? 1 : 0
  const filledD   = fraction <= 0
    ? ''
    : `M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${arcEndX} ${arcEndY}`

  // Needle: from center at angle
  const needleRad = Math.PI * (1 - fraction)
  const nx        = cx + (r - 16) * Math.cos(needleRad)
  const ny        = cy - (r - 16) * Math.sin(needleRad)

  // Zone ticks at 50, 70, 85
  const ticks = [
    { val: 50,  label: '50',  col: '#ffd60a' },
    { val: 70,  label: '70',  col: '#ff6b35' },
    { val: 85,  label: '85',  col: '#ff2d55' },
  ]

  return (
    <div className="sv-card p-6 flex flex-col items-center gap-4">

      {/* Section label */}
      <div className="w-full flex items-center justify-between">
        <span className="sv-label">RISK ASSESSMENT</span>
        <span className="sv-label" style={{ color: 'var(--sv-dim)', fontSize: '0.6rem' }}>
          {chains} CHAIN{chains !== 1 ? 'S' : ''} MONITORED
        </span>
      </div>

      {/* Gauge SVG */}
      <svg width="240" height="140" viewBox="0 0 240 140">
        <defs>
          <linearGradient id="gauge-track" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#00ff88" stopOpacity="0.2" />
            <stop offset="45%"  stopColor="#ffd60a" stopOpacity="0.2" />
            <stop offset="70%"  stopColor="#ff6b35" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ff2d55" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="gauge-fill" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#00ff88" />
            <stop offset="45%"  stopColor="#ffd60a" />
            <stop offset="70%"  stopColor="#ff6b35" />
            <stop offset="100%" stopColor="#ff2d55" />
          </linearGradient>
        </defs>

        {/* Background glow disc */}
        <ellipse cx={cx} cy={cy} rx={r + 20} ry={30} fill={color} opacity="0.03" />

        {/* Track */}
        <path d={trackD} fill="none" stroke="url(#gauge-track)" strokeWidth="14" strokeLinecap="round" />
        <path d={trackD} fill="none" stroke="#1a2540" strokeWidth="12" strokeLinecap="round" />

        {/* Filled arc */}
        {filledD && (
          <path
            d={filledD}
            fill="none"
            stroke="url(#gauge-fill)"
            strokeWidth="12"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${color})`, transition: 'd 0.8s ease' }}
          />
        )}

        {/* Zone ticks */}
        {ticks.map(({ val, label, col }) => {
          const ta = Math.PI * (1 - val / 100)
          const tx1 = cx + (r - 8)  * Math.cos(ta)
          const ty1 = cy - (r - 8)  * Math.sin(ta)
          const tx2 = cx + (r + 8)  * Math.cos(ta)
          const ty2 = cy - (r + 8)  * Math.sin(ta)
          const tlx = cx + (r + 18) * Math.cos(ta)
          const tly = cy - (r + 18) * Math.sin(ta)
          return (
            <g key={val}>
              <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={col} strokeWidth="2" opacity="0.6" />
              <text x={tlx} y={tly + 4} textAnchor="middle" fill={col} fontFamily="JetBrains Mono" fontSize="9" opacity="0.8">
                {label}
              </text>
            </g>
          )
        })}

        {/* Zone labels along arc */}
        {[
          { val: 25,  text: 'SAFE' },
          { val: 60,  text: 'CAUTION' },
          { val: 78,  text: 'DANGER' },
          { val: 93,  text: 'CRITICAL' },
        ].map(({ val, text }) => {
          const a = Math.PI * (1 - val / 100)
          const lx = cx + (r - 32) * Math.cos(a)
          const ly = cy - (r - 32) * Math.sin(a)
          return (
            <text key={text} x={lx} y={ly} textAnchor="middle"
              fill="#3a4d6b" fontFamily="Orbitron,monospace" fontSize="6" letterSpacing="0.5">
              {text}
            </text>
          )
        })}

        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={nx} y2={ny}
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'x2 0.8s ease, y2 0.8s ease' }}
        />
        <circle cx={cx} cy={cy} r="5" fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
        <circle cx={cx} cy={cy} r="3" fill="#0a0e1a" />

        {/* Score display */}
        <text
          x={cx} y={cy - 24}
          textAnchor="middle"
          fill={color}
          fontFamily="Orbitron,monospace"
          fontSize="28"
          fontWeight="900"
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
        >
          {score !== null ? s : '—'}
        </text>
        <text
          x={cx} y={cy - 10}
          textAnchor="middle"
          fill="#3a4d6b"
          fontFamily="Orbitron,monospace"
          fontSize="7"
          letterSpacing="2"
        >
          / 100
        </text>
      </svg>

      {/* Action label */}
      <div className="flex flex-col items-center gap-2">
        <span
          className="sv-badge px-5 py-2"
          style={{
            color:      actionColor(action),
            borderColor: actionColor(action),
            background:  actionBg(action),
            fontSize:   '0.75rem',
            boxShadow:  `0 0 16px ${actionColor(action)}22`,
          }}
        >
          {score !== null ? action : 'AWAITING DATA'}
        </span>
      </div>

      {/* Metrics row */}
      <div className="sv-divider w-full" />
      <div className="w-full grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="sv-label">WORST HF</div>
          <div className="sv-num font-bold mt-1" style={{ color: worstHF !== null ? riskColor(s) : 'var(--sv-dim)', fontSize: '1.1rem' }}>
            {worstHF !== null ? (isFinite(worstHF) ? worstHF.toFixed(3) : '∞') : '—'}
          </div>
        </div>
        <div>
          <div className="sv-label">THRESHOLD</div>
          <div className="sv-num font-bold mt-1" style={{ color: 'var(--sv-muted)', fontSize: '1.1rem' }}>50</div>
        </div>
        <div>
          <div className="sv-label">CHAINS</div>
          <div className="sv-num font-bold mt-1" style={{ color: 'var(--sv-blue)', fontSize: '1.1rem' }}>{chains}</div>
        </div>
      </div>
    </div>
  )
}
