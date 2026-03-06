'use server'

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { getDb } from '../server/db'
import { getActorForAction } from '../server/session'

const scrypt = promisify(scryptCallback)

type RoomData = {
  id: string
  name: string
  isPrivate: boolean
  createdAt: string
}

type RoomActionErrorType = 'auth' | 'validation' | 'not_found' | 'access_required' | 'invalid_access_code' | 'forbidden'

type RoomActionResult =
  | { success: true; data: RoomData }
  | { success: false; error: string; errorType: RoomActionErrorType }

type RoomHistoryItem = {
  id: string
  name: string
  joinedAt: string
}

type RoomHistoryResult =
  | { success: true; data: RoomHistoryItem[] }
  | { success: false; error: string; errorType: 'auth' | 'server' }

type RemoveHistoryResult =
  | { success: true }
  | { success: false; error: string; errorType: 'auth' | 'server' }

function parseBoolean(value: FormDataEntryValue | boolean | undefined) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false
  return value === 'true' || value === 'on' || value === '1'
}

function extractRoomInput(input: FormData | { name: string; isPrivate?: boolean; accessCode?: string }) {
  if (input instanceof FormData) {
    return {
      name: String(input.get('name') ?? '').trim(),
      isPrivate: parseBoolean(input.get('isPrivate') ?? undefined),
      accessCode: String(input.get('accessCode') ?? '').trim(),
    }
  }

  return {
    name: input.name.trim(),
    isPrivate: Boolean(input.isPrivate),
    accessCode: input.accessCode?.trim() ?? '',
  }
}

async function hashSecret(value: string, salt: string) {
  const derived = (await scrypt(value, salt, 64)) as Buffer
  return derived.toString('hex')
}

function isHex(value: string) {
  return /^[a-f0-9]+$/i.test(value)
}

