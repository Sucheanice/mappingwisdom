from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, func
from decimal import Decimal
import httpx
import os

from app.core.mysql_db import get_mysql_session
from app.models_mysql import (
    StoreLocation, 
    StoreLocationCreate, 
    StoreLocationUpdate, 
    StoreLocationResponse
)

# 高德地图 API 配置
AMAP_GEOCODE_BASE = "https://restapi.amap.com/v3/geocode/geo"
# ⚠️ 警告：生产环境必须通过环境变量 AMAP_API_KEY 配置，默认值仅用于开发
AMAP_API_KEY = os.environ.get("AMAP_API_KEY", "cbfcad74ad3ddfb72ba7770a8169cf36")

router = APIRouter(prefix="/mysql/store-locations", tags=["MySQL店铺位置"])


@router.get("/", response_model=List[StoreLocationResponse], summary="获取店铺位置列表", include_in_schema=False)
async def get_store_locations(
    skip: int = Query(0, ge=0, description="跳过记录数"),
    limit: int = Query(10, ge=1, le=1000, description="每页记录数（最大1000）"),
    address: Optional[str] = Query(None, description="地址筛选"),
    is_visited: Optional[int] = Query(None, description="到店状态筛选（0：否，1：是）"),
    session: Session = Depends(get_mysql_session)
):
    """获取店铺位置列表，支持分页和筛选"""
    query = select(StoreLocation)
    
    # 地址筛选
    if address:
        query = query.where(StoreLocation.address.like(f"%{address}%"))
    
    # 到店状态筛选
    if is_visited is not None:
        query = query.where(StoreLocation.is_visited == is_visited)
    
    # 排序和分页
    query = query.order_by(StoreLocation.id.desc()).offset(skip).limit(limit)
    
    locations = session.exec(query).all()
    return locations


# 已注释：店铺地图功能暂时停用
# @router.get("/all", response_model=List[StoreLocationResponse], summary="获取所有店铺位置（用于地图显示）")
# async def get_all_store_locations(
#     session: Session = Depends(get_mysql_session)
# ):
#     """获取所有店铺位置，不分页，用于地图显示"""
#     query = select(StoreLocation).order_by(StoreLocation.id.desc())
#     locations = session.exec(query).all()
#     return locations


@router.get("/count", summary="获取店铺位置总数", include_in_schema=False)
async def get_store_locations_count(
    address: Optional[str] = Query(None, description="地址筛选"),
    is_visited: Optional[int] = Query(None, description="到店状态筛选（0：否，1：是）"),
    session: Session = Depends(get_mysql_session)
):
    """获取店铺位置总数"""
    query = select(func.count(StoreLocation.id))
    
    if address:
        query = query.where(StoreLocation.address.like(f"%{address}%"))
    
    if is_visited is not None:
        query = query.where(StoreLocation.is_visited == is_visited)
    
    count = session.exec(query).one()
    return {"count": count}


@router.get("/{location_id}", response_model=StoreLocationResponse, summary="获取单个店铺位置", include_in_schema=False)
async def get_store_location(
    location_id: int,
    session: Session = Depends(get_mysql_session)
):
    """根据ID获取店铺位置详情"""
    location = session.get(StoreLocation, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="店铺位置记录不存在")
    return location


@router.post("/", response_model=StoreLocationResponse, summary="创建店铺位置", include_in_schema=False)
async def create_store_location(
    location_data: StoreLocationCreate,
    session: Session = Depends(get_mysql_session)
):
    """创建新的店铺位置记录"""
    # 创建店铺位置记录
    location = StoreLocation(**location_data.model_dump())
    
    session.add(location)
    session.commit()
    session.refresh(location)
    
    return location


@router.put("/{location_id}", response_model=StoreLocationResponse, summary="更新店铺位置", include_in_schema=False)
async def update_store_location(
    location_id: int,
    location_data: StoreLocationUpdate,
    session: Session = Depends(get_mysql_session)
):
    """更新店铺位置信息"""
    location = session.get(StoreLocation, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="店铺位置记录不存在")
    
    # 更新店铺位置信息
    update_data = location_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(location, field, value)
    
    session.add(location)
    session.commit()
    session.refresh(location)
    
    return location


