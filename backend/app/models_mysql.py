from datetime import datetime
from decimal import Decimal
from typing import Optional
from sqlmodel import SQLModel, Field, Column, BigInteger, String, DateTime, Integer, Text, JSON, DECIMAL


class SystemUser(SQLModel, table=True):
    """系统用户表"""
    __tablename__ = "system_users"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(max_length=50, description="用户名")
    password: Optional[str] = Field(default=None, max_length=100, description="密码")
    nickname: Optional[str] = Field(default=None, max_length=100, description="昵称")
    email: Optional[str] = Field(default=None, max_length=100, description="邮箱")
    mobile: Optional[str] = Field(default=None, max_length=20, description="手机号")
    sex: Optional[int] = Field(default=None, description="性别")
    avatar: Optional[str] = Field(default=None, max_length=255, description="头像")
    status: Optional[int] = Field(default=1, description="状态")
    login_ip: Optional[str] = Field(default=None, max_length=50, description="登录IP")
    login_date: Optional[datetime] = Field(default=None, description="登录时间")
    creator: Optional[str] = Field(default=None, max_length=50, description="创建人")
    create_time: Optional[datetime] = Field(default=None, description="创建时间")
    updater: Optional[str] = Field(default=None, max_length=50, description="更新人")
    update_time: Optional[datetime] = Field(default=None, description="更新时间")
    deleted: Optional[int] = Field(default=0, description="删除标记")
    dept_id: Optional[int] = Field(default=None, description="部门ID")
    post_ids: Optional[str] = Field(default=None, max_length=255, description="岗位ID")
    role_ids: Optional[str] = Field(default=None, max_length=255, description="角色ID")
    is_admin: Optional[int] = Field(default=0, description="是否管理员")


class OaLocationReport(SQLModel, table=True):
    """外业人员位置上报记录表"""
    __tablename__ = "oa_location_reports"
    
    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    user_id: int = Field(description="用户ID（关联 system_users.id）")
    username: str = Field(max_length=50, description="用户名（冗余字段，方便查看）")
    nickname: Optional[str] = Field(default=None, max_length=100, description="用户真实姓名")
    latitude: Decimal = Field(description="纬度")
    longitude: Decimal = Field(description="经度")
    province: Optional[str] = Field(default=None, max_length=50, description="省份")
    city: Optional[str] = Field(default=None, max_length=50, description="城市")
    district: Optional[str] = Field(default=None, max_length=50, description="区/县")
    address: Optional[str] = Field(default=None, max_length=255, description="完整地址（经纬度解析结果）")
    accuracy: Optional[Decimal] = Field(default=None, description="定位精度（米）")
    source: Optional[str] = Field(default=None, max_length=50, description="位置来源（如 GPS、浏览器、基站、WiFi）")
    device: Optional[str] = Field(default=None, max_length=100, description="上报设备信息（如 iPhone 15 / Chrome 118）")
    ip_address: Optional[str] = Field(default=None, max_length=50, description="上报时的IP地址")
    remark: Optional[str] = Field(default=None, max_length=255, description="备注信息（如特殊情况说明）")
    create_time: Optional[datetime] = Field(default=None, description="上报时间")
    weather_info: Optional[dict] = Field(default=None, sa_column=Column(JSON), description="位置对应的天气JSON")
    weather_time: Optional[datetime] = Field(default=None, description="天气信息的时间")


# Pydantic 模型用于 API 请求/响应
class SystemUserCreate(SQLModel):
    """创建用户请求模型"""
    username: str = Field(max_length=50, description="用户名")
    password: Optional[str] = Field(default=None, max_length=100, description="密码")
    nickname: Optional[str] = Field(default=None, max_length=100, description="昵称")
    email: Optional[str] = Field(default=None, max_length=100, description="邮箱")
    mobile: Optional[str] = Field(default=None, max_length=20, description="手机号")
    sex: Optional[int] = Field(default=None, description="性别")
    avatar: Optional[str] = Field(default=None, max_length=255, description="头像")
    status: Optional[int] = Field(default=1, description="状态")
    dept_id: Optional[int] = Field(default=None, description="部门ID")
    post_ids: Optional[str] = Field(default=None, max_length=255, description="岗位ID")
    role_ids: Optional[str] = Field(default=None, max_length=255, description="角色ID")
    is_admin: Optional[int] = Field(default=0, description="是否管理员")


