"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"

interface Participant {
  id: string
  name: string
  vote: string | null
  seatIndex: number | null
}

interface RoomState {
  participants: Participant[]
  revealed: boolean
}

export interface ThrowEvent {
  id: string
  senderId: string
  targetId: string
  objectType: "paper-ball" | "snowball" | "paper-plane" | "dice"
  senderRect?: DOMRectReadOnly
  targetRect?: DOMRectReadOnly
}
const MAX_ACTIVE_THROWS = 14

type RoomEvent =
  | { type: "connected"; userId: string }
  | { type: "syncState"; state: RoomState }
  | { type: "join"; userId: string; username: string; seatIndex?: number | null }
  | { type: "leave"; userId: string; permanent?: boolean }
  | { type: "vote"; userId: string; vote: string | null }
  | { type: "reveal"; userId: string; revealed: boolean }
  | { type: "reset"; userId: string }
  | { type: "moveToObservers"; userId: string }
  | { type: "changeName"; userId: string; username: string; seatIndex?: number | null }
  | {
      type: "throwObject"
      userId: string
      targetId: string
      objectType: ThrowEvent["objectType"]
      timestamp?: number
    }

export function useRoom(roomId: string, userId: string, username: string, enabled = true) {
  const [state, setState] = useState<RoomState>({
    participants: [],
    revealed: false,
  })
  const [activeThrows, setActiveThrows] = useState<ThrowEvent[]>([])

  const hasJoined = useRef(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  const sendEvent = useCallback(
    async (event: Record<string, unknown>) => {
      if (!enabled || !username) return

      try {
        await fetch(`/api/room/${roomId}/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...event,
            userId,
            timestamp: Date.now(),
          }),
        })
      } catch (error) {
        console.error("Failed to send event:", error)
      }
    },
    [roomId, userId, username, enabled],
  )

  const derivedState = useMemo(() => {
    const observers = state.participants.filter((participant) => participant.seatIndex === null)
    const seatedParticipants = state.participants.filter((participant) => participant.seatIndex !== null)
    const currentParticipant = state.participants.find((participant) => participant.id === userId)
    const hasVotes = state.participants.some((participant) => participant.vote !== null)

    return {
      observers,
      seatedParticipants,
      currentParticipant,
      hasVotes,
    }
  }, [state.participants, userId])

  useEffect(() => {
    if (!enabled || !username || hasJoined.current) return

    const wasObserver = localStorage.getItem(`observer-${roomId}-${userId}`) === "true"
    const savedSeatIndex = localStorage.getItem(`seat-${roomId}-${userId}`)

    const seatIndex = !wasObserver && savedSeatIndex !== null ? Number.parseInt(savedSeatIndex, 10) : null

    hasJoined.current = true

    sendEvent({
      type: "join",
      username,
      seatIndex,
    })

    const handleBeforeUnload = () => {
      sendEvent({
        type: "leave",
        permanent: true,
      })
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      if (!document.hidden) {
        handleBeforeUnload()
      }
    }
  }, [roomId, userId, username, sendEvent, enabled])

  useEffect(() => {
    if (!enabled || !username) return

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const connectEventSource = () => {
      const eventSource = new EventSource(`/api/room/${roomId}/events?userId=${userId}`)
      eventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data) as RoomEvent

        if (data.type === "throwObject") {
          setActiveThrows((prev) => {
            const next = [
              ...prev,
              {
                id: `${data.timestamp ?? Date.now()}-${data.userId}-${data.targetId}-${data.objectType}`,
                senderId: data.userId,
                targetId: data.targetId,
                objectType: data.objectType,
              },
            ]
            return next.slice(-MAX_ACTIVE_THROWS)
          })
          return
        }

        setState((prev) => {
          switch (data.type) {
            case "connected":
              return prev

            case "syncState": {
              const localParticipant = prev.participants.find((participant) => participant.id === userId)
              const wasObserver = localStorage.getItem(`observer-${roomId}-${userId}`) === "true"

              const newParticipants = data.state.participants.map((participant) => {
                if (participant.id === userId && localParticipant) {
                  return {
                    ...participant,
                    name: username,
                    seatIndex: wasObserver ? null : (localParticipant.seatIndex ?? participant.seatIndex),
                  }
                }
                return participant
              })

              return {
                ...data.state,
                participants: newParticipants,
              }
            }

            case "join": {
              const existingParticipant = prev.participants.find((participant) => participant.id === data.userId)
              if (existingParticipant) {
                return {
                  ...prev,
                  participants: prev.participants.map((participant) =>
                    participant.id === data.userId
                      ? {
                          ...participant,
                          name: data.username,
                          seatIndex: data.seatIndex !== undefined ? data.seatIndex : participant.seatIndex,
                        }
                      : participant,
                  ),
                }
              }

              return {
                ...prev,
                participants: [
                  ...prev.participants,
                  {
                    id: data.userId,
                    name: data.username,
                    vote: null,
                    seatIndex: data.seatIndex ?? null,
                  },
                ],
              }
            }

            case "leave":
              if (data.permanent) {
                return {
                  ...prev,
                  participants: prev.participants.filter((participant) => participant.id !== data.userId),
                }
              }
              return prev

            case "vote":
              return {
                ...prev,
                participants: prev.participants.map((participant) =>
                  participant.id === data.userId ? { ...participant, vote: data.vote } : participant,
                ),
              }

            case "reveal":
              return {
                ...prev,
                revealed: data.revealed,
              }

            case "reset":
              return {
                ...prev,
                revealed: false,
                participants: prev.participants.map((participant) => ({ ...participant, vote: null })),
              }

            case "moveToObservers":
              return {
                ...prev,
                participants: prev.participants.map((participant) =>
                  participant.id === data.userId ? { ...participant, seatIndex: null } : participant,
                ),
              }

            case "changeName":
              return {
                ...prev,
                participants: prev.participants.map((participant) =>
                  participant.id === data.userId
                    ? {
                        ...participant,
                        name: data.username,
                        seatIndex: data.seatIndex !== undefined ? data.seatIndex : participant.seatIndex,
                      }
                    : participant,
                ),
              }

            default:
              return prev
          }
        })
      }

      eventSource.onerror = () => {
        eventSource.close()
        reconnectTimeoutRef.current = setTimeout(connectEventSource, 3000)
      }
    }

    connectEventSource()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [roomId, userId, username, enabled])

  const actions = useMemo(
    () => ({
      vote: (value: string) => {
        setState((prev) => ({
          ...prev,
          participants: prev.participants.map((participant) =>
            participant.id === userId ? { ...participant, vote: value } : participant,
          ),
        }))
        sendEvent({ type: "vote", vote: value })
      },

      reveal: () => {
        setState((prev) => ({ ...prev, revealed: true }))
        sendEvent({ type: "reveal", revealed: true })
      },

      reset: () => {
        setState((prev) => ({
          ...prev,
          revealed: false,
          participants: prev.participants.map((participant) => ({ ...participant, vote: null })),
        }))
        sendEvent({ type: "reset" })
      },

      join: (seatIndex: number) => {
        localStorage.removeItem(`observer-${roomId}-${userId}`)
        localStorage.setItem(`seat-${roomId}-${userId}`, seatIndex.toString())

        setState((prev) => {
          const participant = prev.participants.find((item) => item.id === userId)
          return {
            ...prev,
            participants: participant
              ? prev.participants.map((item) => (item.id === userId ? { ...item, seatIndex } : item))
              : [
                  ...prev.participants,
                  {
                    id: userId,
                    name: username,
                    vote: null,
                    seatIndex,
                  },
                ],
          }
        })

        sendEvent({
          type: "join",
          username,
          seatIndex,
        })
      },

      moveToObservers: () => {
        localStorage.setItem(`observer-${roomId}-${userId}`, "true")
        localStorage.removeItem(`seat-${roomId}-${userId}`)

        setState((prev) => ({
          ...prev,
          participants: prev.participants.map((participant) =>
            participant.id === userId ? { ...participant, seatIndex: null } : participant,
          ),
        }))
        sendEvent({ type: "moveToObservers" })
      },

      changeName: (newName: string) => {
        const currentParticipant = derivedState.currentParticipant
        setState((prev) => ({
          ...prev,
          participants: prev.participants.map((participant) =>
            participant.id === userId
              ? {
                  ...participant,
                  name: newName,
                  seatIndex: currentParticipant?.seatIndex ?? null,
                }
              : participant,
          ),
        }))
        sendEvent({
          type: "changeName",
          username: newName,
          seatIndex: currentParticipant?.seatIndex ?? null,
        })
      },

      throwObject: (targetId: string, objectType: ThrowEvent["objectType"]) => {
        sendEvent({ type: "throwObject", targetId, objectType })
      },
    }),
    [userId, sendEvent, roomId, username, derivedState.currentParticipant],
  )

  return {
    ...derivedState,
    participants: state.participants,
    revealed: state.revealed,
    activeThrows,
    setActiveThrows,
    ...actions,
  }
}


