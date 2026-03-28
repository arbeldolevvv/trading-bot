'use client'

import { useEffect, useState } from 'react'

interface AlertDetail {
  id: number
  ticker: string
  pattern_name: string
  signal_type: string
  category: string
  price_at_alert: number | null
  success_rate: number | null
  occurrences: number | null
  stop_loss: number | null
  take_profit: number | null
  take_profit_2: number | null
  rr_ratio: number | null
  rs_vs_spy: number | null
  earnings_imminent: boolean
  detected_at: string
}

interface PositionDetail {
  ticker: string
  quantity: number
  avg_price: number
  stop_loss: number | null
  take_profit: number | null
  highest_price: number | null
  trailing_stop_pct: number | null
  sector: string | null
  opened_at: string
}

interface TradeDetailModalProps {
  ticker: string
  currentPrice: number
  gainPct: number
  onClose: () => void
  onOpenAnalysis: (ticker: string) => void
}

function pct(from: number, to: number) {
  return ((to / from - 1) * 100).toFixed(1)
}

export default function TradeDetailModal({
  ticker,
  currentPrice,
  gainPct,
  onClose,
  onOpenAnalysis,
}: TradeDetailModalProps) {
  const [data, setData] = useState<{ position: PositionDetail; alert: AlertDetail | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/paper-portfolio/${ticker}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ticker])

  const isGain = gainPct >= 0

  const entry = data?.position?.avg_price ?? null
  const alert = data?.alert ?? null

  const stopLoss   = data?.position?.stop_loss ?? null
  const takeProfit = data?.position?.take_profit ?? null
  const takeProfit2 = alert?.take_profit_2 ?? null
  const rrRatio    = alert?.rr_ratio ?? null
  const trailingRaised = stopLoss != null && entry != null && stopLoss > entry

  const riskDollar    = entry != null && stopLoss != null ? Math.abs(entry - stopLoss) * (data?.position?.quantity ?? 0) : null
  const rewardDollar  = entry != null && takeProfit != null ? Math.abs(takeProfit - entry) * (data?.position?.quantity ?? 0) : null

  const signalLabel = alert?.signal_type === 'gold' ? '🥇 Gold' : '⭐ Standard'
  const categoryLabel = alert?.category === 'technical' ? 'טכני' : 'פטרן'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl border border-app-border bg-app-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-app-border">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono font-bold text-ticker">{ticker}</span>
              <span className={`text-sm font-mono font-semibold ${isGain ? 'text-gain' : 'text-loss'}`}>
                {isGain ? '+' : ''}{gainPct.toFixed(2)}%
              </span>
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              מחיר נוכחי: <span className="font-mono text-text-primary">${currentPrice.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[75vh] overflow-y-auto">

          {loading && (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-6 bg-app-card rounded animate-pulse" />
              ))}
            </div>
          )}

          {!loading && (
            <>
              {/* ── Section 1: Why I entered ── */}
              <div>
                <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wide mb-2">
                  למה נכנסתי
                </div>
                {alert ? (
                  <div className="rounded-xl bg-app-card border border-app-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text-primary">
                        {alert.pattern_name}
                      </span>
                      <div className="flex gap-1.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          alert.signal_type === 'gold'
                            ? 'bg-gold/10 text-gold border-gold/30'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                        }`}>{signalLabel}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-app-surface border-app-border text-text-muted">
                          {categoryLabel}
                        </span>
                      </div>
                    </div>
                    {alert.success_rate != null && alert.occurrences != null && (
                      <div className="text-xs text-text-dim">
                        <span className="text-gain font-semibold">{alert.success_rate.toFixed(0)}%</span>
                        {' '}הצלחה מתוך{' '}
                        <span className="font-semibold text-text-primary">{alert.occurrences}</span>
                        {' '}מקרים היסטוריים
                      </div>
                    )}
                    {alert.detected_at && (
                      <div className="text-[10px] text-text-muted">
                        זוהה: {new Date(alert.detected_at).toLocaleDateString('he-IL')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-text-muted rounded-xl bg-app-card border border-app-border p-3">
                    אין נתוני התראה מקושרים
                  </div>
                )}
              </div>

              {/* ── Section 2: Price levels ── */}
              <div>
                <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wide mb-2">
                  רמות מחיר
                </div>
                <div className="rounded-xl bg-app-card border border-app-border overflow-hidden">
                  {entry != null && (
                    <div className="flex justify-between items-center px-3 py-2 border-b border-app-border/40">
                      <span className="text-xs text-text-dim">כניסה</span>
                      <div className="text-right">
                        <span className="text-xs font-mono text-text-primary">${entry.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                  {stopLoss != null && entry != null && (
                    <div className="flex justify-between items-center px-3 py-2 border-b border-app-border/40">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-loss">סטופ לוס</span>
                        {trailingRaised && (
                          <span className="text-[9px] text-gain bg-gain/10 px-1 rounded">▲ trailing</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono text-loss">${stopLoss.toFixed(2)}</span>
                        <span className="text-[10px] text-text-muted mr-1">({pct(entry, stopLoss)}%)</span>
                      </div>
                    </div>
                  )}
                  {takeProfit != null && entry != null && (
                    <div className={`flex justify-between items-center px-3 py-2 ${takeProfit2 ? 'border-b border-app-border/40' : ''}`}>
                      <span className="text-xs text-gain">יעד 1</span>
                      <div className="text-right">
                        <span className="text-xs font-mono text-gain">${takeProfit.toFixed(2)}</span>
                        <span className="text-[10px] text-text-muted mr-1">(+{pct(entry, takeProfit)}%)</span>
                      </div>
                    </div>
                  )}
                  {takeProfit2 != null && entry != null && (
                    <div className="flex justify-between items-center px-3 py-2">
                      <span className="text-xs text-gain">יעד 2</span>
                      <div className="text-right">
                        <span className="text-xs font-mono text-gain">${takeProfit2.toFixed(2)}</span>
                        <span className="text-[10px] text-text-muted mr-1">(+{pct(entry, takeProfit2)}%)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section 3: R:R ── */}
              {(rrRatio != null || (riskDollar != null && rewardDollar != null)) && (
                <div>
                  <div className="text-[11px] font-semibold text-text-dim uppercase tracking-wide mb-2">
                    יחס סיכוי:סיכון
                  </div>
                  <div className="rounded-xl bg-app-card border border-app-border p-3 flex items-center gap-4">
                    {rrRatio != null && (
                      <div className="text-center">
                        <div className="text-2xl font-mono font-bold text-text-primary">
                          1:{rrRatio.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-text-muted">R:R</div>
                      </div>
                    )}
                    {riskDollar != null && rewardDollar != null && (
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">סיכון</span>
                          <span className="font-mono text-loss">-${riskDollar.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-text-muted">פוטנציאל</span>
                          <span className="font-mono text-gain">+${rewardDollar.toFixed(0)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-app-border">
          <button
            onClick={() => onOpenAnalysis(ticker)}
            className="w-full py-2.5 rounded-xl text-sm font-medium bg-app-card hover:bg-app-border/50 border border-app-border text-text-primary transition-colors"
          >
            ניתוח מלא ←
          </button>
        </div>
      </div>
    </div>
  )
}
