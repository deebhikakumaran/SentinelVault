'use client'

export default function PrivacyShield() {
  return (
    <div className="sv-card p-6 flex flex-col gap-5"
      style={{ borderColor: 'rgba(255,107,53,0.3)', boxShadow: '0 0 0 1px rgba(255,107,53,0.1)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 2L3 7v8c0 6.6 4.7 12.8 11 14.5C21.3 27.8 26 21.6 26 15V7L14 2z"
            fill="rgba(255,107,53,0.1)" stroke="#ff6b35" strokeWidth="1.5" />
          <text x="14" y="18" textAnchor="middle" fill="#ff6b35"
            fontFamily="monospace" fontSize="12">🔒</text>
        </svg>
        <div>
          <div className="sv-display font-bold" style={{ color: '#ff6b35', fontSize: '0.9rem' }}>
            PRIVACY ARCHITECTURE
          </div>
          <div className="sv-label mt-0.5">Chainlink DON Trusted Execution Environment</div>
        </div>
        <div className="ml-auto">
          <span
            className="sv-badge"
            style={{ color: '#ff6b35', borderColor: '#ff6b35', background: 'rgba(255,107,53,0.1)', fontSize: '0.55rem' }}
          >
            PRIVACY TRACK
          </span>
        </div>
      </div>

      <div className="sv-divider" />

      {/* Two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Left: explanation */}
        <div className="flex flex-col gap-4">
          <h3 className="sv-display text-sm" style={{ color: 'var(--sv-text)' }}>
            API Key Never Leaves the Enclave
          </h3>
          <div className="flex flex-col gap-3">
            {[
              {
                icon: '🔐',
                title: 'Secret injection inside TEE',
                desc: 'The CryptoCompare API key is injected via Go template at runtime — only inside the DON enclave. It never appears in workflow code, config files, or on-chain.',
              },
              {
                icon: '🤝',
                title: 'Consensus aggregation',
                desc: 'ConsensusAggregationByFields with median() ensures no single DON node can manipulate market sentiment scores. Tamper-resistant by design.',
              },
              {
                icon: '📡',
                title: 'encryptOutput: false rationale',
                desc: 'Market price data is public — only the API key needs protection. Response encryption requires AES-GCM decryption which is unsupported in the QuickJS/WASM runtime.',
              },
              {
                icon: '⛓',
                title: 'Zero on-chain exposure',
                desc: 'The API key, enclave inputs, and TEE internals are completely invisible on-chain. Only the aggregated risk score and action are written to the registry.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
                <div>
                  <div className="font-semibold text-sm mb-0.5" style={{ color: 'var(--sv-text)', fontFamily: 'Rajdhani, sans-serif' }}>
                    {title}
                  </div>
                  <div className="text-sm leading-relaxed" style={{ color: 'var(--sv-muted)' }}>
                    {desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: code snippet + badge */}
        <div className="flex flex-col gap-4">
          <h3 className="sv-display text-sm" style={{ color: 'var(--sv-text)' }}>
            Go Template Secret Injection
          </h3>

          <div className="sv-code text-sm">
            <div style={{ color: '#3a4d6b' }}>{'// ConfidentialHTTPClient — DON TEE'}</div>
            <br />
            <div>
              <span style={{ color: '#94a3b8' }}>const </span>
              <span style={{ color: '#00d4ff' }}>response</span>
              <span style={{ color: '#94a3b8' }}> = sendRequester</span>
            </div>
            <div style={{ paddingLeft: '16px' }}>
              <span style={{ color: '#94a3b8' }}>.sendRequest({'{'}</span>
            </div>
            <div style={{ paddingLeft: '32px' }}>
              <span style={{ color: '#94a3b8' }}>multiHeaders: {'{'}</span>
            </div>
            <div style={{ paddingLeft: '48px' }}>
              <span style={{ color: '#94a3b8' }}>Authorization: {'{'}</span>
            </div>
            <div style={{ paddingLeft: '64px' }}>
              <span style={{ color: '#94a3b8' }}>values: [</span>
              <span style={{ color: '#00ff88' }}>{'"Apikey '}</span>
              <span
                style={{
                  color:       '#ff6b35',
                  background:  'rgba(255,107,53,0.15)',
                  padding:     '1px 4px',
                  borderRadius: '3px',
                  fontWeight:  '700',
                }}
              >
                {'{{.marketDataApiKey}}'}
              </span>
              <span style={{ color: '#00ff88' }}>{'"'}</span>
              <span style={{ color: '#94a3b8' }}>]</span>
            </div>
            <div style={{ paddingLeft: '48px' }}>
              <span style={{ color: '#94a3b8' }}>{'}'},</span>
            </div>
            <div style={{ paddingLeft: '32px' }}>
              <span style={{ color: '#94a3b8' }}>{'}'}</span>
            </div>
            <div style={{ paddingLeft: '16px' }}>
              <span style={{ color: '#94a3b8' }}>{'}'}).result()'</span>
            </div>
          </div>

          {/* Secret owner config */}
          <div className="sv-code text-sm">
            <div style={{ color: '#3a4d6b' }}>{'// secrets.yaml (gitignored)'}</div>
            <div>
              <span style={{ color: '#94a3b8' }}>secretsNames:</span>
            </div>
            <div style={{ paddingLeft: '16px' }}>
              <span style={{ color: '#00d4ff' }}>marketDataApiKey</span>
              <span style={{ color: '#94a3b8' }}>:</span>
            </div>
            <div style={{ paddingLeft: '32px' }}>
              <span style={{ color: '#94a3b8' }}>- </span>
              <span style={{ color: '#00ff88' }}>MARKET_DATA_API_KEY_ALL</span>
            </div>
          </div>

          {/* Privacy badges */}
          <div className="flex flex-wrap gap-2 mt-1">
            {[
              'API KEY NEVER ON-CHAIN',
              'TEE ENCLAVE ISOLATION',
              'CONSENSUS AGGREGATION',
              'MEDIAN() TAMPER-RESISTANT',
            ].map(badge => (
              <span
                key={badge}
                className="sv-badge"
                style={{
                  color:       '#ff6b35',
                  borderColor: 'rgba(255,107,53,0.3)',
                  background:  'rgba(255,107,53,0.06)',
                  fontSize:    '0.55rem',
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
