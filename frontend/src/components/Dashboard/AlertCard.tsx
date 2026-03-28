'use client'

import { useState } from 'react'
import type { Alert } from '@/types'

interface Props {
  alert: Alert
  currentPrice?: { price: number; change: number | null } | null
}

const BULLISH_PATTERNS = new Set([
  'Hammer', 'Inverted Hammer', 'Bullish Engulfing', 'Morning Star',
  'Three White Soldiers', 'Dragonfly Doji', 'Pin Bar', 'Piercing Line',
  'RSI Oversold', 'MA150 Touch', 'MA150 Cross',
])

const PATTERN_NAMES_HE: Record<string, string> = {
  'Hammer': 'פטיש',
  'Inverted Hammer': 'פטיש הפוך',
  'Bullish Engulfing': 'בליעה שורית',
  'Bearish Engulfing': 'בליעה דובית',
  'Morning Star': 'כוכב הבוקר',
  'Evening Star': 'כוכב הערב',
  'Three White Soldiers': 'שלושה חיילים לבנים',
  'Three Black Crows': 'שלושה עורבים שחורים',
  'Doji': 'דוג\'י',
  'Dragonfly Doji': 'דוג\'י טורף',
  'Gravestone Doji': 'דוג\'י מצבה',
  'Pin Bar': 'פין בר',
  'Piercing Line': 'קו חודר',
  'Dark Cloud Cover': 'כיסוי ענן כהה',
  'Shooting Star': 'כוכב נופל',
  'Hanging Man': 'איש תלוי',
  'Harami': 'הריון',
  'Bullish Harami': 'הריון שורי',
  'Bearish Harami': 'הריון דובי',
  '3 Red + Doji': '3 אדומות + דוג\'י',
  'Marubozu (Bull)': 'מרובוזו שורי',
  'Marubozu (Bear)': 'מרובוזו דובי',
  'Pin Bar (Bull)': 'פין בר שורי',
  'Pin Bar (Bear)': 'פין בר דובי',
  'RSI Oversold': 'RSI מכירת יתר',
  'MA150 Touch': 'נגיעה ב-MA150',
  'MA150 Bullish Cross': 'חציה שורית של MA150',
  'MA150 Bearish Cross': 'חציה דובית של MA150',
  'MA150 Cross': 'חציית MA150',
}

type BuyState = 'idle' | 'loading' | 'done' | 'error'

