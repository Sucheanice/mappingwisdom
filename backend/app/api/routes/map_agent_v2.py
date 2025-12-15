"""
地图工具 Agent API v2
每个工具独立 endpoint，统一响应结构
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Security
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

from app.api.routes.map import (
    Marker,
    Drawing,
    Measurement,
    LocateRequest,
    add_marker,
    locate,
    switch_layer,
    add_drawing,
    add_measurement,
    clear_all,
    remove_drawing,
    remove_measurement,
    measure_distance,
    measure_area,
)
from app.core.map_state import map_state_manager
from app.core.mysql_db import get_mysql_session
from sqlmodel import Session

# API Key 认证
# ⚠️ 警告：生产环境必须通过环境变量 MAP_AGENT_API_KEY 配置，默认值仅用于开发
MAP_AGENT_API_KEY = os.environ.get("MAP_AGENT_API_KEY", "dify-map-agent-key-2024")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: Optional[str] = Security(api_key_header)) -> bool:
    """验证 API Key"""
    if api_key is None:
        allow_no_auth = os.environ.get("MAP_AGENT_ALLOW_NO_AUTH", "true").lower() == "true"
        return allow_no_auth
    return api_key == MAP_AGENT_API_KEY


router = APIRouter(prefix="/agent/map/v2", tags=["地图Agent v2"])


# ========== 统一的响应结构 ==========

class StandardResponse(BaseModel):
    """统一的响应结构，便于 LLM 记忆状态"""
    success: bool
    data: Dict[str, Any] = Field(default_factory=dict, description="操作结果数据")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="元数据，包含便于后续操作的信息")
    message: Optional[str] = None


def get_metadata() -> Dict[str, Any]:
    """获取当前地图状态元数据"""
    state = map_state_manager.get_state()
    return {
        "marker_ids": [m.get("id", "") for m in state.get("markers", [])],
        "drawing_ids": [d.get("id", "") for d in state.get("drawings", [])],
        "measurement_ids": [m.get("id", "") for m in state.get("measurements", [])],
        "current_layer": state.get("current_layer", "osm")
    }


# ========== 独立 endpoint ==========

@router.get("/get_map_state", summary="获取当前地图状态", response_model=StandardResponse)
async def get_map_state_v2(
    include_persistent: bool = Query(True, description="是否包含数据库中的永久标记点（默认true）"),
    include_temporary: bool = Query(True, description="是否包含内存中的临时标记点（默认true）"),
    name_filter: Optional[str] = Query(None, description="按名称过滤标记点（可选）"),
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """
    获取当前地图的完整状态，包括所有标记点、绘制图形、测量结果。
    
    **智能查询功能：**
    - 默认返回所有标记点（内存 + 数据库）
    - 支持参数控制查询范围
    - 支持按名称过滤
    
    **使用场景：**
    - 在测量距离/面积之前，先查看地图上有哪些标记点
    - 在删除资源之前，查看资源的ID
    - 了解当前地图的整体状态
    - 查询历史标记点
    
    **典型流程：**
    1. 用户说"测量天府广场和春熙路的距离"
    2. 先调用 get_map_state 查看是否有这两个标记点
    3. 如果没有，先调用 search_and_locate 添加标记点
    4. 然后调用 measure_distance 进行测量
    """
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    try:
        # 从内存获取标记点（当前会话）
        session_markers = []
        if include_temporary:
            state = map_state_manager.get_state()
            session_markers = state.get("markers", [])
        
        # 从数据库获取标记点（永久存储）
        persistent_markers = []
        if include_persistent:
            from app.models_mysql import MapMarker
            from sqlmodel import select
            
            query = select(MapMarker)
            if name_filter:
                query = query.where(MapMarker.name.like(f"%{name_filter}%"))
            
            db_markers = session.exec(query).all()
            for db_marker in db_markers:
                # 转换数据库格式到内存格式
                coord_data = db_marker.coordinate
                if isinstance(coord_data, dict):
                    coordinate = coord_data.get("coordinate", [])
                elif isinstance(coord_data, list):
                    coordinate = coord_data
                else:
                    coordinate = []
                
                persistent_markers.append({
                    "id": db_marker.marker_id,
                    "name": db_marker.name,
                    "coordinate": coordinate,
                    "description": db_marker.description or "",
                    "created_at": db_marker.create_time.isoformat() if db_marker.create_time else None
                })
        
        # 合并标记点（去重，按ID）
        all_markers_dict = {}
        for marker in session_markers:
            marker_id = marker.get("id", "")
            if marker_id:
                all_markers_dict[marker_id] = marker
        
        for marker in persistent_markers:
            marker_id = marker.get("id", "")
            if marker_id:
                # 如果内存中已有，优先使用内存中的（更新）
                if marker_id not in all_markers_dict:
                    all_markers_dict[marker_id] = marker
        
        all_markers = list(all_markers_dict.values())
        
        # 格式化标记点信息，便于 AI 理解
        markers_info = []
        for marker in all_markers:
            markers_info.append({
                "id": marker.get("id", ""),
                "name": marker.get("name", ""),
                "coordinate": marker.get("coordinate", []),
                "description": marker.get("description", "")
            })
        
        # 从内存获取绘制图形和测量结果
        state = map_state_manager.get_state()
        
        # 格式化绘制图形信息
        drawings_info = []
        for drawing in state.get("drawings", []):
            drawings_info.append({
                "id": drawing.get("id", ""),
                "type": drawing.get("type", ""),
                "coordinates": drawing.get("coordinates", [])
            })
        
        # 格式化测量结果信息
        measurements_info = []
        for measurement in state.get("measurements", []):
            measurements_info.append({
                "id": measurement.get("id", ""),
                "type": measurement.get("type", ""),
                "value": measurement.get("value", "")
            })
        
        # 统计信息
        session_count = len(session_markers) if include_temporary else 0
        persistent_count = len(persistent_markers) if include_persistent else 0
        total_count = len(markers_info)
        
        return StandardResponse(
            success=True,
            data={
                "type": "state",
                "markers": markers_info,
                "markers_by_source": {
                    "session": session_markers if include_temporary else [],
                    "persistent": persistent_markers if include_persistent else [],
                    "all": markers_info
                },
                "drawings": drawings_info,
                "measurements": measurements_info,
                "current_layer": state.get("current_layer", "osm"),
                "center": state.get("center", [0, 0]),
                "zoom": state.get("zoom", 2),
                "statistics": {
                    "session_markers": session_count,
                    "persistent_markers": persistent_count,
                    "total_markers": total_count,
                    "drawings": len(drawings_info),
                    "measurements": len(measurements_info)
                }
            },
            metadata=get_metadata(),
            message=f"当前地图有 {total_count} 个标记点（会话: {session_count}, 永久: {persistent_count}），{len(drawings_info)} 个绘制图形，{len(measurements_info)} 个测量结果"
        )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"获取地图状态失败：{str(e)}"
        )


@router.post("/search_and_locate", summary="搜索位置并在地图上标记", response_model=StandardResponse)
async def search_and_locate(
    query: str = Body(..., description="搜索关键词"),
    zoom: int = Body(15, ge=1, le=20, description="缩放级别"),
    add_marker: bool = Body(True, description="是否添加标记点"),
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """搜索位置并在地图上定位，同时添加标记点"""
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    try:
        locate_req = LocateRequest(query=query, zoom=zoom, add_marker=add_marker)
        result = await locate(locate_req, session=session)
        
        if result.get("success"):
            marker = result.get("marker")
            return StandardResponse(
                success=True,
                data={
                    "id": marker.get("id", "") if marker else "",
                    "name": marker.get("name", query) if marker else query,
                    "coordinate": marker.get("coordinate", []) if marker else [],
                    "type": "marker"
                },
                metadata=get_metadata(),
                message=result.get("message", f"已定位到 {query}")
            )
        else:
            return StandardResponse(
                success=False,
                message=result.get("message", "搜索失败")
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"搜索失败：{str(e)}"
        )


@router.post("/add_map_marker", summary="添加地图标记点", response_model=StandardResponse)
async def add_map_marker(
    name: str = Body(..., description="标记点名称"),
    longitude: float = Body(..., ge=-180, le=180, description="经度"),
    latitude: float = Body(..., ge=-90, le=90, description="纬度"),
    description: Optional[str] = Body(None, description="描述信息"),
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """在地图上添加一个精确坐标的标记点"""
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    try:
        marker_id = f"agent_{uuid.uuid4().hex[:8]}"
        marker = Marker(
            id=marker_id,
            name=name,
            coordinate=[longitude, latitude],
            description=description,
            created_at=datetime.now().isoformat()
        )
        
        result = await add_marker(marker=marker, session=session)
        
        if result.get("success"):
            return StandardResponse(
                success=True,
                data={
                    "id": marker_id,
                    "name": name,
                    "coordinate": [longitude, latitude],
                    "type": "marker"
                },
                metadata=get_metadata(),
                message=f"已在地图上添加标记点：{name}"
            )
        else:
            return StandardResponse(
                success=False,
                message="添加标记点失败"
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"添加标记点失败：{str(e)}"
        )


@router.post("/switch_map_layer", summary="切换地图图层", response_model=StandardResponse)
async def switch_map_layer(
    layer_type: str = Body(..., description="图层类型：osm(标准地图)、satellite(卫星地图)、terrain(路网地图)"),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """切换地图图层类型"""
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    if layer_type not in ["osm", "satellite", "terrain"]:
        return StandardResponse(
            success=False,
            message=f"无效的图层类型：{layer_type}，支持：osm, satellite, terrain"
        )
    
    try:
        result = await switch_layer(layer_type=layer_type)
        
        if result.get("success"):
            layer_names = {"osm": "标准地图", "satellite": "卫星地图", "terrain": "路网地图"}
            return StandardResponse(
                success=True,
                data={
                    "type": "layer",
                    "name": layer_names.get(layer_type, layer_type)
                },
                metadata=get_metadata(),
                message=result.get("message", f"已切换到{layer_names.get(layer_type, layer_type)}")
            )
        else:
            return StandardResponse(
                success=False,
                message="切换图层失败"
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"切换图层失败：{str(e)}"
        )


@router.post("/measure_distance", summary="测量两个位置之间的距离", response_model=StandardResponse)
async def measure_distance_v2(
    marker1_name: Optional[str] = Body(None, description="第一个位置的名称（如'天府广场'）"),
    marker2_name: Optional[str] = Body(None, description="第二个位置的名称（如'春熙路'）"),
    marker1_id: Optional[str] = Body(None, description="第一个标记点的ID（从 get_map_state 获取）"),
    marker2_id: Optional[str] = Body(None, description="第二个标记点的ID（从 get_map_state 获取）"),
    point1: Optional[List[float]] = Body(None, description="第一个位置的坐标 [经度, 纬度]"),
    point2: Optional[List[float]] = Body(None, description="第二个位置的坐标 [经度, 纬度]"),
    unit: str = Body("km", description="距离单位：m(米)、km(公里)、mile(英里)"),
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """
    测量两个位置之间的距离。
    
    **使用场景：**
    - 用户说"测量天府广场和春熙路的距离"
    - 用户说"这两个点之间有多远"
    - 用户说"从A到B有多少公里"
    
    **参数选择优先级：**
    1. **优先使用名称**（marker1_name, marker2_name）- 如果用户提到地名，直接使用名称，系统会自动搜索并获取坐标
    2. **使用标记点ID**（marker1_id, marker2_id）- 如果地图上已有标记点，先调用 get_map_state 获取ID
    3. **使用坐标**（point1, point2）- 如果已有坐标，直接使用
    
    **典型流程：**
    1. 用户说"测量天府广场和春熙路的距离"
    2. 直接调用 measure_distance，marker1_name="天府广场", marker2_name="春熙路"
    3. 系统会自动搜索这两个位置并计算距离
    
    **或者：**
    1. 用户说"测量这两个标记点的距离"
    2. 先调用 get_map_state 查看有哪些标记点
    3. 使用返回的 marker_ids 调用 measure_distance
    """
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    try:
        result = await measure_distance(
            marker1_id=marker1_id,
            marker1_name=marker1_name,
            marker2_id=marker2_id,
            marker2_name=marker2_name,
            point1=point1,
            point2=point2,
            unit=unit,
            session=session
        )
        
        if result.get("success"):
            measurement = result.get("measurement", {})
            return StandardResponse(
                success=True,
                data={
                    "id": measurement.get("id", ""),
                    "type": "measurement",
                    "value": result.get("distance_str", ""),
                    "coordinate": result.get("point1", []) + result.get("point2", []) if result.get("point1") and result.get("point2") else []
                },
                metadata=get_metadata(),
                message=result.get("message", f"两点间距离为 {result.get('distance_str', '')}")
            )
        else:
            return StandardResponse(
                success=False,
                message="测量距离失败"
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"测量距离失败：{str(e)}"
        )


@router.post("/measure_area", summary="测量多边形区域的面积", response_model=StandardResponse)
async def measure_area_v2(
    drawing_id: Optional[str] = Body(None, description="已绘制的多边形图形的ID（从 get_map_state 获取）"),
    coordinates: Optional[List[List[float]]] = Body(None, description="多边形的坐标列表 [[经度1, 纬度1], [经度2, 纬度2], ...]，首尾坐标应相同形成闭合"),
    unit: str = Body("km²", description="面积单位：m²(平方米)、km²(平方公里)、hectare(公顷)"),
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """
    测量多边形区域的面积。
    
    **使用场景：**
    - 用户说"测量这个区域的面积"
    - 用户说"这个多边形有多大"
    - 用户说"计算这个区域的面积"
    
    **参数选择：**
    1. **使用 drawing_id** - 如果用户说"测量这个绘制图形的面积"，先调用 get_map_state 查看有哪些绘制图形，获取对应的 drawing_id
    2. **使用 coordinates** - 如果用户提供了坐标或地名，先搜索获取坐标，然后传入 coordinates
    
    **坐标格式：**
    - 多边形坐标列表：[[经度1, 纬度1], [经度2, 纬度2], ..., [经度1, 纬度1]]
    - 首尾坐标必须相同，形成闭合多边形
    - 至少需要3个不同的点（4个坐标，首尾重复）
    
    **典型流程：**
    1. 用户说"测量天安门广场的面积"
    2. 先调用 search_and_locate 获取天安门广场的坐标
    3. 根据坐标范围构建多边形坐标列表
    4. 调用 measure_area，传入 coordinates
    
    **或者：**
    1. 用户说"测量这个绘制图形的面积"
    2. 先调用 get_map_state 查看有哪些绘制图形
    3. 使用对应的 drawing_id 调用 measure_area
    """
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    try:
        result = await measure_area(
            drawing_id=drawing_id,
            coordinates=coordinates,
            unit=unit,
            session=session
        )
        
        if result.get("success"):
            measurement = result.get("measurement", {})
            return StandardResponse(
                success=True,
                data={
                    "id": measurement.get("id", ""),
                    "type": "measurement",
                    "value": result.get("area_str", ""),
                    "coordinate": result.get("coordinates", [])
                },
                metadata=get_metadata(),
                message=result.get("message", f"区域面积为 {result.get('area_str', '')}")
            )
        else:
            return StandardResponse(
                success=False,
                message="测量面积失败"
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"测量面积失败：{str(e)}"
        )


@router.post("/add_map_drawing", summary="在地图上绘制图形", response_model=StandardResponse)
async def add_map_drawing_v2(
    drawing_type: str = Body(..., description="绘制类型：point(点)、line(线)、polygon(多边形)、circle(圆形)"),
    coordinates: List[List[float]] = Body(..., description="坐标数组"),
    drawing_id: Optional[str] = Body(None, description="绘制图形ID（可选）"),
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """
    在地图上绘制图形（点、线、多边形、圆形）。
    
    **使用场景：**
    - 用户要求"画一条线连接两个点" → 使用 line 类型
    - 用户要求"标记一个区域" → 使用 polygon 类型
    - 用户要求"画一个圆" → 使用 circle 类型
    
    **坐标格式说明：**
    - point: [[经度, 纬度]]，例如：[[116.3974, 39.9093]]
    - line: [[经度1, 纬度1], [经度2, 纬度2], ...]，至少2个点
    - polygon: [[经度1, 纬度1], [经度2, 纬度2], ..., [经度1, 纬度1]]，首尾相同形成闭合
    - circle: [[圆心经度, 圆心纬度], [圆周上一点经度, 圆周上一点纬度]]
    
    **获取坐标的方法：**
    1. 如果用户提到地名，先使用 search_and_locate 获取坐标
    2. 如果地图上已有标记点，使用 get_map_state 查看标记点的坐标
    3. 如果用户提供坐标，直接使用
    
    **典型流程：**
    1. 用户说"画一条线从天安门到故宫"
    2. 先调用 search_and_locate("天安门") 和 search_and_locate("故宫") 获取坐标
    3. 然后调用 add_map_drawing，drawing_type="line"，coordinates=[[天安门坐标], [故宫坐标]]
    """
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    if drawing_type not in ["point", "line", "polygon", "circle"]:
        return StandardResponse(
            success=False,
            message=f"无效的绘制类型：{drawing_type}，支持：point, line, polygon, circle"
        )
    
    try:
        if not drawing_id:
            drawing_id = f"agent_draw_{uuid.uuid4().hex[:8]}"
        
        drawing = Drawing(
            id=drawing_id,
            type=drawing_type,
            coordinates=coordinates,
            style=None,
            created_at=datetime.now().isoformat()
        )
        
        result = await add_drawing(drawing=drawing, session=session)
        
        if result.get("success"):
            return StandardResponse(
                success=True,
                data={
                    "id": drawing_id,
                    "type": "drawing",
                    "coordinate": coordinates
                },
                metadata=get_metadata(),
                message=f"已添加{drawing_type}绘制图形"
            )
        else:
            return StandardResponse(
                success=False,
                message="添加绘制图形失败"
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"添加绘制图形失败：{str(e)}"
        )


@router.post("/remove_map_drawing", summary="删除指定的绘制图形", response_model=StandardResponse)
async def remove_map_drawing_v2(
    drawing_id: str = Body(..., description="要删除的绘制图形ID"),
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """删除指定的绘制图形"""
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    try:
        result = await remove_drawing(drawing_id=drawing_id, session=session)
        
        if result.get("success"):
            return StandardResponse(
                success=True,
                data={},
                metadata=get_metadata(),
                message=f"已删除绘制图形：{drawing_id}"
            )
        else:
            return StandardResponse(
                success=False,
                message="删除绘制图形失败"
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"删除绘制图形失败：{str(e)}"
        )


@router.post("/remove_map_measurement", summary="删除指定的测量结果", response_model=StandardResponse)
async def remove_map_measurement_v2(
    measurement_id: str = Body(..., description="要删除的测量结果ID"),
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """删除指定的测量结果"""
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    try:
        result = await remove_measurement(measurement_id=measurement_id, session=session)
        
        if result.get("success"):
            return StandardResponse(
                success=True,
                data={},
                metadata=get_metadata(),
                message=f"已删除测量结果：{measurement_id}"
            )
        else:
            return StandardResponse(
                success=False,
                message="删除测量结果失败"
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"删除测量结果失败：{str(e)}"
        )


@router.post("/clear_map_all", summary="清除地图上的所有内容", response_model=StandardResponse)
async def clear_map_all_v2(
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> StandardResponse:
    """清除地图上的所有标记点、绘制图形和测量结果"""
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    try:
        result = await clear_all(session=session)
        
        if result.get("success"):
            return StandardResponse(
                success=True,
                data={},
                metadata={
                    "marker_ids": [],
                    "drawing_ids": [],
                    "measurement_ids": [],
                    "current_layer": "osm"
                },
                message="已清除地图上的所有内容"
            )
        else:
            return StandardResponse(
                success=False,
                message="清除失败"
            )
    except Exception as e:
        return StandardResponse(
            success=False,
            message=f"清除失败：{str(e)}"
        )


# ========== OpenAPI Schema 导出 ==========

@router.get("/openapi.json", summary="获取 OpenAPI Schema v2", response_class=JSONResponse)
async def get_openapi_schema_v2(
    request: Request,
    api_key_valid: bool = Depends(verify_api_key)
):
    """生成 OpenAPI Schema v2"""
    if not api_key_valid:
        raise HTTPException(status_code=401, detail="Invalid or missing API Key")
    
    # 读取生成的 Schema 文件
    import json
    from pathlib import Path
    
    schema_path = Path(__file__).parent.parent.parent.parent / "DIFY_OPENAPI_SCHEMA2.json"
    
    if schema_path.exists():
        with open(schema_path, "r", encoding="utf-8") as f:
            schema = json.load(f)
        
        # 更新 base_url
        base_url = str(request.base_url).rstrip("/")
        schema["servers"][0]["url"] = f"{base_url}/api/v1/agent/map/v2"
        
        return JSONResponse(
            content=schema,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, X-API-Key"
            }
        )
    else:
        raise HTTPException(status_code=500, detail="Schema file not found")

