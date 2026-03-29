'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import type { StockProfile } from '@/types'

const CandleChart = dynamic(() => import('./CandleChart'), { ssr: false })

interface Props {
  ticker: string | null
  onTickerChange?: (ticker: string) => void
}

const BULLISH_PATTERNS = new Set([
  'Hammer','Inverted Hammer','Bullish Engulfing','Morning Star',
  'Three White Soldiers','Dragonfly Doji','Pin Bar','Piercing Line',
])

function CriteriaBox({
  label, value, status, hint, accent,
}: {
  label: string; value: string; status: 'green' | 'orange' | 'gray'; hint: string; accent?: string
}) {
  const bg    = status === 'green'  ? 'bg-gain/10 border-gain/40'
              : status === 'orange' ? 'bg-amber-500/10 border-amber-500/40'
              : 'bg-app-card border-app-border'
  const icon  = status === 'green'  ? '✓'
              : status === 'orange' ? '~'
              : '–'
  const iconC = status === 'green'  ? 'text-gain bg-gain/20'
              : status === 'orange' ? 'text-amber-400 bg-amber-500/20'
              : 'text-text-muted bg-app-border/50'
  const valC  = status === 'green'  ? 'text-gain'
              : status === 'orange' ? 'text-amber-400'
              : 'text-text-dim'

  return (
    <div className={`rounded-xl border p-3 ${bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-text-dim">{label}</span>
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${iconC}`}>
          {icon}
        </span>
      </div>
      <div className={`text-sm font-mono font-semibold ${valC}`}>{value}</div>
      <div className="text-[10px] text-text-muted mt-1">{hint}</div>
      {accent && <div className={`text-[10px] font-semibold mt-1 ${valC}`}>{accent}</div>}
    </div>
  )
}

