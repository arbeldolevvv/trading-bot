'use client'

import { useState, useEffect, useRef } from 'react'
import WatchlistSidebar from '@/components/Watchlist/WatchlistSidebar'
import StatsRow from '@/components/Dashboard/StatsRow'
import AlertCard from '@/components/Dashboard/AlertCard'
import PatternTable from '@/components/Dashboard/PatternTable'
import StockProfilePanel from '@/components/Dashboard/StockProfile'
import TradeDetailModal from '@/components/Dashboard/TradeDetailModal'
import Tabs from '@/components/common/Tabs'
import ThemeToggle from '@/components/common/ThemeToggle'
import { requestNotificationPermission, showNotification } from '@/lib/notifications'
import type { Alert, ValidatedPattern, DashboardStats, TabId, PaperPortfolio, PaperTrade } from '@/types'

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('alerts')
  const [activeTicker, setActiveTicker] = useState<string | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [patterns, setPatterns] = useState<ValidatedPattern[]>([])
  const [prices, setPrices] = useState<Record<string, { price: number; change: number | null }>>({})
  const [statsLoading, setStatsLoading] = useState(true)
  const [patternsLoading, setPatternsLoading] = useState(false)
  const prevAlertIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    fetchStats()
    fetchAlerts()
    fetchPatterns()
    fetchPrices()
    requestNotificationPermission()

    const id  = setInterval(fetchAlerts, 30_000)
    const id2 = setInterval(fetchPrices, 60_000)
    return () => { clearInterval(id); clearInterval(id2) }
  }, [])

  const fetchStats = async () => {
    setStatsLoading(true)
    const res = await fetch('/api/stats')
    if (res.ok) setStats(await res.json())
    setStatsLoading(false)
  }

  const fetchAlerts = async () => {
    const res = await fetch('/api/alerts')
    if (!res.ok) return
    const data: Alert[] = await res.json()
    setAlerts(data)

    const newAlerts = data.filter((a) => !prevAlertIds.current.has(a.id))
    newAlerts.forEach((a) => {
      const label = a.category === 'technical' ? 'התראה טכנית' : 'דפוס מזוהה'
      showNotification(`${label}: ${a.ticker}`, a.patternName)
    })
    prevAlertIds.current = new Set(data.map((a) => a.id))
  }

  const fetchPatterns = async () => {
    setPatternsLoading(true)
    const res = await fetch('/api/patterns')
    if (res.ok) setPatterns(await res.json())
    setPatternsLoading(false)
  }

  const fetchPrices = async () => {
    const res = await fetch('/api/prices')
    if (res.ok) setPrices(await res.json())
  }

  const handleTickerSelect = (ticker: string) => {
    setActiveTicker(ticker)
    setActiveTab('analysis')
  }

  const handleScanRequest = () => {
    fetchStats()
    fetchAlerts()
    fetchPatterns()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg">
      <WatchlistSidebar
        activeTicker={activeTicker}
        onTickerSelect={handleTickerSelect}
        onScanRequest={handleScanRequest}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 pr-2">
          <div className="flex-1">
            <StatsRow stats={stats} loading={statsLoading} />
          </div>
          <ThemeToggle />
        </div>

        <Tabs active={activeTab} onChange={setActiveTab} alertCount={stats?.activeAlerts ?? 0} />

        <div className="flex-1 overflow-hidden relative">
          <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-150 ${activeTab === 'alerts' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <AlertsTab alerts={alerts} prices={prices} />
          </div>
          <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-150 ${activeTab === 'analysis' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <StockProfilePanel ticker={activeTicker} />
          </div>
          <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-150 ${activeTab === 'patterns' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <PatternTable patterns={patterns} loading={patternsLoading} />
          </div>
          <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-150 ${activeTab === 'history' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <HistoryTab />
          </div>
          <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-150 ${activeTab === 'portfolio' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <PortfolioTab onTickerClick={handleTickerSelect} />
          </div>
        </div>
      </main>
    </div>
  )
}

type SortKey = 'newest' | 'rr' | 'success'

type PriceMap = Record<string, { price: number; change: number | null }>

function AlertsTab({ alerts, prices }: { alerts: Alert[]; prices: PriceMap }) {
  const [signalFilter, setSignalFilter] = useState<'all' | 'gold' | 'standard'>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'technical' | 'pattern'>('all')
  const [outcomeFilter, setOutcomeFilter] = useState<'pending' | 'all' | 'success' | 'fail'>('pending')
  const [tickerSearch, setTickerSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('newest')

  const filtered = alerts
    .filter((a) => signalFilter === 'all' || a.signalType === signalFilter)
    .filter((a) => categoryFilter === 'all' || a.category === categoryFilter)
    .filter((a) => {
      if (outcomeFilter === 'all') return true
      if (outcomeFilter === 'pending') return a.outcome === 'pending' || a.outcome === null
      return a.outcome === outcomeFilter
    })
    .filter((a) => !tickerSearch || a.ticker.toLowerCase().includes(tickerSearch.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'rr') return (b.rrRatio ?? 0) - (a.rrRatio ?? 0)
      if (sortKey === 'success') return (b.successRate ?? 0) - (a.successRate ?? 0)
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    })

  const chipBase = 'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer'
  const chipActive = 'bg-accent border-accent text-white'
  const chipInactive = 'border-app-border text-text-dim hover:text-text-primary hover:border-app-hover'

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* ── Filter bar ── */}
      <div className="px-4 py-3 border-b border-app-border bg-app-surface space-y-2.5 shrink-0">
        {/* Row 1: signal type + category + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'gold', 'standard'] as const).map((v) => (
            <button key={v} onClick={() => setSignalFilter(v)}
              className={`${chipBase} ${signalFilter === v ? chipActive : chipInactive}`}>
              {v === 'all' ? 'הכל' : v === 'gold' ? '⭐ Gold' : 'Standard'}
            </button>
          ))}
          <div className="w-px h-4 bg-app-border mx-1" />
          {(['all', 'technical', 'pattern'] as const).map((v) => (
            <button key={v} onClick={() => setCategoryFilter(v)}
              className={`${chipBase} ${categoryFilter === v ? chipActive : chipInactive}`}>
              {v === 'all' ? 'כל הסוגים' : v === 'technical' ? 'טכני' : 'דפוס'}
            </button>
          ))}
          <div className="flex-1" />
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-xs bg-app-input border border-app-border rounded-lg px-2 py-1 text-text-dim focus:outline-none focus:border-accent">
            <option value="newest">חדש ביותר</option>
            <option value="rr">יחס R/R</option>
            <option value="success">הצלחה %</option>
          </select>
        </div>
        {/* Row 2: outcome + ticker search */}
        <div className="flex items-center gap-2">
          {(['pending', 'all', 'success', 'fail'] as const).map((v) => (
            <button key={v} onClick={() => setOutcomeFilter(v)}
              className={`${chipBase} ${outcomeFilter === v ? chipActive : chipInactive}`}>
              {v === 'pending' ? '⏳ ממתין' : v === 'all' ? 'כולם' : v === 'success' ? '✓ הצלחה' : '✗ נכשל'}
            </button>
          ))}
          <div className="flex-1" />
          <input value={tickerSearch} onChange={(e) => setTickerSearch(e.target.value)}
            placeholder="טיקר..."
            className="w-24 text-xs bg-app-input border border-app-border rounded-lg px-2 py-1 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
        </div>
      </div>

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <div className="text-4xl mb-3">🔔</div>
          <div className="text-text-primary font-semibold mb-1">אין התראות תואמות</div>
          <div className="text-text-dim text-sm">נסה לשנות את הפילטרים</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 xl:grid-cols-2 gap-3 content-start">
          {filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} currentPrice={prices[alert.ticker] ?? null} />
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryTab() {
  const [resolved, setResolved] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/alerts?outcome=all')
      .then((r) => r.json())
      .then((data: Alert[]) => {
        setResolved(data.filter((a) => a.outcome === 'success' || a.outcome === 'fail'))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 bg-app-surface rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (resolved.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" dir="rtl">
        <div className="text-5xl mb-4">📈</div>
        <div className="text-text-primary font-semibold text-lg mb-2">היסטוריית התראות</div>
        <div className="text-text-dim text-sm max-w-sm">
          התראות יסומנו כהצלחה/כישלון אוטומטית 14 ימים לאחר הגילוי. כרגע אין עדיין התראות מאומתות.
        </div>
      </div>
    )
  }

  const wins = resolved.filter((a) => a.outcome === 'success')
  const fails = resolved.filter((a) => a.outcome === 'fail')
  const winRate = Math.round((wins.length / resolved.length) * 100)
  const avgGainOnWins = wins.length > 0
    ? (wins.reduce((s, a) => s + (a.actualGain ?? 0), 0) / wins.length).toFixed(1)
    : null

  // Per-pattern stats
  const byPattern: Record<string, { wins: number; total: number; gains: number[] }> = {}
  for (const a of resolved) {
    if (!byPattern[a.patternName]) byPattern[a.patternName] = { wins: 0, total: 0, gains: [] }
    byPattern[a.patternName].total++
    if (a.outcome === 'success') {
      byPattern[a.patternName].wins++
      if (a.actualGain != null) byPattern[a.patternName].gains.push(a.actualGain)
    }
  }
  const patternStats = Object.entries(byPattern)
    .map(([name, s]) => ({
      name, total: s.total, wins: s.wins,
      winRate: Math.round((s.wins / s.total) * 100),
      avgGain: s.gains.length ? (s.gains.reduce((a, b) => a + b, 0) / s.gains.length) : null,
    }))
    .sort((a, b) => b.winRate - a.winRate)

  return (
    <div className="p-4 space-y-4 overflow-y-auto" dir="rtl">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-app-surface border border-app-border rounded-xl p-3 text-center">
          <div className="text-2xl font-mono font-bold text-text-primary">{resolved.length}</div>
          <div className="text-xs text-text-muted mt-0.5">התראות מאומתות</div>
        </div>
        <div className="bg-app-surface border border-gain/40 rounded-xl p-3 text-center">
          <div className="text-2xl font-mono font-bold text-gain">{winRate}%</div>
          <div className="text-xs text-text-muted mt-0.5">שיעור הצלחה</div>
        </div>
        <div className="bg-app-surface border border-app-border rounded-xl p-3 text-center">
          <div className="text-2xl font-mono font-bold text-gain">
            {avgGainOnWins ? `+${avgGainOnWins}%` : '—'}
          </div>
          <div className="text-xs text-text-muted mt-0.5">רווח ממוצע בהצלחות</div>
        </div>
      </div>

      {/* Per-pattern breakdown */}
      <div className="bg-app-surface border border-app-border rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-app-border text-xs font-semibold text-text-dim">
          ביצועים לפי דפוס
        </div>
        {patternStats.map((p) => (
          <div key={p.name} className="flex items-center justify-between px-3 py-2.5 border-b border-app-border/40 last:border-0">
            <span className="text-sm text-text-primary">{p.name}</span>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-text-muted">{p.total} התראות</span>
              <span className={`font-bold ${p.winRate >= 60 ? 'text-gain' : p.winRate >= 40 ? 'text-amber-400' : 'text-loss'}`}>
                {p.winRate}% הצלחה
              </span>
              {p.avgGain != null && (
                <span className="text-gain">+{p.avgGain.toFixed(1)}%</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Alert list */}
      <div className="bg-app-surface border border-app-border rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-app-border text-xs font-semibold text-text-dim">
          כל ההתראות המאומתות
        </div>
        {resolved.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-3 py-2.5 border-b border-app-border/40 last:border-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold ${a.outcome === 'success' ? 'text-gain' : 'text-loss'}`}>
                {a.outcome === 'success' ? '✓' : '✗'}
              </span>
              <span className="text-xs font-mono font-bold text-ticker">{a.ticker}</span>
              <span className="text-xs text-text-dim">{a.patternName}</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              {a.actualGain != null && (
                <span className={a.actualGain >= 0 ? 'text-gain' : 'text-loss'}>
                  {a.actualGain >= 0 ? '+' : ''}{a.actualGain.toFixed(1)}%
                </span>
              )}
              <span className="text-text-muted">
                {new Date(a.detectedAt).toLocaleDateString('he-IL')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Portfolio Tab ─────────────────────────────────────────────────────────────

function PortfolioTab({ onTickerClick }: { onTickerClick: (ticker: string) => void }) {
  const [portfolio, setPortfolio]   = useState<PaperPortfolio | null>(null)
  const [trades, setTrades]         = useState<PaperTrade[]>([])
  const [loading, setLoading]       = useState(true)
  const [showTrades, setShowTrades] = useState(false)
  const [detailTicker, setDetailTicker] = useState<string | null>(null)

  const load = () => {
    Promise.all([
      fetch('/api/paper-portfolio').then((r) => r.json()),
      fetch('/api/paper-trades').then((r) => r.json()),
    ]).then(([p, t]) => {
      setPortfolio(p)
      setTrades(t)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-app-surface rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  const p = portfolio!
  const isGain = p.totalGainPct >= 0

  // ── Win rate analytics ──────────────────────────────────────────────────
  const closedTrades = trades.filter((t) => t.action === 'sell')
  const wins         = closedTrades.filter((t) => (t.gainPct ?? 0) > 0)
  const losses       = closedTrades.filter((t) => (t.gainPct ?? 0) <= 0)
  const winRate      = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : null
  const avgGain      = wins.length > 0
    ? wins.reduce((s, t) => s + (t.gainPct ?? 0), 0) / wins.length : null
  const avgLoss      = losses.length > 0
    ? losses.reduce((s, t) => s + (t.gainPct ?? 0), 0) / losses.length : null

  const detailPos = detailTicker ? p.positions.find((pos) => pos.ticker === detailTicker) : null

  return (
    <div className="p-4 space-y-4" dir="rtl">

      {/* ── Trade detail modal ── */}
      {detailTicker && detailPos && (
        <TradeDetailModal
          ticker={detailTicker}
          currentPrice={detailPos.currentPrice}
          gainPct={detailPos.gainPct}
          onClose={() => setDetailTicker(null)}
          onOpenAnalysis={(t) => { setDetailTicker(null); onTickerClick(t) }}
        />
      )}

      {/* ── Summary header ── */}
      <div className="rounded-xl border border-app-border bg-app-surface p-4 text-center">
        <div className="text-xs text-text-muted mb-1">שווי תיק כולל</div>
        <div className="text-3xl font-mono font-bold text-text-primary mb-1">
          ${p.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className={`text-lg font-mono font-semibold ${isGain ? 'text-gain' : 'text-loss'}`}>
          {isGain ? '+' : ''}{p.totalGainPct.toFixed(2)}%
          <span className="text-sm font-normal text-text-muted mr-2">
            ({isGain ? '+' : ''}${p.totalGainUsd.toFixed(2)})
          </span>
        </div>
        <div className="text-xs text-text-muted mt-1">מתוך $10,000 הון התחלתי</div>
      </div>

      {/* ── Win rate stats ── */}
      {closedTrades.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl border border-app-border bg-app-surface p-3 text-center">
            <div className="text-[10px] text-text-muted mb-1">אחוז הצלחה</div>
            <div className={`text-xl font-mono font-bold ${(winRate ?? 0) >= 50 ? 'text-gain' : 'text-loss'}`}>
              {winRate}%
            </div>
            <div className="text-[9px] text-text-muted">{wins.length}W / {losses.length}L</div>
          </div>
          <div className="rounded-xl border border-app-border bg-app-surface p-3 text-center">
            <div className="text-[10px] text-text-muted mb-1">עסקאות סגורות</div>
            <div className="text-xl font-mono font-bold text-text-primary">{closedTrades.length}</div>
            <div className="text-[9px] text-text-muted">Total trades</div>
          </div>
          <div className="rounded-xl border border-app-border bg-app-surface p-3 text-center">
            <div className="text-[10px] text-text-muted mb-1">רווח ממוצע</div>
            <div className="text-xl font-mono font-bold text-gain">
              {avgGain != null ? `+${avgGain.toFixed(1)}%` : '—'}
            </div>
            <div className="text-[9px] text-text-muted">Avg win</div>
          </div>
          <div className="rounded-xl border border-app-border bg-app-surface p-3 text-center">
            <div className="text-[10px] text-text-muted mb-1">הפסד ממוצע</div>
            <div className="text-xl font-mono font-bold text-loss">
              {avgLoss != null ? `${avgLoss.toFixed(1)}%` : '—'}
            </div>
            <div className="text-[9px] text-text-muted">Avg loss</div>
          </div>
        </div>
      )}

      {/* ── Positions table ── */}
      {p.positions.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-app-surface p-8 text-center text-text-muted text-sm">
          אין פוזיציות פתוחות — הסורק יקנה אוטומטית בסיגנל הבא
        </div>
      ) : (
        <div className="rounded-xl border border-app-border bg-app-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-app-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-dim">פוזיציות פתוחות</span>
            <span className="text-xs text-text-muted">{p.positions.length} מניות</span>
          </div>

          {/* Header row — 7 columns (added trailing stop) */}
          <div className="grid grid-cols-7 gap-1 px-4 py-1.5 border-b border-app-border/50 text-[10px] text-text-muted font-medium">
            <span>מכשיר</span>
            <span className="text-center">כמות</span>
            <span className="text-center">מחיר כניסה</span>
            <span className="text-center">מחיר אחרון</span>
            <span className="text-center">שינוי%</span>
            <span className="text-center">עצירה</span>
            <span className="text-left">שווי שוק</span>
          </div>

          {p.positions.map((pos) => {
            const isUp      = pos.gainPct >= 0
            const stopRaised = pos.stopLoss != null && pos.stopLoss > pos.avgPrice
            return (
              <div
                key={pos.ticker}
                className="grid grid-cols-7 gap-1 px-4 py-3 border-b border-app-border/30 last:border-0 hover:bg-app-card/50 cursor-pointer transition-colors"
                onClick={() => setDetailTicker(pos.ticker)}
              >
                <div>
                  <div className="text-sm font-mono font-bold text-ticker">{pos.ticker}</div>
                  {pos.sector && (
                    <div className="text-[9px] text-text-muted">{pos.sector}</div>
                  )}
                </div>
                <div className="text-center font-mono text-xs text-text-primary self-center">
                  {pos.quantity.toFixed(4)}
                </div>
                <div className="text-center font-mono text-xs text-text-dim self-center">
                  ${pos.avgPrice.toFixed(2)}
                </div>
                <div className="text-center font-mono text-xs text-text-primary self-center">
                  ${pos.currentPrice.toFixed(2)}
                </div>
                <div className={`text-center font-mono text-xs font-semibold self-center ${isUp ? 'text-gain' : 'text-loss'}`}>
                  {isUp ? '+' : ''}{pos.gainPct.toFixed(2)}%
                </div>
                {/* Trailing stop — green if ratcheted above entry (profit protection) */}
                <div className="text-center self-center">
                  {pos.stopLoss != null ? (
                    <>
                      <div className={`font-mono text-xs font-semibold ${stopRaised ? 'text-gain' : 'text-loss'}`}>
                        ${pos.stopLoss.toFixed(2)}
                      </div>
                      {stopRaised && (
                        <div className="text-[9px] text-gain">▲ trailing</div>
                      )}
                    </>
                  ) : <div className="text-text-muted text-xs">—</div>}
                </div>
                <div className="text-left font-mono text-xs text-text-primary self-center">
                  ${pos.marketValue.toFixed(2)}
                </div>
              </div>
            )
          })}

          {/* Cash row */}
          <div className="grid grid-cols-7 gap-1 px-4 py-3 bg-app-card/40 border-t border-app-border">
            <div className="col-span-6 text-xs text-text-muted font-medium">מזומן USD</div>
            <div className="text-left font-mono text-xs font-semibold text-text-primary">
              ${p.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {/* ── Sector Breakdown ── */}
      {(p.sectorBreakdown ?? []).length > 0 && (
        <div className="rounded-xl border border-app-border bg-app-surface overflow-hidden">
          <div className="px-4 py-2.5 text-xs font-semibold text-text-dim border-b border-app-border">
            פיזור סקטוריאלי
          </div>
          {(p.sectorBreakdown ?? []).map(({ sector, value, pct }) => (
            <div key={sector} className="px-4 py-2.5 flex items-center gap-3 border-b border-app-border/30 last:border-0">
              <div className="flex-1 text-xs text-text-primary">{sector}</div>
              <div className="w-28 h-1.5 bg-app-card rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 30 ? 'bg-loss' : pct >= 20 ? 'bg-gold' : 'bg-gain'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className={`text-xs font-mono font-bold w-10 text-right ${pct >= 30 ? 'text-loss' : pct >= 20 ? 'text-gold' : 'text-gain'}`}>
                {pct}%
              </div>
              <div className="text-xs font-mono text-text-muted w-20 text-right">
                ${value.toFixed(0)}
              </div>
              {pct >= 30 && (
                <div className="text-[10px] font-semibold text-loss">⚠ חשיפת יתר</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Trade history ── */}
      {trades.length > 0 && (
        <div className="rounded-xl border border-app-border bg-app-surface overflow-hidden">
          <button
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-text-dim hover:bg-app-card/40 transition-colors"
            onClick={() => setShowTrades((v) => !v)}
          >
            <span>היסטוריית עסקאות</span>
            <span className="flex items-center gap-2">
              <span className="text-text-muted font-normal">{trades.length} פעולות</span>
              <span>{showTrades ? '▲' : '▼'}</span>
            </span>
          </button>

          {showTrades && (
            <div className="border-t border-app-border">
              {trades.map((t) => {
                const isBuy     = t.action === 'buy'
                const gainPct   = t.gainPct ?? null
                const isGainPos = gainPct !== null ? gainPct >= 0 : null
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2.5 border-b border-app-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'}`}>
                        {isBuy ? 'קנייה' : 'מכירה'}
                      </span>
                      <span className="text-xs font-mono font-bold text-ticker">{t.ticker}</span>
                      <span className="text-xs font-mono text-text-dim">
                        ×{t.quantity.toFixed(2)} @ ${t.pricePerShare.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {gainPct !== null && (
                        <span className={`text-xs font-mono font-semibold ${isGainPos ? 'text-gain' : 'text-loss'}`}>
                          {isGainPos ? '+' : ''}{gainPct.toFixed(2)}%
                        </span>
                      )}
                      <span className="text-[10px] text-text-muted">
                        {new Date(t.executedAt).toLocaleDateString('he-IL')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
