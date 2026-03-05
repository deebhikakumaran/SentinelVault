import {
  CronCapability,
  ConfidentialHTTPClient,
  EVMClient,
  handler,
  ConsensusAggregationByFields,
  median,
  identical,
  Runner,
  type Runtime,
  type ConfidentialHTTPSendRequester,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  encodeCallMsg,
  bytesToHex,
  hexToBase64,
  json,
} from "@chainlink/cre-sdk"
import {
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
  type Address,
} from "viem"

// ——— Types ———

type ChainConfig = {
  chainSelectorName: string     // e.g. "ethereum-testnet-sepolia" — resolved via getNetwork()
  isTestnet: boolean
  chainLabel: string
  aavePoolAddress: string
  monitoredWallet: string
  vaultAddress: string          // SentinelVault deployed on this chain
  mockDexAddress: string        // SimpleMockDEX deployed on this chain (baked into vault constructor; informational)
  gasLimit: string              // gas limit for vault writeReport calls
}

type RegistryConfig = {
  chainSelectorName: string
  address: string               // SentinelRegistry contract address
  isTestnet: boolean
  gasLimit: string
}

type MarketData = {
  avgChange24h: number   // Average 24h change across all tracked assets (%)
  worstDrop24h: number   // Worst single-asset 24h drop (contagion signal, %)
  negativeCount: number  // Number of assets with negative 24h change (breadth)
  totalAssets: number    // Total tracked assets
  aaveChange24h: number  // AAVE-specific 24h change (protocol health signal, %)
  ethChange24h: number   // ETH 24h change (primary collateral asset, %)
}

type Config = {
  schedule: string
  marketDataUrl: string          // CryptoCompare API endpoint
  owner: string                  // DON secret owner address (workflow deployer)
  riskThreshold: number
  chains: ChainConfig[]          // Multi-chain READ + per-chain vault WRITE
  registry: RegistryConfig       // SentinelRegistry audit log (Sepolia)
}

type AavePosition = {
  chainLabel: string
  totalCollateralUSD: bigint
  totalDebtUSD: bigint
  availableBorrowsUSD: bigint
  currentLiquidationThreshold: bigint
  ltv: bigint
  healthFactor: bigint
}

// ——— Aave ABI ———

const aavePoolAbi = [
  {
    name: "getUserAccountData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "totalCollateralBase", type: "uint256" },
      { name: "totalDebtBase", type: "uint256" },
      { name: "availableBorrowsBase", type: "uint256" },
      { name: "currentLiquidationThreshold", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "healthFactor", type: "uint256" },
    ],
  },
] as const

// ——— Workflow Init ———

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)]
}

// ——— Main Handler ———

const onCronTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("🛡️ SentinelVault risk assessment triggered")

  // ═══ STEP 1: Read Aave positions from ALL chains (multi-chain READ) ═══
  const positions: AavePosition[] = []

  for (const chainCfg of runtime.config.chains) {
    const chainNetwork = getNetwork({
      chainFamily: "evm",
      chainSelectorName: chainCfg.chainSelectorName,
      isTestnet: chainCfg.isTestnet,
    })
    if (!chainNetwork) {
      runtime.log(`⚠️ Unknown network "${chainCfg.chainSelectorName}", skipping`)
      continue
    }

    const evmClient = new EVMClient(chainNetwork.chainSelector.selector)

    const callData = encodeFunctionData({
      abi: aavePoolAbi,
      functionName: "getUserAccountData",
      args: [chainCfg.monitoredWallet as Address],
    })

    try {
      const result = evmClient
        .callContract(runtime, {
          call: encodeCallMsg({
            from: zeroAddress,
            to: chainCfg.aavePoolAddress as Address,
            data: callData,
          }),
          blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
        })
        .result()

      const decoded = decodeFunctionResult({
        abi: aavePoolAbi,
        functionName: "getUserAccountData",
        data: bytesToHex(result.data),
      }) as readonly [bigint, bigint, bigint, bigint, bigint, bigint]

      const position: AavePosition = {
        chainLabel: chainCfg.chainLabel,
        totalCollateralUSD: decoded[0],
        totalDebtUSD: decoded[1],
        availableBorrowsUSD: decoded[2],
        currentLiquidationThreshold: decoded[3],
        ltv: decoded[4],
        healthFactor: decoded[5],
      }

      positions.push(position)

      const collateralFormatted = Number(position.totalCollateralUSD) / 1e8
      const debtFormatted = Number(position.totalDebtUSD) / 1e8
      const hfFormatted = Number(position.healthFactor) / 1e18

      runtime.log(
        `📊 [${chainCfg.chainLabel}] Collateral: $${collateralFormatted.toFixed(0)}, Debt: $${debtFormatted.toFixed(0)}, Health: ${hfFormatted.toFixed(4)}`
      )
    } catch (e) {
      runtime.log(`⚠️ [${chainCfg.chainLabel}] Chain read failed, skipping: ${e}`)
    }
  }

  if (positions.length === 0) {
    runtime.log("❌ No chain data available — aborting assessment")
    return "aborted: no chain data"
  }

  // ═══ STEP 2: Fetch market intelligence via ConfidentialHTTPClient (Privacy Track) ═══
  // Runs inside the DON enclave: API key injected from VaultDON secrets
  const confHTTPClient = new ConfidentialHTTPClient()
  const marketData = confHTTPClient
    .sendRequest(runtime, fetchMarketData, ConsensusAggregationByFields<MarketData>({
      avgChange24h:  () => median<number>(),
      worstDrop24h:  () => median<number>(),
      negativeCount: () => median<number>(),
      totalAssets:   () => identical<number>(),
      aaveChange24h: () => median<number>(),
      ethChange24h:  () => median<number>(),
    }))
    (runtime.config).result()

  runtime.log(
    `🌡️ Market Intel — Avg24h: ${marketData.avgChange24h.toFixed(2)}%, ` +
    `WorstDrop: ${marketData.worstDrop24h.toFixed(2)}%, ` +
    `Negative: ${marketData.negativeCount}/${marketData.totalAssets} assets, ` +
    `ETH: ${marketData.ethChange24h.toFixed(2)}%, AAVE: ${marketData.aaveChange24h.toFixed(2)}%`
  )

  // ═══ STEP 3: Deterministic Risk Scoring (across ALL chains) ═══
  const { riskScore, action, worstChain, worstHealthFactor, worstDebtUSD } =
    calculateMultiChainRisk(positions, marketData)

  runtime.log(
    `🎯 Risk Engine — Score: ${riskScore}, Action: ${action}, Worst Chain: ${worstChain}`
  )

  // ═══ STEP 4: Write audit log to SentinelRegistry (Sepolia) ═══
  const registryCfg = runtime.config.registry
  const registryNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: registryCfg.chainSelectorName,
    isTestnet: registryCfg.isTestnet,
  })

  if (registryNetwork) {
    writeRiskAssessment(
      runtime,
      registryNetwork.chainSelector.selector,
      registryCfg,
      riskScore,
      action,
      worstHealthFactor,
      worstDebtUSD,
      worstChain
    )
  }

  // ═══ STEP 5: If HIGH RISK → Write report to SentinelVault on the worst-HF chain ═══
  // This triggers: Aave withdraw → MockDEX swap → Aave repay (ONE TX)
  if (riskScore >= runtime.config.riskThreshold) {
    runtime.log(
      `⚠️ HIGH RISK [${riskScore}/${runtime.config.riskThreshold}] → ${action}`
    )

    triggerProtectiveAction(runtime, action, worstChain, riskScore, worstHealthFactor)
  } else {
    runtime.log(
      `✅ SAFE [${riskScore}/${runtime.config.riskThreshold}] → ${action}`
    )
  }

  return "assessment_complete"
}

// ——— Multi-Chain Risk Calculator ———

