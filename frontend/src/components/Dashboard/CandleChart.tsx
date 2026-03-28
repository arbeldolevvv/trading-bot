'use client'

import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
} from 'lightweight-charts'

interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

interface Props {
  ticker: string
}

function computeMA(candles: Candle[], period: number): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, c) => s + c.close, 0) / period
    result.push({ time: candles[i].date, value: parseFloat(avg.toFixed(4)) })
  }
  return result
}

export default function CandleChart({ ticker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    setLoading(true)
    setEmpty(false)

    // Detect theme colours from CSS variables
    const style = getComputedStyle(document.documentElement)
    const bg       = style.getPropertyValue('--color-app-bg').trim()      || '#080d1a'
    const surface  = style.getPropertyValue('--color-app-surface').trim() || '#0f1629'
    const border   = style.getPropertyValue('--color-app-border').trim()  || '#1e2d4a'
    const textDim  = style.getPropertyValue('--color-text-dim').trim()    || '#94a3b8'

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: surface || '#0f1629' },
        textColor: textDim || '#94a3b8',
      },
      grid: {
        vertLines: { color: border || '#1e2d4a' },
        horzLines: { color: border || '#1e2d4a' },
      },
      rightPriceScale: { borderColor: border || '#1e2d4a' },
      timeScale: {
        borderColor: border || '#1e2d4a',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 1 },
      width: containerRef.current.clientWidth,
      height: 260,
    })
    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:   '#22c55e',
      downColor: '#ef4444',
      borderUpColor:   '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor:   '#22c55e',
      wickDownColor: '#ef4444',
    })

    const maSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    fetch(`/api/candles?ticker=${ticker}&days=180`)
      .then((r) => r.json())
      .then((data: Candle[]) => {
        if (!data.length) { setEmpty(true); setLoading(false); return }

        const candleData = data.map((c) => ({
          time: c.date,
          open: c.open, high: c.high, low: c.low, close: c.close,
        }))
        candleSeries.setData(candleData)

        const maData = computeMA(data, 150)
        if (maData.length) maSeries.setData(maData)

        chart.timeScale().fitContent()
        setLoading(false)
      })
      .catch(() => { setEmpty(true); setLoading(false) })

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [ticker])

  return (
    <div className="rounded-xl border border-app-border bg-app-surface overflow-hidden">
      {/* Legend */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-app-border">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono font-bold text-ticker">{ticker}</span>
          <span className="flex items-center gap-1">
            <span className="w-6 h-px bg-amber-400 inline-block" />
            <span className="text-text-muted">MA150</span>
          </span>
        </div>
        <span className="text-[10px] text-text-muted">180 ימים</span>
      </div>

      {/* Chart area */}
      <div className="relative">
        <div ref={containerRef} style={{ height: 260 }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-app-surface">
            <div className="text-text-muted text-sm animate-pulse">טוען גרף...</div>
          </div>
        )}
        {empty && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-app-surface">
            <div className="text-text-dim text-sm">אין נתוני נרות — הרץ סריקה תחילה</div>
          </div>
        )}
      </div>
    </div>
  )
}
