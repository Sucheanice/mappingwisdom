from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.mysql_db import get_mysql_session
from app.models_mysql import OaLocationReport, SystemUser
from app.core.weather_monitor import (
    ws_manager,
    set_monitoring_enabled,
    is_monitoring_enabled,
    start_monitoring,
    stop_monitoring,
    set_monitoring_interval,
)

router = APIRouter(prefix="/simulation", tags=["simulation"])


class SimulationToggleRequest(BaseModel):
    mode: str
    enabled: bool


@router.post("/toggle")
async def toggle_simulation(body: SimulationToggleRequest):
    """切换监控状态"""
    set_monitoring_enabled(body.enabled)
    
    if body.enabled:
        # 启动监控
        start_monitoring()
        return {
            "success": True,
            "mode": body.mode,
            "enabled": True,
            "message": "实时监控已启用"
        }
    else:
        # 停止监控
        stop_monitoring()
        return {
            "success": True,
            "mode": body.mode,
            "enabled": False,
            "message": "实时监控已禁用"
        }


@router.get("/status")
async def get_monitoring_status():
    """获取监控状态"""
    return {
        "enabled": is_monitoring_enabled(),
        "active_connections": len(ws_manager.active_connections)
    }


@router.post("/test-alert")
async def test_weather_alert(
    username: str = "user01",
    session: Session = Depends(get_mysql_session)
):
    """
    测试天气预警功能
    模拟指定用户的天气异常变化并推送预警
    """
    # 查找用户的位置记录（获取最新的）
    query = select(OaLocationReport).where(
        OaLocationReport.username == username
    ).order_by(OaLocationReport.create_time.desc())
    
    report = session.exec(query).first()
    
    if not report:
        raise HTTPException(status_code=404, detail=f"未找到用户 {username} 的位置记录")
    
    # 获取当前天气信息
    old_weather = report.weather_info or {}
    
    # 模拟极端天气变化
    # 方案1：温度大幅变化
    old_temp_str = old_weather.get("温度(℃)", "20")
    try:
        old_temp = float(old_temp_str) if old_temp_str != "未知" else 20.0
    except (ValueError, TypeError):
        old_temp = 20.0
    
    # 模拟温度突然下降20°C（极端预警）
    new_temp = old_temp - 20.0
    
    # 构建新的天气信息（模拟极端天气）
    new_weather = {
        "城市": old_weather.get("城市", report.city or "未知"),
        "天气": "暴雨",  # 模拟极端天气
        "温度(℃)": str(int(new_temp)),
        "风向": old_weather.get("风向", "未知"),
        "风力": "8",  # 模拟大风
        "湿度(%)": "95",  # 高湿度
        "报告时间": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    
    # 构建预警消息
    alert_reasons = [
        f"温度变化{abs(new_temp - old_temp):.1f}°C",
        "出现极端天气：暴雨",
        "天气从晴天变为暴雨"
    ]
    
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
            "alert_level": "extreme",
            "timestamp": datetime.now().isoformat(),
        }
    }
    
    # 通过WebSocket推送预警
    await ws_manager.broadcast(alert_message)
    
    # 发送短信通知
    sms_sent = False
    try:
        user = session.get(SystemUser, report.user_id)
        if user and user.mobile:
            from app.api.routes.sms import sms_service
            # 使用已报备的固定模板（与互亿无线平台报备的模板格式完全匹配）
            sms_message = "作业员您好，您所在地区天气发生极端变化，请您做好应对措施，保障出行安全。"
            sms_result = await sms_service.send_sms(sms_message, user.mobile)
            sms_sent = sms_result.get("success", False)
            if not sms_sent:
                print(f"测试预警短信发送失败: {sms_result.get('message', '未知错误')}")
    except Exception as e:
        print(f"发送测试预警短信失败: {e}")
    
    # 更新数据库（可选，用于测试）
    # report.weather_info = new_weather
    # report.weather_time = datetime.now()
    # session.add(report)
    # session.commit()
    
    return {
        "success": True,
        "message": f"已为 {username} 推送测试预警" + (f"，已发送短信到 {user.mobile}" if sms_sent else "（未发送短信：用户未设置手机号）"),
        "alert": alert_message["data"],
        "old_weather": old_weather,
        "simulated_weather": new_weather,
        "sms_sent": sms_sent
    }


@router.websocket("/weather-alerts")
async def weather_alerts_websocket(websocket: WebSocket):
    """WebSocket 端点用于天气警报推送"""
    # 记录连接尝试
    print(f"WebSocket 连接尝试: {websocket.url}")
    
    # 连接到管理器
    await ws_manager.connect(websocket)
    
    try:
        # 发送初始连接确认
        await websocket.send_json({"type": "connected", "message": "WebSocket连接成功"})
        
        while True:
            # 保持连接，等待服务器推送消息
            try:
                # 接收客户端消息（心跳等）
                data = await websocket.receive_text()
                if data:
                    # 可以处理客户端发送的消息（如心跳）
                    await websocket.send_json({"type": "pong", "message": "收到消息"})
            except WebSocketDisconnect:
                # 正常断开
                break
            except Exception as e:
                # 其他错误，断开连接
                print(f"WebSocket error: {e}")
                break
    except WebSocketDisconnect:
        # 正常断开
        pass
    except Exception as e:
        # 连接错误
        print(f"WebSocket connection error: {e}")
    finally:
        # 从管理器中移除连接
        ws_manager.disconnect(websocket)

