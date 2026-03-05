'use client'

import { useEffect, useState } from 'react'

interface HeaderProps {
  riskScore: number | null
  lastUpdated: number | null
}

export default function Header({ riskScore, lastUpdated }: HeaderProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const isAlert  = riskScore !== null && riskScore >= 50
  const isLoaded = riskScore !== null

  return (
    <header className="sv-card sv-glow-blue mb-6">
      <div className="px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">

        {/* Left: Logo + title */}
        <div className="flex items-center gap-4">
          {/* Shield SVG */}
          <div className="relative flex-shrink-0">
            <svg width="48" height="52" viewBox="0 0 48 52" fill="none">
              <defs>
                <linearGradient id="shield-grad" x1="0" y1="0" x2="48" y2="52" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stopColor="#00d4ff" />
                  <stop offset="100%" stopColor="#0052ff" />
                </linearGradient>
              </defs>
              <path
                d="M24 2L4 10v16c0 11.5 8.6 22.3 20 25 11.4-2.7 20-13.5 20-25V10L24 2z"
                fill="url(#shield-grad)"
                opacity="0.18"
                stroke="#00d4ff"
                strokeWidth="1.5"
              />
              <path
                d="M24 10L10 16.5V26c0 7.8 5.8 15.1 14 17 8.2-1.9 14-9.2 14-17V16.5L24 10z"
                fill="rgba(0,212,255,0.1)"
                stroke="#00d4ff"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
              {/* S letter */}
              <text x="24" y="32" textAnchor="middle" fill="#00d4ff"
                fontFamily="Orbitron,monospace" fontSize="14" fontWeight="700">
                S
              </text>
            </svg>
            {/* Pulse ring */}
            {isLoaded && (
              <span
                className="absolute -inset-1 rounded-full animate-ping opacity-20"
                style={{ background: isAlert ? '#ff2d55' : '#00d4ff' }}
              />
            )}
          </div>

          <div>
            <h1
              className="sv-display text-xl sm:text-2xl font-bold leading-none"
              style={{
                background: 'linear-gradient(135deg, #00d4ff 0%, #e2e8f0 60%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              SentinelVault
            </h1>
            <p className="text-xs sm:text-sm text-sv-muted mt-0.5 font-body" style={{ color: 'var(--sv-muted)' }}>
              Autonomous Cross-Chain DeFi Risk Protection&nbsp;
              <span className="hidden sm:inline" style={{ color: 'var(--sv-dim)' }}>|</span>
              <span className="hidden sm:inline" style={{ color: 'var(--sv-blue)', fontFamily: 'Orbitron, monospace', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                &nbsp;Powered by Chainlink CRE
              </span>
            </p>
          </div>
        </div>

        {/* Right: status + timestamp */}
        <div className="flex flex-col items-end gap-2 text-right">
          {/* Status pill */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs sv-display"
            style={{
              borderColor: isLoaded ? (isAlert ? '#ff2d55' : '#00ff88') : 'var(--sv-dim)',
              color:       isLoaded ? (isAlert ? '#ff2d55' : '#00ff88') : 'var(--sv-muted)',
              background:  isLoaded ? (isAlert ? 'rgba(255,45,85,0.08)' : 'rgba(0,255,136,0.08)') : 'transparent',
            }}
          >
            <span
              className="sv-dot"
              style={{
                background:  isLoaded ? (isAlert ? '#ff2d55' : '#00ff88') : 'var(--sv-dim)',
                boxShadow:   isLoaded ? `0 0 8px ${isAlert ? '#ff2d55' : '#00ff88'}` : 'none',
                animation:   'pulse-dot 2s ease-in-out infinite',
              }}
            />
            {isLoaded ? (isAlert ? 'ALERT' : 'MONITORING') : 'CONNECTING'}
          </div>

          {/* Clock */}
          <div className="sv-num text-xs" style={{ color: 'var(--sv-dim)' }}>
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          {lastUpdated && (
            <div className="text-xs" style={{ color: 'var(--sv-dim)', fontSize: '0.65rem' }}>
              Updated {Math.floor((Date.now() - lastUpdated) / 1000)}s ago
            </div>
          )}
        </div>
      </div>

      {/* Bottom ticker bar */}
      <div
        className="border-t px-6 py-2 flex items-center gap-6 overflow-x-auto"
        style={{ borderColor: 'var(--sv-border)', background: 'rgba(0,0,0,0.2)' }}
      >
        <span className="sv-label flex-shrink-0">SYSTEM STATUS</span>
        {[
          { label: 'CRE WORKFLOW', value: 'ACTIVE', color: '#00ff88' },
          { label: 'CHAINS',       value: 'SEPOLIA · BASE-SEPOLIA', color: '#00d4ff' },
          { label: 'INTERVAL',     value: '5 MIN', color: '#94a3b8' },
          { label: 'REGISTRY',     value: 'SEPOLIA', color: '#94a3b8' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-2 flex-shrink-0">
            <span className="sv-label">{label}</span>
            <span className="sv-num text-xs font-medium" style={{ color, fontSize: '0.7rem' }}>{value}</span>
          </div>
        ))}
      </div>
    </header>
  )
}
