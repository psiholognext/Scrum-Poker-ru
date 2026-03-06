'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, Lock } from 'lucide-react'
import { createRoom, joinRoom } from '@/lib/actions/rooms'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/lib/contexts/language-context'

export default function DashboardPage() {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isPrivateRoom, setIsPrivateRoom] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinAccessCode, setJoinAccessCode] = useState('')
  const [needJoinAccessCode, setNeedJoinAccessCode] = useState(false)
  const { t } = useLanguage()

  function resetJoinState() {
    setJoinCode('')
    setJoinAccessCode('')
    setNeedJoinAccessCode(false)
    setError('')
  }

  async function onCreateRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    try {
      const room = await createRoom(formData)
      if (!room.success) {
        setError(room.error)
        return
      }

      setShowCreate(false)
      setIsPrivateRoom(false)
      router.push(`/room/${room.data.id}`)
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

        setError(result.error)
        return
      }

      setShowJoin(false)
      resetJoinState()
      router.push(`/room/${code}`)
    } catch {
      setError('Invalid room code')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Scrum Poker</h1>
          <div className="flex gap-4">
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button>
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
                    <Input id="name" name="name" required />
                  </div>

                  <div className="flex items-center gap-2 rounded-md border p-3">
                    <input
                      id="isPrivateDashboard"
                      name="isPrivate"
                      type="checkbox"
                      checked={isPrivateRoom}
                      onChange={(e) => setIsPrivateRoom(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="isPrivateDashboard" className="cursor-pointer">{t('privateRoomRequired')}</Label>
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
                <Button variant="outline">
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
                    {loading ? 'Joining...' : t('joinRoom')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Your Rooms</CardTitle>
              <CardDescription>Rooms you&apos;ve created</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No rooms created yet</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Rooms</CardTitle>
              <CardDescription>Rooms you&apos;ve participated in</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No recent rooms</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
