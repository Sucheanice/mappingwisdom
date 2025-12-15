"""
短信服务模块
基于互亿无线短信接口
"""
from __future__ import annotations

import os
import json
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select
import httpx

from app.core.mysql_db import get_mysql_session
from app.models_mysql import OaLocationReport, SystemUser

router = APIRouter(prefix="/sms", tags=["短信服务"])


class SMSService:
    """短信发送服务类"""
    def __init__(self):
        # 互亿无线短信接口配置
        self.host = "106.ihuyi.com"
        self.sms_send_uri = "/webservice/sms.php?method=Submit"
        
        # ⚠️ 警告：生产环境必须通过环境变量 SMS_ACCOUNT 和 SMS_PASSWORD 配置，默认值仅用于开发
        self.account = os.environ.get("SMS_ACCOUNT", "C76553395")
        self.password = os.environ.get("SMS_PASSWORD", "06cec6194a617f916d4bbd08bd1830c9")
    
    async def send_sms(self, text: str, mobile: str) -> Dict[str, Any]:
        """
        发送短信
        
        Args:
            text: 短信内容
            mobile: 手机号码
            
        Returns:
            Dict: 发送结果
        """
        if not mobile:
            return {
                "success": False,
                "code": -1,
                "message": "手机号为空",
                "smsid": None,
                "raw_response": None
            }
        
        try:
            # 构建请求参数
            params = {
                'account': self.account,
                'password': self.password,
                'content': text,
                'mobile': mobile,
                'format': 'json'
            }
            
            # 发送HTTP请求
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"http://{self.host}{self.sms_send_uri}",
                    data=params,
                    headers={
                        "Content-type": "application/x-www-form-urlencoded",
                        "Accept": "text/plain"
                    }
                )
                
                # 解析响应
                response_text = response.text
                try:
                    result = json.loads(response_text)
                except json.JSONDecodeError:
                    result = {"code": -1, "msg": "响应解析失败", "raw_response": response_text}
                
                return {
                    "success": result.get("code") == 2,  # 互亿无线成功码是2
                    "code": result.get("code"),
                    "message": result.get("msg", "未知错误"),
                    "smsid": result.get("smsid"),
                    "raw_response": result
                }
                
        except Exception as e:
            return {
                "success": False,
                "code": -1,
                "message": f"发送失败: {str(e)}",
                "smsid": None,
                "raw_response": None
            }
    
    def create_location_notification_message(
        self, 
        username: str, 
        nickname: str, 
        address: str, 
        weather_info: Optional[Dict] = None
    ) -> str:
        """
        创建位置通知短信内容
        使用已报备的固定模板格式
        """
        # 使用已报备的固定模板（与geo2项目保持一致）
        # 注意：短信内容必须与互亿无线平台报备的模板格式完全匹配
        message = "作业员您好，您所在地区天气发生极端变化，请您做好应对措施，保障出行安全。"
        
        return message


# 创建全局实例
sms_service = SMSService()


class SendNotificationRequest(BaseModel):
    report_id: int
    message: Optional[str] = None  # 自定义消息，如果不提供则使用默认模板


