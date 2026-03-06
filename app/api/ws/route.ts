import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    {
      error: 'WebSocket endpoint is disabled. Use /api/room/[id]/events (SSE).',
    },
    { status: 410 },
  )
}
