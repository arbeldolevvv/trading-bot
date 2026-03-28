import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('http://localhost:8000/paper-portfolio', { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ cash: 0, positions: [], totalValue: 0, totalGainPct: 0, totalGainUsd: 0 })
  }
}