@router.delete("/{location_id}", summary="删除店铺位置", include_in_schema=False)
async def delete_store_location(
    location_id: int,
    session: Session = Depends(get_mysql_session)
):
    """删除店铺位置记录"""
    location = session.get(StoreLocation, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="店铺位置记录不存在")
    
    session.delete(location)
    session.commit()
    
    return {"message": "店铺位置记录删除成功"}


@router.get("/stats/summary", summary="获取店铺位置统计摘要", include_in_schema=False)
async def get_store_location_stats(
    session: Session = Depends(get_mysql_session)
):
    """获取店铺位置统计摘要"""
    # 总记录数
    total_count = session.exec(select(func.count(StoreLocation.id))).one()
    
    # 已到店数量
    visited_count = session.exec(
        select(func.count(StoreLocation.id)).where(StoreLocation.is_visited == 1)
    ).one()
    
    # 未到店数量
    not_visited_count = total_count - visited_count
    
    return {
        "total_stores": total_count,
        "visited_stores": visited_count,
        "not_visited_stores": not_visited_count,
        "visit_rate": round(visited_count / total_count * 100, 2) if total_count > 0 else 0
    }


@router.post("/batch-update-coordinates", summary="批量更新所有店铺的经纬度", include_in_schema=False)
async def batch_update_coordinates(
    session: Session = Depends(get_mysql_session)
):
    """
    批量更新所有店铺位置的经纬度
    根据地址调用高德地图API获取经纬度并更新数据库
    """
    # 获取所有店铺位置
    query = select(StoreLocation)
    locations = session.exec(query).all()
    
    if not locations:
        return {
            "success": True,
            "message": "没有店铺位置需要更新",
            "total": 0,
            "success_count": 0,
            "failed_count": 0,
            "failed_items": []
        }
    
    success_count = 0
    failed_count = 0
    failed_items = []
    
    async with httpx.AsyncClient() as client:
        for location in locations:
            try:
                # 调用高德地图地理编码API
                params = {
                    "key": AMAP_API_KEY,
                    "address": location.address,
                    "output": "json"
                }
                
                resp = await client.get(
                    AMAP_GEOCODE_BASE,
                    params=params,
                    timeout=10.0
                )
                resp.raise_for_status()
                data = resp.json()
                
                if data and data.get("status") == "1":
                    geocodes = data.get("geocodes", [])
                    if geocodes:
                        geocode_item = geocodes[0]
                        location_str = geocode_item.get("location", "").split(",")
                        
                        if len(location_str) == 2:
                            longitude = Decimal(str(location_str[0]))
                            latitude = Decimal(str(location_str[1]))
                            
                            # 更新经纬度
                            location.longitude = longitude
                            location.latitude = latitude
                            session.add(location)
                            success_count += 1
                        else:
                            failed_count += 1
                            failed_items.append({
                                "id": location.id,
                                "address": location.address,
                                "reason": "无法解析坐标"
                            })
                    else:
                        failed_count += 1
                        failed_items.append({
                            "id": location.id,
                            "address": location.address,
                            "reason": "未找到匹配的地址"
                        })
                else:
                    failed_count += 1
                    failed_items.append({
                        "id": location.id,
                        "address": location.address,
                        "reason": data.get("info", "地理编码失败") if data else "API请求失败"
                    })
                    
            except Exception as e:
                failed_count += 1
                failed_items.append({
                    "id": location.id,
                    "address": location.address,
                    "reason": f"请求异常: {str(e)}"
                })
    
    # 提交所有更新
    session.commit()
    
    return {
        "success": True,
        "message": f"批量更新完成：成功 {success_count} 个，失败 {failed_count} 个",
        "total": len(locations),
        "success_count": success_count,
        "failed_count": failed_count,
        "failed_items": failed_items
    }

