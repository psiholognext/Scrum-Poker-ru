'use server'

import { cookies } from 'next/headers'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { z } from 'zod'
import { userSchema } from '../db/schema'
import { getDb } from '../server/db'
import { getSessionUserByToken } from '../server/session'

const scrypt = promisify(scryptCallback)
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const GUEST_COOKIE = 'guest_id'

const registerSchema = userSchema.pick({
  email: true,
  password: true,
  name: true,
})

const loginSchema = userSchema.pick({
  email: true,
  password: true,
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6),
})
const updateProfileNameSchema = z.object({
  name: z.string().trim().min(2).max(30),
})

type AuthActionResult =
  | { success: true }
  | { success: false; error: string; errorType: 'validation' | 'auth' | 'conflict' | 'server' }

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = (await scrypt(password, salt, 64)) as Buffer
  return derived.toString('hex')
}

async function createSession(userId: string) {
  const db = getDb()
  const token = randomBytes(32).toString('hex')
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()

  db.prepare('INSERT INTO sessions(token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    expiresAt,
    now,
  )

  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  })
}

async function migrateGuestDataToUser(userId: string) {
  const cookieStore = await cookies()
  const guestId = cookieStore.get(GUEST_COOKIE)?.value
  if (!guestId) {
    return
  }

  const guestUserId = `guest:${guestId}`
  if (guestUserId === userId) {
    return
  }

  const db = getDb()
  const guestMemberships = db
    .prepare('SELECT room_id, joined_at FROM room_members WHERE user_id = ?')
    .all(guestUserId) as Array<{ room_id: string; joined_at: string }>

  const tx = db.transaction(() => {
    db.prepare('UPDATE rooms SET owner_user_id = ? WHERE owner_user_id = ?').run(userId, guestUserId)

    const insertMembership = db.prepare('INSERT OR IGNORE INTO room_members(room_id, user_id, joined_at) VALUES (?, ?, ?)')
    for (const membership of guestMemberships) {
      insertMembership.run(membership.room_id, userId, membership.joined_at)
    }

    db.prepare('DELETE FROM room_members WHERE user_id = ?').run(guestUserId)
  })

  tx()
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  return getSessionUserByToken(cookieStore.get('session')?.value)
}

export async function register(data: z.infer<typeof registerSchema>): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Invalid registration data', errorType: 'validation' }
  }

  try {
    const db = getDb()
    const email = parsed.data.email.trim().toLowerCase()
    const name = parsed.data.name.trim()
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined
    if (existingUser) {
      return { success: false, error: 'Email already registered', errorType: 'conflict' }
    }

    const userId = randomBytes(16).toString('hex')
    const salt = randomBytes(16).toString('hex')
    const passwordHash = await hashPassword(parsed.data.password, salt)

    db.prepare(
      'INSERT INTO users(id, email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(userId, email, name, passwordHash, salt, new Date().toISOString())

    await createSession(userId)
    await migrateGuestDataToUser(userId)
    return { success: true }
  } catch (error) {
    console.error('Register failed:', error)
    return { success: false, error: 'Registration failed', errorType: 'server' }
  }
}

export async function login(data: z.infer<typeof loginSchema>): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Invalid credentials', errorType: 'validation' }
  }

  try {
    const db = getDb()
    const email = parsed.data.email.trim().toLowerCase()

    const user = db
      .prepare('SELECT id, password_hash, password_salt FROM users WHERE email = ?')
      .get(email) as
      | {
          id: string
          password_hash: string
          password_salt: string
        }
      | undefined

    if (!user || !user.password_hash || !user.password_salt) {
      return { success: false, error: 'Invalid credentials', errorType: 'auth' }
    }

    const attemptedHash = await hashPassword(parsed.data.password, user.password_salt)
    const sameLength = attemptedHash.length === user.password_hash.length
    const validHex = /^[a-f0-9]+$/i.test(user.password_hash)
    const valid =
      sameLength &&
      validHex &&
      timingSafeEqual(Buffer.from(attemptedHash, 'hex'), Buffer.from(user.password_hash, 'hex'))

    if (!valid) {
      return { success: false, error: 'Invalid credentials', errorType: 'auth' }
    }

    await createSession(user.id)
    await migrateGuestDataToUser(user.id)
    return { success: true }
  } catch (error) {
    console.error('Login failed:', error)
    return { success: false, error: 'Login failed', errorType: 'server' }
  }
}

export async function logout() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  const db = getDb()

  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  }

  cookieStore.delete('session')
  return { success: true }
}

export async function changePassword(data: z.infer<typeof changePasswordSchema>): Promise<AuthActionResult> {
  const parsed = changePasswordSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Invalid password data', errorType: 'validation' }
  }

  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session')?.value
    const currentUser = getSessionUserByToken(token)
    if (!currentUser) {
      return { success: false, error: 'Unauthorized', errorType: 'auth' }
    }

    const db = getDb()
    const row = db
      .prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
      .get(currentUser.id) as { password_hash: string; password_salt: string } | undefined

    if (!row || !row.password_hash || !row.password_salt) {
      return { success: false, error: 'Invalid credentials', errorType: 'auth' }
    }

    const attemptedHash = await hashPassword(parsed.data.currentPassword, row.password_salt)
    const sameLength = attemptedHash.length === row.password_hash.length
    const validHex = /^[a-f0-9]+$/i.test(row.password_hash)
    const valid =
      sameLength &&
      validHex &&
      timingSafeEqual(Buffer.from(attemptedHash, 'hex'), Buffer.from(row.password_hash, 'hex'))

    if (!valid) {
      return { success: false, error: 'Current password is incorrect', errorType: 'auth' }
    }

    const newSalt = randomBytes(16).toString('hex')
    const newHash = await hashPassword(parsed.data.newPassword, newSalt)

    db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(newHash, newSalt, currentUser.id)
    return { success: true }
  } catch (error) {
    console.error('Change password failed:', error)
    return { success: false, error: 'Failed to change password', errorType: 'server' }
  }
}

export async function updateProfileName(data: z.infer<typeof updateProfileNameSchema>): Promise<AuthActionResult> {
  const parsed = updateProfileNameSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: 'Invalid name', errorType: 'validation' }
  }

  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('session')?.value
    const currentUser = getSessionUserByToken(token)
    if (!currentUser) {
      return { success: false, error: 'Unauthorized', errorType: 'auth' }
    }

    const db = getDb()
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(parsed.data.name, currentUser.id)
    return { success: true }
  } catch (error) {
    console.error('Update profile name failed:', error)
    return { success: false, error: 'Failed to update profile name', errorType: 'server' }
  }
}
