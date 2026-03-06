import { promises as fs } from "fs"
import path from "path"

export type StoredUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
}

export type StoredSession = {
  token: string
  userId: string
  expiresAt: string
}

export type StoredRoomMeta = {
  id: string
  name: string
  createdAt: string
}

export type StoredParticipant = {
  id: string
  name: string
  vote: string | null
  seatIndex: number | null
}

export type StoredRoomState = {
  participants: StoredParticipant[]
  revealed: boolean
}

type AppState = {
  usersByEmail: Record<string, StoredUser>
  sessionsByToken: Record<string, StoredSession>
  roomsById: Record<string, StoredRoomMeta>
  roomStatesById: Record<string, StoredRoomState>
}

const defaultState: AppState = {
  usersByEmail: {},
  sessionsByToken: {},
  roomsById: {},
  roomStatesById: {},
}

const stateFile = path.join(process.cwd(), ".data", "app-state.json")
let inMemoryState: AppState | null = null
let pendingWrite: Promise<void> = Promise.resolve()

async function ensureStateFile() {
  await fs.mkdir(path.dirname(stateFile), { recursive: true })
  try {
    await fs.access(stateFile)
  } catch {
    await fs.writeFile(stateFile, JSON.stringify(defaultState, null, 2), "utf-8")
  }
}

async function loadState(): Promise<AppState> {
  if (inMemoryState) {
    return inMemoryState
  }

  await ensureStateFile()
  const raw = await fs.readFile(stateFile, "utf-8")
  const parsed = JSON.parse(raw) as Partial<AppState>
  inMemoryState = {
    usersByEmail: parsed.usersByEmail ?? {},
    sessionsByToken: parsed.sessionsByToken ?? {},
    roomsById: parsed.roomsById ?? {},
    roomStatesById: parsed.roomStatesById ?? {},
  }
  return inMemoryState
}

async function writeState(state: AppState) {
  pendingWrite = pendingWrite.then(async () => {
    await ensureStateFile()
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf-8")
  })
  await pendingWrite
}

export async function readAppState() {
  return loadState()
}

export async function mutateAppState(
  mutator: (state: AppState) => void | AppState,
): Promise<AppState> {
  const state = await loadState()
  const maybeNext = mutator(state)
  const next = maybeNext ?? state
  inMemoryState = next
  await writeState(next)
  return next
}
