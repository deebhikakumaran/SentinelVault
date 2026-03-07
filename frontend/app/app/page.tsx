'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import VaultActionLog from '@/components/VaultActionLog'
import { formatHF, hfColor, formatUSD, actionColor, actionBg } from '@/lib/formatters'

// ── Types ─────────────────────────────────────────────────────────────────────

type TriggerResult = {
  status:        string
  message?:      string
  error?:        string
  chain?:        string
  txHash?:       string
  borrowedUsdc?: string
  healthFactor?: string
  before?: { healthFactor: string; debt: string; collateral: string }
  after?:  { healthFactor: string; debt: string; collateral: string }
}

type ActionResult = {
  status:  string
  error?:  string
  chain?:  string
  action?: string
  txHash?: string
  events?: string[]
  before?: { healthFactor: string; collateral: string; debt: string }
  after?:  { healthFactor: string; collateral: string; debt: string }
}

type VaultLogData = {
  chain:    string
  label:    string
  color:    string
  vault:    string
  explorer: string
  logs:     Record<string, unknown>[]
}

type Position = {
  healthFactor:        string
  totalCollateralBase: string
  totalDebtBase:       string
} | null

type ChainPositions = { sepolia: Position; base: Position }

const CHAINS = [
  { key: 'sepolia', label: 'Sepolia',      color: '#627EEA' },
  { key: 'base',    label: 'Base Sepolia', color: '#0052FF' },
] as const

