'use client'

import { useState } from 'react'
import type { WatchlistStock } from '@/types'

interface Props {
  stock: WatchlistStock
  isActive: boolean
  onRemove: (ticker: string) => void
  onClick: (ticker: string) => void
}

export default function StockItem({ stock, isActive, onRemove, onClick }: Props) {
  const [hovered, setHovered] = useState(false)

  const changeColor =
    stock.dailyChange == null
      ? 'text-text-dim'
      : stock.dailyChange >= 0
      ? 'text-gain'
      : 'text-loss'

  const changePrefix = stock.dailyChange != null && stock.dailyChange >= 0 ? '+' : ''

  return (
    <div
      className={`
        relative flex items-center px-4 py-3 cursor-pointer
        border-b border-app-border transition-colors duration-150
        ${isActive ? 'bg-app-card' : 'hover:bg-app-card'}
        ${stock.hasActiveAlert ? 'border-r-2 border-r-gold' : ''}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onClick(stock.ticker)}
    >
      {/* Right side: ticker + name (RTL: first child = right) */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-wider text-ticker">
            {stock.ticker}
          </span>
          {stock.hasActiveAlert && (
            <span className="text-[10px] text-gold font-mono">●</span>
          )}
        </div>
        <div className="text-xs text-text-muted truncate mt-0.5">
          {stock.name ?? '—'}
        </div>
      </div>

      {/* Left side: price + change */}
      <div className="text-left ltr shrink-0 ml-3">
        <div className="text-sm font-mono text-[#e2e8f0]">
          {stock.currentPrice != null ? `$${stock.currentPrice.toFixed(2)}` : '—'}
        </div>
        <div className={`text-xs font-mono ${changeColor}`}>
          {stock.dailyChange != null
            ? `${changePrefix}${stock.dailyChange.toFixed(2)}%`
            : '—'}
        </div>
      </div>

      {/* Remove button — appears on hover */}
      {hovered && (
        <button
          className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-text-muted hover:text-loss transition-colors text-xs rounded"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(stock.ticker)
          }}
          title="הסר מניה"
        >
          ✕
        </button>
      )}
    </div>
  )
}
