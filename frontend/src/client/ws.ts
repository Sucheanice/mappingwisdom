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

    let origin = window.location.origin
    let apiPath = "/api/v1"

    try {
      const u = new URL(provided, window.location.origin)
      origin = `${u.protocol}//${u.host}`
      const segs = u.pathname.split("/").filter(Boolean)
      const apiIndex = segs.findIndex((s) => s === "api")
      if (apiIndex !== -1 && segs[apiIndex + 1]?.startsWith("v")) {
        apiPath = `/${segs.slice(0, apiIndex + 2).join("/")}`
      }
    } catch {
      // ignore, use defaults
    }

    const httpBase = `${origin}${apiPath}`
    const wsBase = httpBase.replace(/^http/, "ws")
    this.url = `${wsBase}/ws/map`
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


