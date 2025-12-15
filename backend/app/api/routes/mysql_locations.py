from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func, and_
from decimal import Decimal
from datetime import datetime

from app.core.mysql_db import get_mysql_session
from app.models_mysql import (
    OaLocationReport, 
    OaLocationReportCreate, 
    OaLocationReportUpdate, 
    OaLocationReportResponse
)

router = APIRouter(prefix="/mysql/locations", tags=["MySQL位置上报"])


@router.get("/", response_model=List[OaLocationReportResponse], summary="获取位置上报列表")
async def get_locations(
    skip: int = Query(0, ge=0, description="跳过记录数"),
    limit: int = Query(10, ge=1, le=100, description="每页记录数"),
    user_id: Optional[int] = Query(None, description="用户ID筛选"),
    username: Optional[str] = Query(None, description="用户名筛选"),
    city: Optional[str] = Query(None, description="城市筛选"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    session: Session = Depends(get_mysql_session)
):
    """获取位置上报列表，支持分页和筛选"""
    query = select(OaLocationReport)
    
    # 用户ID筛选
    if user_id is not None:
        query = query.where(OaLocationReport.user_id == user_id)
    
    # 用户名筛选
    if username:
        query = query.where(OaLocationReport.username.like(f"%{username}%"))
    
    # 城市筛选
    if city:
        query = query.where(OaLocationReport.city.like(f"%{city}%"))
    
    # 日期范围筛选
    if start_date:
        start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(OaLocationReport.create_time >= start_datetime)
    
    if end_date:
        end_datetime = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        query = query.where(OaLocationReport.create_time <= end_datetime)
    
    # 排序和分页
    query = query.order_by(OaLocationReport.create_time.desc()).offset(skip).limit(limit)
    
    locations = session.exec(query).all()
    return locations


@router.get("/count", summary="获取位置上报总数")
async def get_locations_count(
    user_id: Optional[int] = Query(None, description="用户ID筛选"),
    username: Optional[str] = Query(None, description="用户名筛选"),
    city: Optional[str] = Query(None, description="城市筛选"),
    start_date: Optional[str] = Query(None, description="开始日期"),
    end_date: Optional[str] = Query(None, description="结束日期"),
    session: Session = Depends(get_mysql_session)
):
    """获取位置上报总数"""
    query = select(func.count(OaLocationReport.id))
    
    if user_id is not None:
        query = query.where(OaLocationReport.user_id == user_id)
    
    if username:
        query = query.where(OaLocationReport.username.like(f"%{username}%"))
    
    if city:
        query = query.where(OaLocationReport.city.like(f"%{city}%"))
    
    if start_date:
        start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(OaLocationReport.create_time >= start_datetime)
    
    if end_date:
        end_datetime = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        query = query.where(OaLocationReport.create_time <= end_datetime)
    
    count = session.exec(query).one()
    return {"count": count}


@router.get("/{location_id}", response_model=OaLocationReportResponse, summary="获取单个位置上报")
async def get_location(
    location_id: int,
    session: Session = Depends(get_mysql_session)
):
    """根据ID获取位置上报详情"""
    location = session.get(OaLocationReport, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="位置上报记录不存在")
    return location


@router.post("/", response_model=OaLocationReportResponse, summary="创建位置上报")
async def create_location(
    location_data: OaLocationReportCreate,
    session: Session = Depends(get_mysql_session)
):
    """创建新的位置上报记录"""
    # 创建位置上报记录
    location = OaLocationReport(**location_data.model_dump())
    location.create_time = location.create_time or func.now()
    
    session.add(location)
    session.commit()
    session.refresh(location)
    
    return location


@router.put("/{location_id}", response_model=OaLocationReportResponse, summary="更新位置上报")
async def update_location(
    location_id: int,
    location_data: OaLocationReportUpdate,
    session: Session = Depends(get_mysql_session)
):
    """更新位置上报信息"""
    location = session.get(OaLocationReport, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="位置上报记录不存在")
    
    # 更新位置上报信息
    update_data = location_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(location, field, value)
    
    session.add(location)
    session.commit()
    session.refresh(location)
    
    return location


@router.delete("/{location_id}", summary="删除位置上报")
async def delete_location(
    location_id: int,
    session: Session = Depends(get_mysql_session)
):
    """删除位置上报记录"""
    location = session.get(OaLocationReport, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="位置上报记录不存在")
    
    session.delete(location)
    session.commit()
    
    return {"message": "位置上报记录删除成功"}


@router.get("/stats/summary", summary="获取位置上报统计摘要")
async def get_location_stats(
    user_id: Optional[int] = Query(None, description="用户ID筛选"),
    start_date: Optional[str] = Query(None, description="开始日期"),
    end_date: Optional[str] = Query(None, description="结束日期"),
    session: Session = Depends(get_mysql_session)
):
    """获取位置上报统计摘要"""
    base_query = select(OaLocationReport)
    
    if user_id is not None:
        base_query = base_query.where(OaLocationReport.user_id == user_id)
    
    if start_date:
        start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
        base_query = base_query.where(OaLocationReport.create_time >= start_datetime)
    
    if end_date:
        end_datetime = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        base_query = base_query.where(OaLocationReport.create_time <= end_datetime)
    
    # 总记录数
    total_count = session.exec(select(func.count(OaLocationReport.id)).select_from(base_query.subquery())).one()
    
    # 不同用户数
    unique_users = session.exec(
        select(func.count(func.distinct(OaLocationReport.user_id))).select_from(base_query.subquery())
    ).one()
    
    # 不同城市数
    unique_cities = session.exec(
        select(func.count(func.distinct(OaLocationReport.city))).select_from(base_query.subquery())
    ).one()
    
    # 最近上报时间
    latest_report = session.exec(
        select(func.max(OaLocationReport.create_time)).select_from(base_query.subquery())
    ).one()
    
    return {
        "total_reports": total_count,
        "unique_users": unique_users,
        "unique_cities": unique_cities,
        "latest_report_time": latest_report
    }


@router.get("/stats/by-city", summary="按城市统计位置上报")
async def get_location_stats_by_city(
    limit: int = Query(10, ge=1, le=50, description="返回前N个城市"),
    start_date: Optional[str] = Query(None, description="开始日期"),
    end_date: Optional[str] = Query(None, description="结束日期"),
    session: Session = Depends(get_mysql_session)
):
    """按城市统计位置上报数量"""
    query = select(
        OaLocationReport.city,
        func.count(OaLocationReport.id).label("count")
    ).where(OaLocationReport.city.isnot(None))
    
    if start_date:
        start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
        query = query.where(OaLocationReport.create_time >= start_datetime)
    
    if end_date:
        end_datetime = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        query = query.where(OaLocationReport.create_time <= end_datetime)
    
    query = query.group_by(OaLocationReport.city).order_by(func.count(OaLocationReport.id).desc()).limit(limit)
    
    results = session.exec(query).all()
    
    return [
        {"city": result.city, "count": result.count} 
        for result in results
    ]
