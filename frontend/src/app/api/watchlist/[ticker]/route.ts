import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase()
  try {
    await prisma.watchlist.delete({ where: { ticker } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'לא נמצאה המניה' }, { status: 404 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase()
  const { name } = await req.json()
  const stock = await prisma.watchlist.update({
    where: { ticker },
    data: { name },
  })
  return NextResponse.json(stock)
}
