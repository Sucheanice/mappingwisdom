from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect


router = APIRouter(prefix="/ws", tags=["websocket"])  # Note: prefix is HTTP path base


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.active_connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        text = json.dumps(message)
        async with self._lock:
            websockets = list(self.active_connections)
        for ws in websockets:
            try:
                await ws.send_text(text)
            except Exception:
                # Best-effort removal
                await self.disconnect(ws)


manager = ConnectionManager()


@router.websocket("/map")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            # 简单协议：客户端发送形如 {type, payload} 的JSON
            try:
                data = json.loads(text)
                if not isinstance(data, dict):
                    continue
            except Exception:
                continue

            # 将地图事件广播给所有客户端（含发送者）
            await manager.broadcast({
                "type": data.get("type", "unknown"),
                "payload": data.get("payload", {}),
            })
    except WebSocketDisconnect:
        await manager.disconnect(websocket)


async def broadcast_event(event_type: str, payload: dict[str, Any]) -> None:
    """对外暴露的广播方法，供其他路由调用。"""
    await manager.broadcast({
        "type": event_type,
        "payload": payload,
    })


