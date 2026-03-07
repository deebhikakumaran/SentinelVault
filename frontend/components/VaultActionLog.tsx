'use client'

import {
  formatUSD, formatHF, formatHFDisplay, actionColor, actionBg,
  formatRelativeTime, formatTimestamp, hfColor,
} from '@/lib/formatters'
import { ethers } from 'ethers'

type VaultLog = {
  id:                 number
  action:             string
  riskScore:          string
  healthFactorBefore: string
  healthFactorAfter:  string
  swappedWeth:        string
  receivedUsdc:       string
  repaidUsdc:         string
  withdrawnWeth:      string
  timestamp:          string
  swapSucceeded:      boolean
}

type ChainLogs = {
  chain:    string
  label:    string
  color:    string
  vault:    string
  explorer: string
  logs:     VaultLog[]
}

interface VaultActionLogProps {
  data:      ChainLogs[]
  loading:   boolean
}

function HFDelta({ before, after }: { before: string; after: string }) {
  const hfB = formatHF(before)
  const hfA = formatHF(after)
  const delta = isFinite(hfA) && isFinite(hfB) ? hfA - hfB : null
  const color = delta !== null && delta > 0 ? '#00ff88' : '#ff6b35'

  return (
    <div className="flex items-center gap-1 text-xs sv-num">
      <span style={{ color: hfColor(hfB) }}>{isFinite(hfB) ? hfB.toFixed(3) : '∞'}</span>
      <span style={{ color: 'var(--sv-dim)' }}>→</span>
      <span style={{ color: hfColor(hfA) }}>{isFinite(hfA) ? hfA.toFixed(3) : '∞'}</span>
      {delta !== null && (
        <span style={{ color, fontSize: '0.65rem' }}>
          ({delta >= 0 ? '+' : ''}{delta.toFixed(3)})
        </span>
      )}
    </div>
  )
}

function LogRow({ log, isFirst }: { log: VaultLog; isFirst: boolean }) {
  const color   = actionColor(log.action)
  const wethOut = BigInt(log.withdrawnWeth)
  const usdcIn  = BigInt(log.receivedUsdc)
  const repaid  = BigInt(log.repaidUsdc)

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        background:  isFirst ? actionBg(log.action) : 'rgba(255,255,255,0.02)',
        border:      `1px solid ${isFirst ? color + '44' : 'var(--sv-border)'}`,
        animation:   isFirst ? 'fade-up 0.4s ease-out' : undefined,
      }}
    >
      {/* Row top: action badge + risk score + time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="sv-badge"
            style={{ color, borderColor: color, background: actionBg(log.action), fontSize: '0.6rem' }}
          >
            {log.action}
          </span>
          <span
            className="sv-num text-xs px-2 py-0.5 rounded"
            style={{ color: 'var(--sv-blue)', background: 'rgba(0,212,255,0.1)', fontSize: '0.65rem' }}
          >
            RISK {log.riskScore}
          </span>
        </div>
        <span
          className="sv-num text-xs"
          style={{ color: 'var(--sv-dim)', fontSize: '0.65rem' }}
          title={formatTimestamp(log.timestamp)}
        >
          {formatRelativeTime(log.timestamp)}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="sv-label" style={{ fontSize: '0.55rem' }}>HF CHANGE</div>
          <HFDelta before={log.healthFactorBefore} after={log.healthFactorAfter} />
        </div>

        <div>
          <div className="sv-label" style={{ fontSize: '0.55rem' }}>WITHDRAWN</div>
          <div className="sv-num text-xs" style={{ color: 'var(--sv-text)' }}>
            {wethOut > BigInt(0) ? `${Number(ethers.formatEther(wethOut)).toFixed(4)} WETH` : '—'}
          </div>
        </div>

        <div>
          <div className="sv-label" style={{ fontSize: '0.55rem' }}>SWAP RECEIVED</div>
          <div className="sv-num text-xs" style={{ color: log.swapSucceeded ? '#00ff88' : 'var(--sv-dim)' }}>
            {usdcIn > BigInt(0)
              ? `${Number(ethers.formatUnits(usdcIn, 6)).toFixed(2)} USDC`
              : log.swapSucceeded ? '—' : 'skipped'}
          </div>
        </div>

        <div>
          <div className="sv-label" style={{ fontSize: '0.55rem' }}>DEBT REPAID</div>
          <div className="sv-num text-xs" style={{ color: repaid > BigInt(0) ? '#00ff88' : 'var(--sv-dim)' }}>
            {repaid > BigInt(0) ? `${Number(ethers.formatUnits(repaid, 6)).toFixed(2)} USDC` : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChainSection({ chain }: { chain: ChainLogs }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Chain header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: chain.color, boxShadow: `0 0 6px ${chain.color}` }}
          />
          <span className="sv-display text-sm font-semibold" style={{ color: 'var(--sv-text)' }}>
            {chain.label}
          </span>
          <span
            className="sv-num px-2 py-0.5 rounded text-xs"
            style={{ color: 'var(--sv-blue)', background: 'rgba(0,212,255,0.1)', fontSize: '0.6rem' }}
          >
            {chain.logs.length} EXECUTIONS
          </span>
        </div>
        <a
          href={`${chain.explorer}/address/${chain.vault}`}
          target="_blank" rel="noopener noreferrer"
          className="sv-num hover:text-sv-blue transition-colors"
          style={{ color: 'var(--sv-dim)', fontSize: '0.6rem' }}
        >
          {chain.vault.slice(0, 6)}…{chain.vault.slice(-4)} ↗
        </a>
      </div>

      {chain.logs.length === 0 ? (
        <div
          className="rounded-lg p-4 text-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--sv-border)' }}
        >
          <div className="sv-label" style={{ fontSize: '0.65rem' }}>NO VAULT EXECUTIONS YET</div>
          <div className="text-xs mt-1" style={{ color: 'var(--sv-dim)' }}>
            Trigger a risk event then run a CRE simulation to see execution logs here
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {chain.logs.map((log, i) => (
            <LogRow key={log.id} log={log} isFirst={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function VaultActionLog({ data, loading }: VaultActionLogProps) {
  return (
    <div className="sv-card p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="sv-label">VAULT EXECUTION HISTORY</span>
        <span className="sv-label" style={{ color: 'var(--sv-dim)', fontSize: '0.6rem' }}>
          Aave.withdraw → MockDEX.swap → Aave.repay
        </span>
      </div>

      <div className="sv-divider" />

      {loading ? (
        <div className="flex flex-col gap-4 animate-pulse">
          {[0, 1].map(i => (
            <div key={i} className="h-28 rounded-lg" style={{ background: 'var(--sv-border)' }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {data.map(chain => (
            <ChainSection key={chain.chain} chain={chain} />
          ))}
        </div>
      )}
    </div>
  )
}
