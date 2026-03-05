// Contract addresses, ABIs, and ethers.js helpers for SentinelVault dashboard

export const CHAINS = {
  sepolia: {
    key:      'sepolia',
    label:    'Sepolia',
    chainId:  11155111,
    rpc:      'https://ethereum-sepolia-rpc.publicnode.com',
    vault:    '0x59d1102E37ECC1ff5cEde1D67D9C0C59f05f0A19',
    aavePool: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
    explorer: 'https://sepolia.etherscan.io',
    color:    '#627EEA',
  },
  base: {
    key:      'base',
    label:    'Base Sepolia',
    chainId:  84532,
    rpc:      'https://sepolia.base.org',
    vault:    '0x1980F9a92e97C63468f1cDA533900d0D50a33058',
    aavePool: '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b',
    explorer: 'https://sepolia.basescan.org',
    color:    '#0052FF',
  },
} as const

export const REGISTRY = {
  address: '0xed1bC5A7c14fFD74C8b71F0d6a4C13430F34F2de',
  rpc:     'https://ethereum-sepolia-rpc.publicnode.com',
} as const

// Minimal ABI — only functions the dashboard calls
export const VAULT_ABI = [
  `function getPosition() view returns (
    uint256 totalCollateralBase,
    uint256 totalDebtBase,
    uint256 availableBorrowsBase,
    uint256 currentLiqThreshold,
    uint256 ltv,
    uint256 healthFactor
  )`,
  `function getLatestLog() view returns (
    tuple(
      string   action,
      uint256  riskScore,
      uint256  healthFactorBefore,
      uint256  healthFactorAfter,
      uint256  swappedWeth,
      uint256  receivedUsdc,
      uint256  repaidUsdc,
      uint256  withdrawnWeth,
      uint256  timestamp,
      bool     swapSucceeded
    )
  )`,
  'function owner() view returns (address)',
  'function forwarder() view returns (address)',
] as const

export const REGISTRY_ABI = [
  `function getLatestAssessment() view returns (
    uint8   riskScore,
    string  action,
    uint256 healthFactor,
    uint256 totalDebtUsd,
    string  worstChain,
    uint256 timestamp
  )`,
  'function getAssessmentCount() view returns (uint256)',
  `function getAssessment(uint256 index) view returns (
    tuple(
      uint8   riskScore,
      string  action,
      uint256 healthFactor,
      uint256 totalDebtUsd,
      string  worstChain,
      uint256 timestamp
    )
  )`,
] as const