@router.post("/send-location-notification")
async def send_location_notification(
    body: SendNotificationRequest,
    session: Session = Depends(get_mysql_session)
):
    """
    发送位置通知短信
    根据位置上报记录ID，向对应用户发送短信通知
    """
    # 获取位置记录
    report = session.get(OaLocationReport, body.report_id)
    if not report:
        raise HTTPException(status_code=404, detail="位置记录不存在")
    
    # 获取用户信息（获取手机号）
    # 优先通过 user_id 查找，如果找不到则通过 username 或 nickname 查找
    user = None
    if report.user_id:
        user = session.get(SystemUser, report.user_id)
        if user:
            print(f"[短信服务] 通过 user_id={report.user_id} 找到用户: {user.username}")
    
    # 如果通过 user_id 找不到，尝试通过 username 查找
    if not user and report.username:
        statement = select(SystemUser).where(SystemUser.username == report.username)
        user = session.exec(statement).first()
        if user:
            print(f"[短信服务] 通过 username={report.username} 找到用户: {user.id}")
    
    # 如果通过 username 还找不到，尝试通过 nickname 查找（因为位置记录中的username可能是昵称）
    if not user and report.nickname:
        statement = select(SystemUser).where(SystemUser.nickname == report.nickname)
        user = session.exec(statement).first()
        if user:
            print(f"[短信服务] 通过 nickname={report.nickname} 找到用户: {user.id} ({user.username})")
    
    if not user:
        error_msg = f"用户不存在（位置记录ID: {body.report_id}, user_id: {report.user_id}, username: {report.username or '无'}, nickname: {report.nickname or '无'}）"
        print(f"[短信服务] 错误: {error_msg}")
        # 输出调试信息：列出所有可能的用户
        all_users = session.exec(select(SystemUser)).all()
        print(f"[短信服务] 数据库中的用户列表: {[(u.id, u.username, u.nickname) for u in all_users[:10]]}")
        raise HTTPException(status_code=404, detail=error_msg)
    
    if not user.mobile:
        raise HTTPException(status_code=400, detail="用户未设置手机号")
    
    # 构建短信内容
    if body.message:
        # 使用自定义消息
        sms_content = body.message
    else:
        # 使用默认模板
        location_info = report.address or f"{report.province}{report.city}{report.district}"
        sms_content = sms_service.create_location_notification_message(
            username=report.username,
            nickname=report.nickname or "",
            address=location_info,
            weather_info=report.weather_info
        )
    
    # 发送短信
    result = await sms_service.send_sms(sms_content, user.mobile)
    
    if result["success"]:
        return {
            "success": True,
            "message": f"短信发送成功，已通知 {user.nickname or user.username}",
            "mobile": user.mobile,
            "smsid": result.get("smsid"),
            "code": result.get("code")
        }
    else:
        raise HTTPException(
            status_code=500,
            detail=f"短信发送失败: {result.get('message', '未知错误')}"
        )


@router.post("/send-weather-alert")
async def send_weather_alert(
    user_id: int,
    alert_message: str,
    location: str,
    session: Session = Depends(get_mysql_session)
):
    """
    发送天气预警短信
    """
    # 获取用户信息
    user = session.get(SystemUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    if not user.mobile:
        raise HTTPException(status_code=400, detail="用户未设置手机号")
    
    # 构建短信内容 - 使用已报备的固定模板
    # 注意：短信内容必须与互亿无线平台报备的模板格式完全匹配
    message = "作业员您好，您所在地区天气发生极端变化，请您做好应对措施，保障出行安全。"
    
    # 发送短信
    result = await sms_service.send_sms(message, user.mobile)
    
    if result["success"]:
        return {
            "success": True,
            "message": f"短信发送成功，已通知 {user.nickname or user.username}",
            "mobile": user.mobile,
            "smsid": result.get("smsid"),
            "code": result.get("code")
        }
    else:
        raise HTTPException(
            status_code=500,
            detail=f"短信发送失败: {result.get('message', '未知错误')}"
        )


@router.post("/send-custom-sms")
async def send_custom_sms(
    mobile: str = Query(..., description="手机号码"),
    message: str = Query(..., description="短信内容"),
):
    """
    发送自定义短信
    """
    try:
        result = await sms_service.send_sms(message, mobile)
        return {
            "success": result["success"],
            "message": result["message"],
            "smsid": result.get("smsid"),
            "code": result.get("code")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"发送短信时发生错误: {str(e)}")


@router.get("/test-sms")
async def test_sms():
    """
    测试短信发送功能
    """
    try:
        # 使用已报备的固定模板进行测试
        test_message = "作业员您好，您所在地区天气发生极端变化，请您做好应对措施，保障出行安全。"
        test_mobile = "13551342187"  # 使用默认测试手机号
        
        result = await sms_service.send_sms(test_message, test_mobile)
        
        return {
            "success": result["success"],
            "message": result["message"],
            "test_mobile": test_mobile,
            "test_message": test_message,
            "raw_response": result.get("raw_response")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"测试短信发送失败: {str(e)}")

