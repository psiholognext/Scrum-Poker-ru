import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { getDb, type DbUser } from './db'

const GUEST_COOKIE = 'guest_id'

function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now()
}

function ensureGuestUser(guestId: string): DbUser {
  const db = getDb()
  const userId = `guest:${guestId}`

  const existing = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId) as DbUser | undefined
  if (existing) {
    return existing
  }

  const email = `guest_${guestId}@local`
  const name = `Guest-${guestId.slice(0, 6)}`

  // Avoid race-condition crashes when multiple requests try to create the same guest at once.
  db.prepare(
    'INSERT OR IGNORE INTO users(id, email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userId, email, name, 'guest', 'guest', new Date().toISOString())

  const afterInsert = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId) as DbUser | undefined
  if (afterInsert) {
    return afterInsert
  }

  // Defensive fallback in case of legacy data inconsistency.
  return { id: userId, email, name }
}

export function getSessionUserByToken(token: string | undefined | null): DbUser | null {
  if (!token) {
    return null
  }

  const db = getDb()
  const sessionRow = db
    .prepare(
      `SELECT s.token, s.expires_at, u.id, u.email, u.name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as
    | {
        token: string
        expires_at: string
        id: string
        email: string
        name: string
      }
    | undefined

  if (!sessionRow) {
    return null
  }

  if (isExpired(sessionRow.expires_at)) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }

  return {
    id: sessionRow.id,
    email: sessionRow.email,
    name: sessionRow.name,
  }
}

export async function getActorForAction(options?: { allowGuest?: boolean }): Promise<DbUser | null> {
  const allowGuest = options?.allowGuest ?? true
  const cookieStore = await cookies()

  const sessionUser = getSessionUserByToken(cookieStore.get('session')?.value)
  if (sessionUser) {
    return sessionUser
  }

  if (!allowGuest) {
    return null
  }

  let guestId = cookieStore.get(GUEST_COOKIE)?.value
  if (!guestId) {
    guestId = randomBytes(8).toString('hex')
    cookieStore.set(GUEST_COOKIE, guestId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })
  }

  return ensureGuestUser(guestId)
}

export function getActorFromRequest(req: NextRequest, options?: { allowGuest?: boolean }): DbUser | null {
  const allowGuest = options?.allowGuest ?? true

  const sessionUser = getSessionUserByToken(req.cookies.get('session')?.value)
  if (sessionUser) {
    return sessionUser
  }

  if (!allowGuest) {
    return null
  }

  const guestId = req.cookies.get(GUEST_COOKIE)?.value
  if (!guestId) {
    return null
  }

  return ensureGuestUser(guestId)
}
