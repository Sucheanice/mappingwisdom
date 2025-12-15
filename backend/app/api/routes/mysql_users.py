from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func
from decimal import Decimal

from app.core.mysql_db import get_mysql_session
from app.models_mysql import (
    SystemUser, 
    SystemUserCreate, 
    SystemUserUpdate, 
    SystemUserResponse
)

router = APIRouter(prefix="/mysql/users", tags=["MySQL用户管理"])


@router.get("/", response_model=List[SystemUserResponse], summary="获取用户列表")
async def get_users(
    skip: int = Query(0, ge=0, description="跳过记录数"),
    limit: int = Query(10, ge=1, le=100, description="每页记录数"),
    search: Optional[str] = Query(None, description="搜索关键词（用户名、昵称、邮箱）"),
    status: Optional[int] = Query(None, description="状态筛选"),
    session: Session = Depends(get_mysql_session)
):
    """获取用户列表，支持分页和搜索"""
    query = select(SystemUser).where(SystemUser.deleted == 0)
    
    # 搜索条件
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (SystemUser.username.like(search_term)) |
            (SystemUser.nickname.like(search_term)) |
            (SystemUser.email.like(search_term))
        )
    
    # 状态筛选
    if status is not None:
        query = query.where(SystemUser.status == status)
    
    # 排序和分页
    query = query.order_by(SystemUser.create_time.desc()).offset(skip).limit(limit)
    
    users = session.exec(query).all()
    return users


@router.get("/count", summary="获取用户总数")
async def get_users_count(
    search: Optional[str] = Query(None, description="搜索关键词"),
    status: Optional[int] = Query(None, description="状态筛选"),
    session: Session = Depends(get_mysql_session)
):
    """获取用户总数"""
    query = select(func.count(SystemUser.id)).where(SystemUser.deleted == 0)
    
    if search:
        search_term = f"%{search}%"
        query = query.where(
            (SystemUser.username.like(search_term)) |
            (SystemUser.nickname.like(search_term)) |
            (SystemUser.email.like(search_term))
        )
    
    if status is not None:
        query = query.where(SystemUser.status == status)
    
    count = session.exec(query).one()
    return {"count": count}


@router.get("/{user_id}", response_model=SystemUserResponse, summary="获取单个用户")
async def get_user(
    user_id: int,
    session: Session = Depends(get_mysql_session)
):
    """根据ID获取用户详情"""
    user = session.get(SystemUser, user_id)
    if not user or user.deleted == 1:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.post("/", response_model=SystemUserResponse, summary="创建用户")
async def create_user(
    user_data: SystemUserCreate,
    session: Session = Depends(get_mysql_session)
):
    """创建新用户"""
    # 检查用户名是否已存在
    existing_user = session.exec(
        select(SystemUser).where(SystemUser.username == user_data.username)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    # 创建用户
    user = SystemUser(**user_data.model_dump())
    user.create_time = user.create_time or func.now()
    
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return user


@router.put("/{user_id}", response_model=SystemUserResponse, summary="更新用户")
async def update_user(
    user_id: int,
    user_data: SystemUserUpdate,
    session: Session = Depends(get_mysql_session)
):
    """更新用户信息"""
    user = session.get(SystemUser, user_id)
    if not user or user.deleted == 1:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查用户名是否被其他用户使用
    if user_data.username and user_data.username != user.username:
        existing_user = session.exec(
            select(SystemUser).where(
                SystemUser.username == user_data.username,
                SystemUser.id != user_id
            )
        ).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="用户名已存在")
    
    # 更新用户信息
    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    
    user.update_time = func.now()
    
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return user


@router.delete("/{user_id}", summary="删除用户")
async def delete_user(
    user_id: int,
    session: Session = Depends(get_mysql_session)
):
    """软删除用户"""
    user = session.get(SystemUser, user_id)
    if not user or user.deleted == 1:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 软删除
    user.deleted = 1
    user.update_time = func.now()
    
    session.add(user)
    session.commit()
    
    return {"message": "用户删除成功"}


@router.patch("/{user_id}/status", response_model=SystemUserResponse, summary="更新用户状态")
async def update_user_status(
    user_id: int,
    status: int = Query(..., description="状态值（0-禁用，1-启用）"),
    session: Session = Depends(get_mysql_session)
):
    """更新用户状态"""
    user = session.get(SystemUser, user_id)
    if not user or user.deleted == 1:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    user.status = status
    user.update_time = func.now()
    
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return user
