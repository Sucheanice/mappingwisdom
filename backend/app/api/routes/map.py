from __future__ import annotations

import os
import math
from datetime import datetime
from typing import Any, Optional, List

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from app.api.routes.map_ws import broadcast_event
from app.core.map_state import map_state_manager
from app.core.mysql_db import get_mysql_session
from app.models_mysql import MapDrawing, MapMeasurement, MapMarker

# 高德地图 API 配置
AMAP_GEOCODE_BASE = "https://restapi.amap.com/v3/geocode/geo"
# ⚠️ 警告：生产环境必须通过环境变量 AMAP_API_KEY 配置，默认值仅用于开发
AMAP_API_KEY = os.environ.get("AMAP_API_KEY", "cbfcad74ad3ddfb72ba7770a8169cf36")
USER_AGENT = "mappingwisdom/1.0"


router = APIRouter(prefix="/map", tags=["map"])


class Marker(BaseModel):
    id: str
    name: str
    coordinate: list[float]  # [lon, lat]
    description: str | None = None
    created_at: str | None = None


class Drawing(BaseModel):
    id: str
    type: str = Field(..., description="绘制类型: point, line, polygon, circle")
    coordinates: list[Any] = Field(..., description="坐标数据，根据类型不同格式不同")
    style: dict[str, Any] | None = Field(None, description="样式信息")
    created_at: str | None = None


class Measurement(BaseModel):
    id: str
    type: str = Field(..., description="测量类型: length(距离) 或 area(面积)")
    value: str = Field(..., description="测量结果值，如 '100.50 m' 或 '25.30 m²'")
    coordinates: list[Any] = Field(..., description="测量图形的坐标数据")
    created_at: str | None = None


class LocateRequest(BaseModel):
    query: str = Field(..., description="搜索关键词（城市名称或地址）")
    zoom: int = Field(15, description="缩放级别")
    add_marker: bool = Field(True, description="是否添加标记点")


@router.get("/state")
async def get_state() -> dict[str, Any]:
    return {"success": True, "state": map_state_manager.get_state()}


