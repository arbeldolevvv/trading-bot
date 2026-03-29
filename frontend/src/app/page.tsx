'use client'

import { useState, useEffect, useRef } from 'react'
import WatchlistTab from '@/components/Watchlist/WatchlistTab'
import AlertCard from '@/components/Dashboard/AlertCard'
import StockProfilePanel from '@/components/Dashboard/StockProfile'
import TradeDetailModal from '@/components/Dashboard/TradeDetailModal'
import BottomNav from '@/components/common/BottomNav'
import { requestNotificationPermission, showNotification } from '@/lib/notifications'
import type { Alert, TabId, PaperPortfolio, PaperTrade } from '@/types'

// Helper: full-screen tab panel (opacity switching, not unmount)
function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className={`absolute inset-0 overflow-y-auto transition-opacity duration-150 ${active ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
      {children}
    </div>
  )
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('watchlist')
  const [activeTicker, setActiveTicker] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [prices, setPrices] = useState<Record<string, { price: number; change: number | null }>>({})
  const [alertCount, setAlertCount] = useState(0)
  const prevAlertIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    fetchAlerts()
    fetchPrices()
    requestNotificationPermission()
    const id  = setInterval(fetchAlerts, 30_000)
    const id2 = setInterval(fetchPrices, 60_000)
    return () => { clearInterval(id); clearInterval(id2) }
  }, [])

  const fetchAlerts = async () => {
    const res = await fetch('/api/alerts')
    if (!res.ok) return
    const data: Alert[] = await res.json()
    setAlerts(data)
    setAlertCount(data.filter((a) => a.outcome === 'pending' || a.outcome === null).length)
    const newAlerts = data.filter((a) => !prevAlertIds.current.has(a.id))
    newAlerts.forEach((a) => {
      const label = a.category === 'technical' ? 'התראה טכנית' : 'דפוס מזוהה'
      showNotification(`${label}: ${a.ticker}`, a.patternName)
    })
    prevAlertIds.current = new Set(data.map((a) => a.id))
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
    fetchAlerts()
    fetchPrices()
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-app-bg">
      {/* Tab content area */}
      <div className="flex-1 overflow-hidden relative">
        <TabPanel active={activeTab === 'watchlist'}>
          <WatchlistTab
            activeTicker={activeTicker}
            onTickerSelect={handleTickerSelect}
            onScanRequest={handleScanRequest}
          />
        </TabPanel>

        <TabPanel active={activeTab === 'alerts'}>
          <AlertsTab alerts={alerts} prices={prices} />
        </TabPanel>

        <TabPanel active={activeTab === 'analysis'}>
          <StockProfilePanel
            ticker={activeTicker}
            onTickerChange={handleTickerSelect}
          />
        </TabPanel>

        <TabPanel active={activeTab === 'portfolio'}>
          <PortfolioTab onTickerClick={handleTickerSelect} />
        </TabPanel>
      </div>

      {/* Bottom navigation */}
      <BottomNav active={activeTab} onChange={setActiveTab} alertCount={alertCount} />
    </div>
  )
}

// ── Alerts Tab ─────────────────────────────────────────────────────────────────

type SortKey = 'newest' | 'rr' | 'success'
type PriceMap = Record<string, { price: number; change: number | null }>

function AlertsTab({ alerts, prices }: { alerts: Alert[]; prices: PriceMap }) {
  const [signalFilter, setSignalFilter]     = useState<'all' | 'gold' | 'standard'>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'technical' | 'pattern'>('all')
  const [outcomeFilter, setOutcomeFilter]   = useState<'pending' | 'all' | 'success' | 'fail'>('pending')
  const [tickerSearch, setTickerSearch]     = useState('')
  const [sortKey, setSortKey]               = useState<SortKey>('newest')

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

  const chipBase     = 'text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer'
  const chipActive   = 'bg-accent border-accent text-white'
  const chipInactive = 'border-app-border text-text-dim hover:text-text-primary hover:border-app-hover'

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Filter bar */}
      <div className="px-4 py-3 border-b border-app-border bg-app-surface space-y-2.5 shrink-0">
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

// ── Portfolio Tab ──────────────────────────────────────────────────────────────

function PortfolioTab({ onTickerClick }: { onTickerClick: (ticker: string) => void }) {
  const [portfolio, setPortfolio]       = useState<PaperPortfolio | null>(null)
  const [trades, setTrades]             = useState<PaperTrade[]>([])
  const [loading, setLoading]           = useState(true)
  const [showTrades, setShowTrades]     = useState(false)
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
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-app-surface rounded-xl animate-pulse" />)}
      </div>
    )
  }

  const p = portfolio!
  const isGain = p.totalGainPct >= 0

  const closedTrades = trades.filter((t) => t.action === 'sell')
  const wins         = closedTrades.filter((t) => (t.gainPct ?? 0) > 0)
  const losses       = closedTrades.filter((t) => (t.gainPct ?? 0) <= 0)
  const winRate      = closedTrades.length > 0 ? Math.round((wins.length / closedTrades.length) * 100) : null
  const avgGain      = wins.length > 0 ? wins.reduce((s, t) => s + (t.gainPct ?? 0), 0) / wins.length : null
  const avgLoss      = losses.length > 0 ? losses.reduce((s, t) => s + (t.gainPct ?? 0), 0) / losses.length : null

  const detailPos = detailTicker ? p.positions.find((pos) => pos.ticker === detailTicker) : null

  return (
    <div className="p-4 space-y-4" dir="rtl">

      {detailTicker && detailPos && (
        <TradeDetailModal
          ticker={detailTicker}
          currentPrice={detailPos.currentPrice}
          gainPct={detailPos.gainPct}
          onClose={() => setDetailTicker(null)}
          onOpenAnalysis={(t) => { setDetailTicker(null); onTickerClick(t) }}
        />
      )}

      {/* Summary */}
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

      {/* Win rate stats */}
      {closedTrades.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl border border-app-border bg-app-surface p-3 text-center">
            <div className="text-[10px] text-text-muted mb-1">אחוז הצלחה</div>
            <div className={`text-xl font-mono font-bold ${(winRate ?? 0) >= 50 ? 'text-gain' : 'text-loss'}`}>{winRate}%</div>
            <div className="text-[9px] text-text-muted">{wins.length}W / {losses.length}L</div>
          </div>
          <div className="rounded-xl border border-app-border bg-app-surface p-3 text-center">
            <div className="text-[10px] text-text-muted mb-1">עסקאות סגורות</div>
            <div className="text-xl font-mono font-bold text-text-primary">{closedTrades.length}</div>
            <div className="text-[9px] text-text-muted">Total trades</div>
          </div>
          <div className="rounded-xl border border-app-border bg-app-surface p-3 text-center">
            <div className="text-[10px] text-text-muted mb-1">רווח ממוצע</div>
            <div className="text-xl font-mono font-bold text-gain">{avgGain != null ? `+${avgGain.toFixed(1)}%` : '—'}</div>
            <div className="text-[9px] text-text-muted">Avg win</div>
          </div>
          <div className="rounded-xl border border-app-border bg-app-surface p-3 text-center">
            <div className="text-[10px] text-text-muted mb-1">הפסד ממוצע</div>
            <div className="text-xl font-mono font-bold text-loss">{avgLoss != null ? `${avgLoss.toFixed(1)}%` : '—'}</div>
            <div className="text-[9px] text-text-muted">Avg loss</div>
          </div>
        </div>
      )}

      {/* Positions */}
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
          <div className="grid grid-cols-7 gap-1 px-4 py-1.5 border-b border-app-border/50 text-[10px] text-text-muted font-medium">
            <span>מכשיר</span><span className="text-center">כמות</span><span className="text-center">כניסה</span>
            <span className="text-center">מחיר</span><span className="text-center">שינוי%</span>
            <span className="text-center">עצירה</span><span className="text-left">שווי</span>
          </div>
          {p.positions.map((pos) => {
            const isUp = pos.gainPct >= 0
            const stopRaised = pos.stopLoss != null && pos.stopLoss > pos.avgPrice
            return (
              <div key={pos.ticker}
                className="grid grid-cols-7 gap-1 px-4 py-3 border-b border-app-border/30 last:border-0 hover:bg-app-card/50 cursor-pointer transition-colors"
                onClick={() => setDetailTicker(pos.ticker)}>
                <div>
                  <div className="text-sm font-mono font-bold text-ticker">{pos.ticker}</div>
                  {pos.sector && <div className="text-[9px] text-text-muted">{pos.sector}</div>}
                </div>
                <div className="text-center font-mono text-xs text-text-primary self-center">{pos.quantity.toFixed(4)}</div>
                <div className="text-center font-mono text-xs text-text-dim self-center">${pos.avgPrice.toFixed(2)}</div>
                <div className="text-center font-mono text-xs text-text-primary self-center">${pos.currentPrice.toFixed(2)}</div>
                <div className={`text-center font-mono text-xs font-semibold self-center ${isUp ? 'text-gain' : 'text-loss'}`}>
                  {isUp ? '+' : ''}{pos.gainPct.toFixed(2)}%
                </div>
                <div className="text-center self-center">
                  {pos.stopLoss != null ? (
                    <>
                      <div className={`font-mono text-xs font-semibold ${stopRaised ? 'text-gain' : 'text-loss'}`}>
                        ${pos.stopLoss.toFixed(2)}
                      </div>
                      {stopRaised && <div className="text-[9px] text-gain">▲ trailing</div>}
                    </>
                  ) : <div className="text-text-muted text-xs">—</div>}
                </div>
                <div className="text-left font-mono text-xs text-text-primary self-center">${pos.marketValue.toFixed(2)}</div>
              </div>
            )
          })}
          <div className="grid grid-cols-7 gap-1 px-4 py-3 bg-app-card/40 border-t border-app-border">
            <div className="col-span-6 text-xs text-text-muted font-medium">מזומן USD</div>
            <div className="text-left font-mono text-xs font-semibold text-text-primary">
              ${p.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {/* Sector breakdown */}
      {(p.sectorBreakdown ?? []).length > 0 && (
        <div className="rounded-xl border border-app-border bg-app-surface overflow-hidden">
          <div className="px-4 py-2.5 text-xs font-semibold text-text-dim border-b border-app-border">פיזור סקטוריאלי</div>
          {(p.sectorBreakdown ?? []).map(({ sector, value, pct }) => (
            <div key={sector} className="px-4 py-2.5 flex items-center gap-3 border-b border-app-border/30 last:border-0">
              <div className="flex-1 text-xs text-text-primary">{sector}</div>
              <div className="w-28 h-1.5 bg-app-card rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${pct >= 30 ? 'bg-loss' : pct >= 20 ? 'bg-gold' : 'bg-gain'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className={`text-xs font-mono font-bold w-10 text-right ${pct >= 30 ? 'text-loss' : pct >= 20 ? 'text-gold' : 'text-gain'}`}>
                {pct}%
              </div>
              <div className="text-xs font-mono text-text-muted w-16 text-right">${value.toFixed(0)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trade history */}
      {trades.length > 0 && (
        <div className="rounded-xl border border-app-border bg-app-surface overflow-hidden">
          <button
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-text-dim hover:bg-app-card/50 transition-colors"
            onClick={() => setShowTrades(!showTrades)}
          >
            <span>היסטוריית עסקאות ({trades.length})</span>
            <span>{showTrades ? '▲' : '▼'}</span>
          </button>
          {showTrades && trades.map((t) => {
            const isBuy = t.action === 'buy'
            return (
              <div key={t.id} className="flex items-center justify-between px-4 py-2.5 border-t border-app-border/40">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isBuy ? 'bg-gain/20 text-gain' : 'bg-loss/20 text-loss'}`}>
                    {isBuy ? 'קנייה' : 'מכירה'}
                  </span>
                  <span className="text-xs font-mono font-bold text-ticker">{t.ticker}</span>
                  <span className="text-xs text-text-dim">×{Number(t.quantity).toFixed(4)} @ ${Number(t.pricePerShare).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  {t.gainPct != null && (
                    <span className={Number(t.gainPct) >= 0 ? 'text-gain' : 'text-loss'}>
                      {Number(t.gainPct) >= 0 ? '+' : ''}{Number(t.gainPct).toFixed(2)}%
                    </span>
                  )}
                  <span className="text-text-muted">{new Date(t.executedAt).toLocaleDateString('he-IL')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
