from collections.abc import Generator
from typing import Annotated
import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session

from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.models import TokenPayload, User

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token",
    auto_error=False,  # 当认证禁用时，不自动抛出错误
)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str | None, Depends(reusable_oauth2)]


def _create_dummy_user() -> User:
    """创建一个虚拟用户，用于认证禁用时"""
    # 使用固定的UUID，确保虚拟用户ID一致
    dummy_id = uuid.UUID("00000000-0000-0000-0000-000000000000")
    return User(
        id=dummy_id,
        email="dummy@example.com",
        is_active=True,
        is_superuser=True,
        full_name="Dummy User",
        hashed_password="",  # 虚拟用户不需要密码
    )


def get_current_user(session: SessionDep, token: TokenDep = None) -> User:
    # 如果认证被禁用，返回虚拟用户
    if not settings.AUTH_ENABLED:
        return _create_dummy_user()
    
    # 认证启用时的原有逻辑
    if not token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    # 如果认证被禁用，虚拟用户默认是超级用户，直接返回
    if not settings.AUTH_ENABLED:
        return current_user
    
    # 认证启用时的原有逻辑
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user
