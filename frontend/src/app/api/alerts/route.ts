import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const outcome = req.nextUrl.searchParams.get('outcome') // 'pending' | 'success' | 'fail' | 'all'

  const where = outcome && outcome !== 'all'
    ? { outcome }
    : outcome === 'all'
    ? {}  // no filter — return everything
    : { outcome: 'pending' }  // default

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { detectedAt: 'desc' },
    take: 200,
  })

  const data = alerts.map((a) => ({
    id: a.id,
    ticker: a.ticker,
    patternName: a.patternName,
    signalType: a.signalType,
    category: a.category,
    detectedAt: a.detectedAt.toISOString(),
    priceAtAlert: a.priceAtAlert ? Number(a.priceAtAlert) : null,
    rsiValue: a.rsiValue ? Number(a.rsiValue) : null,
    ma150Value: a.ma150Value ? Number(a.ma150Value) : null,
    successRate: a.successRate ? Number(a.successRate) : null,
    occurrences: a.occurrences,
    outcome: a.outcome,
    actualGain: a.actualGain ? Number(a.actualGain) : null,
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
    highRisk: a.highRisk,
    volumeRatio: a.volumeRatio ? Number(a.volumeRatio) : null,
    stopLoss: a.stopLoss ? Number(a.stopLoss) : null,
    takeProfit: a.takeProfit ? Number(a.takeProfit) : null,
    takeProfit2: a.takeProfit2 ? Number(a.takeProfit2) : null,
    rrRatio:          a.rrRatio    ? Number(a.rrRatio)    : null,
    rsVsSpy:          (a as any).rsVsSpy          ? Number((a as any).rsVsSpy)          : null,
    earningsImminent: (a as any).earningsImminent ?? false,
    earningsDate:     (a as any).earningsDate ? String((a as any).earningsDate).slice(0, 10) : null,
  }))

  return NextResponse.json(data)
}
