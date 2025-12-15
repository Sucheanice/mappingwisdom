"""
从数据库加载地图状态到内存
实现方案3：数据库作为唯一数据源，内存作为缓存
"""
from __future__ import annotations

from typing import Any
from sqlmodel import Session, select

from app.core.map_state import map_state_manager
from app.models_mysql import MapMarker, MapDrawing, MapMeasurement


def load_map_state_from_db(session: Session) -> None:
    """
    从数据库加载地图状态到内存
    
    在应用启动时调用，确保内存状态与数据库同步
    """
    try:
        # 加载标记点
        markers_stmt = select(MapMarker)
        db_markers = session.exec(markers_stmt).all()
        
        markers = []
        for db_marker in db_markers:
            coord_data = db_marker.coordinate
            if isinstance(coord_data, dict):
                coordinate = coord_data.get("coordinate", [])
            elif isinstance(coord_data, list):
                coordinate = coord_data
            else:
                coordinate = []
            
            markers.append({
                "id": db_marker.marker_id,
                "name": db_marker.name,
                "coordinate": coordinate,
                "description": db_marker.description or "",
                "created_at": db_marker.create_time.isoformat() if db_marker.create_time else None
            })
        
        # 加载绘制图形
        drawings_stmt = select(MapDrawing)
        db_drawings = session.exec(drawings_stmt).all()
        
        drawings = []
        for db_drawing in db_drawings:
            coord_data = db_drawing.coordinates
            if isinstance(coord_data, dict):
                coordinates = coord_data.get("coordinates", [])
            elif isinstance(coord_data, list):
                coordinates = coord_data
            else:
                coordinates = []
            
            drawings.append({
                "id": db_drawing.drawing_id,
                "type": db_drawing.type,
                "coordinates": coordinates,
                "style": db_drawing.style,
                "created_at": db_drawing.create_time.isoformat() if db_drawing.create_time else None
            })
        
        # 加载测量结果
        measurements_stmt = select(MapMeasurement)
        db_measurements = session.exec(measurements_stmt).all()
        
        measurements = []
        for db_measurement in db_measurements:
            coord_data = db_measurement.coordinates
            if isinstance(coord_data, dict):
                coordinates = coord_data.get("coordinates", [])
            elif isinstance(coord_data, list):
                coordinates = coord_data
            else:
                coordinates = []
            
            measurements.append({
                "id": db_measurement.measurement_id,
                "type": db_measurement.type,
                "value": db_measurement.value,
                "coordinates": coordinates,
                "created_at": db_measurement.create_time.isoformat() if db_measurement.create_time else None
            })
        
        # 加载到内存状态
        map_state_manager.load_from_dict({
            "markers": markers,
            "drawings": drawings,
            "measurements": measurements
        })
        
        print(f"✅ 已从数据库加载地图状态：{len(markers)} 个标记点，{len(drawings)} 个绘制图形，{len(measurements)} 个测量结果")
        
    except Exception as e:
        print(f"⚠️ 从数据库加载地图状态失败：{e}")
        # 不抛出异常，允许应用继续启动
        # 内存状态将保持为空，后续操作会正常进行

