'use client'

import { useEffect, useState, useCallback } from 'react'
import Header          from '@/components/Header'
import ChainCard       from '@/components/ChainCard'
import RiskScoreGauge  from '@/components/RiskScoreGauge'
import ActionLog       from '@/components/ActionLog'
import PipelineDiagram from '@/components/PipelineDiagram'
import PrivacyShield   from '@/components/PrivacyShield'
import SimulateButton  from '@/components/SimulateButton'
import { formatHF, riskAction } from '@/lib/formatters'

// ── Types ────────────────────────────────────────────────────────────────────

type ChainData = {
  key:      string
  label:    string
  color:    string
  vault:    string
  explorer: string
  position: {
    totalCollateralBase:  string
    totalDebtBase:        string
    currentLiqThreshold:  string
    ltv:                  string
    healthFactor:         string
  } | null
  latestLog: {
    action:             string
    riskScore:          string
    healthFactorBefore: string
    healthFactorAfter:  string
    timestamp:          string
    swapSucceeded:      boolean
  } | null
}

type Assessment = {
  index:        number
  riskScore:    number
  action:       string
  healthFactor: string
  totalDebtUsd: string
  worstChain:   string
  timestamp:    string
}

const POLL_INTERVAL = 30_000 // 30 seconds

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [chains,       setChains]       = useState<ChainData[]>([])
  const [assessments,  setAssessments]  = useState<Assessment[]>([])
  const [assessCount,  setAssessCount]  = useState(0)
  const [lastUpdated,  setLastUpdated]  = useState<number | null>(null)
  const [loading,      setLoading]      = useState(true)

  // Compute aggregate risk score from positions + latest assessments
  const worstHF: number | null = chains.length === 0 ? null : (() => {
    const hfs = chains
      .map(c => c.position ? formatHF(c.position.healthFactor) : null)
      .filter((hf): hf is number => hf !== null && isFinite(hf))
    return hfs.length > 0 ? Math.min(...hfs) : null
  })()

  const latestAssessScore: number | null = assessments.length > 0 ? assessments[0].riskScore : null

  const fetchPositions = useCallback(async () => {
    try {
      const res  = await fetch('/api/positions', { cache: 'no-store' })
      const json = await res.json()
      if (json.data) {
        setChains(json.data)
        setLastUpdated(json.timestamp)
      }
    } catch (e) {
      console.error('positions fetch:', e)
    }
  }, [])

  const fetchAssessments = useCallback(async () => {
    try {
      const res  = await fetch('/api/assessments', { cache: 'no-store' })
      const json = await res.json()
      setAssessments(json.assessments ?? [])
      setAssessCount(json.count ?? 0)
    } catch (e) {
      console.error('assessments fetch:', e)
    }
  }, [])

  // Initial load
  useEffect(() => {
    Promise.all([fetchPositions(), fetchAssessments()])
      .finally(() => setLoading(false))
  }, [fetchPositions, fetchAssessments])

  // Poll every 30s
  useEffect(() => {
    const t = setInterval(() => {
      fetchPositions()
      fetchAssessments()
    }, POLL_INTERVAL)
    return () => clearInterval(t)
  }, [fetchPositions, fetchAssessments])

  return (
    <main className="min-h-screen px-4 py-6 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Header riskScore={latestAssessScore} lastUpdated={lastUpdated} />

      {/* ── Chain positions + Risk gauge ───────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Chain cards (2 of 3 columns) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {loading
            ? [0, 1].map(i => (
                <div key={i} className="sv-card p-5 flex flex-col gap-4 animate-pulse">
                  <div className="h-4 rounded" style={{ background: 'var(--sv-border)', width: '50%' }} />
                  <div className="h-36 rounded" style={{ background: 'var(--sv-border)' }} />
                  <div className="h-3 rounded" style={{ background: 'var(--sv-border)', width: '75%' }} />
                </div>
              ))
            : chains.map(chain => (
                <ChainCard
                  key={chain.key}
                  label={chain.label}
                  color={chain.color}
                  vault={chain.vault}
                  explorer={chain.explorer}
                  position={chain.position}
                  latestLog={chain.latestLog}
                />
              ))
          }
        </div>

        {/* Risk score gauge (1 of 3 columns) */}
        <div>
          <RiskScoreGauge
            score={latestAssessScore}
            worstHF={worstHF}
            chains={chains.length}
          />
        </div>
      </section>

      {/* ── Action log ─────────────────────────────────────────────────── */}
      <section className="mb-6">
        <ActionLog assessments={assessments} count={assessCount} />
      </section>

      {/* ── CRE Pipeline ───────────────────────────────────────────────── */}
      <section className="mb-6">
        <PipelineDiagram />
      </section>

      {/* ── Privacy Shield + Simulate side by side ─────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <PrivacyShield />
        </div>
        <div>
          <SimulateButton />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer
        className="mt-4 py-4 text-center"
        style={{ borderTop: '1px solid var(--sv-border)' }}
      >
        <div className="flex flex-wrap justify-center gap-4 text-xs" style={{ color: 'var(--sv-dim)' }}>
          <span className="sv-display" style={{ fontSize: '0.6rem' }}>SENTINELVAULT</span>
          <span>Chainlink CRE Hackathon — Convergence 2026</span>
          <a
            href="https://github.com"
            target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--sv-dim)' }}
          >
            GitHub ↗
          </a>
          <span>Sepolia · Base Sepolia</span>
          <span className="sv-num" style={{ fontSize: '0.65rem' }}>
            Polling every {POLL_INTERVAL / 1000}s
          </span>
        </div>
      </footer>
    </main>
  )
}