@router.post("/markers")
async def add_marker(
    marker: Marker,
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """添加标记点"""
    marker.created_at = marker.created_at or datetime.now().isoformat()
    
    # 保存到内存状态
    map_state_manager.add_marker(marker.model_dump())
    
    # 保存到数据库
    try:
        # 先检查是否已存在（避免唯一约束冲突导致 ID 跳跃）
        stmt = select(MapMarker).where(MapMarker.marker_id == marker.id)
        existing_marker = session.exec(stmt).first()
        
        if existing_marker:
            # 如果已存在，更新而不是插入
            existing_marker.name = marker.name
            existing_marker.coordinate = {"coordinate": marker.coordinate}
            existing_marker.description = marker.description
            session.add(existing_marker)
        else:
            # 如果不存在，插入新记录
            db_marker = MapMarker(
                marker_id=marker.id,
                name=marker.name,
                coordinate={"coordinate": marker.coordinate},  # 转换为字典格式
                description=marker.description,
                create_time=datetime.now()
            )
            session.add(db_marker)
        
        session.commit()
        if existing_marker:
            session.refresh(existing_marker)
        else:
            session.refresh(db_marker)
    except IntegrityError as e:
        session.rollback()
        # 如果是唯一约束冲突，尝试更新
        try:
            stmt = select(MapMarker).where(MapMarker.marker_id == marker.id)
            existing_marker = session.exec(stmt).first()
            if existing_marker:
                existing_marker.name = marker.name
                existing_marker.coordinate = {"coordinate": marker.coordinate}
                existing_marker.description = marker.description
                session.add(existing_marker)
                session.commit()
                session.refresh(existing_marker)
            else:
                raise HTTPException(status_code=500, detail=f"保存标记点失败: {str(e)}")
        except Exception as e2:
            session.rollback()
            print(f"更新标记点失败: {e2}")
            raise HTTPException(status_code=500, detail=f"保存标记点失败: {str(e2)}")
    except Exception as e:
        session.rollback()
        print(f"保存标记点到数据库失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存标记点失败: {str(e)}")
    
    await broadcast_event("addMarker", {"lon": marker.coordinate[0], "lat": marker.coordinate[1], "id": marker.id, "name": marker.name})
    return {"success": True, "marker": marker}


@router.post("/locate", summary="搜索位置并定位")
async def locate(
    request: LocateRequest,
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """搜索位置并定位到该位置"""
    query = request.query
    zoom = request.zoom
    add_marker = request.add_marker
    
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="搜索关键词不能为空")
    
    coordinate: list[float] | None = None
    name: str = query.strip()
    
    # 优先使用高德地图 API 进行地理编码
    try:
        params = {
            "key": AMAP_API_KEY,
            "address": name,
            "output": "json"
        }
        headers = {"User-Agent": USER_AGENT}
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(
                    AMAP_GEOCODE_BASE,
                    params=params,
                    headers=headers,
                    timeout=15.0
                )
                resp.raise_for_status()
                data = resp.json()
                
                if data and data.get("status") == "1":
                    geocodes = data.get("geocodes", [])
                    if geocodes and len(geocodes) > 0:
                        geocode_item = geocodes[0]
                        location = geocode_item.get("location", "").split(",")  # 高德返回格式：经度,纬度
                        if len(location) == 2:
                            coordinate = [float(location[0]), float(location[1])]
                            # 使用高德返回的格式化地址
                            formatted_address = geocode_item.get("formatted_address", name)
                            if formatted_address:
                                name = formatted_address
            except Exception as e:
                print(f"高德地图 API 调用失败: {e}")
    except Exception as e:
        print(f"高德地图地理编码失败: {e}")
    
    # 如果高德地图 API 失败，回退到 Nominatim（OpenStreetMap）
    if coordinate is None:
        try:
            nominatim_url = "https://nominatim.openstreetmap.org/search"
            params = {
                "format": "json",
                "q": name,
                "limit": 1,
                "addressdetails": 1
            }
            headers = {
                "User-Agent": USER_AGENT
            }
            
            async with httpx.AsyncClient() as client:
                try:
                    resp = await client.get(
                        nominatim_url,
                        params=params,
                        headers=headers,
                        timeout=10.0
                    )
                    resp.raise_for_status()
                    results = resp.json()
                    
                    if results and len(results) > 0:
                        result = results[0]
                        coordinate = [float(result["lon"]), float(result["lat"])]
                        display_name = result.get("display_name", name)
                        if display_name:
                            name = display_name
                except Exception as e:
                    print(f"Nominatim API 调用失败: {e}")
        except Exception as e:
            print(f"Nominatim 地理编码失败: {e}")
    
    # 如果所有地理编码服务都失败，返回错误
    if coordinate is None:
        # 检查是否是网络连接问题
        error_detail = f"无法搜索位置 '{name}'。"
        error_detail += "可能的原因：1) 网络连接问题；2) 搜索关键词不正确。"
        error_detail += "请尝试使用更具体的关键词（如：'北京市'、'上海市黄浦区'）或检查网络连接。"
        raise HTTPException(
            status_code=500,
            detail=error_detail
        )
    
    # 更新地图中心
    map_state_manager.update_center(coordinate[0], coordinate[1], zoom)
    
    # 广播地图中心移动事件（让前端地图移动到新位置）
    await broadcast_event("setCenter", {
        "lon": coordinate[0],
        "lat": coordinate[1],
        "zoom": zoom
    })

    marker_info: dict[str, Any] | None = None
    if add_marker:
        marker_info = {
            "id": f"loc_{datetime.now().timestamp():.0f}",
            "name": name,
            "coordinate": coordinate,
            "created_at": datetime.now().isoformat(),
        }
        map_state_manager.add_marker(marker_info)
        
        # 同时保存到数据库（确保数据持久化）
        try:
            stmt = select(MapMarker).where(MapMarker.marker_id == marker_info["id"])
            existing_marker = session.exec(stmt).first()
            
            if existing_marker:
                existing_marker.name = marker_info["name"]
                existing_marker.coordinate = {"coordinate": marker_info["coordinate"]}
                session.add(existing_marker)
            else:
                db_marker = MapMarker(
                    marker_id=marker_info["id"],
                    name=marker_info["name"],
                    coordinate={"coordinate": marker_info["coordinate"]},
                    description=None,
                    create_time=datetime.now()
                )
                session.add(db_marker)
            
            session.commit()
        except Exception as e:
            session.rollback()
            print(f"保存标记点到数据库失败（非关键错误，继续执行）: {e}")
        
        await broadcast_event("addMarker", {"lon": coordinate[0], "lat": coordinate[1], "name": name, "id": marker_info["id"]})

    return {
        "success": True,
        "map_instructions": {"center": coordinate, "zoom": zoom},
        "marker": marker_info,
        "message": f"已定位到 {name}",
    }


# ========== 图层切换 API ==========

@router.post("/layer", summary="切换地图图层")
async def switch_layer(
    layer_type: str = Body(..., embed=True, description="图层类型: osm(标准地图), satellite(卫星地图), terrain(路网地图)")
) -> dict[str, Any]:
    """切换地图图层类型"""
    if layer_type not in ["osm", "satellite", "terrain"]:
        raise HTTPException(
            status_code=400,
            detail=f"无效的图层类型: {layer_type}。支持的类型: osm(标准地图), satellite(卫星地图), terrain(路网地图)"
        )
    
    map_state_manager.update_layer(layer_type)
    await broadcast_event("switchLayer", {"layer_type": layer_type})
    
    layer_names = {
        "osm": "标准地图",
        "satellite": "卫星地图",
        "terrain": "路网地图"
    }
    
    return {
        "success": True,
        "message": f"图层已切换为: {layer_names.get(layer_type, layer_type)}",
        "layer_type": layer_type,
        "layer_name": layer_names.get(layer_type, layer_type)
    }


# ========== 绘制图形 API ==========

@router.post("/drawings", summary="添加绘制图形")
async def add_drawing(
    drawing: Drawing,
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """添加绘制图形（点、线、多边形、圆形）"""
    drawing.created_at = drawing.created_at or datetime.now().isoformat()
    
    # 保存到内存状态
    map_state_manager.add_drawing(drawing.model_dump())
    
    # 保存到数据库
    try:
        # 先检查是否已存在（避免唯一约束冲突导致 ID 跳跃）
        stmt = select(MapDrawing).where(MapDrawing.drawing_id == drawing.id)
        existing_drawing = session.exec(stmt).first()
        
        if existing_drawing:
            # 如果已存在，更新而不是插入
            existing_drawing.type = drawing.type
            existing_drawing.coordinates = {"coordinates": drawing.coordinates}
            existing_drawing.style = drawing.style
            session.add(existing_drawing)
        else:
            # 如果不存在，插入新记录
            db_drawing = MapDrawing(
                drawing_id=drawing.id,
                type=drawing.type,
                coordinates={"coordinates": drawing.coordinates},  # 转换为字典格式
                style=drawing.style,
                create_time=datetime.now()
            )
            session.add(db_drawing)
        
        session.commit()
        if existing_drawing:
            session.refresh(existing_drawing)
        else:
            session.refresh(db_drawing)
    except IntegrityError as e:
        session.rollback()
        # 如果是唯一约束冲突，尝试更新
        try:
            stmt = select(MapDrawing).where(MapDrawing.drawing_id == drawing.id)
            existing_drawing = session.exec(stmt).first()
            if existing_drawing:
                existing_drawing.type = drawing.type
                existing_drawing.coordinates = {"coordinates": drawing.coordinates}
                existing_drawing.style = drawing.style
                session.add(existing_drawing)
                session.commit()
                session.refresh(existing_drawing)
            else:
                raise HTTPException(status_code=500, detail=f"保存绘制图形失败: {str(e)}")
        except Exception as e2:
            session.rollback()
            print(f"更新绘制图形失败: {e2}")
            raise HTTPException(status_code=500, detail=f"保存绘制图形失败: {str(e2)}")
    except Exception as e:
        session.rollback()
        print(f"保存绘制图形到数据库失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存绘制图形失败: {str(e)}")
    
    await broadcast_event("addDrawing", {
        "id": drawing.id,
        "type": drawing.type,
        "coordinates": drawing.coordinates
    })
    return {"success": True, "drawing": drawing}


@router.delete("/drawings/{drawing_id}", summary="删除绘制图形")
async def remove_drawing(
    drawing_id: str,
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """删除指定ID的绘制图形"""
    # 从内存状态删除
    map_state_manager.remove_drawing(drawing_id)
    
    # 从数据库删除
    stmt = select(MapDrawing).where(MapDrawing.drawing_id == drawing_id)
    db_drawing = session.exec(stmt).first()
    if db_drawing:
        session.delete(db_drawing)
        session.commit()
    
    await broadcast_event("removeDrawing", {"id": drawing_id})
    return {"success": True, "message": "绘制图形删除成功", "removed_id": drawing_id}


@router.delete("/drawings", summary="清除所有绘制图形")
async def clear_drawings(
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """清除所有绘制图形"""
    # 从内存状态清除
    map_state_manager.clear_drawings()
    
    # 从数据库清除
    stmt = select(MapDrawing)
    db_drawings = session.exec(stmt).all()
    for db_drawing in db_drawings:
        session.delete(db_drawing)
    session.commit()
    
    await broadcast_event("clearDrawings", {})
    return {"success": True, "message": "所有绘制图形已清除"}


# ========== 测量结果 API ==========

@router.post("/measurements", summary="添加测量结果")
async def add_measurement(
    measurement: Measurement,
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """添加测量结果（距离、面积）"""
    measurement.created_at = measurement.created_at or datetime.now().isoformat()
    
    # 保存到内存状态
    map_state_manager.add_measurement(measurement.model_dump())
    
    # 保存到数据库
    try:
        # 先检查是否已存在（避免唯一约束冲突导致 ID 跳跃）
        stmt = select(MapMeasurement).where(MapMeasurement.measurement_id == measurement.id)
        existing_measurement = session.exec(stmt).first()
        
        if existing_measurement:
            # 如果已存在，更新而不是插入
            existing_measurement.type = measurement.type
            existing_measurement.value = measurement.value
            existing_measurement.coordinates = {"coordinates": measurement.coordinates}
            session.add(existing_measurement)
        else:
            # 如果不存在，插入新记录
            db_measurement = MapMeasurement(
                measurement_id=measurement.id,
                type=measurement.type,
                value=measurement.value,
                coordinates={"coordinates": measurement.coordinates},  # 转换为字典格式
                create_time=datetime.now()
            )
            session.add(db_measurement)
        
        session.commit()
        if existing_measurement:
            session.refresh(existing_measurement)
        else:
            session.refresh(db_measurement)
    except IntegrityError as e:
        session.rollback()
        # 如果是唯一约束冲突，尝试更新
        try:
            stmt = select(MapMeasurement).where(MapMeasurement.measurement_id == measurement.id)
            existing_measurement = session.exec(stmt).first()
            if existing_measurement:
                existing_measurement.type = measurement.type
                existing_measurement.value = measurement.value
                existing_measurement.coordinates = {"coordinates": measurement.coordinates}
                session.add(existing_measurement)
                session.commit()
                session.refresh(existing_measurement)
            else:
                raise HTTPException(status_code=500, detail=f"保存测量结果失败: {str(e)}")
        except Exception as e2:
            session.rollback()
            print(f"更新测量结果失败: {e2}")
            raise HTTPException(status_code=500, detail=f"保存测量结果失败: {str(e2)}")
    except Exception as e:
        session.rollback()
        print(f"保存测量结果到数据库失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存测量结果失败: {str(e)}")
    
    await broadcast_event("addMeasurement", {
        "id": measurement.id,
        "type": measurement.type,
        "value": measurement.value
    })
    return {"success": True, "measurement": measurement}


@router.delete("/measurements/{measurement_id}", summary="删除测量结果")
async def remove_measurement(
    measurement_id: str,
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """删除指定ID的测量结果"""
    # 从内存状态删除
    map_state_manager.remove_measurement(measurement_id)
    
    # 从数据库删除
    stmt = select(MapMeasurement).where(MapMeasurement.measurement_id == measurement_id)
    db_measurement = session.exec(stmt).first()
    if db_measurement:
        session.delete(db_measurement)
        session.commit()
    
    await broadcast_event("removeMeasurement", {"id": measurement_id})
    return {"success": True, "message": "测量结果删除成功", "removed_id": measurement_id}


@router.delete("/measurements", summary="清除所有测量结果")
async def clear_measurements(
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """清除所有测量结果"""
    # 从内存状态清除
    map_state_manager.clear_measurements()
    
    # 从数据库清除
    stmt = select(MapMeasurement)
    db_measurements = session.exec(stmt).all()
    for db_measurement in db_measurements:
        session.delete(db_measurement)
    session.commit()
    
    await broadcast_event("clearMeasurements", {})
    return {"success": True, "message": "所有测量结果已清除"}


# ========== 批量清除 API ==========

@router.post("/clear-all", summary="清除所有内容")
async def clear_all(
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """清除所有标记点、绘制图形和测量结果"""
    # 从内存状态清除
    map_state_manager.clear_markers()
    map_state_manager.clear_drawings()
    map_state_manager.clear_measurements()
    
    # 从数据库清除
    # 清除标记点
    markers_stmt = select(MapMarker)
    db_markers = session.exec(markers_stmt).all()
    for db_marker in db_markers:
        session.delete(db_marker)
    
    # 清除绘制图形
    drawings_stmt = select(MapDrawing)
    db_drawings = session.exec(drawings_stmt).all()
    for db_drawing in db_drawings:
        session.delete(db_drawing)
    
    # 清除测量结果
    measurements_stmt = select(MapMeasurement)
    db_measurements = session.exec(measurements_stmt).all()
    for db_measurement in db_measurements:
        session.delete(db_measurement)
    
    session.commit()
    
    await broadcast_event("clearAll", {})
    return {"success": True, "message": "所有内容已清除"}


# ========== 智能测量工具 ==========

def haversine_distance(point1: List[float], point2: List[float]) -> float:
    """
    使用 Haversine 公式计算两点间距离（单位：米）
    参数：point1, point2 格式为 [经度, 纬度]
    """
    R = 6371000  # 地球半径（米）
    
    lon1, lat1 = math.radians(point1[0]), math.radians(point1[1])
    lon2, lat2 = math.radians(point2[0]), math.radians(point2[1])
    
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    distance = R * c  # 距离（米）
    return distance


def calculate_polygon_area(coordinates: List[List[float]]) -> float:
    """
    计算多边形面积（单位：平方米）
    使用球面多边形面积计算公式
    参数：coordinates 格式为 [[lon1, lat1], [lon2, lat2], ...]
    """
    if len(coordinates) < 3:
        return 0.0
    
    R = 6371000  # 地球半径（米）
    area = 0.0
    
    # 确保多边形闭合（首尾点相同）
    if coordinates[0] != coordinates[-1]:
        coordinates = coordinates + [coordinates[0]]
    
    for i in range(len(coordinates) - 1):
        lon1, lat1 = math.radians(coordinates[i][0]), math.radians(coordinates[i][1])
        lon2, lat2 = math.radians(coordinates[i + 1][0]), math.radians(coordinates[i + 1][1])
        
        area += (lon2 - lon1) * (2 + math.sin(lat1) + math.sin(lat2))
    
    area = abs(area * R * R / 2.0)
    return area


@router.post("/measure-distance", summary="测量两个位置之间的距离")
async def measure_distance(
    marker1_id: Optional[str] = Body(None, description="第一个标记点的ID"),
    marker1_name: Optional[str] = Body(None, description="第一个标记点的名称（如'天府广场'）"),
    marker2_id: Optional[str] = Body(None, description="第二个标记点的ID"),
    marker2_name: Optional[str] = Body(None, description="第二个标记点的名称（如'春熙路'）"),
    point1: Optional[List[float]] = Body(None, description="第一个位置的坐标 [经度, 纬度]"),
    point2: Optional[List[float]] = Body(None, description="第二个位置的坐标 [经度, 纬度]"),
    unit: str = Body("km", description="距离单位：m(米)、km(公里)、mile(英里)"),
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """
    测量两个位置之间的距离
    
    支持以下方式：
    1. 通过标记点ID或名称查找坐标
    2. 直接提供坐标点
    """
    # 获取第一个点的坐标
    coord1: Optional[List[float]] = None
    
    if point1:
        coord1 = point1
    elif marker1_id or marker1_name:
        # 先检查内存中的标记点
        state = map_state_manager.get_state()
        memory_marker = None
        for marker in state.get("markers", []):
            if marker1_id and marker.get("id") == marker1_id:
                memory_marker = marker
                break
            elif marker1_name and marker.get("name") == marker1_name:
                memory_marker = marker
                break
        
        if memory_marker:
            coord1 = memory_marker.get("coordinate", [])
        else:
            # 如果内存中找不到，从数据库查找标记点
            query = select(MapMarker)
            if marker1_id:
                query = query.where(MapMarker.marker_id == marker1_id)
            elif marker1_name:
                query = query.where(MapMarker.name == marker1_name)
            
            marker1 = session.exec(query).first()
            if marker1:
                coord_data = marker1.coordinate
                if isinstance(coord_data, dict):
                    coord1 = coord_data.get("coordinate", [])
                elif isinstance(coord_data, list):
                    coord1 = coord_data
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"未找到标记点：{marker1_id or marker1_name}"
                )
    else:
        raise HTTPException(
            status_code=400,
            detail="必须提供 point1 或 (marker1_id/marker1_name)"
        )
    
    # 获取第二个点的坐标
    coord2: Optional[List[float]] = None
    
    if point2:
        coord2 = point2
    elif marker2_id or marker2_name:
        # 先检查内存中的标记点
        state = map_state_manager.get_state()
        memory_marker = None
        for marker in state.get("markers", []):
            if marker2_id and marker.get("id") == marker2_id:
                memory_marker = marker
                break
            elif marker2_name and marker.get("name") == marker2_name:
                memory_marker = marker
                break
        
        if memory_marker:
            coord2 = memory_marker.get("coordinate", [])
        else:
            # 如果内存中找不到，从数据库查找标记点
            query = select(MapMarker)
            if marker2_id:
                query = query.where(MapMarker.marker_id == marker2_id)
            elif marker2_name:
                query = query.where(MapMarker.name == marker2_name)
            
            marker2 = session.exec(query).first()
            if marker2:
                coord_data = marker2.coordinate
                if isinstance(coord_data, dict):
                    coord2 = coord_data.get("coordinate", [])
                elif isinstance(coord_data, list):
                    coord2 = coord_data
            else:
                raise HTTPException(
                    status_code=404,
                    detail=f"未找到标记点：{marker2_id or marker2_name}"
                )
    else:
        raise HTTPException(
            status_code=400,
            detail="必须提供 point2 或 (marker2_id/marker2_name)"
        )
    
    if not coord1 or not coord2:
        raise HTTPException(status_code=400, detail="无法获取坐标")
    
    if len(coord1) != 2 or len(coord2) != 2:
        raise HTTPException(status_code=400, detail="坐标格式错误，应为 [经度, 纬度]")
    
    # 计算距离（米）
    distance_m = haversine_distance(coord1, coord2)
    
    # 转换为指定单位
    if unit == "km":
        distance_value = distance_m / 1000
        distance_str = f"{distance_value:.2f} km"
    elif unit == "mile":
        distance_value = distance_m / 1609.34
        distance_str = f"{distance_value:.2f} mile"
    else:  # 默认米
        distance_value = distance_m
        distance_str = f"{distance_value:.2f} m"
    
    # 创建测量结果并保存
    measurement_id = f"dist_{datetime.now().timestamp():.0f}"
    measurement = Measurement(
        id=measurement_id,
        type="length",
        value=distance_str,
        coordinates=[coord1, coord2],
        created_at=datetime.now().isoformat()
    )
    
    # 保存到数据库和状态
    map_state_manager.add_measurement(measurement.model_dump())
    try:
        db_measurement = MapMeasurement(
            measurement_id=measurement_id,
            type="length",
            value=distance_str,
            coordinates={"coordinates": [coord1, coord2]},
            create_time=datetime.now()
        )
        session.add(db_measurement)
        session.commit()
        session.refresh(db_measurement)
    except Exception as e:
        session.rollback()
        print(f"保存测量结果失败: {e}")
    
    # 广播事件
    await broadcast_event("addMeasurement", {
        "id": measurement_id,
        "type": "length",
        "value": distance_str
    })
    
    return {
        "success": True,
        "distance": distance_value,
        "unit": unit,
        "distance_str": distance_str,
        "point1": coord1,
        "point2": coord2,
        "measurement": measurement.model_dump(),
        "message": f"两点间距离为 {distance_str}"
    }


@router.post("/measure-area", summary="测量多边形区域的面积")
async def measure_area(
    drawing_id: Optional[str] = Body(None, description="已绘制的多边形图形的ID"),
    coordinates: Optional[List[List[float]]] = Body(None, description="多边形的坐标列表 [[lon1, lat1], [lon2, lat2], ...]"),
    unit: str = Body("km²", description="面积单位：m²(平方米)、km²(平方公里)、hectare(公顷)"),
    session: Session = Depends(get_mysql_session)
) -> dict[str, Any]:
    """
    测量多边形区域的面积
    
    支持以下方式：
    1. 通过 drawing_id 查找已绘制的多边形
    2. 直接提供坐标列表
    """
    coords: Optional[List[List[float]]] = None
    
    if coordinates:
        coords = coordinates
    elif drawing_id:
        # 从数据库查找绘制图形
        db_drawing = session.exec(select(MapDrawing).where(MapDrawing.drawing_id == drawing_id)).first()
        if db_drawing:
            coord_data = db_drawing.coordinates
            if isinstance(coord_data, dict):
                coords = coord_data.get("coordinates", [])
            elif isinstance(coord_data, list):
                coords = coord_data
        else:
            raise HTTPException(status_code=404, detail=f"未找到绘制图形：{drawing_id}")
    else:
        raise HTTPException(
            status_code=400,
            detail="必须提供 coordinates 或 drawing_id"
        )
    
    if not coords or len(coords) < 3:
        raise HTTPException(status_code=400, detail="多边形至少需要3个点")
    
    # 计算面积（平方米）
    area_m2 = calculate_polygon_area(coords)
    
    # 转换为指定单位
    if unit == "km²":
        area_value = area_m2 / 1000000
        area_str = f"{area_value:.4f} km²"
    elif unit == "hectare":
        area_value = area_m2 / 10000
        area_str = f"{area_value:.4f} ha ({area_m2:.2f} m²)"
    else:  # 默认平方米
        area_value = area_m2
        if area_value > 10000:
            area_str = f"{area_value / 10000:.4f} ha ({area_value:.2f} m²)"
        else:
            area_str = f"{area_value:.2f} m²"
    
    # 创建测量结果并保存
    measurement_id = f"area_{datetime.now().timestamp():.0f}"
    measurement = Measurement(
        id=measurement_id,
        type="area",
        value=area_str,
        coordinates=coords,
        created_at=datetime.now().isoformat()
    )
    
    # 保存到数据库和状态
    map_state_manager.add_measurement(measurement.model_dump())
    try:
        db_measurement = MapMeasurement(
            measurement_id=measurement_id,
            type="area",
            value=area_str,
            coordinates={"coordinates": coords},
            create_time=datetime.now()
        )
        session.add(db_measurement)
        session.commit()
        session.refresh(db_measurement)
    except Exception as e:
        session.rollback()
        print(f"保存测量结果失败: {e}")
    
    # 广播事件
    await broadcast_event("addMeasurement", {
        "id": measurement_id,
        "type": "area",
        "value": area_str
    })
    
    return {
        "success": True,
        "area": area_value,
        "unit": unit,
        "area_str": area_str,
        "coordinates": coords,
        "measurement": measurement.model_dump(),
        "message": f"区域面积为 {area_str}"
    }


