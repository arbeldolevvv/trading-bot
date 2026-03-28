'use client'

import type { DashboardStats } from '@/types'

interface Props {
  stats: DashboardStats | null
  loading: boolean
}

const StatCard = ({
  label,
  value,
  color = 'text-[#e2e8f0]',
}: {
  label: string
  value: string
  color?: string
}) => (
  <div className="bg-app-surface border border-app-border rounded-xl px-4 py-3 flex-1 min-w-0">
    <div className={`text-xl font-mono font-semibold ${color}`}>{value}</div>
    <div className="text-xs text-text-dim mt-0.5">{label}</div>
  </div>
)

export default function StatsRow({ stats, loading }: Props) {
  if (loading || !stats) {
    return (
      <div className="flex gap-3 p-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-app-surface border border-app-border rounded-xl px-4 py-3 h-16 animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-3 p-4" dir="rtl">
      <StatCard label="מניות במעקב" value={String(stats.totalStocks)} />
      <StatCard
        label="דפוסים מאומתים"
        value={String(stats.validatedPatterns)}
        color="text-accent"
      />
      <StatCard
        label="התראות פעילות"
        value={String(stats.activeAlerts)}
        color={stats.activeAlerts > 0 ? 'text-gold' : 'text-[#e2e8f0]'}
      />
      <StatCard
        label="שיעור הצלחה ממוצע"
        value={stats.avgSuccessRate != null ? `${stats.avgSuccessRate.toFixed(1)}%` : '—'}
        color="text-gain"
      />
    </div>
  )
}
