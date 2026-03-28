import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get('limit') ?? '100'
  try {
    const res = await fetch(`http://localhost:8000/paper-trades?limit=${limit}`, { cache: 'no-store' })
    const data = await res.json()
    const transformed = data.map((t: any) => ({
      id:            t.id,
      ticker:        t.ticker,
      action:        t.action,
      quantity:      t.quantity,
      pricePerShare: t.price_per_share,
      totalCost:     t.total_cost,
      stopLoss:      t.stop_loss,
      takeProfit:    t.take_profit,
      alertId:       t.alert_id,
      executedAt:    t.executed_at,
      notes:         t.notes,
      gainPct:       t.gain_pct,
    }))
    return NextResponse.json(transformed)
  } catch {
    return NextResponse.json([])
  }
}
