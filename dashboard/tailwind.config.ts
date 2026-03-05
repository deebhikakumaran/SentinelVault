import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sv: {
          bg:       '#0a0e1a',
          bg2:      '#0d1528',
          card:     '#0f1929',
          border:   '#1a2540',
          blue:     '#00d4ff',
          green:    '#00ff88',
          orange:   '#ff6b35',
          red:      '#ff2d55',
          yellow:   '#ffd60a',
          text:     '#e2e8f0',
          muted:    '#94a3b8',
          dim:      '#3a4d6b',
        },
      },
      fontFamily: {
        display: ['Orbitron', 'monospace'],
        mono:    ['JetBrains Mono', 'monospace'],
        body:    ['Rajdhani', 'sans-serif'],
      },
      keyframes: {
        'scan-line': {
          '0%':   { transform: 'translateY(-2px)', opacity: '0.08' },
          '50%':  { opacity: '0.12' },
          '100%': { transform: 'translateY(100vh)', opacity: '0.04' },
        },
        'border-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
        'data-flow': {
          '0%':   { strokeDashoffset: '200' },
          '100%': { strokeDashoffset: '0' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
      animation: {
        'scan-line':    'scan-line 6s linear infinite',
        'border-pulse': 'border-pulse 2s ease-in-out infinite',
        'data-flow':    'data-flow 2s linear infinite',
        'fade-up':      'fade-up 0.4s ease-out forwards',
        'blink':        'blink 1s step-end infinite',
      },
      backgroundImage: {
        'dot-grid': 'radial-gradient(circle, #1a2540 1px, transparent 1px)',
      },
      backgroundSize: {
        'dot-grid': '24px 24px',
      },
    },
  },
  plugins: [],
}

export default config
