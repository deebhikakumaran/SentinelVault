'use client'

import { useState } from 'react'

type SimResult = {
  status:    string
  message:   string
  steps:     string[]
  currentPositions: { chain: string; healthFactor: string }[]
}

function formatHF(raw: string) {
  const n = BigInt(raw)
  if (n >= BigInt('0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0')) return '∞'
  return (Number(n) / 1e18).toFixed(4)
}

export default function SimulateButton() {
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<SimResult | null>(null)
  const [showModal, setShowModal] = useState(false)

  async function handleSimulate() {
    setLoading(true)
    setShowModal(true)
    try {
      const res  = await fetch('/api/simulate-risk', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({
        status:    'error',
        message:   'Failed to connect to API',
        steps:     [],
        currentPositions: [],
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* The button */}
      <div className="sv-card p-6 flex flex-col items-center gap-4">
        <span className="sv-label text-center">LIVE RISK SIMULATION</span>
        <p className="text-sm text-center" style={{ color: 'var(--sv-muted)', maxWidth: '420px' }}>
          Trigger a risk event to demonstrate the full CRE protection loop:
          borrow extra USDC → lower HF → CRE fires → vault executes → HF recovers.
        </p>

        <button
          onClick={handleSimulate}
          disabled={loading}
          className="relative group flex items-center gap-3 px-8 py-4 rounded-xl font-bold transition-all duration-200"
          style={{
            background:    loading ? 'rgba(255,107,53,0.1)' : 'rgba(255,107,53,0.12)',
            border:        '1.5px solid #ff6b35',
            color:         '#ff6b35',
            fontFamily:    'Orbitron, monospace',
            fontSize:      '0.85rem',
            letterSpacing: '0.08em',
            boxShadow:     '0 0 20px rgba(255,107,53,0.15)',
            cursor:        loading ? 'wait' : 'pointer',
          }}
        >
          {/* Ripple */}
          <span
            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(255,107,53,0.06)' }}
          />

          {loading ? (
            <>
              {/* Spinning shield */}
              <svg width="22" height="22" viewBox="0 0 22 22" style={{ animation: 'spin 1s linear infinite' }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); transform-origin: center; } }`}</style>
                <circle cx="11" cy="11" r="9" stroke="#ff6b35" strokeWidth="2" strokeDasharray="20 40" fill="none" />
              </svg>
              ANALYZING...
            </>
          ) : (
            <>
              <span style={{ fontSize: '1.2rem' }}>⚡</span>
              SIMULATE RISK EVENT
            </>
          )}
        </button>

        <div className="text-xs" style={{ color: 'var(--sv-dim)' }}>
          For live simulation with tx execution, run:{' '}
          <code className="sv-num" style={{ color: 'var(--sv-muted)', fontSize: '0.7rem' }}>
            cd scripts && npx ts-node trigger-risk.ts sepolia
          </code>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(6px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            className="sv-card w-full max-w-lg flex flex-col gap-5 p-6"
            style={{
              borderColor: '#ff6b35',
              boxShadow:   '0 0 40px rgba(255,107,53,0.2)',
              animation:   'fade-up 0.3s ease-out',
            }}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="sv-display font-bold" style={{ color: '#ff6b35', fontSize: '1rem' }}>
                  ⚡ RISK SIMULATION
                </div>
                <div className="sv-label mt-1">What this would do on-chain</div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="sv-label hover:text-sv-text transition-colors p-1"
                style={{ fontSize: '1rem' }}
              >
                ✕
              </button>
            </div>

            <div className="sv-divider" />

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="sv-label animate-pulse">READING CHAIN STATE...</div>
              </div>
            ) : result ? (
              <>
                {/* Current positions */}
                {result.currentPositions?.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="sv-label">CURRENT HEALTH FACTORS</span>
                    <div className="grid grid-cols-2 gap-3">
                      {result.currentPositions.map((p) => {
                        const hf = p.healthFactor ? formatHF(p.healthFactor) : '—'
                        const color = hf === '∞' ? '#00ff88'
                          : parseFloat(hf) < 1.2 ? '#ff2d55'
                          : parseFloat(hf) < 1.5 ? '#ffd60a' : '#00ff88'
                        return (
                          <div key={p.chain}
                            className="flex flex-col items-center gap-1 p-3 rounded-lg"
                            style={{ background: `${color}0d`, border: `1px solid ${color}33` }}
                          >
                            <span className="sv-label" style={{ fontSize: '0.6rem' }}>{p.chain}</span>
                            <span className="sv-num font-bold" style={{ color, fontSize: '1.3rem' }}>{hf}</span>
                            <span className="sv-label" style={{ fontSize: '0.55rem' }}>HF</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Steps */}
                {result.steps?.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="sv-label">SIMULATION STEPS</span>
                    <div className="flex flex-col gap-1.5">
                      {result.steps.map((step, i) => (
                        <div key={i} className="flex gap-2 text-sm">
                          <span className="sv-num flex-shrink-0" style={{ color: '#ff6b35', fontSize: '0.75rem', marginTop: '2px' }}>
                            {i + 1}.
                          </span>
                          <span style={{ color: 'var(--sv-muted)', lineHeight: '1.5' }}>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message */}
                <div
                  className="rounded-lg p-3 text-sm"
                  style={{ background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.2)' }}
                >
                  <span style={{ color: '#ff6b35' }}>ℹ </span>
                  <span style={{ color: 'var(--sv-muted)' }}>{result.message}</span>
                </div>
              </>
            ) : null}

            <div className="sv-divider" />
            <button
              onClick={() => setShowModal(false)}
              className="self-end px-5 py-2 rounded-lg text-xs transition-all"
              style={{
                background:  'rgba(0,212,255,0.08)',
                border:      '1px solid rgba(0,212,255,0.3)',
                color:       'var(--sv-blue)',
                fontFamily:  'Orbitron, monospace',
                letterSpacing: '0.08em',
                cursor:      'pointer',
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  )
}