class SystemUserUpdate(SQLModel):
    """更新用户请求模型"""
    username: Optional[str] = Field(default=None, max_length=50, description="用户名")
    password: Optional[str] = Field(default=None, max_length=100, description="密码")
    nickname: Optional[str] = Field(default=None, max_length=100, description="昵称")
    email: Optional[str] = Field(default=None, max_length=100, description="邮箱")
    mobile: Optional[str] = Field(default=None, max_length=20, description="手机号")
    sex: Optional[int] = Field(default=None, description="性别")
    avatar: Optional[str] = Field(default=None, max_length=255, description="头像")
    status: Optional[int] = Field(default=None, description="状态")
    dept_id: Optional[int] = Field(default=None, description="部门ID")
    post_ids: Optional[str] = Field(default=None, max_length=255, description="岗位ID")
    role_ids: Optional[str] = Field(default=None, max_length=255, description="角色ID")
    is_admin: Optional[int] = Field(default=None, description="是否管理员")


class SystemUserResponse(SQLModel):
    """用户响应模型"""
    id: int
    username: str
    nickname: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    sex: Optional[int] = None
    avatar: Optional[str] = None
    status: Optional[int] = None
    login_ip: Optional[str] = None
    login_date: Optional[datetime] = None
    creator: Optional[str] = None
    create_time: Optional[datetime] = None
    updater: Optional[str] = None
    update_time: Optional[datetime] = None
    dept_id: Optional[int] = None
    post_ids: Optional[str] = None
    role_ids: Optional[str] = None
    is_admin: Optional[int] = None


class OaLocationReportCreate(SQLModel):
    """创建位置上报请求模型"""
    user_id: int = Field(description="用户ID")
    username: str = Field(max_length=50, description="用户名")
    nickname: Optional[str] = Field(default=None, max_length=100, description="用户真实姓名")
    latitude: Decimal = Field(description="纬度")
    longitude: Decimal = Field(description="经度")
    province: Optional[str] = Field(default=None, max_length=50, description="省份")
    city: Optional[str] = Field(default=None, max_length=50, description="城市")
    district: Optional[str] = Field(default=None, max_length=50, description="区/县")
    address: Optional[str] = Field(default=None, max_length=255, description="完整地址")
    accuracy: Optional[Decimal] = Field(default=None, description="定位精度（米）")
    source: Optional[str] = Field(default=None, max_length=50, description="位置来源")
    device: Optional[str] = Field(default=None, max_length=100, description="上报设备信息")
    ip_address: Optional[str] = Field(default=None, max_length=50, description="上报时的IP地址")
    remark: Optional[str] = Field(default=None, max_length=255, description="备注信息")
    weather_info: Optional[dict] = Field(default=None, description="位置对应的天气JSON")
    weather_time: Optional[datetime] = Field(default=None, description="天气信息的时间")


class OaLocationReportUpdate(SQLModel):
    """更新位置上报请求模型"""
    user_id: Optional[int] = Field(default=None, description="用户ID")
    username: Optional[str] = Field(default=None, max_length=50, description="用户名")
    nickname: Optional[str] = Field(default=None, max_length=100, description="用户真实姓名")
    latitude: Optional[Decimal] = Field(default=None, description="纬度")
    longitude: Optional[Decimal] = Field(default=None, description="经度")
    province: Optional[str] = Field(default=None, max_length=50, description="省份")
    city: Optional[str] = Field(default=None, max_length=50, description="城市")
    district: Optional[str] = Field(default=None, max_length=50, description="区/县")
    address: Optional[str] = Field(default=None, max_length=255, description="完整地址")
    accuracy: Optional[Decimal] = Field(default=None, description="定位精度（米）")
    source: Optional[str] = Field(default=None, max_length=50, description="位置来源")
    device: Optional[str] = Field(default=None, max_length=100, description="上报设备信息")
    ip_address: Optional[str] = Field(default=None, max_length=50, description="上报时的IP地址")
    remark: Optional[str] = Field(default=None, max_length=255, description="备注信息")
    weather_info: Optional[dict] = Field(default=None, description="位置对应的天气JSON")
    weather_time: Optional[datetime] = Field(default=None, description="天气信息的时间")


class OaLocationReportResponse(SQLModel):
    """位置上报响应模型"""
    id: int
    user_id: int
    username: str
    nickname: Optional[str] = None
    latitude: Decimal
    longitude: Decimal
    province: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    accuracy: Optional[Decimal] = None
    source: Optional[str] = None
    device: Optional[str] = None
    ip_address: Optional[str] = None
    remark: Optional[str] = None
    create_time: Optional[datetime] = None
    weather_info: Optional[dict] = None
    weather_time: Optional[datetime] = None


class StoreLocation(SQLModel, table=True):
    """店铺位置信息表"""
    __tablename__ = "store_locations"
    
    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    address: str = Field(max_length=255, description="店铺地址")
    latitude: Decimal = Field(description="纬度")
    longitude: Decimal = Field(description="经度")
    is_visited: Optional[int] = Field(default=0, description="是否已到店（0：否，1：是）")


