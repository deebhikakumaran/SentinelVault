'use client'

import { formatHF, actionColor, formatRelativeTime, formatTimestamp, hfColor } from '@/lib/formatters'

const fmt18 = (v: bigint, d = 4) => (Number(v) / 1e18).toFixed(d)
const fmt6  = (v: bigint, d = 2) => (Number(v) / 1e6).toFixed(d)

// ── Types ─────────────────────────────────────────────────────────────────────

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
  data:    ChainLogs[]
  loading: boolean
}

// ── Style constants ───────────────────────────────────────────────────────────

const FONT_BODY = "'Rajdhani', sans-serif"
const FONT_MONO = "'JetBrains Mono', 'Fira Code', monospace"

const label = (overrides?: React.CSSProperties): React.CSSProperties => ({
  fontFamily:    FONT_BODY,
  fontSize:      '0.62rem',
  fontWeight:    600,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color:         'rgba(255,255,255,0.28)',
  marginBottom:  8,
  ...overrides,
})

const monoVal = (overrides?: React.CSSProperties): React.CSSProperties => ({
  fontFamily:         FONT_MONO,
  fontVariantNumeric: 'tabular-nums',
  fontSize:           '0.85rem',
  fontWeight:         600,
  ...overrides,
})

// ── Sub-components ────────────────────────────────────────────────────────────

function Pill({
  children,
  color,
  bg,
  border,
}: {
  children: React.ReactNode
  color: string
  bg: string
  border: string
}) {
  return (
    <span style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           5,
      padding:       '4px 11px',
      borderRadius:  9999,
      border:        `1px solid ${border}`,
      background:    bg,
      color,
      fontFamily:    FONT_BODY,
      fontSize:      '0.68rem',
      fontWeight:    700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      whiteSpace:    'nowrap',
    }}>
      {children}
    </span>
  )
}

function HFArrow({ before, after }: { before: string; after: string }) {
  const hfB   = formatHF(before)
  const hfA   = formatHF(after)
  const delta = isFinite(hfA) && isFinite(hfB) ? hfA - hfB : null

  return (
    <div>
      <div style={label()}>HF Change</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={monoVal({ color: hfColor(hfB) })}>
          {isFinite(hfB) ? hfB.toFixed(3) : '∞'}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>→</span>
        <span style={monoVal({ color: hfColor(hfA) })}>
          {isFinite(hfA) ? hfA.toFixed(3) : '∞'}
        </span>
      </div>
      {delta !== null && (
        <div style={monoVal({
          fontSize:   '0.72rem',
          marginTop:  3,
          color:      delta === 0 ? 'rgba(255,255,255,0.2)' : delta > 0 ? '#00FF85' : '#ff6b35',
        })}>
          {delta === 0 ? '—' : (delta > 0 ? '+' : '') + delta.toFixed(3)}
        </div>
      )}
    </div>
  )
}

function Metric({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div>
      <div style={label()}>{title}</div>
      <div style={monoVal({ color })}>{value}</div>
    </div>
  )
}