const ACTIONS = ['EMERGENCY_EXIT', 'DELEVERAGE', 'REBALANCE', 'SWAP_TO_STABLE', 'HOLD'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function TxLink({ hash, chainKey }: { hash: string; chainKey: string }) {
  const url = chainKey === 'base'
    ? `https://sepolia.basescan.org/tx/${hash}`
    : `https://sepolia.etherscan.io/tx/${hash}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: '#00FF85', fontSize: '0.72rem', wordBreak: 'break-all', textDecoration: 'none', fontFamily: 'monospace' }}
    >
      {hash.slice(0, 10)}…{hash.slice(-8)} ↗
    </a>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppPage() {
  const [positions,   setPositions]   = useState<ChainPositions>({ sepolia: null, base: null })
  const [posLoading,  setPosLoading]  = useState(true)

  const [trigChain,   setTrigChain]   = useState<'sepolia' | 'base'>('sepolia')
  const [trigLoading, setTrigLoading] = useState(false)
  const [trigResult,  setTrigResult]  = useState<TriggerResult | null>(null)

  const [actChain,    setActChain]    = useState<'sepolia' | 'base'>('sepolia')
  const [actAction,   setActAction]   = useState<string>('DELEVERAGE')
  const [actLoading,  setActLoading]  = useState(false)
  const [actResult,   setActResult]   = useState<ActionResult | null>(null)

  const [vaultLogs,   setVaultLogs]   = useState<VaultLogData[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  const fetchPositions = useCallback(async () => {
    try {
      const res  = await fetch('/api/positions', { cache: 'no-store' })
      const json = await res.json() as { data?: Array<{ key: string; position: Position }> }
      if (json.data) {
        setPositions({
          sepolia: json.data.find(c => c.key === 'sepolia')?.position ?? null,
          base:    json.data.find(c => c.key === 'base')?.position    ?? null,
        })
      }
    } catch { /* ignore */ }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      const res  = await fetch('/api/vault-logs', { cache: 'no-store' })
      const json = await res.json() as { data?: VaultLogData[] }
      if (json.data) setVaultLogs(json.data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    Promise.all([fetchPositions(), fetchLogs()])
      .finally(() => { setPosLoading(false); setLogsLoading(false) })
  }, [fetchPositions, fetchLogs])

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchPositions(), fetchLogs()])
  }, [fetchPositions, fetchLogs])

  async function handleTriggerRisk() {
    setTrigLoading(true)
    setTrigResult(null)
    try {
      const res  = await fetch('/api/trigger-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: trigChain }),
      })
      const data = await res.json() as TriggerResult
      setTrigResult(data)
      if (data.status === 'success' || data.status === 'already_risky') {
        setTimeout(refreshAll, 3000)
      }
    } catch {
      setTrigResult({ status: 'error', error: 'Failed to connect to API' })
    } finally {
      setTrigLoading(false)
    }
  }

  async function handleTestAction() {
    setActLoading(true)
    setActResult(null)
    try {
      const res  = await fetch('/api/test-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: actChain, action: actAction }),
      })
      const data = await res.json() as ActionResult
      setActResult(data)
      if (data.status === 'success') {
        setTimeout(refreshAll, 3000)
      }
    } catch {
      setActResult({ status: 'error', error: 'Failed to connect to API' })
    } finally {
      setActLoading(false)
    }
  }

  const actCol = actionColor(actAction)

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style suppressHydrationWarning>{`

        .ap {
          background: #000000;
          color: #ffffff;
          font-family: 'Rajdhani', sans-serif;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .ap *, .ap *::before, .ap *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* Nav */
        .ap-nav {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 0 40px;
        }

        .ap-nav-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 18px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .ap-logo {
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #fff;
        }

        .ap-logo em { color: #00FF85; font-style: normal; }

        .ap-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 9999px;
          border: 1px solid rgba(0,255,133,0.25);
          color: #00FF85;
          background: rgba(0,255,133,0.05);
        }

        .ap-badge-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #00FF85;
          box-shadow: 0 0 6px #00FF85;
          animation: ap-pulse 2s ease-in-out infinite;
        }

        @keyframes ap-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .ap-hint {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.25);
        }

        /* Content */
        .ap-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 40px 80px;
        }

        /* Section label */
        .ap-label {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 14px;
        }

        /* Section heading — Rajdhani 400, matches landing .lp-h2 */
        .ap-section-h2 {
          font-family: 'Rajdhani', sans-serif;
          font-style: normal;
          font-weight: 800;
          font-size: clamp(30px, 2.5vw, 48px);
          letter-spacing: -0.025em;
          line-height: 1.13;
          margin-bottom: 20px;
        }

        /* Card */
        .ap-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 28px;
          position: relative;
          overflow: hidden;
        }

        .ap-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
          pointer-events: none;
        }

        /* Positions grid */
        .ap-positions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 32px;
        }

        .ap-pos-card {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 22px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: border-color 0.2s;
        }

        .ap-pos-card:hover { border-color: rgba(255,255,255,0.12); }

        .ap-pos-chain {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.04em;
        }

        .ap-pos-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .ap-pos-metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .ap-metric-label {
          font-size: 0.62rem;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 4px;
        }

        .ap-metric-val {
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          font-variant-numeric: tabular-nums;
        }

        /* Controls grid */
        .ap-controls {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 32px;
        }

        /* Chain selector */
        .ap-chain-row {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }

        .ap-chain-btn {
          flex: 1;
          padding: 10px 14px;
          border-radius: 10px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid;
        }

        /* Action grid */
        .ap-action-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 20px;
        }

        .ap-action-btn {
          padding: 9px 8px;
          border-radius: 9px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.15s;
          text-align: center;
          border: 1px solid;
        }

        /* Execute button */
        .ap-exec-btn {
          width: 100%;
          padding: 14px 20px;
          border-radius: 12px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          border: 1.5px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .ap-exec-btn:disabled { cursor: wait; opacity: 0.7; }

        /* Result card */
        .ap-result {
          margin-top: 16px;
          padding: 18px;
          border-radius: 14px;
          border: 1px solid;
          animation: ap-fadein 0.25s ease-out;
        }

        @keyframes ap-fadein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .ap-result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .ap-result-status {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .ap-result-body {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.5);
          line-height: 1.6;
        }

        .ap-hf-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .ap-hf-block { display: flex; flex-direction: column; gap: 3px; }

        .ap-hf-tiny {
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.25);
        }

        .ap-hf-val {
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }

        .ap-arrow {
          color: rgba(255,255,255,0.2);
          font-size: 1.1rem;
        }

        .ap-events {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 12px;
        }

        .ap-event {
          display: flex;
          gap: 8px;
          font-size: 0.82rem;
          color: rgba(255,255,255,0.5);
          align-items: flex-start;
        }

        .ap-event-check { color: #00FF85; flex-shrink: 0; }

        /* Step heading */
        .ap-step-head {
          margin-bottom: 18px;
        }

        .ap-step-num {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #00FF85;
          margin-bottom: 6px;
        }

        .ap-step-title {
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin-bottom: 8px;
        }

        .ap-step-desc {
          font-size: 0.83rem;
          font-weight: 300;
          color: rgba(255,255,255,0.45);
          line-height: 1.7;
        }

        .ap-divider {
          height: 1px;
          background: rgba(255,255,255,0.06);
          margin: 20px 0;
        }

        .ap-step-foot {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.25);
          line-height: 1.6;
        }

        .ap-refresh-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,0.3);
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.72rem;
          font-weight: 500;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .ap-refresh-btn:hover {
          color: #fff;
          background: rgba(255,255,255,0.05);
        }

        .ap-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        /* Footer */
        .ap-footer {
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 28px 40px;
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }

        .ap-footer-logo {
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .ap-footer-logo em { color: #00FF85; font-style: normal; }

        .ap-footer-copy {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.2);
        }

        code.ap-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: #00FF85;
          background: rgba(0,255,133,0.06);
          padding: 2px 6px;
          border-radius: 4px;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .ap-nav { padding: 14px 20px; }
          .ap-content { padding: 24px 20px 60px; }
          .ap-positions { grid-template-columns: 1fr; }
          .ap-controls { grid-template-columns: 1fr; }
          .ap-footer { padding: 24px 20px; }
          .ap-action-grid { grid-template-columns: repeat(2, 1fr); }
          .ap-pos-metrics { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>

      <div className="ap">

        {/* ── Nav ── */}

        <nav className="ap-nav">
          <div className="ap-nav-inner">
            <div className="ap-logo">Sentinel<em>Vault</em></div>
            <div className="ap-badge">
              <div className="ap-badge-dot" />
              Live Testnet
            </div>
          </div>
        </nav>

        {/* ── Content ── */}
        <div className="ap-content">

          {/* ── Live Positions ── */}
          <div style={{ marginBottom: 32 }}>
            <div className="ap-section-header">
              <div className="ap-section-h2">Live Positions</div>
              <button
                className="ap-refresh-btn"
                onClick={() => { setPosLoading(true); fetchPositions().finally(() => setPosLoading(false)) }}
              >
                ↺ Refresh
              </button>
            </div>

            {posLoading ? (
              <div className="ap-positions">
                {[0, 1].map(i => (
                  <div key={i} className="ap-pos-card" style={{ opacity: 0.5 }}>
                    <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.06)', width: '40%' }} />
                    <div className="ap-pos-metrics">
                      {[0, 1, 2].map(j => (
                        <div key={j}>
                          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.04)', marginBottom: 6, width: '60%' }} />
                          <div style={{ height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.06)', width: '80%' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ap-positions">
                {CHAINS.map(c => {
                  const pos = positions[c.key]
                  const hf  = pos ? formatHF(pos.healthFactor) : null
                  return (
                    <div key={c.key} className="ap-pos-card">
                      <div className="ap-pos-chain">
                        <div
                          className="ap-pos-dot"
                          style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }}
                        />
                        {c.label}
                        {!pos && (
                          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>
                            — no position
                          </span>
                        )}
                      </div>
                      {pos && hf !== null ? (
                        <div className="ap-pos-metrics">
                          <div>
                            <div className="ap-metric-label">Collateral</div>
                            <div className="ap-metric-val" style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>
                              {formatUSD(pos.totalCollateralBase)}
                            </div>
                          </div>
                          <div>
                            <div className="ap-metric-label">Debt</div>
                            <div className="ap-metric-val" style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>
                              {formatUSD(pos.totalDebtBase)}
                            </div>
                          </div>
                          <div>
                            <div className="ap-metric-label">Health Factor</div>
                            <div
                              className="ap-metric-val"
                              style={{ color: hfColor(hf), fontSize: '1.1rem' }}
                            >
                              {isFinite(hf) ? hf.toFixed(4) : '∞'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.25)' }}>
                          No active Aave position found.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="ap-section-header" style={{ marginBottom: 16 }}>
            <div className="ap-section-h2">Simulation</div>
          </div>

          {/* ── Controls ── */}
          <div className="ap-controls">   

            {/* Step 1 — Trigger Risk */}
            <div className="ap-card">
              <div className="ap-step-head">
                <div className="ap-step-num">Step 01</div>
                <div className="ap-step-title">Simulate Risk Event</div>
                <div className="ap-step-desc">
                  Borrows additional USDC from Aave to push the vault&apos;s Health Factor to ~1.35
                  (DELEVERAGE territory). The next CRE cron cycle will detect elevated risk and write a
                  protective action report to the vault.
                </div>
              </div>

              <div className="ap-divider" />

              <div style={{ marginBottom: 8 }}>
                <div className="ap-label" style={{ marginBottom: 10 }}>Select Chain</div>
                <div className="ap-chain-row">
                  {CHAINS.map(c => (
                    <button
                      key={c.key}
                      onClick={() => setTrigChain(c.key)}
                      className="ap-chain-btn"
                      style={{
                        background:   trigChain === c.key ? `${c.color}18` : 'transparent',
                        borderColor:  trigChain === c.key ? c.color : 'rgba(255,255,255,0.1)',
                        color:        trigChain === c.key ? c.color : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <div
                        style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: c.color,
                          boxShadow: trigChain === c.key ? `0 0 8px ${c.color}` : 'none',
                          flexShrink: 0,
                        }}
                      />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleTriggerRisk}
                disabled={trigLoading}
                className="ap-exec-btn"
                style={{
                  background:  trigLoading ? 'rgba(255,214,10,0.04)' : 'rgba(255,214,10,0.08)',
                  borderColor: '#ffd60a',
                  color:       '#ffd60a',
                  boxShadow:   '0 0 20px rgba(255,214,10,0.08)',
                }}
              >
                {trigLoading ? (
                  <>
                    <span style={{ animation: 'ap-pulse 0.8s linear infinite', display: 'inline-block' }}>◌</span>
                    Borrowing…
                  </>
                ) : (
                  <>↓ Lower Health Factor</>
                )}
              </button>

              {trigResult && <ResultPanel result={trigResult} chainKey={trigChain} />}

              <div className="ap-divider" />
              <div className="ap-step-foot">
                After this, wait ≤5 min for the CRE cron to fire — or use Step 2 to execute immediately.
              </div>
            </div>

            {/* Step 2 — Execute Action */}
            <div className="ap-card">
              <div className="ap-step-head">
                <div className="ap-step-num">Step 02</div>
                <div className="ap-step-title">Execute Vault Action</div>
                <div className="ap-step-desc">
                  Directly calls <code className="ap-code">vault.onReport()</code> as owner —
                  the same path the Chainlink KeystoneForwarder takes. Executes atomically:
                  Aave.withdraw → MockDEX.swap → Aave.repay.
                </div>
              </div>

              <div className="ap-divider" />

              <div style={{ marginBottom: 18 }}>
                <div className="ap-label" style={{ marginBottom: 10 }}>Select Chain</div>
                <div className="ap-chain-row">
                  {CHAINS.map(c => (
                    <button
                      key={c.key}
                      onClick={() => setActChain(c.key)}
                      className="ap-chain-btn"
                      style={{
                        background:   actChain === c.key ? `${c.color}18` : 'transparent',
                        borderColor:  actChain === c.key ? c.color : 'rgba(255,255,255,0.1)',
                        color:        actChain === c.key ? c.color : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <div
                        style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: c.color,
                          boxShadow: actChain === c.key ? `0 0 8px ${c.color}` : 'none',
                          flexShrink: 0,
                        }}
                      />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div className="ap-label" style={{ marginBottom: 10 }}>Select Action</div>
                <div className="ap-action-grid">
                  {ACTIONS.map(a => {
                    const col = actionColor(a)
                    const sel = actAction === a
                    return (
                      <button
                        key={a}
                        onClick={() => { setActAction(a); setActResult(null) }}
                        className="ap-action-btn"
                        style={{
                          background:   sel ? actionBg(a) : 'transparent',
                          borderColor:  sel ? col : 'rgba(255,255,255,0.09)',
                          color:        sel ? col : 'rgba(255,255,255,0.35)',
                        }}
                      >
                        {a.replace('_', ' ')}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                onClick={handleTestAction}
                disabled={actLoading}
                className="ap-exec-btn"
                style={{
                  background:  actLoading ? `${actCol}06` : `${actCol}10`,
                  borderColor: actCol,
                  color:       actCol,
                  boxShadow:   `0 0 20px ${actCol}12`,
                }}
              >
                {actLoading ? (
                  <>
                    <span style={{ animation: 'ap-pulse 0.8s linear infinite', display: 'inline-block' }}>◌</span>
                    Executing…
                  </>
                ) : (
                  <>⚡ Execute {actAction.replace(/_/g, ' ')}</>
                )}
              </button>

              {actResult && <ResultPanel result={actResult} chainKey={actChain} />}

              <div className="ap-divider" />
              <div className="ap-step-foot">
                MockDEX must be funded with USDC for swap to succeed. If swap fails, WETH is held in vault.
              </div>
            </div>
          </div>

          {/* ── Vault Execution History ── */}
          <div className="ap-section-header" style={{ marginBottom: 16 }}>
            <div className="ap-section-h2">Vault Execution History</div>
            <button
              className="ap-refresh-btn"
              onClick={() => { setLogsLoading(true); fetchLogs().finally(() => setLogsLoading(false)) }}
            >
              ↺ Refresh
            </button>
          </div>
          <VaultActionLog
            data={vaultLogs as Parameters<typeof VaultActionLog>[0]['data']}
            loading={logsLoading}
          />
        </div>

        {/* ── Footer ── */}
        <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="ap-footer">
            <div className="ap-footer-logo">Sentinel<em>Vault</em></div>
            <div className="ap-footer-copy">Convergence 2026</div>
          </div>
        </footer>

      </div>
    </>
  )
}

// ── Result Panel ──────────────────────────────────────────────────────────────

function ResultPanel({
  result,
  chainKey,
}: {
  result: TriggerResult | ActionResult
  chainKey: string
}) {
  const isError   = !!result.error
  const isInfo    = result.status === 'already_risky'
  const isSuccess = result.status === 'success'

  const color   = isError ? '#ff2d55' : isInfo ? '#ffd60a' : '#00FF85'
  const label   = isError ? 'Error' : isInfo ? 'Already Risky' : 'Success'

  const hfBefore = (result as TriggerResult).before?.healthFactor
  const hfAfter  = (result as TriggerResult).after?.healthFactor
  const events   = (result as ActionResult).events
  const txHash   = (result as TriggerResult).txHash

  return (
    <div
      className="ap-result"
      style={{ background: `${color}07`, borderColor: `${color}33` }}
    >
      <div className="ap-result-header">
        <span className="ap-result-status" style={{ color }}>{label}</span>
        {txHash && <TxLink hash={txHash} chainKey={chainKey} />}
      </div>

      {result.error && (
        <div className="ap-result-body" style={{ color: '#ff2d55' }}>{result.error}</div>
      )}
      {'message' in result && result.message && (
        <div className="ap-result-body">{result.message}</div>
      )}
      {'borrowedUsdc' in result && result.borrowedUsdc && (
        <div className="ap-result-body">
          Borrowed{' '}
          <span style={{ color: '#ffd60a', fontWeight: 600 }}>{result.borrowedUsdc} USDC</span>
          {' '}— HF pushed into risky territory
        </div>
      )}

      {hfBefore && hfAfter && (
        <div className="ap-hf-row">
          <div className="ap-hf-block">
            <div className="ap-hf-tiny">HF Before</div>
            <div className="ap-hf-val" style={{ color: hfColor(formatHF(hfBefore)) }}>
              {formatHF(hfBefore).toFixed(4)}
            </div>
          </div>
          <div className="ap-arrow">→</div>
          <div className="ap-hf-block">
            <div className="ap-hf-tiny">HF After</div>
            <div className="ap-hf-val" style={{ color: hfColor(formatHF(hfAfter)) }}>
              {formatHF(hfAfter).toFixed(4)}
            </div>
          </div>
        </div>
      )}

      {events && events.length > 0 && (
        <div className="ap-events">
          {events.map((ev, i) => (
            <div key={i} className="ap-event">
              <span className="ap-event-check">✓</span>
              <span>{ev}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
