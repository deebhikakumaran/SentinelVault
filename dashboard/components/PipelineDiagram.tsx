'use client'

export default function PipelineDiagram() {
  return (
    <div className="sv-card p-5 flex flex-col gap-4">
      <span className="sv-label">CRE WORKFLOW PIPELINE</span>

      {/* Main SVG diagram */}
      <div className="overflow-x-auto -mx-2 px-2">
        <svg
          viewBox="0 0 760 320"
          width="100%"
          style={{ minWidth: '560px' }}
          fill="none"
        >
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#3a4d6b" />
            </marker>
            <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#00d4ff" />
            </marker>
            <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#00ff88" />
            </marker>
            <marker id="arrow-orange" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#ff6b35" />
            </marker>
            {/* Animated flow */}
            <filter id="blue-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* ───── Row 1: Triggers ───── */}

          {/* CRON */}
          <rect x="20" y="40" width="120" height="48" rx="8"
            fill="rgba(0,212,255,0.06)" stroke="#00d4ff" strokeWidth="1" />
          <text x="80" y="60" textAnchor="middle" fill="#00d4ff"
            fontFamily="Orbitron,monospace" fontSize="9" letterSpacing="1">CRON TRIGGER</text>
          <text x="80" y="76" textAnchor="middle" fill="#3a4d6b"
            fontFamily="JetBrains Mono,monospace" fontSize="8">0 */5 * * * *</text>

          {/* Arrow: CRON → Aave Reads */}
          <line x1="140" y1="64" x2="178" y2="64" stroke="#00d4ff" strokeWidth="1.5"
            markerEnd="url(#arrow-blue)" />
          {/* Animated dot */}
          <circle r="3" fill="#00d4ff" opacity="0.9" filter="url(#blue-glow)">
            <animateMotion dur="1.8s" repeatCount="indefinite" path="M140,64 L178,64" />
          </circle>

          {/* MULTI-CHAIN AAVE */}
          <rect x="180" y="28" width="150" height="72" rx="8"
            fill="rgba(0,212,255,0.06)" stroke="#1a2540" strokeWidth="1.5" />
          <text x="255" y="50" textAnchor="middle" fill="#94a3b8"
            fontFamily="Orbitron,monospace" fontSize="8" letterSpacing="1">MULTI-CHAIN READ</text>
          {['Sepolia  ·  Aave V3', 'Base Sepolia  ·  Aave V3'].map((label, i) => (
            <g key={label}>
              <rect x="192" y={57 + i * 18} width="126" height="14" rx="4"
                fill="rgba(0,212,255,0.08)" stroke="rgba(0,212,255,0.2)" strokeWidth="0.8" />
              <text x="255" y={67 + i * 18} textAnchor="middle" fill="#00d4ff"
                fontFamily="JetBrains Mono,monospace" fontSize="8">{label}</text>
            </g>
          ))}

          {/* Arrow: Aave Reads → ConfHTTP */}
          <line x1="330" y1="64" x2="368" y2="64" stroke="#3a4d6b" strokeWidth="1.5"
            markerEnd="url(#arrow)" />

          {/* CONFIDENTIAL HTTP — DON TEE */}
          <rect x="370" y="24" width="160" height="80" rx="8"
            fill="rgba(255,107,53,0.06)" stroke="#ff6b35" strokeWidth="1.5" />
          {/* TEE badge */}
          <rect x="390" y="30" width="120" height="16" rx="4"
            fill="rgba(255,107,53,0.2)" />
          <text x="450" y="41" textAnchor="middle" fill="#ff6b35"
            fontFamily="Orbitron,monospace" fontSize="8" letterSpacing="1.5">DON TEE ENCLAVE</text>
          <text x="450" y="57" textAnchor="middle" fill="#94a3b8"
            fontFamily="Orbitron,monospace" fontSize="7.5">ConfidentialHTTP</text>
          <text x="450" y="71" textAnchor="middle" fill="#3a4d6b"
            fontFamily="JetBrains Mono,monospace" fontSize="7.5">CryptoCompare API</text>
          {/* Lock icon */}
          <text x="450" y="95" textAnchor="middle" fill="#ff6b35"
            fontFamily="monospace" fontSize="9" opacity="0.7">🔒 API KEY NEVER ON-CHAIN</text>

          {/* Arrow: ConfHTTP → Risk Scoring */}
          <line x1="530" y1="64" x2="568" y2="64" stroke="#3a4d6b" strokeWidth="1.5"
            markerEnd="url(#arrow)" />

          {/* RISK SCORING */}
          <rect x="570" y="30" width="168" height="68" rx="8"
            fill="rgba(255,214,10,0.06)" stroke="#ffd60a" strokeWidth="1.5" />
          <text x="654" y="52" textAnchor="middle" fill="#ffd60a"
            fontFamily="Orbitron,monospace" fontSize="9" letterSpacing="1">RISK SCORING</text>
          <text x="654" y="66" textAnchor="middle" fill="#3a4d6b"
            fontFamily="JetBrains Mono,monospace" fontSize="8">Health Factor 0–45 pts</text>
          <text x="654" y="79" textAnchor="middle" fill="#3a4d6b"
            fontFamily="JetBrains Mono,monospace" fontSize="8">LTV + Sentiment + Chains</text>
          <text x="654" y="92" textAnchor="middle" fill="#ffd60a"
            fontFamily="JetBrains Mono,monospace" fontSize="8" fontWeight="700">Score 0–100</text>

          {/* ───── Row 2: Outputs ───── */}

          {/* Down arrow from Risk Scoring */}
          <line x1="654" y1="98" x2="654" y2="140" stroke="#ffd60a" strokeWidth="1.5"
            markerEnd="url(#arrow-orange)" />
          <circle r="3" fill="#ffd60a" opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path="M654,98 L654,140" />
          </circle>

          {/* Split line */}
          <line x1="490" y1="156" x2="654" y2="156" stroke="#3a4d6b" strokeWidth="1.5" strokeDasharray="4 3" />

          {/* ALWAYS arrow → Registry */}
          <line x1="490" y1="156" x2="490" y2="190" stroke="#00ff88" strokeWidth="1.5"
            markerEnd="url(#arrow-green)" />
          <text x="450" y="152" fill="#00ff88" fontFamily="Orbitron,monospace" fontSize="7" opacity="0.7">ALWAYS</text>

          {/* IF ≥ 50 arrow → Vault */}
          <line x1="654" y1="156" x2="654" y2="190" stroke="#ff6b35" strokeWidth="1.5"
            markerEnd="url(#arrow-orange)" />
          <text x="660" y="175" fill="#ff6b35" fontFamily="Orbitron,monospace" fontSize="7" opacity="0.7">IF SCORE ≥ 50</text>

          {/* SENTINEL REGISTRY */}
          <rect x="380" y="192" width="220" height="52" rx="8"
            fill="rgba(0,255,136,0.06)" stroke="#00ff88" strokeWidth="1.5" />
          <text x="490" y="214" textAnchor="middle" fill="#00ff88"
            fontFamily="Orbitron,monospace" fontSize="9" letterSpacing="1">SENTINELREGISTRY</text>
          <text x="490" y="228" textAnchor="middle" fill="#3a4d6b"
            fontFamily="JetBrains Mono,monospace" fontSize="8">Immutable audit log (Sepolia)</text>
          <text x="490" y="240" textAnchor="middle" fill="#00ff88"
            fontFamily="JetBrains Mono,monospace" fontSize="7.5">0xed1b…F2de</text>

          {/* SENTINEL VAULT */}
          <rect x="560" y="192" width="180" height="52" rx="8"
            fill="rgba(255,107,53,0.08)" stroke="#ff6b35" strokeWidth="1.5" />
          <text x="650" y="214" textAnchor="middle" fill="#ff6b35"
            fontFamily="Orbitron,monospace" fontSize="9" letterSpacing="1">SENTINELVAULT</text>
          <text x="650" y="228" textAnchor="middle" fill="#3a4d6b"
            fontFamily="JetBrains Mono,monospace" fontSize="8">onReport() ← KeystoneForwarder</text>
          <text x="650" y="240" textAnchor="middle" fill="#ff6b35"
            fontFamily="JetBrains Mono,monospace" fontSize="7.5">Sepolia + Base Sepolia</text>

          {/* Animated flow dot along the data-flow arrow */}
          <circle r="3" fill="#00ff88" opacity="0.9" filter="url(#blue-glow)">
            <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.5s"
              path="M490,156 L490,190" />
          </circle>

          {/* ───── Row 3: Vault execution ───── */}

          {/* Down arrow from Vault */}
          <line x1="650" y1="244" x2="650" y2="270" stroke="#ff6b35" strokeWidth="1.5"
            markerEnd="url(#arrow-orange)" />

          {/* Execution chain */}
          <rect x="20" y="272" width="720" height="40" rx="8"
            fill="rgba(255,107,53,0.04)" stroke="#1a2540" strokeWidth="1" />

          {/* Execution steps */}
          {[
            { x: 60,  label: 'Aave.withdraw()', color: '#00d4ff' },
            { x: 230, label: 'MockDEX.swap()', color: '#ffd60a' },
            { x: 400, label: 'Aave.repay()',    color: '#00ff88' },
            { x: 560, label: 'HF Recovers',     color: '#00ff88' },
          ].map(({ x, label, color }, i, arr) => (
            <g key={label}>
              <text x={x} y={298} textAnchor="middle" fill={color}
                fontFamily="JetBrains Mono,monospace" fontSize="9.5">{label}</text>
              {i < arr.length - 1 && (
                <line x1={x + 70} y1="292" x2={x + 110} y2="292" stroke="#3a4d6b"
                  strokeWidth="1.5" markerEnd="url(#arrow)" />
              )}
            </g>
          ))}

          <text x="380" y="312" textAnchor="middle" fill="#3a4d6b"
            fontFamily="Orbitron,monospace" fontSize="7.5" letterSpacing="1">
            ATOMIC EXECUTION — SINGLE TRANSACTION
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 pt-2">
        {[
          { color: '#00d4ff', label: 'CRE read / trigger' },
          { color: '#ff6b35', label: 'ConfidentialHTTP (DON TEE)' },
          { color: '#ffd60a', label: 'Risk scoring' },
          { color: '#00ff88', label: 'Audit log write' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: color }} />
            <span style={{ color: 'var(--sv-dim)', fontSize: '0.68rem', fontFamily: 'Rajdhani, sans-serif' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
