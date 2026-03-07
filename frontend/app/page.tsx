'use client'

import { useState } from 'react'
import Link from 'next/link'

// ── Data ─────────────────────────────────────────────────────────────────────

const MARQUEE_ITEMS = [
  'CHAINLINK CRE', 'AAVE V3', 'MULTI-CHAIN', 'AUTONOMOUS', 'RISK SCORING',
  'PRIVACY-PRESERVING', 'ATOMIC EXECUTION', 'EMERGENCY EXIT', 'DON TEE',
  'UNISWAP V3', 'SEPOLIA', 'BASE SEPOLIA', 'KEYSTONE FORWARDER', 'FOUNDRY',
]

const STEPS = [
  {
    num: '01',
    title: 'Monitor',
    desc: 'CRE cron fires every 5 minutes. EVMClient reads getUserAccountData() from Aave V3 across all configured chains simultaneously.',
  },
  {
    num: '02',
    title: 'Score',
    desc: 'The DON reaches consensus on a 0–100 risk score. Market sentiment is fetched confidentially inside a TEE enclave — no secret ever leaves.',
  },
  {
    num: '03',
    title: 'Execute',
    desc: 'If score ≥ threshold, a signed report is delivered to SentinelVault via KeystoneForwarder. The vault decodes the action and executes atomically.',
  },
]

const FEATURES = [
  {
    green: true,
    title: 'Multi-Chain Monitoring',
    desc: 'Reads Aave V3 health factors, LTV utilization, and collateral ratios across Sepolia and Base Sepolia — in a single CRE cron cycle.',
  },
  {
    green: false,
    title: 'Deterministic Risk Scoring',
    desc: 'Combines health factor (45 pts), LTV utilization (25 pts), chain concentration (10 pts), and Market Sentiment (20 pts). Fully auditable, no black boxes.',
  },
  {
    green: true,
    title: 'Privacy-Preserving Feeds',
    desc: 'Market data is fetched inside a Chainlink DON Trusted Execution Environment via ConfidentialHTTPClient. API keys never leave the enclave.',
  },
  {
    green: false,
    title: 'Atomic On-Chain Execution',
    desc: 'One transaction: withdraw WETH from Aave, swap to USDC via Uniswap V3, repay debt — or stop safely at any point without reverting.',
  },
  {
    green: true,
    title: 'CRE Workflow',
    desc: 'TypeScript logic executes across DON nodes, reaches Byzantine Fault Tolerant consensus, and writes signed reports to vault contracts on-chain.',
  },
  {
    green: false,
    title: 'Immutable Audit Trail',
    desc: 'Every assessment is written to SentinelRegistry on Sepolia — risk score, action, health factor, total debt, and worst chain — forever on-chain.',
  },
]

const FAQS = [
  {
    q: 'What is SentinelVault?',
    a: 'SentinelVault is an autonomous multi-chain DeFi position protection system. It monitors Aave V3 positions across multiple chains and automatically executes protective actions — from rebalancing to emergency exit — when risk exceeds configurable thresholds.',
  },
  {
    q: 'How does risk scoring work?',
    a: 'The score combines four signals: health factor (0–45 pts), LTV utilization (0–25 pts), multi-chain concentration (0–10 pts), and market sentiment via CryptoCompare API (0–20 pts). Scores are deterministic and fully auditable on-chain.',
  },
  {
    q: 'What chains are supported?',
    a: 'Currently monitoring Ethereum Sepolia and Base Sepolia testnets, with SentinelVault contracts deployed on both. The architecture supports any EVM chain with an Aave V3 deployment.',
  },
  {
    q: 'Is it trustless?',
    a: 'Reports are attested and delivered by the Chainlink Decentralized Oracle Network (DON) via the KeystoneForwarder. Vault contracts only accept reports from the authorized forwarder — no centralized relayer can inject actions.',
  },
  {
    q: 'What is Chainlink CRE?',
    a: 'Chainlink Runtime Environment is a programmable compute layer for the DON. SentinelVault uses CRE to run TypeScript logic across nodes, reach consensus on risk assessments, and write signed reports directly to vault contracts.',
  },
  {
    q: 'What actions can it take?',
    a: 'Four graduated responses based on score: HOLD (< 50), REBALANCE at 25% (≥ 50), DELEVERAGE at 50% (≥ 70), and EMERGENCY_EXIT at 100% (≥ 85). Each action withdraws WETH collateral, swaps to USDC, and repays Aave debt atomically.',
  },
]

