'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, Globe, Lock, LogIn, Settings, History } from 'lucide-react'
import { createRoom, getPublicRoomHistory, joinRoom } from '@/lib/actions/rooms'
import { changePassword, getCurrentUser, login, logout, register } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/lib/contexts/language-context'

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

export default function HomePage() {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isPrivateRoom, setIsPrivateRoom] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinAccessCode, setJoinAccessCode] = useState('')
  const [needJoinAccessCode, setNeedJoinAccessCode] = useState(false)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [roomHistory, setRoomHistory] = useState<HistoryItem[]>([])
  const [settingsError, setSettingsError] = useState('')
  const { language, setLanguage, t } = useLanguage()

  async function loadUserData() {
    setAuthLoading(true)
    const user = await getCurrentUser()
    setCurrentUser(user)

    if (user) {
      setHistoryLoading(true)
      const historyResult = await getPublicRoomHistory(20)
      if (historyResult.success) {
        setRoomHistory(historyResult.data)
      } else {
        setRoomHistory([])
      }
      setHistoryLoading(false)
    } else {
      setRoomHistory([])
    }

    setAuthLoading(false)
  }

  useEffect(() => {
    void loadUserData()
  }, [])

  function resetJoinState() {
    setJoinCode('')
    setJoinAccessCode('')
    setNeedJoinAccessCode(false)
    setError('')
  }

  function getJoinRoomErrorMessage(errorType?: string, fallback?: string) {
    if (errorType === 'invalid_access_code') return t('invalidAccessCode')
    if (errorType === 'access_required') return t('accessCodeRequiredError')
    if (errorType === 'not_found') return t('roomNotFoundError')
    if (errorType === 'forbidden') return t('roomAccessDeniedError')
    return fallback || t('genericJoinRoomError')
  }

  async function onCreateRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await createRoom(new FormData(e.currentTarget))

      if (!result.success) {
        setError(result.error || 'Failed to create room')
        return
      }

      setShowCreate(false)
      setIsPrivateRoom(false)
      router.push(`/room/${result.data.id}`)
    } catch {
      setError('Failed to create room')
    } finally {
      setLoading(false)
    }
  }

  async function onJoinRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const code = joinCode.trim().toUpperCase()
    const accessCode = joinAccessCode.trim()

    try {
      const result = await joinRoom(code, accessCode)
      if (!result.success) {
        if (result.errorType === 'access_required') {
          setNeedJoinAccessCode(true)
          return
        }

        setError(getJoinRoomErrorMessage(result.errorType, result.error))
        return
      }

      setShowJoin(false)
      resetJoinState()
      router.push(`/room/${code}`)
    } catch {
      setError('Failed to join room')
    } finally {
      setLoading(false)
    }
  }

  async function onAuthSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')

    try {
      if (authMode === 'login') {
        const result = await login({ email, password })
        if (!result.success) {
          setError(result.error)
          return
        }
      } else {
        const name = String(formData.get('name') ?? '')
        const result = await register({ email, password, name })
        if (!result.success) {
          setError(result.error)
          return
        }
      }

      setShowAuth(false)
      await loadUserData()
    } finally {
      setLoading(false)
    }
  }

  async function onChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSettingsError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const currentPassword = String(formData.get('currentPassword') ?? '')
    const newPassword = String(formData.get('newPassword') ?? '')
    const confirmPassword = String(formData.get('confirmPassword') ?? '')

    if (newPassword !== confirmPassword) {
      setSettingsError(t('passwordsDoNotMatch'))
      setLoading(false)
      return
    }

    try {
      const result = await changePassword({ currentPassword, newPassword })
      if (!result.success) {
        setSettingsError(result.error)
        return
      }

      setShowSettings(false)
    } finally {
      setLoading(false)
    }
  }

  async function onLogout() {
    setLoading(true)
    await logout()
    await loadUserData()
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md space-y-8">
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
            className="rounded-full"
          >
            <Globe className="h-4 w-4" />
          </Button>

          {!authLoading && (
            currentUser ? (
              <>
                <Dialog open={showSettings} onOpenChange={setShowSettings}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-full">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('accountSettings')}</DialogTitle>
                      <DialogDescription>{t('resetPasswordDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                      <div>{t('signedInAs')}</div>
                      <div className="font-medium">{currentUser.name} ({currentUser.email})</div>
                    </div>
                    <form onSubmit={onChangePassword} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">{t('currentPassword')}</Label>
                        <Input id="currentPassword" name="currentPassword" type="password" minLength={6} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">{t('newPassword')}</Label>
                        <Input id="newPassword" name="newPassword" type="password" minLength={6} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
                        <Input id="confirmPassword" name="confirmPassword" type="password" minLength={6} required />
                      </div>
                      {settingsError && <p className="text-sm text-red-500">{settingsError}</p>}
                      <Button type="submit" className="w-full" disabled={loading}>{t('resetPassword')}</Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <Button variant="outline" onClick={onLogout} disabled={loading}>{t('logout')}</Button>
              </>
            ) : (
              <Dialog open={showAuth} onOpenChange={setShowAuth}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <LogIn className="mr-2 h-4 w-4" />
                    {t('signIn')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{authMode === 'login' ? t('signIn') : t('register')}</DialogTitle>
                    <DialogDescription>{t('authRequired')}</DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-2">
                    <Button type="button" variant={authMode === 'login' ? 'default' : 'outline'} className="flex-1" onClick={() => setAuthMode('login')}>
                      {t('signIn')}
                    </Button>
                    <Button type="button" variant={authMode === 'register' ? 'default' : 'outline'} className="flex-1" onClick={() => setAuthMode('register')}>
                      {t('register')}
                    </Button>
                  </div>
                  <form onSubmit={onAuthSubmit} className="space-y-4">
                    {authMode === 'register' && (
                      <div className="space-y-2">
                        <Label htmlFor="name">{t('yourName')}</Label>
                        <Input id="name" name="name" minLength={2} required />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('email')}</Label>
                      <Input id="email" name="email" type="email" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t('password')}</Label>
                      <Input id="password" name="password" type="password" minLength={6} required />
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading}>
                      {authMode === 'login' ? t('signIn') : t('register')}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )
          )}
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('createOrJoin')}</p>
        </div>

        <div className="grid gap-4">
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="lg" className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                {t('createRoom')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('createRoom')}</DialogTitle>
                <DialogDescription>{t('createRoomDescription')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={onCreateRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('roomName')}</Label>
                  <Input id="name" name="name" required placeholder={t('enterRoomName')} autoComplete="off" autoFocus />
                </div>

                <div className="flex items-center gap-2 rounded-md border p-3">
                  <input
                    id="isPrivate"
                    name="isPrivate"
                    type="checkbox"
                    checked={isPrivateRoom}
                    onChange={(e) => setIsPrivateRoom(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="isPrivate" className="cursor-pointer">{t('privateRoomRequired')}</Label>
                </div>

                {isPrivateRoom && (
                  <div className="space-y-2">
                    <Label htmlFor="accessCode">{t('roomAccessCode')}</Label>
                    <Input id="accessCode" name="accessCode" type="password" minLength={4} required />
                  </div>
                )}

                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('creating') : t('createRoom')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={showJoin}
            onOpenChange={(open) => {
              setShowJoin(open)
              if (!open) {
                resetJoinState()
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="lg" className="w-full">
                <Users className="mr-2 h-4 w-4" />
                {t('joinRoom')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('joinRoom')}</DialogTitle>
                <DialogDescription>{t('joinRoomDescription')}</DialogDescription>
              </DialogHeader>
              <form onSubmit={onJoinRoom} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">{t('roomName')}</Label>
                  <Input
                    id="code"
                    name="code"
                    required
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder={t('enterRoomCode')}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoFocus
                    pattern="[A-Za-z0-9]+"
                    minLength={6}
                    maxLength={6}
                  />
                </div>

                {needJoinAccessCode && (
                  <div className="space-y-2">
                    <Label htmlFor="accessCodeJoin" className="flex items-center gap-2">
                      <Lock className="h-4 w-4" /> {t('accessCodeForPrivate')}
                    </Label>
                    <Input
                      id="accessCodeJoin"
                      name="accessCode"
                      type="password"
                      value={joinAccessCode}
                      onChange={(e) => setJoinAccessCode(e.target.value)}
                      placeholder={t('optionalForPublicRoom')}
                      minLength={4}
                      required
                    />
                  </div>
                )}

                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {t('joinRoom')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {currentUser && (
          <div className="rounded-xl border bg-white/80 dark:bg-slate-900/70 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <History className="h-4 w-4" />
              {t('roomHistory')}
            </div>

            {historyLoading ? (
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            ) : roomHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noRoomHistory')}</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                {roomHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2 bg-white/70 dark:bg-slate-950/40">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.id}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => router.push(`/room/${item.id}`)}>
                      {t('openRoom')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