function LogRow({ log, isLatest }: { log: VaultLog; isLatest: boolean }) {
  const actionCol = actionColor(log.action)
  const wethOut   = BigInt(log.withdrawnWeth)
  const usdcIn    = BigInt(log.receivedUsdc)
  const repaid    = BigInt(log.repaidUsdc)

  return (
    <div style={{
      background:    isLatest ? `${actionCol}08` : 'rgba(255,255,255,0.02)',
      border:        `1px solid ${isLatest ? actionCol + '35' : 'rgba(255,255,255,0.07)'}`,
      borderRadius:  16,
      padding:       '18px 20px',
      display:       'flex',
      flexDirection: 'column',
      gap:           14,
    }}>

      {/* Top row: pills + timestamp */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Pill
            color={actionCol}
            bg={`${actionCol}12`}
            border={actionCol}
          >
            {log.action.replace(/_/g, ' ')}
          </Pill>
          <Pill
            color="#00d4ff"
            bg="rgba(0,212,255,0.06)"
            border="rgba(0,212,255,0.2)"
          >
            Risk {log.riskScore}
          </Pill>
          {log.action !== 'HOLD' && wethOut === 0n && (
            <Pill
              color="rgba(255,255,255,0.35)"
              bg="rgba(255,255,255,0.04)"
              border="rgba(255,255,255,0.12)"
            >
              HF too low — capped
            </Pill>
          )}
          {!log.swapSucceeded && wethOut > 0n && (
            <Pill
              color="#ff6b35"
              bg="rgba(255,107,53,0.06)"
              border="rgba(255,107,53,0.22)"
            >
              Swap Skipped
            </Pill>
          )}
        </div>
        <span
          style={{ fontFamily: FONT_BODY, fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)' }}
          title={formatTimestamp(log.timestamp)}
        >
          {formatRelativeTime(log.timestamp)}
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />

      {/* Metrics: 4 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        <HFArrow before={log.healthFactorBefore} after={log.healthFactorAfter} />
        <Metric
          title="WETH Withdrawn"
          value={wethOut > 0n ? `${fmt18(wethOut)} WETH` : '—'}
          color={wethOut > 0n ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)'}
        />
        <Metric
          title="USDC Received"
          value={usdcIn > 0n ? `${fmt6(usdcIn)} USDC` : '—'}
          color={usdcIn > 0n ? '#00FF85' : 'rgba(255,255,255,0.2)'}
        />
        <Metric
          title="Debt Repaid"
          value={repaid > 0n ? `${fmt6(repaid)} USDC` : '—'}
          color={repaid > 0n ? '#00FF85' : 'rgba(255,255,255,0.2)'}
        />
      </div>
    </div>
  )
}

function ChainSection({ chain }: { chain: ChainLogs }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Chain header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width:       8,
            height:      8,
            borderRadius: '50%',
            background:  chain.color,
            boxShadow:   `0 0 8px ${chain.color}`,
            flexShrink:  0,
          }} />
          <span style={{
            fontFamily:    FONT_BODY,
            fontSize:      '0.9rem',
            fontWeight:    700,
            color:         '#fff',
            letterSpacing: '-0.01em',
          }}>
            {chain.label}
          </span>
          <span style={{
            fontFamily:    FONT_BODY,
            fontSize:      '0.68rem',
            fontWeight:    600,
            padding:       '3px 10px',
            borderRadius:  9999,
            background:    'rgba(255,255,255,0.04)',
            border:        '1px solid rgba(255,255,255,0.08)',
            color:         'rgba(255,255,255,0.38)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            {chain.logs.length} {chain.logs.length === 1 ? 'Execution' : 'Executions'}
          </span>
        </div>
        <a
          href={`${chain.explorer}/address/${chain.vault}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily:     FONT_MONO,
            fontSize:       '0.7rem',
            color:          'rgba(255,255,255,0.22)',
            textDecoration: 'none',
            transition:     'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.22)')}
        >
          {chain.vault.slice(0, 6)}…{chain.vault.slice(-4)} ↗
        </a>
      </div>

      {/* Rows or empty state */}
      {chain.logs.length === 0 ? (
        <div style={{
          background:   'rgba(255,255,255,0.02)',
          border:       '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          padding:      '32px 24px',
          textAlign:    'center',
        }}>
          <div style={{
            fontFamily:    FONT_BODY,
            fontSize:      '0.82rem',
            fontWeight:    600,
            color:         'rgba(255,255,255,0.22)',
            letterSpacing: '0.06em',
            marginBottom:  8,
          }}>
            No executions yet
          </div>
          <div style={{
            fontFamily: FONT_BODY,
            fontSize:   '0.8rem',
            fontWeight: 300,
            color:      'rgba(255,255,255,0.15)',
            lineHeight: 1.6,
          }}>
            Trigger a risk event then run a CRE simulation to see logs here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {chain.logs.map((log, i) => (
            <LogRow key={log.id} log={log} isLatest={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function VaultActionLog({ data, loading }: VaultActionLogProps) {
  return (
    <div style={{
      background:   'rgba(255,255,255,0.025)',
      border:       '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      padding:      '26px',
      position:     'relative',
      overflow:     'hidden',
    }}>

      {/* Green shimmer on top edge */}
      <div style={{
        position:      'absolute',
        top: 0, left: 0, right: 0,
        height:        1,
        background:    'linear-gradient(90deg, transparent, rgba(0,255,133,0.35), transparent)',
        pointerEvents: 'none',
      }} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1].map(i => (
            <div key={i} style={{
              height:       110,
              borderRadius: 16,
              background:   'rgba(255,255,255,0.03)',
              border:       '1px solid rgba(255,255,255,0.06)',
            }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {data.map(chain => (
            <ChainSection key={chain.chain} chain={chain} />
          ))}
        </div>
      )}
    </div>
  )
}
