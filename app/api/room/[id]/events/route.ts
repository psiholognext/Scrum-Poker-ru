import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { getDb } from '@/lib/server/db'
import { getActorFromRequest } from '@/lib/server/session'

type StoredParticipant = {
  id: string
  name: string
  vote: string | null
  seatIndex: number | null
}

type RoomState = {
  participants: StoredParticipant[]
  revealed: boolean
}

type ConnectionEntry = {
  userId: string
  controller: ReadableStreamDefaultController<Uint8Array>
}

type RoomConnection = {
  controllers: Map<string, ConnectionEntry>
}

const activeConnections = new Map<string, RoomConnection>()

const seatSchema = z.number().int().min(0).max(63).nullable().optional()

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    userId: z.string().min(1),
    username: z.string().trim().min(1).max(30),
    seatIndex: seatSchema,
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal('leave'),
    userId: z.string().min(1),
    permanent: z.boolean().optional(),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal('vote'),
    userId: z.string().min(1),
    vote: z.string().min(1).max(4).nullable(),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal('reveal'),
    userId: z.string().min(1),
    revealed: z.boolean(),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal('reset'),
    userId: z.string().min(1),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal('moveToObservers'),
    userId: z.string().min(1),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal('requestState'),
    userId: z.string().min(1),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal('changeName'),
    userId: z.string().min(1),
    username: z.string().trim().min(1).max(30),
    seatIndex: seatSchema,
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal('throwObject'),
    userId: z.string().min(1),
    targetId: z.string().min(1),
    objectType: z.enum(['paper-ball', 'snowball', 'paper-plane', 'dice']),
    timestamp: z.number().optional(),
  }),
])

function isAllowedOrigin(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (!origin) {
    return true
  }

  const allowedOrigins = new Set<string>([req.nextUrl.origin, process.env.APP_ORIGIN ?? ''])
  return allowedOrigins.has(origin)
}

function getOrCreateConnection(roomId: string): RoomConnection {
  const existing = activeConnections.get(roomId)
  if (existing) {
    return existing
  }

  const created: RoomConnection = { controllers: new Map() }
  activeConnections.set(roomId, created)
  return created
}

