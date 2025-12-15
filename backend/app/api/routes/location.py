from __future__ import annotations

from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Query, Depends
from sqlmodel import Session, select
import httpx
import os

from app.core.mysql_db import get_mysql_session
from app.models_mysql import OaLocationReport, OaLocationReportResponse

router = APIRouter(prefix="/location", tags=["location"])

# 高德API配置
AMAP_API_BASE = "https://restapi.amap.com/v3/weather/weatherInfo"
AMAP_REVERSE_BASE = "https://restapi.amap.com/v3/geocode/regeo"
# ⚠️ 警告：生产环境必须通过环境变量 AMAP_API_KEY 配置，默认值仅用于开发
AMAP_API_KEY = os.environ.get("AMAP_API_KEY", "cbfcad74ad3ddfb72ba7770a8169cf36")
USER_AGENT = "mappingwisdom-weather/1.0"


@router.get("/reports", response_model=list[OaLocationReportResponse])
async def get_location_reports(
    username: Optional[str] = Query(None, description="用户名筛选"),
    source: Optional[str] = Query(None, description="来源筛选"),
    province: Optional[str] = Query(None, description="省份筛选"),
    session: Session = Depends(get_mysql_session),
):
    """从数据库获取位置上报记录"""
    query = select(OaLocationReport)
    
    # 用户名筛选
    if username:
        query = query.where(
            (OaLocationReport.username.like(f"%{username}%")) |
            (OaLocationReport.nickname.like(f"%{username}%"))
        )
    
    # 来源筛选
    if source:
        query = query.where(OaLocationReport.source == source)
    
    # 省份筛选
    if province:
        query = query.where(OaLocationReport.province.like(f"%{province}%"))
    
    # 按创建时间倒序排列
    query = query.order_by(OaLocationReport.create_time.desc())
    
    reports = session.exec(query).all()
    return reports


async def _get_weather_by_coordinates(lat: float, lon: float) -> Optional[dict]:
    """根据经纬度获取天气信息"""
    try:
        # 1. 先通过逆地理编码获取城市名
        params = {
            "key": AMAP_API_KEY,
            "location": f"{lon},{lat}",  # 高德为 经度,纬度
            "extensions": "base",
            "radius": "1000",
        }
        headers = {"User-Agent": USER_AGENT}
        
        async with httpx.AsyncClient() as client:
            # 获取位置信息
            resp = await client.get(
                AMAP_REVERSE_BASE,
                params=params,
                headers=headers,
                timeout=15.0
            )
            resp.raise_for_status()
            data = resp.json()
            
            if not data or data.get("status") != "1":
                return None
            
            regeocode = data.get("regeocode", {})
            comp = regeocode.get("addressComponent", {})
            city_name = comp.get("city") or comp.get("province") or ""
            
            if not city_name:
                return None
            
            # 2. 根据城市名获取天气
            weather_params = {
                "key": AMAP_API_KEY,
                "city": city_name,
                "extensions": "base",
            }
            
            weather_resp = await client.get(
                AMAP_API_BASE,
                params=weather_params,
                headers=headers,
                timeout=20.0
            )
            weather_resp.raise_for_status()
            weather_data = weather_resp.json()
            
            if weather_data and weather_data.get("status") == "1" and weather_data.get("lives"):
                live = weather_data["lives"][0]
                return {
                    "城市": live.get("city", city_name),
                    "天气": live.get("weather", "未知"),
                    "温度(℃)": live.get("temperature", "未知"),
                    "风向": live.get("winddirection", "未知"),
                    "风力": live.get("windpower", "未知"),
                    "湿度(%)": live.get("humidity", "未知"),
                    "报告时间": live.get("reporttime", ""),
                }
    except Exception as e:
        print(f"获取天气信息失败 (lat={lat}, lon={lon}): {e}")
        return None
    
    return None


@router.post("/reports/batch-update-weather")
async def batch_update_weather(session: Session = Depends(get_mysql_session)):
    """批量更新位置上报记录的天气信息"""
    query = select(OaLocationReport)
    reports = session.exec(query).all()
    
    updated_count = 0
    failed_count = 0
    failed_ids = []
    
    for report in reports:
        try:
            # 获取经纬度
            lat = float(report.latitude)
            lon = float(report.longitude)
            
            # 获取天气信息
            weather_info = await _get_weather_by_coordinates(lat, lon)
            
            if weather_info:
                # 更新数据库记录
                report.weather_info = weather_info
                report.weather_time = datetime.now()
                session.add(report)
                updated_count += 1
            else:
                failed_count += 1
                failed_ids.append(report.id)
        except Exception as e:
            print(f"更新记录 {report.id} 失败: {e}")
            failed_count += 1
            failed_ids.append(report.id)
    
    # 提交所有更改
    try:
        session.commit()
    except Exception as e:
        session.rollback()
        return {
            "success": False,
            "updated_count": 0,
            "failed_count": len(reports),
            "message": f"数据库更新失败: {str(e)}"
        }
    
    return {
        "success": True,
        "updated_count": updated_count,
        "failed_count": failed_count,
        "failed_ids": failed_ids[:10],  # 只返回前10个失败ID
        "message": f"成功更新 {updated_count} 条记录，失败 {failed_count} 条"
    }