export default function AlertCard({ alert, currentPrice }: Props) {
  const isGold      = alert.signalType === 'gold'
  const isTechnical = alert.category === 'technical'
  const isBullish   = BULLISH_PATTERNS.has(alert.patternName)
  const nameHe      = PATTERN_NAMES_HE[alert.patternName] ?? alert.patternName

  const [expanded,   setExpanded]   = useState(false)
  const [buyState,   setBuyState]   = useState<BuyState>('idle')
  const [buyResult,  setBuyResult]  = useState<{ quantity: number; positionValue: number; pctRisked: number | null } | null>(null)
  const [buyError,   setBuyError]   = useState<string | null>(null)

  const canBuy = isBullish && alert.outcome === 'pending'
    && alert.priceAtAlert !== null && !alert.earningsImminent

  const handleBuy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canBuy || buyState === 'loading' || buyState === 'done') return
    setBuyState('loading')
    try {
      const res  = await fetch('/api/paper-buy', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker:     alert.ticker,
          price:      alert.priceAtAlert,
          stopLoss:   alert.stopLoss,
          takeProfit: alert.takeProfit,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setBuyResult({ quantity: data.quantity, positionValue: data.positionValue, pctRisked: data.pctRisked })
        setBuyState('done')
      } else {
        setBuyError(data.reason ?? 'שגיאה')
        setBuyState('error')
      }
    } catch {
      setBuyError('שגיאת רשת')
      setBuyState('error')
    }
  }

  const outcomeLabel =
    alert.outcome === 'success' ? '✓ הצלחה' :
    alert.outcome === 'fail'    ? '✗ נכשל'  : '⏳ ממתין'
  const outcomeColor =
    alert.outcome === 'success' ? 'text-gain border-gain/40' :
    alert.outcome === 'fail'    ? 'text-loss border-loss/40' : 'text-gold border-gold/40'

  const delta = currentPrice && alert.priceAtAlert
    ? ((currentPrice.price - Number(alert.priceAtAlert)) / Number(alert.priceAtAlert)) * 100
    : null

  return (
    <div
      className={`rounded-xl border animate-fade-in overflow-hidden ${
        isGold ? 'border-gold/50 bg-app-surface' : 'border-app-border bg-app-surface'
      }`}
      dir="rtl"
    >
      {/* BUY SIGNAL banner — gold + bullish only */}
      {isGold && isBullish && (
        <div className="flex items-center justify-between bg-gain/10 border-b border-gain/30 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-gain text-base">🟢</span>
            <span className="text-xs font-bold text-gain">סיגנל קנייה פעיל</span>
          </div>
          <span className="text-[10px] font-bold bg-gain text-[#080d1a] px-2.5 py-0.5 rounded-full">
            BUY SIGNAL
          </span>
        </div>
      )}

      {/* ── Clickable header (always visible) ── */}
      <div
        className="p-4 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          {/* Left: ticker + pattern name + price */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {isGold && <span className="text-gold text-sm">⭐</span>}
              <span className="text-xl font-mono font-bold text-ticker">{alert.ticker}</span>
              <span className="text-[11px] text-text-muted font-medium truncate">
                {nameHe}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {alert.priceAtAlert && (
                <span className="text-xs font-mono text-text-dim">
                  ${Number(alert.priceAtAlert).toFixed(2)}
                </span>
              )}
              {delta !== null && (
                <span className={`text-[10px] font-mono font-semibold ${delta >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                </span>
              )}
              {alert.successRate !== null && !isTechnical && (
                <span className={`text-[10px] font-mono font-semibold ${(alert.successRate ?? 0) >= 75 ? 'text-gold' : 'text-gain'}`}>
                  {(alert.successRate ?? 0).toFixed(0)}% ✓
                </span>
              )}
              {alert.rrRatio !== null && (
                <span className="text-[10px] font-mono text-text-muted">
                  R/R 1:{alert.rrRatio.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          {/* Right: badges + chevron */}
          <div className="flex items-center gap-1.5 mr-2 shrink-0">
            <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${outcomeColor}`}>
              {outcomeLabel}
            </div>
            <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              isBullish
                ? 'bg-gain/10 text-gain border-gain/30'
                : 'bg-loss/10 text-loss border-loss/30'
            }`}>
              {isBullish ? '📈 שורי' : '📉 דובי'}
            </div>
            {alert.highRisk && (
              <span className="text-[10px] text-amber-400">⚠</span>
            )}
            {/* Chevron */}
            <span className={`text-text-muted text-xs transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </div>
        </div>
      </div>

      {/* ── Expanded detail section ── */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-app-border/40 pt-3 space-y-3">

          {/* Pattern name box */}
          <div className="p-2.5 bg-app-card rounded-lg border border-app-border/60">
            <div className="text-xs font-semibold text-text-muted mb-1">סיבת הסיגנל</div>
            <div className="text-sm font-semibold text-text-primary">{nameHe}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{alert.patternName}</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {isTechnical ? 'אינדיקטור טכני' : 'דפוס נרות יפני'}
              {' · '}
              <span className={isGold ? 'text-gold font-semibold' : 'text-accent'}>
                {isGold ? '⭐ Gold Signal' : 'Standard Signal'}
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-2 flex-wrap">
            {alert.volumeRatio !== null && (
              <div className="text-xs bg-app-card rounded-lg px-2 py-1 border border-app-border/40">
                <span className="text-text-muted">נפח </span>
                <span className={`font-mono font-semibold ${(alert.volumeRatio ?? 0) >= 1.5 ? 'text-gain' : 'text-text-dim'}`}>
                  {(alert.volumeRatio ?? 0).toFixed(1)}x
                </span>
              </div>
            )}
            {alert.rsiValue !== null && (
              <div className="text-xs bg-app-card rounded-lg px-2 py-1 border border-app-border/40">
                <span className="text-text-muted">RSI </span>
                <span className="font-mono font-semibold text-loss">{alert.rsiValue?.toFixed(1)}</span>
              </div>
            )}
            {alert.ma150Value !== null && (
              <div className="text-xs bg-app-card rounded-lg px-2 py-1 border border-app-border/40">
                <span className="text-text-muted">MA150 </span>
                <span className="font-mono font-semibold text-text-primary">${alert.ma150Value?.toFixed(2)}</span>
              </div>
            )}
            {!isTechnical && alert.successRate !== null && (
              <div className="text-xs bg-app-card rounded-lg px-2 py-1 border border-app-border/40">
                <span className="text-text-muted">הצלחה היסטורית </span>
                <span className={`font-mono font-semibold ${(alert.successRate ?? 0) >= 75 ? 'text-gold' : 'text-gain'}`}>
                  {(alert.successRate ?? 0).toFixed(0)}%
                </span>
              </div>
            )}
            {!isTechnical && alert.occurrences !== null && (
              <div className="text-xs bg-app-card rounded-lg px-2 py-1 border border-app-border/40">
                <span className="text-text-muted">{alert.occurrences} מופעים</span>
              </div>
            )}
            {alert.rsVsSpy !== null && (
              <div className="text-xs bg-app-card rounded-lg px-2 py-1 border border-app-border/40">
                <span className="text-text-muted">RS vs SPY </span>
                <span className={`font-mono font-semibold ${(alert.rsVsSpy ?? 0) >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {(alert.rsVsSpy ?? 0) >= 0 ? '+' : ''}
                  {((alert.rsVsSpy ?? 0) * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* R/R HUD */}
          {alert.stopLoss !== null && (
            <div className="p-2.5 bg-app-card rounded-lg border border-app-border/60">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-loss font-semibold">⛔ Stop: ${alert.stopLoss.toFixed(2)}</span>
                {alert.takeProfit !== null && (
                  <span className="text-gain font-semibold">🎯 TP1: ${alert.takeProfit?.toFixed(2)}</span>
                )}
              </div>
              {alert.takeProfit2 !== null && (
                <div className="flex justify-end text-xs mb-1.5">
                  <span className="text-accent font-semibold">🚀 TP2: ${alert.takeProfit2.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-1 border-t border-app-border/40 flex items-center justify-between">
                {alert.rrRatio !== null ? (
                  <div className="text-xs">
                    <span className="text-text-muted">R/R </span>
                    <span className={`font-mono font-bold ${(alert.rrRatio ?? 0) >= 2 ? 'text-gain' : 'text-text-primary'}`}>
                      1:{alert.rrRatio?.toFixed(1)}
                    </span>
                  </div>
                ) : <span />}
                {alert.takeProfit2 !== null && (
                  <div className="text-[9px] text-text-muted">
                    TP1 = התנגדות | TP2 = ATR×3
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Earnings block warning */}
          {alert.earningsImminent && isBullish && alert.outcome === 'pending' && (
            <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/30 text-xs text-center text-red-400">
              🚫 חסום — דוח רווחים קרוב ({alert.earningsDate ?? ''})
            </div>
          )}

          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            {alert.highRisk && (
              <div className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                ⚠ שוק בסיכון
              </div>
            )}
            {alert.earningsImminent && (
              <div className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
                🚨 Earnings Imminent
              </div>
            )}
            <div className="mr-auto text-[10px] text-text-muted">
              {new Date(alert.detectedAt).toLocaleDateString('he-IL')}
            </div>
          </div>

          {/* Virtual Buy Button */}
          {canBuy && (
            <div>
              {buyState === 'idle' && (
                <button
                  onClick={handleBuy}
                  className="w-full py-2 rounded-lg text-xs font-bold bg-gain/15 text-gain border border-gain/40 hover:bg-gain/25 transition-colors"
                >
                  📈 קנה בתיק נייר
                </button>
              )}
              {buyState === 'loading' && (
                <div className="w-full py-2 rounded-lg text-xs text-center text-text-muted border border-app-border animate-pulse">
                  מבצע קנייה...
                </div>
              )}
              {buyState === 'done' && buyResult && (
                <div className="p-2.5 rounded-lg bg-gain/10 border border-gain/40 text-xs">
                  <div className="font-bold text-gain mb-1">✓ נרכש בהצלחה</div>
                  <div className="flex justify-between text-text-dim">
                    <span>כמות: <span className="font-mono text-text-primary">×{buyResult.quantity}</span></span>
                    <span>שווי: <span className="font-mono text-text-primary">${buyResult.positionValue.toFixed(0)}</span></span>
                    {buyResult.pctRisked != null && (
                      <span>סיכון: <span className="font-mono text-loss">{buyResult.pctRisked.toFixed(1)}%</span></span>
                    )}
                  </div>
                </div>
              )}
              {buyState === 'error' && (
                <div className="p-2 rounded-lg bg-loss/10 border border-loss/40 text-xs text-loss text-center">
                  ✗ {buyError}
                  <button onClick={(e) => { e.stopPropagation(); setBuyState('idle') }} className="mr-2 underline">נסה שוב</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
