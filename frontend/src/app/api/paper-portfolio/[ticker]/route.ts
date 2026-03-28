import { NextResponse } from 'next/server'

export async function GET(
  _: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL ?? 'http://localhost:8000'}/paper-portfolio/position/${params.ticker}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 503 })
  }
}
