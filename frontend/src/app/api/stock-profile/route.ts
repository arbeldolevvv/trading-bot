import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })
  try {
    const res = await fetch(`${process.env.BACKEND_URL ?? 'http://localhost:8000'}/stock-profile/${ticker}`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'backend unavailable' }, { status: 503 })
  }
}