export async function createRoom(input: FormData | { name: string; isPrivate?: boolean; accessCode?: string }): Promise<RoomActionResult> {
  try {
    const actor = await getActorForAction({ allowGuest: true })
    if (!actor) {
      return { success: false, error: 'Unable to resolve actor', errorType: 'auth' }
    }

    const parsed = extractRoomInput(input)
    if (!parsed.name) {
      return { success: false, error: 'Room name is required', errorType: 'validation' }
    }

    if (parsed.isPrivate && parsed.accessCode.length < 4) {
      return { success: false, error: 'Access code must be at least 4 characters', errorType: 'validation' }
    }

    const db = getDb()
    const code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase()
    const now = new Date().toISOString()

    let accessCodeHash: string | null = null
    let accessCodeSalt: string | null = null

    if (parsed.isPrivate) {
      accessCodeSalt = randomBytes(16).toString('hex')
      accessCodeHash = await hashSecret(parsed.accessCode, accessCodeSalt)
    }

    db.prepare(
      `INSERT INTO rooms(id, name, owner_user_id, is_private, access_code_hash, access_code_salt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(code, parsed.name, actor.id, parsed.isPrivate ? 1 : 0, accessCodeHash, accessCodeSalt, now)

    db.prepare('INSERT INTO room_members(room_id, user_id, joined_at) VALUES (?, ?, ?)').run(code, actor.id, now)

    db.prepare('INSERT OR IGNORE INTO room_states(room_id, participants_json, revealed, updated_at) VALUES (?, ?, ?, ?)').run(
      code,
      '[]',
      0,
      now,
    )

    return {
      success: true,
      data: {
        id: code,
        name: parsed.name,
        isPrivate: parsed.isPrivate,
        createdAt: now,
      },
    }
  } catch (error) {
    console.error('createRoom failed:', error)
    return { success: false, error: 'Failed to create room', errorType: 'forbidden' }
  }
}

export async function joinRoom(code: string, accessCode?: string): Promise<RoomActionResult> {
  try {
    const actor = await getActorForAction({ allowGuest: true })
    if (!actor) {
      return { success: false, error: 'Unable to resolve actor', errorType: 'auth' }
    }

    const db = getDb()
    const normalizedCode = code.trim().toUpperCase()

    const room = db
      .prepare(
        `SELECT id, name, is_private, access_code_hash, access_code_salt, created_at
         FROM rooms
         WHERE id = ?`,
      )
      .get(normalizedCode) as
      | {
          id: string
          name: string
          is_private: number
          access_code_hash: string | null
          access_code_salt: string | null
          created_at: string
        }
      | undefined

    if (!room) {
      return { success: false, error: 'Room not found', errorType: 'not_found' }
    }

    if (room.is_private) {
      const existingMembership = db
        .prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?')
        .get(room.id, actor.id) as { 1: number } | undefined

      const cleanCode = accessCode?.trim() ?? ''
      if (!existingMembership && !cleanCode) {
        return { success: false, error: 'Access code required', errorType: 'access_required' }
      }

      if (existingMembership) {
        const now = new Date().toISOString()
        db.prepare('INSERT OR IGNORE INTO room_states(room_id, participants_json, revealed, updated_at) VALUES (?, ?, ?, ?)').run(
          room.id,
          '[]',
          0,
          now,
        )

        return {
          success: true,
          data: {
            id: room.id,
            name: room.name,
            isPrivate: room.is_private === 1,
            createdAt: room.created_at,
          },
        }
      }

      if (!room.access_code_hash || !room.access_code_salt) {
        return { success: false, error: 'Room configuration error', errorType: 'forbidden' }
      }

      const attemptedHash = await hashSecret(cleanCode, room.access_code_salt)
      const validHashFormat = isHex(room.access_code_hash) && room.access_code_hash.length === attemptedHash.length
      if (!validHashFormat) {
        return { success: false, error: 'Invalid access code', errorType: 'invalid_access_code' }
      }

      const valid = timingSafeEqual(Buffer.from(attemptedHash, 'hex'), Buffer.from(room.access_code_hash, 'hex'))
      if (!valid) {
        return { success: false, error: 'Invalid access code', errorType: 'invalid_access_code' }
      }
    }

    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO room_members(room_id, user_id, joined_at) VALUES (?, ?, ?)').run(
      room.id,
      actor.id,
      now,
    )

    db.prepare('INSERT OR IGNORE INTO room_states(room_id, participants_json, revealed, updated_at) VALUES (?, ?, ?, ?)').run(
      room.id,
      '[]',
      0,
      now,
    )

    return {
      success: true,
      data: {
        id: room.id,
        name: room.name,
        isPrivate: room.is_private === 1,
        createdAt: room.created_at,
      },
    }
  } catch (error) {
    console.error('joinRoom failed:', error)
    return { success: false, error: 'Failed to join room', errorType: 'forbidden' }
  }
}

export async function getRoom(id: string): Promise<RoomActionResult> {
  const actor = await getActorForAction({ allowGuest: true })
  if (!actor) {
    return { success: false, error: 'Unable to resolve actor', errorType: 'auth' }
  }

  const db = getDb()
  const normalizedCode = id.trim().toUpperCase()

  const room = db
    .prepare(
      `SELECT r.id, r.name, r.is_private, r.created_at,
              EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = ?) AS is_member
       FROM rooms r
       WHERE r.id = ?`,
    )
    .get(actor.id, normalizedCode) as
    | {
        id: string
        name: string
        is_private: number
        created_at: string
        is_member: number
      }
    | undefined

  if (!room) {
    return { success: false, error: 'Room not found', errorType: 'not_found' }
  }

  if (!room.is_member) {
    return { success: false, error: 'Forbidden', errorType: 'forbidden' }
  }

  return {
    success: true,
    data: {
      id: room.id,
      name: room.name,
      isPrivate: room.is_private === 1,
      createdAt: room.created_at,
    },
  }
}

export async function getPublicRoomHistory(limit = 20): Promise<RoomHistoryResult> {
  try {
    const actor = await getActorForAction({ allowGuest: false })
    if (!actor) {
      return { success: false, error: 'Unauthorized', errorType: 'auth' }
    }

    const db = getDb()
    const rows = db
      .prepare(
        `SELECT r.id, r.name, MAX(rm.joined_at) AS joined_at
         FROM room_members rm
         JOIN rooms r ON r.id = rm.room_id
         WHERE rm.user_id = ?
           AND r.is_private = 0
         GROUP BY r.id, r.name
         ORDER BY joined_at DESC
         LIMIT ?`,
      )
      .all(actor.id, Math.max(1, Math.min(limit, 100))) as Array<{ id: string; name: string; joined_at: string }>

    return {
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        joinedAt: row.joined_at,
      })),
    }
  } catch (error) {
    console.error('getPublicRoomHistory failed:', error)
    return { success: false, error: 'Failed to load room history', errorType: 'server' }
  }
}

export async function removeRoomFromHistory(roomId: string): Promise<RemoveHistoryResult> {
  try {
    const actor = await getActorForAction({ allowGuest: false })
    if (!actor) {
      return { success: false, error: 'Unauthorized', errorType: 'auth' }
    }

    const db = getDb()
    const normalizedRoomId = roomId.trim().toUpperCase()
    db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(normalizedRoomId, actor.id)

    return { success: true }
  } catch (error) {
    console.error('removeRoomFromHistory failed:', error)
    return { success: false, error: 'Failed to remove room from history', errorType: 'server' }
  }
}
