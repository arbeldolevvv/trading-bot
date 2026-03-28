'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import StockItem from './StockItem'
import AddStockModal from './AddStockModal'
import SettingsPanel, { loadSettings, type ScanSettings } from '@/components/common/SettingsPanel'
import { backendApi } from '@/lib/api'
import type { WatchlistStock } from '@/types'

interface Props {
  activeTicker: string | null
  onTickerSelect: (ticker: string) => void
  onScanRequest: () => void
}

// ── Countdown to a target ISO datetime ───────────────────────────────────────
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

// ── IBKR status dot ──────────────────────────────────────────────────────────
type IbkrStatus = 'unknown' | 'connected' | 'disconnected'

function IbkrDot({ status }: { status: IbkrStatus }) {
  const color =
    status === 'connected'
      ? 'bg-gain'
      : status === 'disconnected'
      ? 'bg-loss'
      : 'bg-text-muted'
  const label =
    status === 'connected' ? 'IBKR מחובר' : status === 'disconnected' ? 'IBKR מנותק' : '...'
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className="text-[10px] text-text-dim">{label}</span>
      <span className={`w-2 h-2 rounded-full ${color} ${status === 'connected' ? 'animate-pulse' : ''}`} />
    </div>
  )
}

// ── Scan progress bar ─────────────────────────────────────────────────────────
function ScanProgress({ current, total, ticker }: { current: number; total: number; ticker: string | null }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="px-4 py-2 border-b border-app-border bg-app-bg/50" dir="rtl">
      <div className="flex justify-between text-xs text-text-dim mb-1">
        <span className="font-mono">{pct}%</span>
        <span>{ticker ?? '...'} ({current}/{total})</span>
      </div>
      <div className="h-1 bg-app-border rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WatchlistSidebar({ activeTicker, onTickerSelect, onScanRequest }: Props) {
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

  // ── Fetch watchlist ──
  const fetchStocks = useCallback(async () => {
    const res = await fetch('/api/watchlist')
    if (res.ok) setStocks(await res.json())
  }, [])

  // ── Fetch next scan time ──
  const fetchNextScan = useCallback(async () => {
    try {
      const res = await fetch('/api/backend/scan/next')
      if (res.ok) {
        const data = await res.json()
        setNextScanIso(data.next_run ?? null)
      }
    } catch { /* backend might not be up */ }
  }, [])

  // ── Poll IBKR status every 10s ──
  const checkIbkr = useCallback(async () => {
    try {
      const data = await backendApi.ibkrStatus()
      setIbkrStatus(data.connected ? 'connected' : 'disconnected')
    } catch {
      setIbkrStatus('disconnected')
    }
  }, [])

  // ── Poll scan progress when running ──
  useEffect(() => {
    if (scanStatus !== 'running') return
    const id = setInterval(async () => {
      try {
        const data = await backendApi.scanStatus()
        setScanStatus(data.status)
        setScanProgress({
          current: data.progress ?? 0,
          total: data.total ?? 0,
          ticker: data.current_ticker ?? null,
        })
        if (data.status === 'done') {
          onScanRequest()
          fetchStocks()
        }
      } catch { /* backend might be briefly busy */ }
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

  // ── Handlers ──
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
      alert('לא ניתן להתחיל סריקה — ודא שהשרת הפייתון פועל (port 8000)')
    }
  }

  const handleTestEmail = async () => {
    try {
      const res = await fetch('/api/backend/scan/send-test-email', { method: 'POST' })
      const data = await res.json()
      if (data.sent) {
        alert(`✅ אימייל נשלח! כולל ${data.alerts_included} התראות`)
      } else {
        alert('❌ שליחת אימייל נכשלה — בדוק RESEND_API_KEY ו-ALERT_EMAIL_TO בקובץ .env')
      }
    } catch {
      alert('שגיאת רשת')
    }
  }

  const filtered = stocks.filter(
    (s) =>
      s.ticker.toLowerCase().includes(search.toLowerCase()) ||
      (s.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const isScanning = scanStatus === 'running'

  return (
    <div className="h-full flex flex-col bg-app-surface border-l border-app-border w-[340px] shrink-0">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-app-border space-y-3">
        {/* Logo row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setModalOpen(true)}
            className="text-accent text-sm hover:text-blue-400 transition-colors font-medium"
          >
            + הוסף מניה
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ticker tracking-wide">
              Pattern<span className="text-accent">Scanner</span>
            </span>
            <div className="w-8 h-8 rounded-full bg-app-border flex items-center justify-center">
              <span className="text-[11px] font-bold text-ticker">PS</span>
            </div>
          </div>
        </div>

        {/* Scan controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleScan}
              disabled={isScanning}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors
                ${isScanning
                  ? 'bg-accent/20 text-accent cursor-not-allowed'
                  : 'bg-app-border hover:bg-app-hover text-text-primary'}`}
            >
              <span>{isScanning ? '⟳' : '▶'}</span>
              <span>{isScanning ? 'סורק...' : 'הרץ סריקה עכשיו'}</span>
            </button>
            <button
              onClick={handleTestEmail}
              title="שלח אימייל ניסיון עם ההתראות הנוכחיות"
              className="text-xs px-2 py-1.5 rounded-lg bg-app-border hover:bg-app-hover text-text-muted hover:text-text-primary transition-colors"
            >
              ✉
            </button>
          </div>
          <div className="text-right leading-tight">
            <div className="text-xs text-ticker">
              סריקה הבאה: {nextScanIso ? new Date(nextScanIso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—:——'}
            </div>
            <div className="text-xs font-mono text-accent">{countdown}</div>
          </div>
        </div>

        {/* IBKR status */}
        <div className="flex justify-end">
          <IbkrDot status={ibkrStatus} />
        </div>
      </div>

      {/* ── Scan progress (only while running) ── */}
      {isScanning && (
        <ScanProgress
          current={scanProgress.current}
          total={scanProgress.total}
          ticker={scanProgress.ticker}
        />
      )}

      {/* ── Watchlist header ── */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-app-border">
        <span className="text-text-dim text-xs">{stocks.length} מניות</span>
        <span className="text-text-dim text-[10px] font-semibold tracking-[0.15em]">WATCHLIST</span>
      </div>

      {/* ── Search ── */}
      <div className="px-4 py-2 border-b border-app-border">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש טיקר..."
          dir="rtl"
          className="w-full bg-app-input border border-app-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* ── Stock list ── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-text-muted text-sm" dir="rtl">
            {search
              ? `לא נמצאו תוצאות עבור "${search}"`
              : 'לחץ "+ הוסף מניה" כדי להתחיל'}
          </div>
        ) : (
          filtered.map((stock) => (
            <StockItem
              key={stock.ticker}
              stock={stock}
              isActive={stock.ticker === activeTicker}
              onRemove={handleRemove}
              onClick={onTickerSelect}
            />
          ))
        )}
      </div>

      {/* ── Settings panel (collapsible, at bottom) ── */}
      <div className="shrink-0 border-t border-app-border">
        {settingsOpen ? (
          <SettingsPanel
            onClose={() => setSettingsOpen(false)}
            onSave={(s) => { scanSettings.current = s }}
          />
        ) : (
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            dir="rtl"
          >
            <span>⚙</span>
            <span>הגדרות סריקה</span>
          </button>
        )}
      </div>

      {/* ── Add modal ── */}
      {modalOpen && (
        <AddStockModal onAdd={handleAdd} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