class StoreLocationCreate(SQLModel):
    """创建店铺位置请求模型"""
    address: str = Field(max_length=255, description="店铺地址")
    latitude: Decimal = Field(description="纬度")
    longitude: Decimal = Field(description="经度")
    is_visited: Optional[int] = Field(default=0, description="是否已到店（0：否，1：是）")


class StoreLocationUpdate(SQLModel):
    """更新店铺位置请求模型"""
    address: Optional[str] = Field(default=None, max_length=255, description="店铺地址")
    latitude: Optional[Decimal] = Field(default=None, description="纬度")
    longitude: Optional[Decimal] = Field(default=None, description="经度")
    is_visited: Optional[int] = Field(default=None, description="是否已到店（0：否，1：是）")


class StoreLocationResponse(SQLModel):
    """店铺位置响应模型"""
    id: int
    address: str
    latitude: Decimal
    longitude: Decimal
    is_visited: Optional[int] = None


# ========== 地图绘制和测量相关模型 ==========

class MapMarker(SQLModel, table=True):
    """地图标记点表 - 临时存储地图上的标记点"""
    __tablename__ = "map_markers"
    
    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    marker_id: str = Field(max_length=100, description="标记点唯一标识（前端生成）")
    name: str = Field(max_length=255, description="标记点名称")
    coordinate: dict = Field(sa_column=Column(JSON), description="坐标数据（JSON格式，包含经纬度）")
    description: Optional[str] = Field(default=None, max_length=500, description="标记点描述")
    create_time: Optional[datetime] = Field(default=None, description="创建时间")


class MapDrawing(SQLModel, table=True):
    """地图绘制图形表 - 临时存储绘制的点、线、多边形、圆形"""
    __tablename__ = "map_drawings"
    
    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    drawing_id: str = Field(max_length=100, description="绘制图形唯一标识（前端生成）")
    type: str = Field(max_length=20, description="图形类型: point, line, polygon, circle")
    coordinates: dict = Field(sa_column=Column(JSON), description="坐标数据（JSON格式）")
    style: Optional[dict] = Field(default=None, sa_column=Column(JSON), description="样式信息（JSON格式）")
    create_time: Optional[datetime] = Field(default=None, description="创建时间")


class MapMeasurement(SQLModel, table=True):
    """地图测量结果表 - 临时存储测量的距离和面积"""
    __tablename__ = "map_measurements"
    
    id: Optional[int] = Field(default=None, primary_key=True, description="主键ID")
    measurement_id: str = Field(max_length=100, description="测量结果唯一标识（前端生成）")
    type: str = Field(max_length=20, description="测量类型: length(距离) 或 area(面积)")
    value: str = Field(max_length=100, description="测量结果值，如 '100.50 m' 或 '25.30 m²'")
    coordinates: dict = Field(sa_column=Column(JSON), description="测量图形的坐标数据（JSON格式）")
    create_time: Optional[datetime] = Field(default=None, description="创建时间")


class MapDrawingCreate(SQLModel):
    """创建绘制图形请求模型"""
    drawing_id: str = Field(max_length=100, description="绘制图形唯一标识")
    type: str = Field(max_length=20, description="图形类型")
    coordinates: dict = Field(description="坐标数据")
    style: Optional[dict] = Field(default=None, description="样式信息")


class MapDrawingResponse(SQLModel):
    """绘制图形响应模型"""
    id: int
    drawing_id: str
    type: str
    coordinates: dict
    style: Optional[dict] = None
    create_time: Optional[datetime] = None


class MapMeasurementCreate(SQLModel):
    """创建测量结果请求模型"""
    measurement_id: str = Field(max_length=100, description="测量结果唯一标识")
    type: str = Field(max_length=20, description="测量类型")
    value: str = Field(max_length=100, description="测量结果值")
    coordinates: dict = Field(description="坐标数据")


class MapMeasurementResponse(SQLModel):
    """测量结果响应模型"""
    id: int
    measurement_id: str
    type: str
    value: str
    coordinates: dict
    create_time: Optional[datetime] = None


class MapMarkerCreate(SQLModel):
    """创建标记点请求模型"""
    marker_id: str = Field(max_length=100, description="标记点唯一标识")
    name: str = Field(max_length=255, description="标记点名称")
    coordinate: dict = Field(description="坐标数据")
    description: Optional[str] = Field(default=None, max_length=500, description="标记点描述")


class MapMarkerResponse(SQLModel):
    """标记点响应模型"""
    id: int
    marker_id: str
    name: str
    coordinate: dict
    description: Optional[str] = None
    create_time: Optional[datetime] = None