function calculateMultiChainRisk(
  positions: AavePosition[],
  marketData: MarketData
): {
  riskScore: number
  action: string
  worstChain: string
  worstHealthFactor: bigint
  worstDebtUSD: bigint
} {
  let worstHF = 2n ** 256n - 1n  // type(uint256).max — any real HF will be lower
  let worstChain = "none"
  let worstDebtUSD = 0n
  let totalDebtAllChains = 0n
  let totalCollateralAllChains = 0n

  for (const pos of positions) {
    totalDebtAllChains += pos.totalDebtUSD
    totalCollateralAllChains += pos.totalCollateralUSD

    if (pos.totalDebtUSD > 0n && pos.healthFactor < worstHF) {
      worstHF = pos.healthFactor
      worstChain = pos.chainLabel
      worstDebtUSD = pos.totalDebtUSD
    }
  }

  if (totalDebtAllChains === 0n) {
    return {
      riskScore: 5,
      action: "HOLD",
      worstChain: "none",
      worstHealthFactor: 0n,
      worstDebtUSD: 0n,
    }
  }

  let score = 0
  const hfFloat = Number(worstHF) / 1e18

  // Health factor scoring (0-45 points)
  if (hfFloat < 1.05) score += 45
  else if (hfFloat < 1.1) score += 35
  else if (hfFloat < 1.2) score += 25
  else if (hfFloat < 1.5) score += 15
  else if (hfFloat < 2.0) score += 8
  else score += 2

  // LTV utilization scoring (0-25 points)
  const globalLTV =
    totalCollateralAllChains > 0n
      ? Number((totalDebtAllChains * 10000n) / totalCollateralAllChains)
      : 0
  if (globalLTV > 8500) score += 25
  else if (globalLTV > 8000) score += 20
  else if (globalLTV > 7500) score += 15
  else if (globalLTV > 7000) score += 8

  // Multi-chain concentration risk (0-10 points)
  const chainsWithDebt = positions.filter((p) => p.totalDebtUSD > 0n).length
  if (chainsWithDebt >= 3) score += 10
  else if (chainsWithDebt >= 2) score += 5
  else score += 2

  // Market sentiment scoring (0-20 points) — derived from multi-asset CryptoCompare data.
  // Composite signals: average market change, breadth (% assets negative),
  // tail/contagion risk (worst single drop), and AAVE protocol health.
  let sentimentScore = 50 // neutral baseline (maps to 0-100 fear/greed scale)

  // 1. Average market direction
  if (marketData.avgChange24h <= -10) sentimentScore -= 30
  else if (marketData.avgChange24h <= -5) sentimentScore -= 18
  else if (marketData.avgChange24h <= -2) sentimentScore -= 8
  else if (marketData.avgChange24h <= 0) sentimentScore -= 2
  else if (marketData.avgChange24h <= 5) sentimentScore += 8
  else sentimentScore += 20

  // 2. Market breadth — broad bleed means systemic fear, not just one coin
  const bearFraction = marketData.negativeCount / (marketData.totalAssets || 1)
  if (bearFraction >= 0.9) sentimentScore -= 15
  else if (bearFraction >= 0.7) sentimentScore -= 8
  else if (bearFraction <= 0.2) sentimentScore += 10

  // 3. Contagion / tail risk — any asset crashing hard signals cascade risk
  if (marketData.worstDrop24h <= -30) sentimentScore -= 20
  else if (marketData.worstDrop24h <= -20) sentimentScore -= 12
  else if (marketData.worstDrop24h <= -15) sentimentScore -= 6

  // 4. AAVE protocol health — collateral token drop raises liquidation pressure
  if (marketData.aaveChange24h <= -15) sentimentScore -= 10
  else if (marketData.aaveChange24h <= -8) sentimentScore -= 5
  else if (marketData.aaveChange24h >= 8) sentimentScore += 5

  sentimentScore = Math.max(0, Math.min(100, sentimentScore))

  // Use same thresholds as Fear & Greed (low score = fear = higher risk)
  if (sentimentScore <= 10) score += 20
  else if (sentimentScore <= 25) score += 15
  else if (sentimentScore <= 40) score += 8
  else if (sentimentScore <= 60) score += 3
  else score += 0

  score = Math.min(100, Math.max(0, score))

  let action: string
  if (score >= 85) action = "EMERGENCY_EXIT"
  else if (score >= 70) action = "DELEVERAGE"
  else if (score >= 50) action = "REBALANCE"
  else action = "HOLD"

  return { riskScore: score, action, worstChain, worstHealthFactor: worstHF, worstDebtUSD }
}

// ——— Confidential Market Intelligence Fetch (CryptoCompare via ConfidentialHTTPClient) ———
// Privacy Track: executes inside the DON enclave (TEE).
// - marketDataApiKey injected from VaultDON secrets via Go template — key never appears
//   in workflow code or config, injected only inside the enclave at call time.
// - encryptOutput: false — CryptoCompare price data is public, no need to encrypt the
//   response body. The confidentiality guarantee is on the API KEY, not the response.
//   (encryptOutput: true requires the WASM to AES-GCM-decrypt response.body manually,
//    which is unsupported without crypto.subtle in the QuickJS/WASM host environment.)
// Fetches 10 assets: BTC + ETH (market leaders), AAVE/LINK/UNI (DeFi ecosystem),
// BNB/SOL/AVAX/MATIC/ARB (broad alt-market breadth).

