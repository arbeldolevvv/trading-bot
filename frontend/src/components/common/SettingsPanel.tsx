'use client'

import { useState } from 'react'

export interface ScanSettings {
  volumeMinRatio: number
  minSuccessRate: number
  rsiOversoldLevel: number
  showHighRisk: boolean
}

export const DEFAULT_SETTINGS: ScanSettings = {
  volumeMinRatio: 1.5,
  minSuccessRate: 50,
  rsiOversoldLevel: 30,
  showHighRisk: true,
}

const STORAGE_KEY = 'patternscanner_settings'

export function loadSettings(): ScanSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(s: ScanSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

interface Props {
  onClose: () => void
  onSave: (settings: ScanSettings) => void
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-accent border-accent text-white'
          : 'border-app-border text-text-dim hover:border-accent/50 hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  )
}

export default function SettingsPanel({ onClose, onSave }: Props) {
  const [settings, setSettings] = useState<ScanSettings>(loadSettings)

  const set = (patch: Partial<ScanSettings>) => setSettings((s) => ({ ...s, ...patch }))

  const handleSave = () => {
    saveSettings(settings)
    onSave(settings)
    onClose()
  }

  return (
    <div className="border-t border-app-border bg-app-bg px-4 py-3 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-dim tracking-[0.1em]">⚙ הגדרות סריקה</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xs">✕</button>
      </div>

      {/* Volume filter */}
      <div>
        <div className="text-[10px] text-text-muted mb-1.5">פילטר נפח מינימלי (x ממוצע 20 ימים)</div>
        <div className="flex gap-1.5 flex-wrap">
          {[1.0, 1.2, 1.5, 2.0].map((v) => (
            <Chip key={v} label={`${v}x`} active={settings.volumeMinRatio === v} onClick={() => set({ volumeMinRatio: v })} />
          ))}
        </div>
      </div>

      {/* Min success rate */}
      <div>
        <div className="text-[10px] text-text-muted mb-1.5">הצלחה היסטורית מינימלית</div>
        <div className="flex gap-1.5 flex-wrap">
          {[40, 50, 60, 70].map((v) => (
            <Chip key={v} label={`${v}%`} active={settings.minSuccessRate === v} onClick={() => set({ minSuccessRate: v })} />
          ))}
        </div>
      </div>

      {/* RSI level */}
      <div>
        <div className="text-[10px] text-text-muted mb-1.5">RSI — סף מכירת יתר (קנייה)</div>
        <div className="flex gap-1.5 flex-wrap">
          {[25, 30, 35].map((v) => (
            <Chip key={v} label={`RSI < ${v}`} active={settings.rsiOversoldLevel === v} onClick={() => set({ rsiOversoldLevel: v })} />
          ))}
        </div>
      </div>

      {/* Show high risk */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-muted">הצג התראות בשוק בסיכון גבוה</span>
        <button
          onClick={() => set({ showHighRisk: !settings.showHighRisk })}
          className={`relative w-9 h-5 rounded-full transition-colors ${settings.showHighRisk ? 'bg-gain' : 'bg-app-border'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${settings.showHighRisk ? 'right-0.5' : 'left-0.5'}`} />
        </button>
      </div>

      <button
        onClick={handleSave}
        className="w-full text-xs font-semibold bg-accent hover:bg-blue-500 text-white rounded-lg py-2 transition-colors"
      >
        שמור והפעל בסריקה הבאה
      </button>
    </div>
  )
}