function encodeSSE(payload: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcast(roomId: string, payload: unknown, options?: { excludeUserId?: string }) {
  const room = activeConnections.get(roomId)
  if (!room) {
    return
  }

  const encoded = encodeSSE(payload)
  room.controllers.forEach((entry, connectionId) => {
    if (options?.excludeUserId && options.excludeUserId === entry.userId) {
      return
    }

    try {
      entry.controller.enqueue(encoded)
    } catch {
      room.controllers.delete(connectionId)
    }
  })

  if (room.controllers.size === 0) {
    activeConnections.delete(roomId)
  }
}

function upsertParticipant(
  participants: StoredParticipant[],
  userId: string,
  updater: (current?: StoredParticipant) => StoredParticipant,
) {
  const index = participants.findIndex((participant) => participant.id === userId)
  if (index >= 0) {
    participants[index] = updater(participants[index])
  } else {
    participants.push(updater(undefined))
  }
}

function parseRoomState(rawState: string | undefined, revealed: number | undefined): RoomState {
  let participants: StoredParticipant[] = []
  if (rawState) {
    try {
      participants = JSON.parse(rawState) as StoredParticipant[]
    } catch {
      participants = []
    }
  }

  return {
    participants,
    revealed: Boolean(revealed),
  }
}

function loadRoomState(roomId: string): RoomState {
  const db = getDb()
  const roomStateRow = db
    .prepare('SELECT participants_json, revealed FROM room_states WHERE room_id = ?')
    .get(roomId) as { participants_json: string; revealed: number } | undefined

  if (!roomStateRow) {
    return { participants: [], revealed: false }
  }

  return parseRoomState(roomStateRow.participants_json, roomStateRow.revealed)
}

function saveRoomState(roomId: string, roomState: RoomState) {
  const db = getDb()
  db.prepare(
    `INSERT INTO room_states(room_id, participants_json, revealed, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(room_id)
     DO UPDATE SET participants_json = excluded.participants_json,
                   revealed = excluded.revealed,
                   updated_at = excluded.updated_at`,
  ).run(roomId, JSON.stringify(roomState.participants), roomState.revealed ? 1 : 0, new Date().toISOString())
}

function canAccessRoom(roomId: string, userId: string) {
  const db = getDb()
  const member = db
    .prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?')
    .get(roomId, userId) as { 1: number } | undefined
  return Boolean(member)
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = getActorFromRequest(req, { allowGuest: true })
  if (!actor) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { id } = await context.params
  const roomId = id.toUpperCase()
  const userId = req.nextUrl.searchParams.get('userId')

  if (!userId) {
    return new NextResponse('Missing userId', { status: 400 })
  }

  if (!canAccessRoom(roomId, actor.id)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const initialState = loadRoomState(roomId)
  const roomConnection = getOrCreateConnection(roomId)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const connectionId = randomBytes(12).toString('hex')
      roomConnection.controllers.set(connectionId, { userId, controller })
      controller.enqueue(
        encodeSSE({
          type: 'syncState',
          state: initialState,
        }),
      )

      broadcast(
        roomId,
        {
          type: 'connected',
          userId,
          timestamp: Date.now(),
        },
        { excludeUserId: userId },
      )

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
          roomConnection.controllers.delete(connectionId)
        }
      }, 30000)

      const cleanup = () => {
        clearInterval(heartbeat)
        roomConnection.controllers.delete(connectionId)
        if (roomConnection.controllers.size === 0) {
          activeConnections.delete(roomId)
        }
      }

      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
    },
  })
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(req)) {
    return new NextResponse('Forbidden origin', { status: 403 })
  }

  const actor = getActorFromRequest(req, { allowGuest: true })
  if (!actor) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { id } = await context.params
  const roomId = id.toUpperCase()

  if (!canAccessRoom(roomId, actor.id)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const parseResult = eventSchema.safeParse(await req.json())
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Invalid event payload', details: parseResult.error.issues },
      { status: 400 },
    )
  }

  const event = parseResult.data

  if (event.type === 'throwObject') {
    broadcast(roomId, event)
    return new NextResponse('OK')
  }

  const roomState = loadRoomState(roomId)

  switch (event.type) {
    case 'join': {
      upsertParticipant(roomState.participants, event.userId, (current) => ({
        id: event.userId,
        name: event.username,
        vote: current?.vote ?? null,
        seatIndex: event.seatIndex ?? current?.seatIndex ?? null,
      }))
      break
    }

    case 'moveToObservers': {
      upsertParticipant(roomState.participants, event.userId, (current) => ({
        id: event.userId,
        name: current?.name ?? 'Unknown',
        vote: null,
        seatIndex: null,
      }))
      break
    }

    case 'leave': {
      if (event.permanent) {
        roomState.participants = roomState.participants.filter((participant) => participant.id !== event.userId)
      }
      break
    }

    case 'vote': {
      upsertParticipant(roomState.participants, event.userId, (current) => ({
        id: event.userId,
        name: current?.name ?? 'Unknown',
        vote: event.vote,
        seatIndex: current?.seatIndex ?? null,
      }))
      break
    }

    case 'reveal': {
      roomState.revealed = event.revealed
      break
    }

    case 'reset': {
      roomState.revealed = false
      roomState.participants = roomState.participants.map((participant) => ({
        ...participant,
        vote: null,
      }))
      break
    }

    case 'changeName': {
      upsertParticipant(roomState.participants, event.userId, (current) => ({
        id: event.userId,
        name: event.username,
        vote: current?.vote ?? null,
        seatIndex: event.seatIndex ?? current?.seatIndex ?? null,
      }))
      break
    }

    case 'requestState':
      break
  }

  if (event.type === 'requestState') {
    const roomConnection = activeConnections.get(roomId)
    if (roomConnection) {
      roomConnection.controllers.forEach((entry, connectionId) => {
        if (entry.userId !== event.userId) {
          return
        }

        try {
          entry.controller.enqueue(
            encodeSSE({
              type: 'syncState',
              state: roomState,
            }),
          )
        } catch {
          roomConnection.controllers.delete(connectionId)
        }
      })
      if (roomConnection.controllers.size === 0) {
        activeConnections.delete(roomId)
      }
    }

    return new NextResponse('OK')
  }

  saveRoomState(roomId, roomState)

  broadcast(roomId, event)
  return new NextResponse('OK')
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 405 })
}

