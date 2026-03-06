type WebSocketMessage = {
  type: 'join' | 'leave' | 'vote' | 'reveal' | 'reset'
  roomId: string
  userId?: string
  username?: string
  vote?: string | null
  revealed?: boolean
}

export class RoomWebSocket {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private listeners: ((message: WebSocketMessage) => void)[] = []

  constructor(roomId: string, userId: string) {
    this.connect(roomId, userId)
  }

  private connect(roomId: string, userId: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = process.env.NEXT_PUBLIC_WS_URL || window.location.host
    this.ws = new WebSocket(`${protocol}//${host}/api/ws?roomId=${roomId}&userId=${userId}`)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage
        this.listeners.forEach(listener => listener(message))
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        setTimeout(() => this.connect(roomId, userId), 1000 * this.reconnectAttempts)
      }
    }
  }

  subscribe(listener: (message: WebSocketMessage) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  close() {
    this.ws?.close()
  }
}
