from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings


class ChatMessage(BaseModel):
    conversation_id: str | None = None
    message: str
    metadata: dict[str, Any] | None = None


router = APIRouter(prefix="/dify", tags=["dify"])


def _get_dify_headers() -> dict[str, str]:
    if not settings.DIFY_API_KEY:
        raise HTTPException(status_code=500, detail="Dify API key is not configured")
    return {
        "Authorization": f"Bearer {settings.DIFY_API_KEY}",
        "Content-Type": "application/json",
    }


@router.post("/chat")
async def dify_chat(body: ChatMessage):
    if not settings.DIFY_API_BASE:
        raise HTTPException(status_code=500, detail="Dify API base is not configured")

    # 常见Dify对话接口路径（根据部署可能不同，请按需调整）
    endpoint = f"{settings.DIFY_API_BASE.rstrip('/')}/v1/chat-messages"

    payload: dict[str, Any] = {
        "inputs": body.metadata or {},
        "response_mode": "blocking",
        "query": body.message,
    }
    if body.conversation_id:
        payload["conversation_id"] = body.conversation_id
    if settings.DIFY_APP_ID:
        payload["user"] = settings.DIFY_APP_ID

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(endpoint, headers=_get_dify_headers(), json=payload)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()


