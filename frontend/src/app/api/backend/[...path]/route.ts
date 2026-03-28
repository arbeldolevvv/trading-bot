/**
 * Catch-all proxy: forwards /api/backend/** → Python FastAPI on port 8000
 * This keeps the Python port off the browser and avoids CORS issues.
 */
import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000'

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/')
  const url = `${BACKEND}/${path}${req.nextUrl.search}`

  const body =
    req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined

  try {
    const res = await fetch(url, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { error: 'Backend unavailable — is the Python server running?' },
      { status: 503 }
    )
  }
}

export const GET = proxy
export const POST = proxy
export const DELETE = proxy
export const PATCH = proxy
