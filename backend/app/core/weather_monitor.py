"""
天气监控模块
负责定期检查天气变化并推送预警
"""
from __future__ import annotations

import asyncio
from typing import Dict, List, Optional, Set
from datetime import datetime
from decimal import Decimal
import httpx
import os

from app.core.mysql_db import mysql_engine
from app.models_mysql import OaLocationReport, SystemUser
from sqlmodel import Session, select

# 高德API配置
AMAP_API_BASE = "https://restapi.amap.com/v3/weather/weatherInfo"
AMAP_REVERSE_BASE = "https://restapi.amap.com/v3/geocode/regeo"
# ⚠️ 警告：生产环境必须通过环境变量 AMAP_API_KEY 配置，默认值仅用于开发
AMAP_API_KEY = os.environ.get("AMAP_API_KEY", "cbfcad74ad3ddfb72ba7770a8169cf36")
USER_AGENT = "mappingwisdom-weather/1.0"

# 预警阈值配置
ALERT_THRESHOLDS = {
    "temperature_change": {
        "normal": 10,      # 一般预警：温度变化10°C
        "severe": 15,      # 严重预警：温度变化15°C
        "extreme": 20      # 极端预警：温度变化20°C
    },
    "extreme_weather": ["暴雨", "暴雪", "沙尘暴", "台风", "冰雹", "大雾", "霾"],
    "wind_change": 3,      # 风力变化3级
    "humidity_change": 30  # 湿度变化30%
}

# 天气突变检测：从好天气变为坏天气
WEATHER_SUDDEN_CHANGES = {
    "晴": ["暴雨", "暴雪", "沙尘暴", "台风", "冰雹"],
    "多云": ["暴雨", "暴雪", "沙尘暴", "台风"],
    "阴": ["暴雨", "暴雪", "沙尘暴"]
}

