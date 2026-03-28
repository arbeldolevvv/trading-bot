export interface WatchlistStock {
  id: number
  ticker: string
  name: string | null
  addedAt: string
  hasActiveAlert?: boolean
  currentPrice?: number | null
  dailyChange?: number | null
}

export interface Alert {
  id: number
  ticker: string
  patternName: string
  signalType: 'gold' | 'standard'
  category: 'technical' | 'pattern'
  detectedAt: string
  priceAtAlert: number | null
  rsiValue: number | null
  ma150Value: number | null
  successRate: number | null
  occurrences: number | null
  outcome: 'success' | 'fail' | 'pending' | null
  actualGain: number | null
  resolvedAt: string | null
  highRisk: boolean | null
  volumeRatio: number | null
  stopLoss: number | null
  takeProfit: number | null
  takeProfit2: number | null
  rrRatio:          number | null
  rsVsSpy:          number | null
  earningsImminent: boolean | null
  earningsDate:     string | null
}

export interface ValidatedPattern {
  id: number
  ticker: string
  patternName: string
  totalAppearances: number | null
  totalSuccesses5pct: number | null
  totalSuccesses10pct: number | null
  successRate5pct: number | null
  successRate10pct: number | null
  avgGain: number | null
  avgMaxDrawdown: number | null
  isValidated: boolean
  signalType: 'gold' | 'standard' | null
  lastUpdated: string
  strengthScore?: number | null
}

export interface DashboardStats {
  totalStocks: number
  validatedPatterns: number
  activeAlerts: number
  avgSuccessRate: number | null
}

export interface StockProfile {
  ticker: string
  price: number
  error?: string
  rsi: { value: number | null; signal: string | null }
  ma150: { value: number | null; signal: string | null; position: 'above' | 'below' }
  ma200: { value: number | null; above: boolean } | null
  volume: { today: number; avg20d: number | null; ratio: number | null; passes: boolean }
  patterns_today: { name: string; occurrences: number; success_rate: number; avg_gain: number }[]
  top_patterns: {
    id: number; ticker: string; pattern_name: string
    total_appearances: number | null; success_rate_10pct: number | null
    avg_gain: number | null; signal_type: string | null; strength_score?: number | null
  }[]
}

export type TabId = 'alerts' | 'patterns' | 'history' | 'analysis' | 'portfolio'

export interface PaperPosition {
  ticker:          string
  quantity:        number
  avgPrice:        number
  currentPrice:    number
  stopLoss:        number | null
  takeProfit:      number | null
  gainPct:         number
  marketValue:     number
  openedAt:        string
  highestPrice:    number | null
  trailingStopPct: number | null
  sector:          string | null
  alertId:         number | null
}

export interface PaperPortfolio {
  cash:            number
  positions:       PaperPosition[]
  totalValue:      number
  totalGainPct:    number
  totalGainUsd:    number
  sectorBreakdown: { sector: string; value: number; pct: number }[]
}

export interface PaperTrade {
  id:            number
  ticker:        string
  action:        'buy' | 'sell'
  quantity:      number
  pricePerShare: number
  totalCost:     number
  stopLoss:      number | null
  takeProfit:    number | null
  gainPct:       number | null
  executedAt:    string
  notes:         string | null
}
