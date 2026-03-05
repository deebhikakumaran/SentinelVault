import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SentinelVault | Autonomous DeFi Risk Protection',
  description: 'Autonomous cross-chain DeFi position protection powered by Chainlink CRE. Real-time risk monitoring, deterministic scoring, and atomic on-chain execution.',
  keywords: ['DeFi', 'Chainlink', 'CRE', 'Aave', 'risk management', 'cross-chain'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