# WebSocket连接管理器
class WebSocketManager:
    """管理所有WebSocket连接"""
    def __init__(self):
        self.active_connections: Set[any] = set()
    
    async def connect(self, websocket):
        """添加WebSocket连接"""
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"WebSocket连接已添加，当前连接数: {len(self.active_connections)}")
    
    def disconnect(self, websocket):
        """移除WebSocket连接"""
        self.active_connections.discard(websocket)
        print(f"WebSocket连接已移除，当前连接数: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """向所有连接的客户端广播消息"""
        if not self.active_connections:
            return
        
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"发送消息失败: {e}")
                disconnected.add(connection)
        
        # 移除断开的连接
        for conn in disconnected:
            self.active_connections.discard(conn)

# 全局WebSocket管理器
ws_manager = WebSocketManager()

# 监控状态
_monitoring_enabled = False
_monitoring_task: Optional[asyncio.Task] = None
_monitoring_interval = 600  # 默认10分钟（600秒）


def is_monitoring_enabled() -> bool:
    """检查监控是否启用"""
    return _monitoring_enabled


def set_monitoring_enabled(enabled: bool):
    """设置监控状态"""
    global _monitoring_enabled
    _monitoring_enabled = enabled
    print(f"监控状态已设置为: {enabled}")


def set_monitoring_interval(seconds: int):
    """设置监控间隔（秒）"""
    global _monitoring_interval
    _monitoring_interval = seconds
    print(f"监控间隔已设置为: {seconds}秒")


async def _get_weather_by_coordinates(lat: Decimal, lon: Decimal) -> Optional[dict]:
    """根据经纬度获取天气信息"""
    try:
        # 1. 先通过逆地理编码获取城市名
        params = {
            "key": AMAP_API_KEY,
            "location": f"{float(lon)},{float(lat)}",  # 高德为 经度,纬度
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


def _detect_weather_anomaly(old_weather: Optional[dict], new_weather: dict) -> List[tuple]:
    """
    检测天气异常变化
    返回: [(预警级别, 预警原因), ...]
    """
    alerts = []
    
    if not old_weather:
        # 没有历史数据，不进行异常检测
        return alerts
    
    try:
        # 1. 检测温度变化
        old_temp_str = old_weather.get("温度(℃)", "0")
        new_temp_str = new_weather.get("温度(℃)", "0")
        
        try:
            old_temp = float(old_temp_str) if old_temp_str != "未知" else 0
            new_temp = float(new_temp_str) if new_temp_str != "未知" else 0
            
            if old_temp > 0 and new_temp > 0:
                temp_change = abs(new_temp - old_temp)
                
                if temp_change >= ALERT_THRESHOLDS["temperature_change"]["extreme"]:
                    alerts.append(("extreme", f"温度变化{temp_change:.1f}°C"))
                elif temp_change >= ALERT_THRESHOLDS["temperature_change"]["severe"]:
                    alerts.append(("severe", f"温度变化{temp_change:.1f}°C"))
                elif temp_change >= ALERT_THRESHOLDS["temperature_change"]["normal"]:
                    alerts.append(("normal", f"温度变化{temp_change:.1f}°C"))
        except (ValueError, TypeError):
            pass
        
        # 2. 检测极端天气
        new_weather_type = new_weather.get("天气", "")
        for extreme in ALERT_THRESHOLDS["extreme_weather"]:
            if extreme in new_weather_type:
                alerts.append(("extreme", f"出现极端天气：{new_weather_type}"))
                break
        
        # 3. 检测天气突变
        old_weather_type = old_weather.get("天气", "")
        if old_weather_type and new_weather_type:
            # 检查是否从好天气变为坏天气
            for good_weather, bad_weathers in WEATHER_SUDDEN_CHANGES.items():
                if good_weather in old_weather_type:
                    for bad_weather in bad_weathers:
                        if bad_weather in new_weather_type:
                            alerts.append(("severe", f"天气从{old_weather_type}变为{new_weather_type}"))
                            break
        
        # 4. 检测风力变化
        old_wind_str = old_weather.get("风力", "0")
        new_wind_str = new_weather.get("风力", "0")
        
        try:
            # 尝试提取数字（如 "3级" -> 3）
            old_wind = float(''.join(filter(str.isdigit, old_wind_str))) if old_wind_str != "未知" else 0
            new_wind = float(''.join(filter(str.isdigit, new_wind_str))) if new_wind_str != "未知" else 0
            
            if old_wind > 0 and new_wind > 0:
                wind_change = abs(new_wind - old_wind)
                if wind_change >= ALERT_THRESHOLDS["wind_change"]:
                    alerts.append(("normal", f"风力变化{wind_change:.0f}级"))
        except (ValueError, TypeError):
            pass
        
        # 5. 检测湿度变化
        old_humidity_str = old_weather.get("湿度(%)", "0")
        new_humidity_str = new_weather.get("湿度(%)", "0")
        
        try:
            old_humidity = float(old_humidity_str) if old_humidity_str != "未知" else 0
            new_humidity = float(new_humidity_str) if new_humidity_str != "未知" else 0
            
            if old_humidity > 0 and new_humidity > 0:
                humidity_change = abs(new_humidity - old_humidity)
                if humidity_change >= ALERT_THRESHOLDS["humidity_change"]:
                    alerts.append(("normal", f"湿度变化{humidity_change:.0f}%"))
        except (ValueError, TypeError):
            pass
            
    except Exception as e:
        print(f"检测天气异常时出错: {e}")
    
    return alerts


async def _check_and_update_weather():
    """检查并更新所有位置的天气信息"""
    if not _monitoring_enabled:
        return
    
    print(f"[{datetime.now()}] 开始检查天气...")
    
    # 创建数据库会话
    try:
        with Session(mysql_engine) as session:
            # 获取所有位置记录
            query = select(OaLocationReport).order_by(OaLocationReport.create_time.desc())
            reports = session.exec(query).all()
            
            print(f"找到 {len(reports)} 条位置记录")
            
            updated_count = 0
            alert_count = 0
            
            for report in reports:
                try:
                    # 获取历史天气数据
                    old_weather = report.weather_info
                    
                    # 获取最新天气
                    new_weather = await _get_weather_by_coordinates(report.latitude, report.longitude)
                    
                    if not new_weather:
                        continue
                    
                    # 检测异常
                    alerts = _detect_weather_anomaly(old_weather, new_weather)
                    
                    # 如果有异常，推送预警
                    if alerts:
                        alert_reasons = [reason for _, reason in alerts]
                        alert_level = max([level for level, _ in alerts], key=lambda x: ["normal", "severe", "extreme"].index(x))
                        
                        # 构建预警消息
                        alert_message = {
                            "type": "weather_alert",
                            "data": {
                                "report_id": report.id,
                                "user_id": report.user_id,
                                "username": report.username,
                                "nickname": report.nickname,
                                "location": report.address or f"{report.province}{report.city}{report.district}",
                                "longitude": float(report.longitude),
                                "latitude": float(report.latitude),
                                "alert_reasons": alert_reasons,
                                "alert_level": alert_level,
                                "timestamp": datetime.now().isoformat(),
                            }
                        }
                        
                        # 通过WebSocket推送
                        await ws_manager.broadcast(alert_message)
                        alert_count += 1
                        print(f"推送预警: {report.username} - {', '.join(alert_reasons)}")
                        
                        # 发送短信通知（自动发送）
                        try:
                            # 优先通过 user_id 查找，如果找不到则通过 username 或 nickname 查找
                            user = None
                            if report.user_id:
                                user = session.get(SystemUser, report.user_id)
                            
                            # 如果通过 user_id 找不到，尝试通过 username 查找
                            if not user and report.username:
                                from sqlmodel import select
                                statement = select(SystemUser).where(SystemUser.username == report.username)
                                user = session.exec(statement).first()
                            
                            # 如果通过 username 还找不到，尝试通过 nickname 查找
                            if not user and report.nickname:
                                from sqlmodel import select
                                statement = select(SystemUser).where(SystemUser.nickname == report.nickname)
                                user = session.exec(statement).first()
                            
                            if user and user.mobile:
                                # 使用已报备的固定模板（与互亿无线平台报备的模板格式完全匹配）
                                sms_message = "作业员您好，您所在地区天气发生极端变化，请您做好应对措施，保障出行安全。"
                                
                                # 调用短信发送函数
                                from app.api.routes.sms import sms_service
                                sms_result = await sms_service.send_sms(sms_message, user.mobile)
                                sms_success = sms_result.get("success", False)
                                if sms_success:
                                    print(f"[自动短信] 已发送短信通知: {report.nickname or report.username} ({user.mobile}) - 预警原因: {', '.join(alert_reasons)}")
                                else:
                                    print(f"[自动短信] 短信发送失败: {report.nickname or report.username} - {sms_result.get('message', '未知错误')}")
                            else:
                                if not user:
                                    print(f"[自动短信] 用户不存在，跳过短信通知: user_id={report.user_id}, username={report.username}, nickname={report.nickname}")
                                else:
                                    print(f"[自动短信] 用户 {report.nickname or report.username} 未设置手机号，跳过短信通知")
                        except Exception as e:
                            print(f"[自动短信] 发送短信失败: {e}")
                            import traceback
                            traceback.print_exc()
                    
                    # 更新数据库
                    report.weather_info = new_weather
                    report.weather_time = datetime.now()
                    session.add(report)
                    updated_count += 1
                    
                except Exception as e:
                    print(f"处理记录 {report.id} 时出错: {e}")
                    continue
            
            # 提交更改
            session.commit()
            print(f"[{datetime.now()}] 天气检查完成: 更新{updated_count}条，预警{alert_count}条")
            
    except Exception as e:
        print(f"天气检查出错: {e}")


async def _monitoring_loop():
    """监控循环"""
    print("天气监控任务已启动")
    
    while True:
        try:
            if _monitoring_enabled:
                await _check_and_update_weather()
            else:
                print("监控已禁用，等待启用...")
            
            # 等待指定间隔
            await asyncio.sleep(_monitoring_interval)
            
        except asyncio.CancelledError:
            print("监控任务已取消")
            break
        except Exception as e:
            print(f"监控循环出错: {e}")
            await asyncio.sleep(60)  # 出错后等待1分钟再继续


def start_monitoring():
    """启动监控任务"""
    global _monitoring_task
    
    if _monitoring_task and not _monitoring_task.done():
        print("监控任务已在运行")
        return
    
    _monitoring_task = asyncio.create_task(_monitoring_loop())
    print("监控任务已启动")


def stop_monitoring():
    """停止监控任务"""
    global _monitoring_task
    
    if _monitoring_task and not _monitoring_task.done():
        _monitoring_task.cancel()
        print("监控任务已停止")
    else:
        print("监控任务未运行")