export default function StockProfilePanel({ ticker, onTickerChange }: Props) {
  const [profile, setProfile] = useState<StockProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  const handleSearch = () => {
    const t = searchInput.trim().toUpperCase()
    if (t) onTickerChange?.(t)
  }

  useEffect(() => {
    if (!ticker) { setProfile(null); return }
    setLoading(true)
    fetch(`/api/stock-profile?ticker=${ticker}`)
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [ticker])

  const SearchBar = (
    <div className="px-4 pt-4 pb-3 border-b border-app-border bg-app-surface shrink-0" dir="rtl">
      <div className="flex gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="הכנס טיקר... (לדוגמה AAPL)"
          className="flex-1 bg-app-input border border-app-border rounded-xl px-4 py-2.5
                     text-sm font-mono text-text-primary placeholder-text-muted
                     focus:outline-none focus:border-accent transition-colors"
          dir="ltr"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          חפש
        </button>
      </div>
    </div>
  )

  if (!ticker) return (
    <div className="flex flex-col h-full" dir="rtl">
      {SearchBar}
      <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <div className="text-text-primary font-semibold text-lg mb-2">ניתוח מניה</div>
        <div className="text-text-dim text-sm">הכנס טיקר בחיפוש או לחץ על מניה ברשימה</div>
      </div>
    </div>
  )

  if (loading) return (
    <div className="flex flex-col h-full">
      {SearchBar}
      <div className="p-4 space-y-3" dir="rtl">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-app-surface rounded-xl animate-pulse" />)}
      </div>
    </div>
  )

  if (!profile || profile.error) return (
    <div className="flex flex-col h-full">
      {SearchBar}
      <div className="flex flex-col items-center justify-center flex-1 p-8 text-center" dir="rtl">
        <div className="text-text-dim text-sm">אין מספיק נתונים עבור {ticker} — הרץ סריקה תחילה</div>
      </div>
    </div>
  )

  // ── Criteria statuses ──────────────────────────────────────────────────────
  const rsiVal = profile.rsi.value
  const rsiStatus: 'green'|'orange'|'gray' =
    rsiVal != null && rsiVal < 30 ? 'green' :
    rsiVal != null && rsiVal < 40 ? 'orange' : 'gray'
  const rsiHint =
    rsiStatus === 'green'  ? '🔥 RSI בתחום קנייה' :
    rsiStatus === 'orange' ? '⚡ RSI מתקרב לתחום קנייה' :
    'ממתין ל-RSI < 30'

  const ma150Val = profile.ma150.value
  const maStatus: 'green'|'orange'|'gray' =
    profile.ma150.signal ? 'green' :
    (ma150Val != null && Math.abs(profile.price - ma150Val) / ma150Val < 0.03) ? 'orange' : 'gray'
  const maHint =
    maStatus === 'green'  ? `🔥 ${profile.ma150.signal}` :
    maStatus === 'orange' ? '⚡ מחיר קרוב ל-MA150 (תוך 3%)' :
    `מחיר ${profile.ma150.position === 'above' ? 'מעל' : 'מתחת'} ל-MA150`

  const volRatio = profile.volume.ratio
  const volStatus: 'green'|'orange'|'gray' =
    volRatio != null && volRatio >= 1.5 ? 'green' :
    volRatio != null && volRatio >= 1.2 ? 'orange' : 'gray'
  const volHint =
    volStatus === 'green'  ? '🔥 נפח גבוה — מאשר את הסיגנל' :
    volStatus === 'orange' ? '⚡ נפח מתגבר' :
    'סף: 1.5x ממוצע 20 ימים'

  const hasPattern = profile.patterns_today.length > 0
  const hasBullish = profile.patterns_today.some((p) => BULLISH_PATTERNS.has(p.name))
  const patternStatus: 'green'|'orange'|'gray' = hasPattern ? 'green' : 'gray'

  // MA200 trend filter status
  const ma200Val = profile.ma200?.value ?? null
  const aboveMA200 = profile.ma200?.above ?? true
  const ma200Status: 'green'|'orange'|'gray' = aboveMA200 ? 'green' : ma200Val != null ? 'orange' : 'gray'
  const ma200Hint =
    ma200Val == null   ? 'אין מספיק נתונים (נדרשים 200 ימים)' :
    aboveMA200         ? '✓ מחיר מעל MA200 — טרנד עולה מאושר' :
                         '⚠ מחיר מתחת ל-MA200 — סיגנלי קנייה מושבתים'

  // Is it a BUY SIGNAL day? (bullish pattern + at least one other criterion met + above MA200)
  const otherCriteria = [rsiStatus, maStatus, volStatus].filter((s) => s === 'green').length
  const isBuySignal = hasBullish && otherCriteria >= 1 && aboveMA200

  const goldPatterns = profile.top_patterns.filter((p) => p.signal_type === 'gold')
  const stdPatterns  = profile.top_patterns.filter((p) => p.signal_type !== 'gold')

  return (
    <div className="flex flex-col h-full" dir="rtl">
    {SearchBar}
    <div className="flex-1 overflow-y-auto p-4 space-y-4">

      {/* ── Candlestick chart ── */}
      <CandleChart ticker={profile.ticker} />

      {/* ── Header ── */}
      <div className="flex items-center justify-between bg-app-surface rounded-xl border border-app-border px-4 py-3">
        <div className="text-text-dim text-xs">ניתוח יומי</div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-ticker">{profile.ticker}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono font-semibold text-text-primary">
              ${profile.price.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ── BUY SIGNAL banner ── */}
      {isBuySignal && (
        <div className="rounded-xl border border-gain/60 bg-gain/10 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gain/80 font-semibold mb-0.5">סיגנל פעיל היום</div>
            <div className="text-sm text-gain font-bold">
              {profile.patterns_today.filter((p) => BULLISH_PATTERNS.has(p.name)).map((p) => p.name).join(', ')}
            </div>
          </div>
          <div className="text-2xl">🟢</div>
          <div className="bg-gain text-[#080d1a] text-xs font-bold px-3 py-1 rounded-full">
            BUY SIGNAL
          </div>
        </div>
      )}

      {/* ── Criteria grid ── */}
      <div>
        <div className="text-xs font-semibold text-text-dim mb-2 px-1">קריטריונים להתראה</div>
        <div className="grid grid-cols-2 gap-2">
          <CriteriaBox
            label="RSI (14)"
            value={rsiVal != null ? rsiVal.toFixed(1) : '—'}
            status={rsiStatus}
            hint={rsiHint}
            accent={rsiVal != null && rsiVal < 30 ? 'OVERSOLD ← קנייה' : undefined}
          />
          <CriteriaBox
            label="MA150"
            value={ma150Val != null ? `$${ma150Val.toFixed(2)}` : '—'}
            status={maStatus}
            hint={maHint}
            accent={profile.ma150.signal ?? undefined}
          />
          <CriteriaBox
            label="נפח מסחר"
            value={volRatio != null ? `${volRatio.toFixed(2)}x` : '—'}
            status={volStatus}
            hint={volHint}
            accent={volStatus === 'green' ? `${(profile.volume.today / 1_000_000).toFixed(1)}M מניות` : undefined}
          />
          <CriteriaBox
            label="דפוס נרות היום"
            value={hasPattern ? profile.patterns_today[0].name : 'לא זוהה'}
            status={patternStatus}
            hint={hasPattern ? 'דפוס על 4 הנרות האחרונים' : 'ממתין לדפוס מאומת'}
            accent={hasPattern && profile.patterns_today[0].success_rate > 0
              ? `${profile.patterns_today[0].success_rate.toFixed(0)}% הצלחה היסטורית`
              : undefined}
          />
          <CriteriaBox
            label="MA200 (טרנד)"
            value={ma200Val != null ? `$${ma200Val.toFixed(2)}` : '—'}
            status={ma200Status}
            hint={ma200Hint}
            accent={aboveMA200 && ma200Val != null
              ? `מעל ב-${(((profile.price - ma200Val) / ma200Val) * 100).toFixed(1)}%`
              : ma200Val != null
              ? `מתחת ב-${(((ma200Val - profile.price) / ma200Val) * 100).toFixed(1)}%`
              : undefined}
          />
        </div>
      </div>

      {/* ── Today's patterns detail ── */}
      {profile.patterns_today.length > 1 && (
        <div className="bg-app-surface rounded-xl border border-app-border overflow-hidden">
          <div className="px-3 py-2 border-b border-app-border text-xs font-semibold text-text-dim">
            כל הדפוסים שזוהו היום
          </div>
          {profile.patterns_today.map((p) => (
            <div key={p.name} className="flex items-center justify-between px-3 py-2.5 border-b border-app-border/40 last:border-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${BULLISH_PATTERNS.has(p.name) ? 'text-gain' : 'text-loss'}`}>
                  {BULLISH_PATTERNS.has(p.name) ? '▲' : '▼'}
                </span>
                <span className="text-sm text-text-primary">{p.name}</span>
              </div>
              <div className="flex gap-3 text-xs font-mono">
                <span className="text-text-dim">{p.occurrences}x</span>
                <span className="text-gain font-semibold">{p.success_rate.toFixed(0)}%</span>
                <span className="text-gain">+{p.avg_gain.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── GOLD patterns ── */}
      {goldPatterns.length > 0 && (
        <div className="rounded-xl border border-gold/40 bg-gold/5 overflow-hidden">
          <div className="px-3 py-2 border-b border-gold/30 flex items-center gap-2">
            <span className="text-gold text-sm">⭐</span>
            <span className="text-xs font-bold text-gold">דפוסי GOLD — הוכחו היסטורית</span>
          </div>
          {goldPatterns.map((p) => (
            <div key={p.pattern_name} className="flex items-center justify-between px-3 py-2.5 border-b border-gold/20 last:border-0">
              <span className="text-sm font-semibold text-text-primary">{p.pattern_name}</span>
              <div className="flex gap-2 items-center text-xs font-mono">
                <span className="text-text-dim bg-app-card rounded px-1.5 py-0.5">{p.total_appearances}x</span>
                <span className="text-gold font-bold bg-gold/10 rounded px-1.5 py-0.5">
                  {p.success_rate_10pct?.toFixed(0)}%
                </span>
                <span className="text-gain">+{p.avg_gain?.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Standard patterns ── */}
      {stdPatterns.length > 0 && (
        <div className="bg-app-surface rounded-xl border border-app-border overflow-hidden">
          <div className="px-3 py-2 border-b border-app-border text-xs font-semibold text-text-dim">
            דפוסים נוספים (Standard)
          </div>
          {stdPatterns.slice(0, 5).map((p) => (
            <div key={p.pattern_name} className="flex items-center justify-between px-3 py-2.5 border-b border-app-border/40 last:border-0">
              <span className="text-sm text-text-primary">{p.pattern_name}</span>
              <div className="flex gap-2 text-xs font-mono">
                <span className="text-text-dim">{p.total_appearances}x</span>
                <span className="text-accent">{p.success_rate_10pct?.toFixed(0)}%</span>
                <span className="text-gain">+{p.avg_gain?.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {profile.top_patterns.length === 0 && (
        <div className="text-center text-text-dim text-sm py-4 bg-app-surface rounded-xl border border-app-border">
          הרץ סריקה כדי לחשב דפוסים היסטוריים
        </div>
      )}
    </div>
    </div>
  )
}
