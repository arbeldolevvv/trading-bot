'use client'

import type { TabId } from '@/types'

interface Tab { id: TabId; label: string; icon: string }

const TABS: Tab[] = [
  { id: 'portfolio', label: 'תיק מניות', icon: '💼' },
  { id: 'analysis',  label: 'ניתוח',     icon: '🔍' },
  { id: 'alerts',    label: 'התראות',    icon: '🔔' },
  { id: 'watchlist', label: 'רשימה',     icon: '☰'  },
]

interface Props {
  active: TabId
  onChange: (t: TabId) => void
  alertCount: number
}

export default function BottomNav({ active, onChange, alertCount }: Props) {
  return (
    <nav
      className="shrink-0 flex items-stretch border-t border-app-border bg-app-surface"
      dir="rtl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 relative transition-colors
              ${isActive ? 'text-accent' : 'text-text-muted hover:text-text-primary'}`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>

            {/* Alert badge */}
            {tab.id === 'alerts' && alertCount > 0 && (
              <span className="absolute top-2 right-[calc(50%-8px)] translate-x-4
                bg-gold text-[#080d1a] text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                {alertCount > 99 ? '99+' : alertCount}
              </span>
            )}

            {/* Active indicator line */}
            {isActive && (
              <span className="absolute top-0 inset-x-6 h-0.5 rounded-b-full bg-accent" />
            )}
          </button>
        )
      })}
    </nav>
  )
}
