'use client'

import { useState, useRef, useEffect } from 'react'

interface Props {
  onAdd: (ticker: string, name: string) => Promise<void>
  onClose: () => void
}

export default function AddStockModal({ onAdd, onClose }: Props) {
  const [ticker, setTicker] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const tickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    tickerRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = ticker.trim().toUpperCase()
    if (!t) {
      setError('נדרש טיקר')
      return
    }
    if (!/^[A-Z.]{1,10}$/.test(t)) {
      setError('טיקר לא תקין (אותיות אנגלית בלבד, עד 10 תווים)')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onAdd(t, name.trim())
    } catch (err: any) {
      setError(err.message ?? 'שגיאה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-app-surface border border-app-border rounded-xl p-6 w-80 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={onClose}
            className="text-text-muted hover:text-[#e2e8f0] transition-colors text-lg"
          >
            ✕
          </button>
          <h2 className="text-[#e2e8f0] font-semibold text-base">הוסף מניה לרשימה</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" dir="rtl">
          <div>
            <label className="block text-xs text-text-dim mb-1">טיקר *</label>
            <input
              ref={tickerRef}
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="NVDA"
              maxLength={10}
              className="w-full bg-app-input border border-app-border rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-text-muted focus:outline-none focus:border-accent font-mono tracking-wider text-right"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-xs text-text-dim mb-1">שם החברה (אופציונלי)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="NVIDIA Corporation"
              className="w-full bg-app-input border border-app-border rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-text-muted focus:outline-none focus:border-accent text-right"
            />
          </div>

          {error && (
            <p className="text-loss text-xs text-right">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-2 text-sm font-medium transition-colors mt-2"
          >
            {loading ? 'מוסיף...' : '+ הוסף מניה'}
          </button>
        </form>
      </div>
    </div>
  )
}
