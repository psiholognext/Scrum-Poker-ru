import Database from 'better-sqlite3'
import { randomBytes, scryptSync } from 'crypto'
import { mkdirSync } from 'fs'
import path from 'path'

export type DbUser = {
  id: string
  email: string
  name: string
}

let dbInstance: Database.Database | null = null

function ensureColumn(db: Database.Database, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  const hasColumn = columns.some((entry) => entry.name === column)
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function runMigrations(db: Database.Database) {
  ensureColumn(db, 'users', 'password_hash', 'TEXT')
  ensureColumn(db, 'users', 'password_salt', 'TEXT')
  ensureColumn(db, 'users', 'created_at', 'TEXT')

  const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>
  const hasLegacyPassword = userColumns.some((entry) => entry.name === 'password')

  if (hasLegacyPassword) {
    const legacyUsers = db
      .prepare(
        `SELECT id, password
         FROM users
         WHERE (password_hash IS NULL OR password_hash = '')
           AND password IS NOT NULL
           AND password != ''`,
      )
      .all() as Array<{ id: string; password: string }>

    const updatePassword = db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')
    const migrateLegacyUsers = db.transaction((rows: Array<{ id: string; password: string }>) => {
      for (const row of rows) {
        const salt = randomBytes(16).toString('hex')
        const hash = scryptSync(row.password, salt, 64).toString('hex')
        updatePassword.run(hash, salt, row.id)
      }
    })

    migrateLegacyUsers(legacyUsers)

    db.exec(`
      UPDATE users
      SET
        password_hash = COALESCE(NULLIF(password_hash, ''), 'legacy'),
        password_salt = COALESCE(NULLIF(password_salt, ''), 'legacy'),
        created_at = COALESCE(NULLIF(created_at, ''), datetime('now'))
    `)
  } else {
    db.exec(`
      UPDATE users
      SET
        password_hash = COALESCE(NULLIF(password_hash, ''), 'legacy'),
        password_salt = COALESCE(NULLIF(password_salt, ''), 'legacy'),
        created_at = COALESCE(NULLIF(created_at, ''), datetime('now'))
    `)
  }
}

function createDb() {
  const dataDir = path.join(process.cwd(), '.data')
  mkdirSync(dataDir, { recursive: true })

  const dbPath = path.join(dataDir, 'app.db')
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      is_private INTEGER NOT NULL DEFAULT 0,
      access_code_hash TEXT,
      access_code_salt TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (room_id, user_id),
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_states (
      room_id TEXT PRIMARY KEY,
      participants_json TEXT NOT NULL DEFAULT '[]',
      revealed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
  `)

  runMigrations(db)

  return db
}

export function getDb() {
  if (!dbInstance) {
    dbInstance = createDb()
  }
  return dbInstance
}
