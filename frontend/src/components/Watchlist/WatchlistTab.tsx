'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AddStockModal from './AddStockModal'
import SettingsPanel, { loadSettings, type ScanSettings } from '@/components/common/SettingsPanel'
import ThemeToggle from '@/components/common/ThemeToggle'
import { backendApi } from '@/lib/api'
import type { WatchlistStock } from '@/types'

interface Props {
  activeTicker: string | null
  onTickerSelect: (ticker: string) => void
  onScanRequest: () => void
}

// ── Countdown hook ─────────────────────────────────────────────────────────────
function useCountdown(targetIso: string | null) {
  const [countdown, setCountdown] = useState('—:——:——')
  useEffect(() => {
    if (!targetIso) return
    const target = new Date(targetIso)
    const tick = () => {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) { setCountdown('עכשיו'); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)
      setCountdown(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [targetIso])
  return countdown
}

// ── IBKR status dot ────────────────────────────────────────────────────────────
type IbkrStatus = 'unknown' | 'connected' | 'disconnected'
function IbkrDot({ status }: { status: IbkrStatus }) {
  const color = status === 'connected' ? 'bg-gain' : status === 'disconnected' ? 'bg-loss' : 'bg-text-muted'
  const label = status === 'connected' ? 'IBKR מחובר' : status === 'disconnected' ? 'IBKR מנותק' : '...'
  return (
    <div className="flex items-center gap-1" title={label}>
      <span className={`w-2 h-2 rounded-full ${color} ${status === 'connected' ? 'animate-pulse' : ''}`} />
      <span className="text-[10px] text-text-dim">{label}</span>
    </div>
  )
}

// ── Scan progress bar ──────────────────────────────────────────────────────────
function ScanProgress({ current, total, ticker }: { current: number; total: number; ticker: string | null }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="px-4 py-2 border-b border-app-border bg-app-bg/50" dir="rtl">
      <div className="flex justify-between text-xs text-text-dim mb-1">
        <span className="font-mono">{pct}%</span>
        <span>{ticker ?? '...'} ({current}/{total})</span>
      </div>
      <div className="h-1 bg-app-border rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function WatchlistTab({ activeTicker, onTickerSelect, onScanRequest }: Props) {
  const [stocks, setStocks] = useState<WatchlistStock[]>([])
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ibkrStatus, setIbkrStatus] = useState<IbkrStatus>('unknown')
  const [scanStatus, setScanStatus] = useState<string>('idle')
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, ticker: null as string | null })
  const [nextScanIso, setNextScanIso] = useState<string | null>(null)
  const scanSettings = useRef<ScanSettings>(loadSettings())
  const countdown = useCountdown(nextScanIso)

  const fetchStocks = useCallback(async () => {
    const res = await fetch('/api/watchlist')
    if (res.ok) setStocks(await res.json())
  }, [])

  const fetchNextScan = useCallback(async () => {
    try {
      const res = await fetch('/api/backend/scan/next')
      if (res.ok) {
        const data = await res.json()
        setNextScanIso(data.next_run ?? null)
      }
    } catch { /* backend might not be up */ }
  }, [])

  const checkIbkr = useCallback(async () => {
    try {
      const data = await backendApi.ibkrStatus()
      setIbkrStatus(data.connected ? 'connected' : 'disconnected')
    } catch {
      setIbkrStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    if (scanStatus !== 'running') return
    const id = setInterval(async () => {
      try {
        const data = await backendApi.scanStatus()
        setScanStatus(data.status)
        setScanProgress({ current: data.progress ?? 0, total: data.total ?? 0, ticker: data.current_ticker ?? null })
        if (data.status === 'done') { onScanRequest(); fetchStocks() }
      } catch { /* ignore */ }
    }, 2_000)
    return () => clearInterval(id)
  }, [scanStatus, onScanRequest, fetchStocks])

  useEffect(() => {
    fetchStocks()
    checkIbkr()
    fetchNextScan()
    const id = setInterval(checkIbkr, 10_000)
    const id2 = setInterval(fetchNextScan, 60_000)
    return () => { clearInterval(id); clearInterval(id2) }
  }, [fetchStocks, checkIbkr, fetchNextScan])

  const handleAdd = async (ticker: string, name: string) => {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, name }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'שגיאה')
    await fetchStocks()
    setModalOpen(false)
  }

  const handleRemove = async (ticker: string) => {
    await fetch(`/api/watchlist/${ticker}`, { method: 'DELETE' })
    await fetchStocks()
  }

  const handleScan = async () => {
    if (scanStatus === 'running') return
    try {
      const s = scanSettings.current
      await fetch('/api/backend/scan/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volume_min_ratio: s.volumeMinRatio,
          min_success_rate: s.minSuccessRate,
          rsi_oversold_level: s.rsiOversoldLevel,
        }),
      })
      setScanStatus('running')
      setScanProgress({ current: 0, total: 0, ticker: null })
    } catch {
      alert('לא ניתן להתחיל סריקה — ודא שהשרת הפייתון פועל')
    }
  }

  const handleTestEmail = async () => {
    try {
      const res = await fetch('/api/backend/scan/send-test-email', { method: 'POST' })
      const data = await res.json()
      if (data.sent) alert(`✅ אימייל נשלח! כולל ${data.alerts_included} התראות`)
      else alert('❌ שליחת אימייל נכשלה — בדוק RESEND_API_KEY ו-ALERT_EMAIL_TO בקובץ .env')
    } catch { alert('שגיאת רשת') }
  }

  const filtered = stocks.filter((s) =>
    s.ticker.toLowerCase().includes(search.toLowerCase()) ||
    (s.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const isScanning = scanStatus === 'running'

  return (
    <div className="h-full flex flex-col bg-app-bg" dir="rtl">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-app-border bg-app-surface space-y-3 shrink-0">
        {/* Logo row */}
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-ticker tracking-wide">
              Pattern<span className="text-accent">Scanner</span>
            </span>
          </div>
        </div>

        {/* Scan controls row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleScan}
              disabled={isScanning}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-medium transition-colors
                ${isScanning
                  ? 'bg-accent/20 text-accent cursor-not-allowed'
                  : 'bg-app-border hover:bg-app-hover text-text-primary'}`}
            >
              <span>{isScanning ? '⟳' : '▶'}</span>
              <span>{isScanning ? 'סורק...' : 'הרץ סריקה'}</span>
            </button>
            <button
              onClick={handleTestEmail}
              title="שלח אימייל ניסיון"
              className="text-xs px-2.5 py-2 rounded-xl bg-app-border hover:bg-app-hover text-text-muted hover:text-text-primary transition-colors"
            >✉</button>
          </div>
          <div className="text-left leading-tight">
            <div className="text-[10px] text-text-muted">סריקה הבאה</div>
            <div className="text-xs font-mono text-accent">{countdown}</div>
          </div>
        </div>

        {/* IBKR status */}
        <IbkrDot status={ibkrStatus} />
      </div>

      {/* ── Scan progress ── */}
      {isScanning && (
        <ScanProgress current={scanProgress.current} total={scanProgress.total} ticker={scanProgress.ticker} />
      )}

      {/* ── Search + count ── */}
      <div className="px-4 py-3 border-b border-app-border bg-app-surface shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold text-text-dim tracking-widest">WATCHLIST</span>
          <span className="text-[10px] text-text-muted">{stocks.length} מניות</span>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש טיקר..."
          className="w-full bg-app-input border border-app-border rounded-xl px-4 py-2.5 text-sm
                     text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* ── Stock list ── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            {search ? `לא נמצאו תוצאות עבור "${search}"` : 'לחץ "+ הוסף מניה" כדי להתחיל'}
          </div>
        ) : (
          filtered.map((stock) => {
            const isActive = stock.ticker === activeTicker
            const isUp = (stock.dailyChange ?? 0) >= 0
            return (
              <div
                key={stock.ticker}
                onClick={() => onTickerSelect(stock.ticker)}
                className={`flex items-center justify-between px-4 py-3.5 border-b border-app-border/40
                            cursor-pointer transition-colors hover:bg-app-card/60
                            ${isActive ? 'bg-app-card' : ''}
                            ${stock.hasActiveAlert ? 'border-r-2 border-r-gold' : ''}`}
              >
                {/* Right: ticker + name */}
                <div className="min-w-0">
                  <div className="font-mono font-bold text-ticker text-base leading-tight">{stock.ticker}</div>
                  {stock.name && (
                    <div className="text-xs text-text-muted truncate max-w-[160px]">{stock.name}</div>
                  )}
                </div>

                {/* Left: price + change + remove */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-left">
                    {stock.currentPrice != null ? (
                      <div className="font-mono text-sm font-semibold text-text-primary">
                        ${stock.currentPrice.toFixed(2)}
                      </div>
                    ) : <div className="font-mono text-sm text-text-muted">—</div>}
                    {stock.dailyChange != null && (
                      <div className={`text-xs font-mono font-semibold text-left ${isUp ? 'text-gain' : 'text-loss'}`}>
                        {isUp ? '+' : ''}{stock.dailyChange.toFixed(2)}%
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(stock.ticker) }}
                    className="text-text-muted hover:text-loss text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="הסר"
                  >✕</button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Footer: Add + Settings ── */}
      <div className="shrink-0 border-t border-app-border bg-app-surface">
        <button
          onClick={() => setModalOpen(true)}
          className="w-full py-3 text-sm font-semibold text-accent hover:bg-app-card/50 transition-colors border-b border-app-border"
        >
          + הוסף מניה
        </button>
        {settingsOpen ? (
          <SettingsPanel onClose={() => setSettingsOpen(false)} onSave={(s) => { scanSettings.current = s }} />
        ) : (
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <span>⚙</span>
            <span>הגדרות סריקה</span>
          </button>
        )}
      </div>

      {modalOpen && <AddStockModal onAdd={handleAdd} onClose={() => setModalOpen(false)} />}
    </div>
  )
}
