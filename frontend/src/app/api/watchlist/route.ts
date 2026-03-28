import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const stocks = await prisma.watchlist.findMany({ orderBy: { addedAt: 'desc' } })

  const enriched = await Promise.all(
    stocks.map(async (s) => {
      try {
        const candles = await prisma.candle.findMany({
          where: { ticker: s.ticker },
          orderBy: { date: 'desc' },
          take: 2,
          select: { close: true },
        })
        const currentPrice = candles[0] ? Number(candles[0].close) : null
        const prevClose    = candles[1] ? Number(candles[1].close) : null
        const dailyChange  =
          currentPrice != null && prevClose != null && prevClose > 0
            ? ((currentPrice - prevClose) / prevClose) * 100
            : null
        return { ...s, currentPrice, dailyChange }
      } catch {
        return { ...s, currentPrice: null, dailyChange: null }
      }
    })
  )

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const ticker = (body.ticker ?? '').trim().toUpperCase()
  const name = (body.name ?? '').trim() || null

  if (!ticker || ticker.length > 10 || !/^[A-Z.]+$/.test(ticker)) {
    return NextResponse.json({ error: 'טיקר לא תקין' }, { status: 400 })
  }

  try {
    const stock = await prisma.watchlist.create({
      data: { ticker, name },
    })
    return NextResponse.json(stock, { status: 201 })
  } catch (e: any) {
    if (e.code === 'P2002') {
      return NextResponse.json({ error: 'המניה כבר ברשימה' }, { status: 409 })
    }
    throw e
  }
}
