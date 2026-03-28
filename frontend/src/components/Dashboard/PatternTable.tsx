import type { ValidatedPattern } from '@/types'

interface Props {
  patterns: ValidatedPattern[]
  loading: boolean
}

function PatternCard({ p }: { p: ValidatedPattern }) {
  const isGold = p.signalType === 'gold'
  const rate = p.successRate10pct != null ? Number(p.successRate10pct) : null
  const gain = p.avgGain != null ? Number(p.avgGain) : null

  return (
    <div className={`rounded-xl border p-3 ${isGold ? 'border-gold/40 bg-gold/5' : 'border-app-border bg-app-surface'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            {isGold && <span className="text-gold text-xs">⭐</span>}
            <span className="text-sm font-semibold text-text-primary truncate">{p.patternName}</span>
            {isGold && p.strengthScore != null && p.strengthScore > 0 && (
              <span className="text-[9px] font-bold bg-gold/15 text-gold border border-gold/30 rounded px-1 py-0.5">
                💪 {p.strengthScore.toFixed(1)}
              </span>
            )}
          </div>
          <span className="text-xs font-mono font-bold text-ticker">{p.ticker}</span>
        </div>
        <div className="text-right shrink-0">
          {gain != null && (
            <div className="text-base font-mono font-bold text-gain">+{gain.toFixed(1)}%</div>
          )}
          <div className="text-[10px] text-text-muted">רווח ממוצע</div>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">שיעור הצלחה</span>
          <span className={`font-mono font-semibold ${isGold ? 'text-gold' : 'text-accent'}`}>
            {rate != null ? `${rate.toFixed(0)}%` : '—'}
          </span>
        </div>
        {rate != null && (
          <div className="h-1.5 bg-app-card rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${isGold ? 'bg-gold' : 'bg-accent'}`}
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
        )}
        <div className="flex items-center justify-between text-[10px] text-text-muted">
          <span>{p.totalAppearances ?? '—'} הופעות ב-365 ימים</span>
          <span>הצלחה = עלה ≥3% תוך 14 ימים</span>
        </div>
      </div>
    </div>
  )
}

export default function PatternTable({ patterns, loading }: Props) {
  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-app-surface rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (patterns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center" dir="rtl">
        <div className="text-4xl mb-3">📊</div>
        <div className="text-text-primary font-semibold mb-1">אין דפוסים מאומתים עדיין</div>
        <div className="text-text-dim text-sm">
          לאחר חיבור IBKR וביצוע סריקה, הדפוסים שהוכחו היסטורית יופיעו כאן
        </div>
      </div>
    )
  }

  const gold = patterns
    .filter((p) => p.signalType === 'gold')
    .sort((a, b) => (b.strengthScore ?? 0) - (a.strengthScore ?? 0))
  const standard = patterns.filter((p) => p.signalType !== 'gold')

  return (
    <div className="p-4 space-y-5 overflow-y-auto" dir="rtl">
      {gold.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-gold text-base">⭐</span>
            <span className="text-sm font-bold text-gold">דפוסי GOLD — הוכחו היסטורית</span>
            <span className="text-[10px] bg-gold/10 text-gold border border-gold/30 rounded-full px-2 py-0.5 font-semibold ml-auto">
              {gold.length} דפוסים
            </span>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {gold.map((p) => <PatternCard key={p.id} p={p} />)}
          </div>
        </div>
      )}

      {standard.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-bold text-text-dim">דפוסים מאומתים (Standard)</span>
            <span className="text-[10px] bg-app-card text-text-muted border border-app-border rounded-full px-2 py-0.5 ml-auto">
              {standard.length} דפוסים
            </span>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {standard.map((p) => <PatternCard key={p.id} p={p} />)}
          </div>
        </div>
      )}

      <div className="text-center text-[10px] text-text-muted py-2 border-t border-app-border/40">
        הצלחה מוגדרת כעלייה של ≥3% תוך 14 ימי מסחר מרגע הדפוס
      </div>
    </div>
  )
}
