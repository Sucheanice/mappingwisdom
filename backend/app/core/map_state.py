from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class MapState:
    center: tuple[float, float] = (0.0, 0.0)
    zoom: int = 2
    current_layer: str = "osm"
    markers: list[dict[str, Any]] = field(default_factory=list)
    drawings: list[dict[str, Any]] = field(default_factory=list)
    measurements: list[dict[str, Any]] = field(default_factory=list)
    last_updated: str = field(default_factory=lambda: datetime.now().isoformat())
    version: int = 1


class MapStateManager:
    def __init__(self) -> None:
        self.state = MapState()

    def get_state(self) -> dict[str, Any]:
        return {
            "center": list(self.state.center),
            "zoom": self.state.zoom,
            "current_layer": self.state.current_layer,
            "markers": self.state.markers,
            "drawings": self.state.drawings,
            "measurements": self.state.measurements,
            "last_updated": self.state.last_updated,
            "version": self.state.version,
        }

    def _touch(self) -> None:
        self.state.version += 1
        self.state.last_updated = datetime.now().isoformat()

    def update_center(self, longitude: float, latitude: float, zoom: int | None = None) -> None:
        self.state.center = (longitude, latitude)
        if zoom is not None:
            self.state.zoom = zoom
        self._touch()

    def update_layer(self, layer_type: str) -> None:
        """更新当前图层类型: osm(标准地图), satellite(卫星地图), terrain(路网地图)"""
        if layer_type in ["osm", "satellite", "terrain"]:
            self.state.current_layer = layer_type
            self._touch()

    def add_marker(self, marker: dict[str, Any]) -> None:
        self.state.markers.append(marker)
        self._touch()

    def clear_markers(self) -> None:
        self.state.markers = []
        self._touch()

    def add_drawing(self, drawing: dict[str, Any]) -> None:
        """添加绘制图形（点、线、多边形、圆形）"""
        self.state.drawings.append(drawing)
        self._touch()

    def remove_drawing(self, drawing_id: str) -> None:
        """删除指定ID的绘制图形"""
        self.state.drawings = [d for d in self.state.drawings if d.get("id") != drawing_id]
        self._touch()

    def clear_drawings(self) -> None:
        """清除所有绘制图形"""
        self.state.drawings = []
        self._touch()

    def add_measurement(self, measurement: dict[str, Any]) -> None:
        """添加测量结果（距离、面积）"""
        self.state.measurements.append(measurement)
        self._touch()

    def remove_measurement(self, measurement_id: str) -> None:
        """删除指定ID的测量结果"""
        self.state.measurements = [m for m in self.state.measurements if m.get("id") != measurement_id]
        self._touch()

    def clear_measurements(self) -> None:
        """清除所有测量结果"""
        self.state.measurements = []
        self._touch()
    
    def load_from_dict(self, data: dict[str, Any]) -> None:
        """从字典加载状态（用于从数据库恢复）"""
        if "markers" in data:
            self.state.markers = data["markers"]
        if "drawings" in data:
            self.state.drawings = data["drawings"]
        if "measurements" in data:
            self.state.measurements = data["measurements"]
        if "current_layer" in data:
            self.state.current_layer = data["current_layer"]
        if "center" in data:
            center = data["center"]
            if isinstance(center, list) and len(center) >= 2:
                self.state.center = (float(center[0]), float(center[1]))
        if "zoom" in data:
            self.state.zoom = int(data["zoom"])
        self._touch()


map_state_manager = MapStateManager()


