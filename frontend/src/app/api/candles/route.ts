import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  const days   = req.nextUrl.searchParams.get('days') ?? '120'
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })

  try {
    const res = await fetch(
      `http://localhost:8000/candles/${encodeURIComponent(ticker.toUpperCase())}?days=${days}`,
      { cache: 'no-store' },
    )
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