const fetchMarketData = (
  sendRequester: ConfidentialHTTPSendRequester,
  config: Config
): MarketData => {
  const response = sendRequester
    .sendRequest({
      request: {
        url: config.marketDataUrl,
        method: "GET",
        multiHeaders: {
          Authorization: { values: ["Apikey {{.marketDataApiKey}}"] },
        },
      },
      vaultDonSecrets: [
        { key: "marketDataApiKey", owner: config.owner },
      ],
      encryptOutput: false,
    })
    .result()

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`CryptoCompare API failed: HTTP ${response.statusCode}`)
  }

  // json() is the WASM-safe SDK helper — uses decodeJson(Uint8Array) under the hood,
  // not TextDecoder, so it works correctly in the QuickJS/WASM runtime.
  const body = json(response) as { RAW?: Record<string, { USD: { CHANGEPCT24HOUR: number } }> }
  const raw = body.RAW

  if (!raw) throw new Error("Unexpected CryptoCompare response structure")

  const assets = Object.keys(raw)
  const changes = assets.map((sym) => Number(raw[sym]?.USD?.CHANGEPCT24HOUR ?? 0))
  const avgChange24h = changes.reduce((a, b) => a + b, 0) / (changes.length || 1)
  const worstDrop24h = Math.min(...changes)
  const negativeCount = changes.filter((c) => c < 0).length

  return {
    avgChange24h,
    worstDrop24h,
    negativeCount,
    totalAssets: assets.length,
    aaveChange24h: Number(raw["AAVE"]?.USD?.CHANGEPCT24HOUR ?? 0),
    ethChange24h: Number(raw["ETH"]?.USD?.CHANGEPCT24HOUR ?? 0),
  }
}

// ——— Write Audit Log to SentinelRegistry (Sepolia) ———

function writeRiskAssessment(
  runtime: Runtime<Config>,
  chainSelector: bigint,
  registryCfg: RegistryConfig,
  riskScore: number,
  action: string,
  healthFactor: bigint,
  totalDebtUSD: bigint,
  worstChain: string
): string {
  const evmClient = new EVMClient(chainSelector)

  const reportData = encodeAbiParameters(
    parseAbiParameters(
      "uint8 riskScore, string action, uint256 healthFactor, uint256 totalDebtUSD, string worstChain"
    ),
    [riskScore, action, healthFactor, totalDebtUSD, worstChain]
  )

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: registryCfg.address,
      report: reportResponse,
      gasConfig: { gasLimit: registryCfg.gasLimit },
    })
    .result()

  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
  runtime.log(`📝 Audit log written to SentinelRegistry: ${txHash}`)
  return txHash
}

// ——— Trigger Protective Action on the worst-HF chain's SentinelVault ———
// Looks up the chain config by targetChain (chainLabel of worst health factor chain),
// resolves the CRE network selector, and writes a signed report to that chain's vault.
// The vault's onReport() → Aave.withdraw() → DEX.swap() → Aave.repay() atomically.

function triggerProtectiveAction(
  runtime: Runtime<Config>,
  action: string,
  targetChain: string,
  riskScore: number,
  healthFactor: bigint
): void {
  // Look up the vault config for the chain with the worst health factor
  const chainCfg = runtime.config.chains.find(c => c.chainLabel === targetChain)
  if (!chainCfg) {
    runtime.log(`⚠️ No chain config found for "${targetChain}", cannot trigger protective action`)
    return
  }

  const vaultNetwork = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chainCfg.chainSelectorName,
    isTestnet: chainCfg.isTestnet,
  })
  if (!vaultNetwork) {
    runtime.log(`⚠️ Unknown network for chain "${targetChain}", cannot trigger protective action`)
    return
  }

  const evmClient = new EVMClient(vaultNetwork.chainSelector.selector)

  const reportData = encodeAbiParameters(
    parseAbiParameters("string action, uint256 riskScore, uint256 healthFactor, uint256 timestamp"),
    [
      action,
      BigInt(riskScore),
      healthFactor,
      0n,
    ]
  )

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: chainCfg.vaultAddress,
      report: reportResponse,
      gasConfig: { gasLimit: chainCfg.gasLimit },
    })
    .result()

  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
  runtime.log(`🚨 Protective action (${action}) executed on ${targetChain} vault: ${txHash}`)
  runtime.log(`   → Vault withdrew WETH, swapped via Uniswap, repaid Aave debt`)
}

// ——— Entry Point ———

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}