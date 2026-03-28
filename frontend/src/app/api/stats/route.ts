import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const [totalStocks, validatedPatterns, activeAlerts, rateResult] =
    await Promise.all([
      prisma.watchlist.count(),
      prisma.validatedPattern.count({ where: { isValidated: true } }),
      prisma.alert.count({ where: { outcome: 'pending' } }),
      prisma.validatedPattern.aggregate({
        where: { isValidated: true },
        _avg: { successRate10pct: true },
      }),
    ])

  return NextResponse.json({
    totalStocks,
    validatedPatterns,
    activeAlerts,
    avgSuccessRate: rateResult._avg.successRate10pct
      ? Number(rateResult._avg.successRate10pct)
      : null,
  })
}
