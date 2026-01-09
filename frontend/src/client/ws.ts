export type MapEventMessage = {
  type: string
  payload: Record<string, unknown>
}

export class MapWebSocketClient {
  private ws: WebSocket | null = null
  private readonly url: string
  private listeners: Set<(msg: MapEventMessage) => void> = new Set()

  constructor(baseUrl?: string) {
    // 优先使用传入 baseUrl，否则回退到 window.location.origin
    const provided = (baseUrl && baseUrl.length > 0) ? baseUrl : window.location.origin

    try {
      const u = new URL(provided, window.location.origin)
      // 确保有正确的协议和主机
      const protocol = u.protocol
      const host = u.host

      // 如果URL包含/api/v1，则移除它，因为我们要添加/ws/map
      let pathname = u.pathname
      if (pathname.includes('/api/v1')) {
        pathname = pathname.replace('/api/v1', '')
      }

      // 构建基础URL
      const baseUrlClean = `${protocol}//${host}${pathname}`.replace(/\/$/, '')

      // 构建WebSocket URL
      this.url = baseUrlClean.replace(/^http/, "ws") + "/api/v1/ws/map"
    } catch (error) {
      console.warn("WebSocket URL构建失败，使用默认值:", error)
      // 回退到默认值
      this.url = window.location.origin.replace(/^http/, "ws") + "/api/v1/ws/map"
    }

    console.log("WebSocket URL:", this.url)
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.ws = new WebSocket(this.url)
    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as MapEventMessage
        this.listeners.forEach((cb) => cb(data))
      } catch {
        // ignore
      }
    }
    this.ws.onclose = () => {
      // 简单重连策略
      setTimeout(() => this.connect(), 1500)
    }
  }

  onMessage(cb: (msg: MapEventMessage) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  send(message: MapEventMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(message))
  }
}


