import { z } from "zod"

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  password: z.string().min(6),
})

export const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  code: z.string(),
  createdAt: z.date(),
})

export const participantSchema = z.object({
  id: z.string(),
  userId: z.string(),
  roomId: z.string(),
  vote: z.string().nullable(),
})

export type User = z.infer<typeof userSchema>
export type Room = z.infer<typeof roomSchema>
export type Participant = z.infer<typeof participantSchema>