// ── Icons ─────────────────────────────────────────────────────────────────────

function HexIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00FF85" strokeWidth="1.5">
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <>
      <style suppressHydrationWarning>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        .lp {
          background: #000000;
          color: #ffffff;
          font-family: 'Inter', sans-serif;
          overflow-x: hidden;
          min-height: 100vh;
        }

        .lp *, .lp *::before, .lp *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        /* ── Nav ── */
        .lp-nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 40px;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .lp-logo {
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #fff;
          text-decoration: none;
        }

        .lp-logo em { color: #00FF85; font-style: normal; }

        .lp-nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
          list-style: none;
        }

        .lp-nav-links a {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.55);
          text-decoration: none;
          transition: color 0.2s;
          letter-spacing: 0.01em;
        }

        .lp-nav-links a:hover { color: #fff; }

        /* ── Buttons ── */
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #00FF85;
          color: #000;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 0.875rem;
          padding: 12px 24px;
          border-radius: 9999px;
          border: none;
          cursor: pointer;
          letter-spacing: 0.01em;
          text-decoration: none;
          transition: opacity 0.2s, transform 0.15s;
          white-space: nowrap;
        }

        .btn-primary:hover { opacity: 0.88; transform: translateY(-1px); }

        .btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          color: #fff;
          font-family: 'Inter', sans-serif;
          font-weight: 500;
          font-size: 0.875rem;
          padding: 12px 24px;
          border-radius: 9999px;
          border: 1px solid rgba(255,255,255,0.2);
          cursor: pointer;
          letter-spacing: 0.01em;
          text-decoration: none;
          transition: border-color 0.2s, background 0.2s;
          white-space: nowrap;
        }

        .btn-ghost:hover {
          border-color: rgba(255,255,255,0.45);
          background: rgba(255,255,255,0.04);
        }

        .btn-nav {
          font-size: 0.8rem;
          padding: 9px 18px;
        }

        /* ── Hero ── */
        .lp-hero {
          position: relative;
          padding: 164px 40px 100px;
          max-width: 1200px;
          margin: 0 auto;
          text-align: center;
          overflow: hidden;
        }

        .lp-blob {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(90px);
        }

        .lp-blob-green {
          width: 700px; height: 420px;
          top: -60px; left: 50%;
          transform: translateX(-50%);
          background: radial-gradient(ellipse, rgba(0,255,133,0.13) 0%, transparent 68%);
        }

        .lp-blob-purple {
          width: 500px; height: 300px;
          bottom: -40px; right: -80px;
          background: radial-gradient(ellipse, rgba(139,92,246,0.10) 0%, transparent 70%);
        }

        .lp-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.72rem;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 7px 18px;
          border-radius: 9999px;
          margin-bottom: 36px;
        }

        .lp-eyebrow em { color: #00FF85; font-style: normal; }

        .lp-hero-title {
          font-size: clamp(52px, 8vw, 88px);
          font-weight: 900;
          line-height: 1.04;
          letter-spacing: -0.035em;
          margin-bottom: 28px;
        }

        .lp-hero-title .green { color: #00FF85; }
        .lp-hero-title .period { color: #00FF85; }

        .lp-hero-sub {
          font-size: 1.1rem;
          font-weight: 300;
          color: rgba(255,255,255,0.5);
          line-height: 1.75;
          max-width: 540px;
          margin: 0 auto 44px;
        }

        .lp-hero-ctas {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        /* ── Marquee ── */
        .lp-marquee-wrap {
          overflow: hidden;
          border-top: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 15px 0;
          background: rgba(255,255,255,0.015);
        }

        .lp-marquee-track {
          display: flex;
          gap: 0;
          width: max-content;
          animation: lp-marquee 35s linear infinite;
        }

        .lp-marquee-track:hover { animation-play-state: paused; }

        @keyframes lp-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .lp-marquee-item {
          display: flex;
          align-items: center;
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          white-space: nowrap;
          padding: 0 36px;
        }

        .lp-marquee-item::after {
          content: '·';
          color: #00FF85;
          margin-left: 36px;
          font-size: 1rem;
        }

        /* ── Section layout ── */
        .lp-section {
          max-width: 1200px;
          margin: 0 auto;
          padding: 96px 40px;
        }

        .lp-label {
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 16px;
        }

        .lp-h2 {
          font-size: clamp(30px, 4vw, 48px);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.13;
          margin-bottom: 20px;
        }

        .lp-sub {
          font-size: 1rem;
          font-weight: 300;
          color: rgba(255,255,255,0.48);
          line-height: 1.75;
          max-width: 520px;
          margin-bottom: 60px;
        }

        /* ── Stats ── */
        .lp-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          overflow: hidden;
          background: rgba(255,255,255,0.07);
        }

        .lp-stat {
          background: #000;
          padding: 36px 24px;
          text-align: center;
        }

        .lp-stat-num {
          font-size: 2.4rem;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: #00FF85;
          line-height: 1;
          margin-bottom: 10px;
        }

        .lp-stat-label {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.38);
          letter-spacing: 0.04em;
        }

        /* ── Steps ── */
        .lp-steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .lp-step {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          padding: 36px 30px;
          transition: border-color 0.3s, box-shadow 0.3s;
        }

        .lp-step:hover {
          border-color: rgba(0,255,133,0.22);
          box-shadow: 0 0 40px rgba(0,255,133,0.04);
        }

        .lp-step-num {
          font-size: 2.8rem;
          font-weight: 900;
          letter-spacing: -0.04em;
          color: rgba(0,255,133,0.14);
          line-height: 1;
          margin-bottom: 22px;
        }

        .lp-step-title {
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin-bottom: 12px;
        }

        .lp-step-desc {
          font-size: 0.875rem;
          font-weight: 300;
          color: rgba(255,255,255,0.48);
          line-height: 1.75;
        }

        /* ── Risk score callout ── */
        .lp-score-band {
          background: rgba(255,255,255,0.018);
          border-top: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          padding: 88px 40px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .lp-score-big {
          font-size: 9rem;
          font-weight: 900;
          letter-spacing: -0.05em;
          line-height: 1;
          background: linear-gradient(135deg, #00FF85 0%, #00d4ff 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 4px;
        }

        .lp-actions-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          flex-wrap: wrap;
          margin-top: 44px;
        }

        .lp-action-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 9999px;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border: 1px solid;
        }

        /* ── Features ── */
        .lp-features {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }

        .lp-feat {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          padding: 30px 26px;
          transition: border-color 0.25s, background 0.25s;
        }

        .lp-feat:hover {
          border-color: rgba(255,255,255,0.13);
          background: rgba(255,255,255,0.04);
        }

        .lp-feat-icon {
          width: 44px; height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }

        .lp-feat-icon-green {
          background: rgba(0,255,133,0.07);
          border: 1px solid rgba(0,255,133,0.14);
        }

        .lp-feat-icon-purple {
          background: rgba(139,92,246,0.07);
          border: 1px solid rgba(139,92,246,0.14);
        }

        .lp-feat-title {
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin-bottom: 10px;
        }

        .lp-feat-desc {
          font-size: 0.84rem;
          font-weight: 300;
          color: rgba(255,255,255,0.46);
          line-height: 1.75;
        }

        /* ── Code snippet ── */
        .lp-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 56px;
          align-items: center;
        }

        .lp-code {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px;
          padding: 30px 28px;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 0.8rem;
          line-height: 1.85;
          color: rgba(255,255,255,0.65);
          overflow-x: auto;
          position: relative;
        }

        .lp-code::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,212,255,0.3), transparent);
        }

        .kw  { color: #8B5CF6; }
        .fn  { color: #00FF85; }
        .str { color: #ffd60a; }
        .cm  { color: rgba(255,255,255,0.22); font-style: italic; }
        .nu  { color: #00d4ff; }

        .grad-purple {
          background: linear-gradient(135deg, #8B5CF6, #6D28D9);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* ── Tech stack ── */
        .lp-tech-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        .lp-tech {
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px;
          padding: 24px 18px;
          text-align: center;
          transition: border-color 0.2s;
        }

        .lp-tech:hover { border-color: rgba(255,255,255,0.13); }

        .lp-tech-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          margin: 0 auto 14px;
        }

        .lp-tech-name {
          font-size: 0.875rem;
          font-weight: 700;
          margin-bottom: 5px;
          letter-spacing: -0.01em;
        }

        .lp-tech-role {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.04em;
        }

        /* ── FAQ ── */
        .lp-faq-grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 80px;
          align-items: start;
        }

        .lp-faq-list { display: flex; flex-direction: column; }

        .lp-faq-item { border-bottom: 1px solid rgba(255,255,255,0.07); }

        .lp-faq-q {
          width: 100%;
          background: none;
          border: none;
          color: #fff;
          font-family: 'Inter', sans-serif;
          font-size: 0.95rem;
          font-weight: 500;
          text-align: left;
          padding: 22px 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          letter-spacing: -0.01em;
          transition: color 0.2s;
        }

        .lp-faq-q:hover { color: rgba(255,255,255,0.75); }

        .lp-faq-chevron {
          flex-shrink: 0;
          color: rgba(255,255,255,0.3);
          transition: transform 0.25s, color 0.25s;
        }

        .lp-faq-chevron.open {
          transform: rotate(180deg);
          color: #00FF85;
        }

        .lp-faq-a {
          font-size: 0.875rem;
          font-weight: 300;
          color: rgba(255,255,255,0.46);
          line-height: 1.8;
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s ease, padding-bottom 0.3s ease;
        }

        .lp-faq-a.open {
          max-height: 220px;
          padding-bottom: 22px;
        }

        /* ── CTA band ── */
        .lp-cta {
          position: relative;
          text-align: center;
          padding: 120px 40px;
          overflow: hidden;
        }

        .lp-cta-glow {
          position: absolute;
          width: 800px; height: 400px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(ellipse, rgba(0,255,133,0.08) 0%, rgba(139,92,246,0.06) 50%, transparent 70%);
          pointer-events: none;
        }

        .lp-cta-title {
          font-size: clamp(40px, 6vw, 68px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.08;
          margin-bottom: 20px;
          position: relative;
        }

        .lp-cta-sub {
          font-size: 1rem;
          font-weight: 300;
          color: rgba(255,255,255,0.46);
          margin-bottom: 40px;
          position: relative;
          max-width: 460px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.7;
        }

        .lp-cta-btns {
          display: flex;
          gap: 14px;
          justify-content: center;
          flex-wrap: wrap;
          position: relative;
        }

        /* ── Footer ── */
        .lp-footer {
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 36px 40px;
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }

        .lp-footer-links {
          display: flex;
          gap: 24px;
          list-style: none;
        }

        .lp-footer-links a {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.3);
          text-decoration: none;
          transition: color 0.2s;
        }

        .lp-footer-links a:hover { color: rgba(255,255,255,0.65); }

        .lp-copy {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.18);
        }

        /* ── Divider ── */
        .lp-div {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent);
          margin: 0 40px;
        }

        /* ── Anchor scroll offset (accounts for fixed nav ~57px) ── */
        #how-it-works, #features, #tech, #faq {
          scroll-margin-top: 80px;
        }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .lp-nav-links { display: none; }
          .lp-stats { grid-template-columns: repeat(2, 1fr); }
          .lp-steps { grid-template-columns: 1fr; }
          .lp-features { grid-template-columns: 1fr 1fr; }
          .lp-split { grid-template-columns: 1fr; gap: 32px; }
          .lp-tech-grid { grid-template-columns: repeat(2, 1fr); }
          .lp-faq-grid { grid-template-columns: 1fr; gap: 40px; }
        }

        @media (max-width: 600px) {
          .lp-nav { padding: 16px 20px; }
          .lp-hero { padding: 120px 20px 64px; }
          .lp-section { padding: 64px 20px; }
          .lp-score-band { padding: 64px 20px; }
          .lp-cta { padding: 80px 20px; }
          .lp-footer { padding: 32px 20px; }
          .lp-div { margin: 0 20px; }
          .lp-features { grid-template-columns: 1fr; }
          .lp-score-big { font-size: 6rem; }
        }
      `}</style>

      <div className="lp">

        {/* ── Navigation ── */}
        <nav className="lp-nav">
          <div className="lp-logo">Sentinel<em>Vault</em></div>
          <ul className="lp-nav-links">
            <li><a href="#how-it-works">How it works</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#tech">Tech Stack</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
          <Link href="/app" className="btn-primary btn-nav">Launch App →</Link>
        </nav>

        {/* ── Hero ── */}
        <div className="lp-hero">
          <div className="lp-blob lp-blob-green" />
          <div className="lp-blob lp-blob-purple" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="lp-eyebrow">
              <em>●</em> Chainlink CRE Hackathon — Convergence 2026
            </div>
            <h1 className="lp-hero-title">
              Protect your<br />
              <span className="green">DeFi positions</span>
              <span className="period">.</span>
            </h1>
            <p className="lp-hero-sub">
              Autonomous multi-chain risk protection for Aave V3. Powered by Chainlink CRE — monitors positions across chains, scores risk, and executes atomic protective actions. Without you lifting a finger.
            </p>
            <div className="lp-hero-ctas">
              <Link href="/app" className="btn-primary">Launch App →</Link>
              <a href="#how-it-works" className="btn-ghost">How it works</a>
            </div>
          </div>
        </div>

        {/* ── Marquee ── */}
        <div className="lp-marquee-wrap">
          <div className="lp-marquee-track">
            {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
              <span key={i} className="lp-marquee-item">{item}</span>
            ))}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="lp-section" style={{ paddingBottom: 0 }}>
          <div className="lp-stats">
            {[
              { num: '0–100', label: 'Deterministic Risk Score' },
              { num: '5 min',  label: 'Monitoring Cycle'        },
              { num: '2+',     label: 'Chains Monitored'        },
              { num: '1 tx',   label: 'Atomic Execution'        },
            ].map(s => (
              <div key={s.label} className="lp-stat">
                <div className="lp-stat-num">{s.num}</div>
                <div className="lp-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── How it works ── */}
        <div className="lp-section" id="how-it-works">
          <div className="lp-label">How it works</div>
          <h2 className="lp-h2">Three steps. Zero intervention.</h2>
          <p className="lp-sub">
            From monitoring to execution, every step is automated, attested by the Chainlink DON, and recorded permanently on-chain.
          </p>
          <div className="lp-steps">
            {STEPS.map(s => (
              <div key={s.num} className="lp-step">
                <div className="lp-step-num">{s.num}</div>
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Risk score callout ── */}
        <div className="lp-score-band">
          <div className="lp-blob lp-blob-green" style={{ opacity: 0.6 }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto' }}>
            <div className="lp-label" style={{ marginBottom: 12 }}>Risk Engine</div>
            <h2 className="lp-h2" style={{ marginBottom: 12 }}>Deterministic by design.</h2>
            <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.42)', lineHeight: 1.75, maxWidth: 480, margin: '0 auto 52px' }}>
              Every signal, every weight, every threshold is transparent and auditable. No black boxes, no trusted feeds.
            </p>
            <div className="lp-score-big">72</div>
            <div style={{ fontSize: '0.68rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
              Sample Risk Score
            </div>
            <div className="lp-actions-row">
              {[
                { label: 'HOLD',           range: '< 50',  color: 'rgba(255,255,255,0.38)', bg: 'rgba(255,255,255,0.03)' },
                { label: 'REBALANCE',      range: '≥ 50',  color: '#00FF85',                bg: 'rgba(0,255,133,0.05)'   },
                { label: 'DELEVERAGE',     range: '≥ 70',  color: '#ffd60a',                bg: 'rgba(255,214,10,0.05)'  },
                { label: 'EMERGENCY EXIT', range: '≥ 85',  color: '#ff2d55',                bg: 'rgba(255,45,85,0.05)'   },
              ].map(a => (
                <div
                  key={a.label}
                  className="lp-action-pill"
                  style={{ color: a.color, borderColor: a.color, background: a.bg }}
                >
                  <span style={{ fontSize: '0.55rem' }}>●</span>
                  {a.label}
                  <span style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400, fontSize: '0.68rem' }}>{a.range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <div className="lp-section" id="features">
          <div className="lp-label">Features</div>
          <h2 className="lp-h2">Built for the edge of DeFi.</h2>
          <p className="lp-sub">
            Every component is designed for trust minimization, transparency, and real-time response to market conditions.
          </p>
          <div className="lp-features">
            {FEATURES.map(f => (
              <div key={f.title} className="lp-feat">
                <div className={`lp-feat-icon ${f.green ? 'lp-feat-icon-green' : 'lp-feat-icon-purple'}`}>
                  {f.green ? <HexIcon /> : <LayersIcon />}
                </div>
                <div className="lp-feat-title">{f.title}</div>
                <div className="lp-feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-div" />

        {/* ── Code snippet ── */}
        <div className="lp-section">
          <div className="lp-split">
            <div>
              <div className="lp-label">Under the hood</div>
              <h2 className="lp-h2" style={{ marginBottom: 16 }}>
                CRE workflow,<br />
                <span className="grad-purple">pure TypeScript.</span>
              </h2>
              <p style={{ fontSize: '0.9rem', fontWeight: 300, color: 'rgba(255,255,255,0.46)', lineHeight: 1.8 }}>
                The entire risk engine runs as a Chainlink CRE workflow — deterministic TypeScript that executes across DON nodes, reaches BFT consensus, and writes attested reports directly to your vault contracts.
              </p>
            </div>
            <div className="lp-code">
              <span className="cm">// onCronTrigger — every 5 minutes</span><br />
              <span className="kw">const</span> evmClient = <span className="kw">new</span> <span className="fn">EVMClient</span>(<br />
              &nbsp;&nbsp;BigInt(chainSelector)<br />
              )<br />
              <br />
              <span className="kw">const</span> {'{'} healthFactor {'}'} = evmClient<br />
              &nbsp;&nbsp;.<span className="fn">call</span>(runtime, {'{'} data: <span className="fn">getUserAccountData</span>(wallet) {'}'})<br />
              &nbsp;&nbsp;.<span className="fn">result</span>()<br />
              <br />
              <span className="kw">const</span> score = <span className="fn">scoreRisk</span>({'{'}<br />
              &nbsp;&nbsp;healthFactor,<br />
              &nbsp;&nbsp;sentiment: marketData.value<br />
              {'}'})<span className="cm"> // 0–100</span><br />
              <br />
              <span className="kw">if</span> (score &gt;= threshold) {'{'}<br />
              &nbsp;&nbsp;evmClient.<span className="fn">writeReport</span>(runtime, {'{'}<br />
              &nbsp;&nbsp;&nbsp;&nbsp;receiver: <span className="str">sentinelVault</span>,<br />
              &nbsp;&nbsp;&nbsp;&nbsp;report: <span className="fn">encodeAction</span>(score)<br />
              &nbsp;&nbsp;{'}'})<br />
              {'}'}
            </div>
          </div>
        </div>

        {/* ── Tech stack ── */}
        <div className="lp-section" id="tech" style={{ paddingTop: 0 }}>
          <div className="lp-label">Tech Stack</div>
          <h2 className="lp-h2" style={{ marginBottom: 48 }}>Production-grade primitives.</h2>
          <div className="lp-tech-grid">
            {[
              { name: 'Chainlink CRE',    role: 'Compute & Attestation', color: '#375BD2' },
              { name: 'Aave V3',          role: 'Lending Protocol',       color: '#B6509E' },
              { name: 'Uniswap V3',       role: 'On-chain DEX',           color: '#FF007A' },
              { name: 'Solidity',         role: 'Vault Contracts',        color: '#00FF85' },
              { name: 'Eth Sepolia',      role: 'Testnet Chain',          color: '#627EEA' },
              { name: 'Base Sepolia',     role: 'Testnet Chain',          color: '#0052FF' },
              { name: 'Foundry',          role: 'Contract Testing',       color: '#ffd60a' },
              { name: 'TypeScript',       role: 'CRE Workflow',           color: '#3178C6' },
            ].map(t => (
              <div key={t.name} className="lp-tech">
                <div
                  className="lp-tech-dot"
                  style={{ background: t.color, boxShadow: `0 0 10px ${t.color}60` }}
                />
                <div className="lp-tech-name">{t.name}</div>
                <div className="lp-tech-role">{t.role}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-div" />

        {/* ── FAQ ── */}
        <div className="lp-section" id="faq">
          <div className="lp-faq-grid">
            <div>
              <div className="lp-label">FAQ</div>
              <h2 className="lp-h2" style={{ marginBottom: 14 }}>Common questions.</h2>
              <p style={{ fontSize: '0.85rem', fontWeight: 300, color: 'rgba(255,255,255,0.38)', lineHeight: 1.75 }}>
                Everything you need to know about SentinelVault and how it protects your positions.
              </p>
            </div>
            <div className="lp-faq-list">
              {FAQS.map((faq, i) => (
                <div key={i} className="lp-faq-item">
                  <button
                    className="lp-faq-q"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    <span>{faq.q}</span>
                    <span className={`lp-faq-chevron ${openFaq === i ? 'open' : ''}`}>
                      <ChevronDown />
                    </span>
                  </button>
                  <div className={`lp-faq-a ${openFaq === i ? 'open' : ''}`}>{faq.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Final CTA ── */}
        <div className="lp-cta">
          <div className="lp-cta-glow" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="lp-eyebrow" style={{ display: 'inline-flex', marginBottom: 32 }}>
              <em>●</em> Live on Sepolia + Base Sepolia
            </div>
            <h2 className="lp-cta-title">
              Your positions.<br />
              Protected<span style={{ color: '#00FF85' }}>.</span>
            </h2>
            <p className="lp-cta-sub">
              Open the live dashboard to see real-time chain positions, risk scores, and audit logs from the SentinelRegistry.
            </p>
            <div className="lp-cta-btns">
              <Link href="/app" className="btn-primary">Launch App →</Link>
              <a
                href="https://github.com/deebhikakumaran/SentinelVault"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="lp-footer">
            <div className="lp-logo">Sentinel<em>Vault</em></div>
            <ul className="lp-footer-links">
              <li><a href="#how-it-works">How it works</a></li>
              <li><a href="#features">Features</a></li>
              <li><a href="#tech">Tech Stack</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
            <div className="lp-copy">Convergence 2026</div>
          </div>
        </footer>

      </div>
    </>
  )
}
