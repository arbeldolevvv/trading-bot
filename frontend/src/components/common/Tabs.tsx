'use client'

import type { TabId } from '@/types'

interface Tab {
  id: TabId
  label: string
  icon: string
  count?: number
}

interface Props {
  active: TabId
  onChange: (id: TabId) => void
  alertCount?: number
}

export default function Tabs({ active, onChange, alertCount = 0 }: Props) {
  const tabs: Tab[] = [
    { id: 'alerts', label: 'התראות', icon: '🔔', count: alertCount },
    { id: 'analysis', label: 'ניתוח', icon: '🔍' },
    { id: 'patterns', label: 'דפוסים', icon: '📊' },
    { id: 'history', label: 'היסטוריה', icon: '📈' },
    { id: 'portfolio', label: 'תיק', icon: '💼' },
  ]

  return (
    <div className="flex border-b border-app-border" dir="rtl">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`
            flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium
            transition-colors duration-150 relative
            ${
              active === tab.id
                ? 'text-[#e2e8f0] border-b-2 border-accent'
                : 'text-text-dim hover:text-[#94a3b8]'
            }
          `}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
          {tab.count != null && tab.count > 0 && (
            <span className="bg-gold text-[#080d1a] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {tab.count > 9 ? '9+' : tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
