import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')
  const url = ticker
    ? `http://localhost:8000/patterns?ticker=${ticker}`
    : 'http://localhost:8000/patterns'
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const raw: any[] = await res.json()
    // Transform snake_case from Python backend → camelCase for frontend types
    const data = raw.map((p) => ({
      id:                  p.id,
      ticker:              p.ticker,
      patternName:         p.pattern_name,
      totalAppearances:    p.total_appearances,
      totalSuccesses5pct:  p.total_successes_10pct,
      totalSuccesses10pct: p.total_successes_10pct,
      successRate5pct:     p.success_rate_10pct,
      successRate10pct:    p.success_rate_10pct,
      avgGain:             p.avg_gain,
      avgMaxDrawdown:      null,
      isValidated:         p.is_validated,
      signalType:          p.signal_type,
      lastUpdated:         p.last_updated,
      strengthScore:       p.strength_score ?? null,
    }))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
