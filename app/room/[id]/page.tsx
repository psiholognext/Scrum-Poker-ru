"use client"

import React from "react"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Eye, Share2, Globe, Plus, RefreshCcw, Menu, Pencil, Users } from 'lucide-react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/lib/contexts/language-context"
import type { TranslationKey } from "@/lib/i18n/translations"
import { calculateStatisticsMemo } from "@/lib/utils/statistics"
import { useRoom } from "@/lib/hooks/useRoom"
import { JoinDialog } from "@/components/join-dialog"
import { joinRoom, getPublicRoomHistory, removeRoomFromHistory } from "@/lib/actions/rooms"
import { changePassword, getCurrentUser, updateProfileName } from "@/lib/actions/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QRCode } from "@/components/qr-code"
import { ThrowableObject } from "@/components/throwable-object" // Import new component

// Define type for the throwable object
type ThrowableObjectType = 'paper-ball' | 'snowball' | 'paper-plane' | 'dice';
const MAX_ACTIVE_THROWS = 14
const THROW_COOLDOWN_MS = 90
type CurrentUser = {
  id: string
  email: string
  name: string
}

type HistoryItem = {
  id: string
  name: string
  joinedAt: string
}

// Memoized components for better performance
const MemoizedCard = React.forwardRef(
  ({
    participant,
    revealed,
    userId,
    onEditVote,
    t,
    angle,
    radius,
    onThrowIconClick, // New prop
    isCurrentUserSeated, // New prop
  }: {
    participant: any
    revealed: boolean
    userId: string
    onEditVote: () => void
    t: (key: TranslationKey) => string
    angle: number
    radius: number
    onThrowIconClick: (targetId: string, objectType: ThrowableObjectType) => void
    isCurrentUserSeated: boolean
  }, ref: React.Ref<HTMLDivElement>) => {
    const left = 50 + radius * Math.cos(angle)
    const top = 50 + radius * Math.sin(angle)

    return (
      <div
        ref={ref} // Attach ref here
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
        style={{
          left: `${left}%`,
          top: `${top}%`,
        }}
      >
        <div className="flex flex-col items-center gap-1 sm:gap-2">
          <div
            className={`w-14 h-20 sm:w-20 sm:h-28 transition-all duration-300 relative z-0 hover:z-10 group hover:scale-[1.015] hover:brightness-105 rounded-lg border-2 flex items-center justify-center
            ${revealed ? "rotate-0" : "rotate-180"}
            ${
              participant.vote
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-lg shadow-emerald-500/20"
                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            }
            ${participant.vote && !revealed ? "border-emerald-400 animate-pulse-slow" : ""}
          `}
          >
            {/* Vote indicator dot */}
            {participant.vote && !revealed && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse-slow shadow-lg shadow-emerald-500/50" />
            )}

            <span
              className={`text-lg sm:text-3xl font-bold transition-all duration-500 font-inter ${
                revealed ? "scale-100 opacity-100" : "scale-75 opacity-80"
              } ${participant.vote ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}
            >
              {revealed ? participant.vote || "?" : "🎯"}
            </span>

            {revealed && participant.id === userId && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 h-4 w-4 sm:h-6 sm:w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditVote()
                }}
                title={t("editVote")}
              >
                <Pencil className="h-2 w-2 sm:h-3 sm:w-3" />
              </Button>
            )}
          </div>
          <div className="text-center">
            <div className="font-medium text-xs sm:text-sm truncate max-w-16 sm:max-w-20 text-slate-700 dark:text-slate-300 font-inter">
              {participant.name}
            </div>
            {participant.vote && !revealed && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 justify-center font-inter">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse-slow" />
                <span className="hidden sm:inline">{t("ready")}</span>
              </div>
            )}
            {/* Mini-icons for throwing objects */}
            {isCurrentUserSeated && participant.id !== userId && ( // Only show if current user is seated and not self
              <div className="flex gap-1 mt-1 justify-center">
                <button
                  onClick={() => onThrowIconClick(participant.id, 'paper-ball')}
                  className="text-xs p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title={t('throwPaperBall')}
                >
                  ✉️
                </button>
                <button
                  onClick={() => onThrowIconClick(participant.id, 'snowball')}
                  className="text-xs p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title={t('throwSnowball')}
                >
                  ❄️
                </button>
                <button
                  onClick={() => onThrowIconClick(participant.id, 'paper-plane')}
                  className="text-xs p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title={t('throwPaperPlane')}
                >
                  ✈️
                </button>
                <button
                  onClick={() => onThrowIconClick(participant.id, 'dice')}
                  className="text-xs p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title={t('throwDice')}
                >
                  🎲
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  },
)

MemoizedCard.displayName = 'MemoizedCard'; // Add display name for forwardRef

const MemoizedEmptySeat = React.memo(
  ({
    index,
    onJoin,
    disabled,
    t,
    angle,
    radius,
  }: {
    index: number
    onJoin: (index: number) => void
    disabled: boolean
    t: (key: TranslationKey) => string
    angle: number
    radius: number
  }) => {
    const left = 50 + radius * Math.cos(angle)
    const top = 50 + radius * Math.sin(angle)

    return (
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
        style={{
          left: `${left}%`,
          top: `${top}%`,
        }}
      >
        <div className="flex flex-col items-center gap-1 sm:gap-2">
          <button
            className="w-14 h-20 sm:w-20 sm:h-28 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 relative z-0 hover:z-10 hover:scale-[1.015] hover:brightness-105 rounded-lg flex items-center justify-center group"
            onClick={() => onJoin(index)}
            disabled={disabled}
          >
            <Plus className="h-4 w-4 sm:h-6 sm:w-6 text-slate-400 group-hover:text-violet-500 transition-colors" />
          </button>
          <div className="text-center text-xs text-slate-500 dark:text-slate-400 max-w-16 sm:max-w-20 font-inter">
            <span className="hidden sm:inline">{disabled ? t("alreadyHasSeat") : t("emptySeat")}</span>
            <span className="sm:hidden">+</span>
          </div>
        </div>
      </div>
    )
  },
)

MemoizedEmptySeat.displayName = 'MemoizedEmptySeat'

export default function RoomPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const roomId = (params.id ?? "").toUpperCase()
  const { t, language, setLanguage } = useLanguage()
  const [showSettings, setShowSettings] = useState(false)
  const [showPasswordSettings, setShowPasswordSettings] = useState(false)
  const [showRoomHistory, setShowRoomHistory] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [authResolved, setAuthResolved] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [roomHistory, setRoomHistory] = useState<HistoryItem[]>([])
  const [removingRoomId, setRemovingRoomId] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState("")
  const [roomHistoryError, setRoomHistoryError] = useState("")
  const [accessStatus, setAccessStatus] = useState<"checking" | "granted" | "needKey" | "denied">("checking")
  const [roomAccessCode, setRoomAccessCode] = useState("")
  const [accessError, setAccessError] = useState("")

  // Ref to store DOM elements of participant cards for position calculation
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const lastThrowAtRef = useRef(0)
  const getJoinRoomErrorMessage = useCallback((errorType?: string, fallback?: string) => {
    if (errorType === "invalid_access_code") return t("invalidAccessCode")
    if (errorType === "access_required") return t("accessCodeRequiredError")
    if (errorType === "not_found") return t("roomNotFoundError")
    if (errorType === "forbidden") return t("roomAccessDeniedError")
    return fallback || t("genericJoinRoomError")
  }, [t])

  const [userId] = useState(() => {
    if (typeof window !== "undefined") {
      const savedUserId = localStorage.getItem("userId")
      if (savedUserId) return savedUserId
      const newUserId = Math.random().toString(36).slice(2)
      localStorage.setItem("userId", newUserId)
      return newUserId
    }
    return ""
  })

  // Load username from localStorage only once during initial mount
  useEffect(() => {
    const savedUsername = localStorage.getItem("username")
    setUsername(savedUsername)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadCurrentUser = async () => {
      try {
        const user = await getCurrentUser()
        if (!cancelled) {
          setCurrentUser(user)
        }
      } finally {
        if (!cancelled) {
          setAuthResolved(true)
        }
      }
    }

    void loadCurrentUser()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authResolved) return

    if (!currentUser) {
      return
    }

    const profileName = currentUser.name?.trim() ?? ""
    if (profileName.length >= 2) {
      setUsername(profileName)
      if (typeof window !== "undefined") {
        localStorage.setItem("username", profileName)
      }
      return
    }

    setUsername(null)
    if (typeof window !== "undefined") {
      localStorage.removeItem("username")
    }
  }, [authResolved, currentUser])

  // Clear username from localStorage when leaving the room
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("username")
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const checkRoomAccess = async () => {
      setAccessStatus("checking")
      setAccessError("")

      const result = await joinRoom(roomId)
      if (cancelled) {
        return
      }

      if (result.success) {
        setAccessStatus("granted")
        return
      }

      if (result.errorType === "access_required") {
        setAccessStatus("needKey")
        return
      }

      setAccessStatus("denied")
      setAccessError(getJoinRoomErrorMessage(result.errorType, result.error))
    }

    if (roomId) {
      checkRoomAccess()
    }

    return () => {
      cancelled = true
    }
  }, [roomId, getJoinRoomErrorMessage])

  const roomEnabled = accessStatus === "granted"

  const {
    participants = [],
    revealed = false,
    currentParticipant,
    observers,
    seatedParticipants,
    hasVotes,
    vote,
    reveal,
    reset,
    join,
    moveToObservers,
    changeName,
    throwObject, // Get the new throwObject action
    activeThrows, // Get active throws from hook
    setActiveThrows, // Get setter for active throws
  } = useRoom(roomId, userId, username || "", roomEnabled)

  const handleJoin = useCallback(async (name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    setUsername(trimmedName)
    localStorage.setItem("username", trimmedName)

    if (currentUser) {
      const result = await updateProfileName({ name: trimmedName })
      if (result.success) {
        setCurrentUser((prev) => (prev ? { ...prev, name: trimmedName } : prev))
      }
    }
  }, [currentUser])

  const handleAccessSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setAccessError("")

    const result = await joinRoom(roomId, roomAccessCode)
    if (result.success) {
      setAccessStatus("granted")
      setRoomAccessCode("")
      return
    }

    setAccessError(getJoinRoomErrorMessage(result.errorType, result.error))
  }, [roomId, roomAccessCode, getJoinRoomErrorMessage])

  const loadRoomHistory = useCallback(async () => {
    setRoomHistoryError("")
    setHistoryLoading(true)

    const result = await getPublicRoomHistory(20)
    if (result.success) {
      setRoomHistory(result.data)
    } else {
      setRoomHistory([])
      setRoomHistoryError(result.error || t("noRoomHistory"))
    }

    setHistoryLoading(false)
  }, [t])

  const handlePasswordSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPasswordError("")

    const formData = new FormData(e.currentTarget)
    const currentPassword = String(formData.get("currentPassword") ?? "")
    const newPassword = String(formData.get("newPassword") ?? "")
    const confirmPassword = String(formData.get("confirmPassword") ?? "")

    if (newPassword !== confirmPassword) {
      setPasswordError(t("passwordsDoNotMatch"))
      return
    }

    const result = await changePassword({ currentPassword, newPassword })
    if (!result.success) {
      setPasswordError(result.error)
      return
    }

    setShowPasswordSettings(false)
  }, [t])

  const handleRemoveFromHistory = useCallback(async (historyRoomId: string) => {
    setRemovingRoomId(historyRoomId)
    const result = await removeRoomFromHistory(historyRoomId)
    if (!result.success) {
      setRoomHistoryError(result.error || t("noRoomHistory"))
      setRemovingRoomId(null)
      return
    }

    setRoomHistory((prev) => prev.filter((item) => item.id !== historyRoomId))
    setRemovingRoomId(null)
  }, [t])

  // Memoize expensive calculations
  const { cards, totalSeats, stats, roomUrl } = useMemo(() => {
    const cards = ["0", "1/2", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?"]
    const totalSeats = Math.max(6, seatedParticipants.length + 1)
    const stats = revealed && participants.length > 0 ? calculateStatisticsMemo(participants.map((p) => p?.vote)) : null
    const roomUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${roomId}` : ""

    return { cards, totalSeats, stats, roomUrl }
  }, [seatedParticipants.length, revealed, participants, roomId])

  // Handle icon click to throw object
  const handleThrowIconClick = useCallback((targetId: string, objectType: ThrowableObjectType) => {
    const now = Date.now()
    if (now - lastThrowAtRef.current < THROW_COOLDOWN_MS) {
      return
    }
    lastThrowAtRef.current = now

    const senderCard = cardRefs.current.get(userId);
    const targetCard = cardRefs.current.get(targetId);

    if (senderCard && targetCard) {
      const senderRect = senderCard.getBoundingClientRect();
      const targetRect = targetCard.getBoundingClientRect();

      // Add to activeThrows state for immediate local animation
      setActiveThrows(prev => {
        const next = [...prev, {
          id: Date.now().toString(), // Unique ID for the animation instance
          senderId: userId,
          targetId,
          objectType,
          senderRect: { x: senderRect.x, y: senderRect.y, width: senderRect.width, height: senderRect.height } as DOMRectReadOnly,
          targetRect: { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height } as DOMRectReadOnly,
        }]
        return next.slice(-MAX_ACTIVE_THROWS)
      });

      // Send event via useRoom to notify other clients
      throwObject(targetId, objectType);
    }
  }, [userId, throwObject, setActiveThrows]);

  // Callback to remove animation from state once it ends
  const handleAnimationEnd = useCallback((id: string) => {
    setActiveThrows(prev => prev.filter(throwEvent => throwEvent.id !== id));
  }, [setActiveThrows]);

  // Show loading state or join dialog
  if (isLoading || !authResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-indigo-500 border-t-transparent"></div>
      </div>
    )
  }

  if (accessStatus === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-indigo-500 border-t-transparent"></div>
      </div>
    )
  }

  if (accessStatus === "needKey") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur p-6 shadow-xl space-y-4">
          <h2 className="text-xl font-semibold font-inter text-slate-900 dark:text-slate-100">{t("privateRoomTitle")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-inter">{t("enterAccessCodeForRoom")} {roomId}</p>
          <form onSubmit={handleAccessSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="roomAccessCode" className="font-inter">{t("roomAccessCode")}</Label>
              <Input
                id="roomAccessCode"
                value={roomAccessCode}
                onChange={(e) => setRoomAccessCode(e.target.value)}
                type="password"
                minLength={4}
                required
                autoFocus
              />
            </div>
            {accessError && <p className="text-sm text-red-500 font-inter">{accessError}</p>}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1 font-inter">{t("joinRoomButton")}</Button>
              <Button type="button" variant="outline" onClick={() => router.push('/')} className="font-inter">
                {t("home")}
              </Button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (accessStatus === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur p-6 shadow-xl space-y-4 text-center">
          <h2 className="text-xl font-semibold font-inter text-slate-900 dark:text-slate-100">{t("roomUnavailable")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 font-inter">{accessError || "You do not have access to this room."}</p>
          <Button onClick={() => router.push('/')} className="w-full font-inter">
            {t("goToHome")}
          </Button>
        </div>
      </div>
    )
  }

  if (!username) {
    return <JoinDialog onJoin={handleJoin} />
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800 overflow-x-hidden overflow-y-visible font-inter">
      {/* Full Width Header with gradient */}
      <div className="flex-shrink-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 text-white border-b border-indigo-200 dark:border-slate-700 px-4 sm:px-6 pt-5 pb-4 sm:pt-6 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-4xl font-bold truncate font-inter">{t("title")}</h1>
            <p className="text-sm text-indigo-100 flex items-center gap-2 mt-1 font-inter">
              <span className="inline-block w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              {t("room")}: <span className="font-mono-local font-semibold text-white">{roomId}</span>
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3 flex-shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setLanguage(language === "en" ? "ru" : "en")}
              className="h-8 w-8 sm:h-10 sm:w-10 border-white/20 bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm"
            >
              <Globe className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-xs sm:text-sm px-2 sm:px-4 border-white/20 bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm font-inter"
                >
                  <Share2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">{t("share")}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md mx-4">
                <DialogHeader>
                  <DialogTitle className="font-inter">{t("share")}</DialogTitle>
                  <DialogDescription className="font-inter">{t("shareDescription")}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-full flex justify-center">
                    <QRCode value={roomUrl} size={160} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400 font-inter">{t("roomCode")}</p>
                    <p className="text-2xl sm:text-3xl font-bold font-mono-local bg-gradient-to-r from-indigo-600 to-cyan-600 bg-clip-text text-transparent">
                      {roomId}
                    </p>
                  </div>
                  <div className="grid w-full gap-2">
                    <Label htmlFor="room-url" className="font-inter">
                      {t("roomUrl")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="room-url"
                        value={roomUrl}
                        readOnly
                        onClick={(e) => e.currentTarget.select()}
                        className="font-mono-local text-xs sm:text-sm"
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(roomUrl)
                        }}
                        className="text-xs sm:text-sm font-inter"
                      >
                        {t("copy")}
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 sm:h-10 sm:w-10 border-white/20 bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm"
                >
                  <Menu className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-inter">{t("settings")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/')} className="font-inter">
                  {t("createNewRoom")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSettings(true)} className="font-inter">
                  {t("changeName")}
                </DropdownMenuItem>
                {currentUser && (
                  <DropdownMenuItem onClick={() => setShowPasswordSettings(true)} className="font-inter">
                    {t("resetPassword")}
                  </DropdownMenuItem>
                )}
                {currentUser && (
                  <DropdownMenuItem
                    onClick={() => {
                      setShowRoomHistory(true)
                      void loadRoomHistory()
                    }}
                    className="font-inter"
                  >
                    {t("roomHistory")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="mx-4">
          <DialogHeader>
            <DialogTitle className="font-inter">{t("changeName")}</DialogTitle>
            <DialogDescription className="font-inter">{t("changeNameDescription")}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const newName = new FormData(e.currentTarget).get("name") as string
              if (newName.trim()) {
                handleJoin(newName.trim())
                changeName(newName.trim())
                setShowSettings(false)
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="name" className="font-inter">
                {t("yourName")}
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={username}
                required
                minLength={2}
                maxLength={30}
                className="font-inter"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 font-inter"
            >
              {t("save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasswordSettings} onOpenChange={setShowPasswordSettings}>
        <DialogContent className="mx-4">
          <DialogHeader>
            <DialogTitle className="font-inter">{t("resetPassword")}</DialogTitle>
            <DialogDescription className="font-inter">{t("resetPasswordDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword" className="font-inter">{t("currentPassword")}</Label>
              <Input id="currentPassword" name="currentPassword" type="password" minLength={6} required className="font-inter" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="font-inter">{t("newPassword")}</Label>
              <Input id="newPassword" name="newPassword" type="password" minLength={6} required className="font-inter" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-inter">{t("confirmPassword")}</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" minLength={6} required className="font-inter" />
            </div>
            {passwordError && <p className="text-sm text-red-500 font-inter">{passwordError}</p>}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 font-inter"
            >
              {t("save")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showRoomHistory} onOpenChange={setShowRoomHistory}>
        <DialogContent className="mx-4">
          <DialogHeader>
            <DialogTitle className="font-inter">{t("roomHistory")}</DialogTitle>
            <DialogDescription className="font-inter">{t("noRoomHistory")}</DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <p className="text-sm text-slate-500 font-inter">{t("loading")}</p>
          ) : roomHistory.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {roomHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate font-inter">{item.name}</p>
                    <p className="text-xs text-slate-500 font-mono-local">{item.id}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-inter"
                    onClick={() => {
                      setShowRoomHistory(false)
                      router.push(`/room/${item.id}`)
                    }}
                  >
                    {t("openRoom")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-inter"
                    disabled={removingRoomId === item.id}
                    onClick={() => void handleRemoveFromHistory(item.id)}
                  >
                    {t("removeFromHistory")}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 font-inter">{roomHistoryError || t("noRoomHistory")}</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Table Area */}
        <div className="flex-1 flex items-center justify-center min-h-0 px-4 sm:px-6 py-4">
          <div className="max-w-6xl mx-auto w-full h-full flex items-center justify-center">
            <div
              className="w-full h-full max-w-sm sm:max-w-2xl lg:max-w-4xl aspect-square relative"
              style={{ maxHeight: "100%" }}
            >
              {/* Colorful Table Surface */}
              <div className="absolute inset-[8%] sm:inset-[12%] rounded-2xl bg-gradient-to-br from-emerald-100 via-teal-50 to-cyan-100 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-cyan-950/30 border-2 border-emerald-200 dark:border-emerald-800 shadow-xl">
                {/* Center Control Panel - Colorful */}
                <div className="absolute inset-[15%] sm:inset-[18%] rounded-xl bg-gradient-to-br from-white via-slate-50 to-white dark:from-slate-800 dark:via-slate-750 dark:to-slate-800 border border-slate-200 dark:border-slate-600 flex flex-col items-center justify-center gap-3 sm:gap-4 p-3 shadow-lg">
                  {revealed ? (
                    <>
                      <div className="text-center space-y-3 sm:space-y-4">
                        <div className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent flex items-center gap-2 justify-center font-inter">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse-slow" />
                          {t("results")}
                        </div>
                        {stats && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="text-center p-3 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-200 dark:border-indigo-800">
                                <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium font-inter">
                                  {t("mostVoted")}
                                </div>
                                <div className="text-xl sm:text-2xl font-bold text-indigo-700 dark:text-indigo-300 font-inter">
                                  {stats.mode}
                                </div>
                              </div>
                              {stats.average && (
                                <div className="text-center p-3 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-800">
                                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium font-inter">
                                    {t("average")}
                                  </div>
                                  <div className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 font-inter">
                                    {stats.average}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 hidden sm:block font-inter">
                              {t("distribution")}:
                            </div>
                            <div className="text-xs space-y-2 max-h-16 sm:max-h-20 overflow-y-auto hidden sm:block">
                              {Object.entries(stats.distribution).map(([value, count]) => (
                                <div key={value} className="flex items-center gap-2">
                                  <div className="w-6 font-medium text-center text-slate-700 dark:text-slate-300 font-inter">
                                    {value}
                                  </div>
                                  <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-1000 ease-out rounded-full"
                                      style={{
                                        width: `${(count / stats.totalVotes) * 100}%`,
                                      }}
                                    />
                                  </div>
                                  <div className="w-8 text-right text-slate-600 dark:text-slate-400 font-inter">
                                    {count}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={reset}
                        size="sm"
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xs sm:text-sm font-inter shadow-lg border-0 px-4 py-2 rounded-lg font-semibold"
                      >
                        <RefreshCcw className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                        {t("newVote")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={reveal}
                      disabled={!hasVotes}
                      size="sm"
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white text-xs sm:text-sm px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium shadow-lg font-inter"
                    >
                      <Eye className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      {t("revealCards")}
                    </Button>
                  )}
                </div>
              </div>

              {/* Seats around the table */}
              {Array.from({ length: totalSeats }).map((_, index) => {
                const angle = index * (360 / totalSeats) * (Math.PI / 180)
                const radius = 42

                const participant = seatedParticipants.find((p) => p.seatIndex === index)

                if (!participant) {
                  return (
                    <MemoizedEmptySeat
                      key={`empty-${index}`}
                      index={index}
                      onJoin={join}
                      disabled={currentParticipant?.seatIndex !== null && currentParticipant?.seatIndex !== undefined}
                      t={t}
                      angle={angle}
                      radius={radius}
                    />
                  )
                }

                return (
                  <MemoizedCard
                    key={participant.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(participant.id, el);
                      else cardRefs.current.delete(participant.id);
                    }}
                    participant={participant}
                    revealed={revealed}
                    userId={userId}
                    onEditVote={() => setIsEditing(true)}
                    t={t}
                    angle={angle}
                    radius={radius}
                    onThrowIconClick={handleThrowIconClick} // Pass the handler
                    isCurrentUserSeated={currentParticipant?.seatIndex !== null && currentParticipant?.seatIndex !== undefined} // Pass current user's seat status
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* Render active throwable objects */}
        {activeThrows.map(throwEvent => {
          // Ensure senderRect and targetRect are available before rendering
          const senderRect = throwEvent.senderRect ?? cardRefs.current.get(throwEvent.senderId)?.getBoundingClientRect();
          const targetRect = throwEvent.targetRect ?? cardRefs.current.get(throwEvent.targetId)?.getBoundingClientRect();

          if (senderRect && targetRect) {
            return (
              <ThrowableObject
                key={throwEvent.id}
                id={throwEvent.id}
                objectType={throwEvent.objectType}
                senderRect={senderRect}
                targetRect={targetRect}
                onAnimationEnd={handleAnimationEnd}
              />
            );
          }
          return null;
        })}

        {/* Single Row Card Selection with colors */}
        {currentParticipant?.seatIndex !== null && currentParticipant?.seatIndex !== undefined && (
          <div className="flex-shrink-0 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-800 dark:via-slate-750 dark:to-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 sm:px-6 pt-5 pb-4 sm:pt-6 shadow-lg">
            <div className="max-w-6xl mx-auto">
              <div className="overflow-y-visible pt-3 sm:pt-4">
                <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-3 scrollbar-hide">
                {cards.map((card, index) => {
                  const isSelected = currentParticipant.vote === card
                  // Different colors for different card ranges
                  const getCardColor = (card: string, isSelected: boolean) => {
                    if (isSelected) {
                      return "border-indigo-400 bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-indigo-500/30 ring-1 ring-white/20"
                    }

                    if (card === "?") {
                      return "border-amber-200 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 text-amber-700 dark:text-amber-300"
                    }

                    const numValue = card === "1/2" ? 0.5 : Number.parseFloat(card)
                    if (!isNaN(numValue)) {
                      if (numValue <= 2) {
                        return "border-emerald-200 dark:border-emerald-700 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 text-emerald-700 dark:text-emerald-300"
                      } else if (numValue <= 8) {
                        return "border-blue-200 dark:border-blue-700 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 text-blue-700 dark:text-blue-300"
                      } else {
                        return "border-rose-200 dark:border-rose-700 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-pink-950/20 text-rose-700 dark:text-rose-300"
                      }
                    }

                    return "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }

                  return (
                    <button
                      key={card}
                      className={`relative z-0 hover:z-10 inline-flex items-center justify-center leading-none flex-shrink-0 h-12 sm:h-16 w-12 sm:w-16 text-base sm:text-xl font-bold transition-all duration-200 rounded-lg border-2 font-inter ${isSelected ? "hover:translate-y-0.5 hover:brightness-110 hover:saturate-110 hover:shadow-lg hover:shadow-indigo-500/40" : "hover:scale-[1.015] hover:brightness-105"} ${getCardColor(card, isSelected)}
                      ${revealed && !isEditing ? "opacity-50 cursor-not-allowed" : ""}
                    `}
                      onClick={() => {
                        vote(card)
                        setIsEditing(false)
                      }}
                      disabled={revealed && !isEditing}
                    >
                      {card}
                    </button>
                  )
                })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom section with observers and instructions */}
        <div className="flex-shrink-0 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-800 dark:via-slate-750 dark:to-slate-800 border-t border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            {/* Instructions */}
            <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-inter">
              {currentParticipant?.seatIndex === null || currentParticipant?.seatIndex === undefined ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                  {t("clickSeatToJoin")}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse delay-100" />
                    <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse delay-200" />
                  </div>
                  {t("votingInstructions")}
                </div>
              )}
            </div>

            {/* Compact Observers */}
            <div className="flex items-center gap-3">
              {currentParticipant?.seatIndex !== null && currentParticipant?.seatIndex !== undefined && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={moveToObservers}
                  className="text-xs px-2 hover:bg-violet-100 dark:hover:bg-violet-950/20 text-violet-600 dark:text-violet-400 font-inter"
                >
                  {t("moveToObservers")}
                </Button>
              )}

              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-inter">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 text-cyan-500" />
                <span className="font-medium">
                  {t("observers")} ({observers.length})
                </span>
                {observers.length > 0 && (
                  <div className="flex gap-1 max-w-32 sm:max-w-48 overflow-hidden">
                    {observers.slice(0, 3).map((observer, index) => (
                      <span
                        key={observer.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-cyan-100 to-blue-100 dark:from-cyan-950/20 dark:to-blue-950/20 text-cyan-700 dark:text-cyan-300 text-xs truncate font-inter"
                      >
                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        {observer.name}
                      </span>
                    ))}
                    {observers.length > 3 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-inter">
                        +{observers.length - 3}
                      </span>
                    )}
                  </div>
                )}
                {observers.length === 0 && (
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-inter">{t("noObservers")}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



































