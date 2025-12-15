from typing import Any, Dict, Optional
import os
import csv
import httpx
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/weather", tags=["天气服务"])

# 高德API配置
AMAP_API_BASE = "https://restapi.amap.com/v3/weather/weatherInfo"
AMAP_REVERSE_BASE = "https://restapi.amap.com/v3/geocode/regeo"
AMAP_GEOCODE_BASE = "https://restapi.amap.com/v3/geocode/geo"
# ⚠️ 警告：生产环境必须通过环境变量 AMAP_API_KEY 配置，默认值仅用于开发
AMAP_API_KEY = os.environ.get("AMAP_API_KEY", "cbfcad74ad3ddfb72ba7770a8169cf36")
USER_AGENT = "mappingwisdom-weather/1.0"

# 城市名到adcode的映射字典
city_to_adcode: Dict[str, str] = {}


def _load_city_adcode_map() -> None:
    """加载城市adcode映射表"""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        csv_file_path = os.path.join(current_dir, "AMap_adcode_citycode.csv")
        if not os.path.exists(csv_file_path):
            return
        with open(csv_file_path, 'r', encoding='utf-8') as file:
            reader = csv.reader(file)
            next(reader, None)  # 跳过表头
            for row in reader:
                if len(row) >= 2:
                    city_name = row[0].strip()
                    adcode = row[1].strip()
                    if city_name and adcode:
                        city_to_adcode[city_name] = adcode
    except Exception:
        # 静默失败，后续降级到直接用城市名查询
        pass


# 初始化时加载城市映射表
_load_city_adcode_map()


def _get_adcode_or_city(city_name: str) -> str:
    """获取城市的adcode，如果没有则返回城市名"""
    if not city_name:
        return city_name
    
    # 直接匹配
    if city_name in city_to_adcode:
        return city_to_adcode[city_name]
    
    # 尝试添加"市"或"省"后缀
    if not city_name.endswith("市") and not city_name.endswith("省"):
        if city_name + "市" in city_to_adcode:
            return city_to_adcode[city_name + "市"]
        if city_name + "省" in city_to_adcode:
            return city_to_adcode[city_name + "省"]
    
    return city_name  # 直接返回城市名，交由高德处理


async def _amap_get(params: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """调用高德天气API"""
    params["key"] = AMAP_API_KEY
    headers = {"User-Agent": USER_AGENT}
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                AMAP_API_BASE, 
                params=params, 
                headers=headers, 
                timeout=20.0
            )
            resp.raise_for_status()
            result = resp.json()
            print(f"高德API返回: {result}")  # 调试日志
            return result
        except Exception as e:
            print(f"高德API错误: {e}")  # 调试日志
            return None


# ==================== API端点 ====================

@router.get("/current", summary="获取实时天气")
async def current_weather(
    city: str = Query(..., description="城市名，如：北京/成都/上海")
):
    """
    根据城市名获取实时天气信息
    
    - **city**: 城市名称（支持省市县）
    - 返回实时天气、温度、风力、湿度等信息
    """
    code_or_city = _get_adcode_or_city(city)
    data = await _amap_get({"city": code_or_city, "extensions": "base"})
    
    if not data or data.get("status") != "1" or not data.get("lives"):
        raise HTTPException(
            status_code=404, 
            detail=f"获取{city}的实时天气失败，请检查城市名称是否正确"
        )
    
    live = data["lives"][0]
    return {
        "success": True,
        "data": {
            "城市": live.get("city", "未知"),
            "天气": live.get("weather", "未知"),
            "温度": live.get("temperature", "未知"),
            "温度单位": "℃",
            "风向": live.get("winddirection", "未知"),
            "风力": live.get("windpower", "未知"),
            "湿度": live.get("humidity", "未知"),
            "湿度单位": "%",
            "报告时间": live.get("reporttime", "未知"),
        }
    }


@router.get("/forecast", summary="获取天气预报")
async def forecast_weather(
    city: str = Query(..., description="城市名，如：北京/成都/上海")
):
    """
    根据城市名获取未来几天的天气预报
    
    - **city**: 城市名称（支持省市县）
    - 返回未来3-4天的天气预报信息
    """
    code_or_city = _get_adcode_or_city(city)
    data = await _amap_get({"city": code_or_city, "extensions": "all"})
    
    if not data or data.get("status") != "1" or not data.get("forecasts"):
        raise HTTPException(
            status_code=404,
            detail=f"获取{city}的天气预报失败，请检查城市名称是否正确"
        )
    
    forecast = data["forecasts"][0]
    casts = forecast.get("casts", [])
    
    zh_casts = [
        {
            "日期": c.get("date"),
            "星期": c.get("week"),
            "白天天气": c.get("dayweather"),
            "白天温度": c.get("daytemp"),
            "白天风向": c.get("daywind"),
            "白天风力": c.get("daypower"),
            "夜间天气": c.get("nightweather"),
            "夜间温度": c.get("nighttemp"),
            "夜间风向": c.get("nightwind"),
            "夜间风力": c.get("nightpower"),
        }
        for c in casts
    ]
    
    return {
        "success": True,
        "data": {
            "城市": forecast.get("city", city),
            "预报": zh_casts,
        }
    }


@router.get("/search", summary="搜索城市")
async def search_city(
    keyword: str = Query(..., description="搜索关键字，如：北、杭、深")
):
    """
    按关键字搜索城市名称
    
    - **keyword**: 搜索关键字
    - 返回匹配的城市列表（最多20个）
    """
    if not city_to_adcode:
        return {
            "success": True, 
            "data": {"城市": []}, 
            "message": "未加载城市字典"
        }
    
    matched = [name for name in city_to_adcode.keys() if keyword in name]
    return {
        "success": True, 
        "data": {"城市": matched[:20]}
    }


# ==================== 坐标相关API ====================

class ReverseRequest(BaseModel):
    """逆地理编码请求模型"""
    lat: float = Field(..., description="纬度")
    lon: float = Field(..., description="经度")


@router.post("/reverse", summary="逆地理编码获取地名")
async def reverse_geocode(payload: ReverseRequest):
    """
    根据经纬度获取地理位置信息（逆地理编码）
    
    - **lat**: 纬度
    - **lon**: 经度
    - 返回详细的地址信息
    """
    params = {
        "key": AMAP_API_KEY,
        "location": f"{payload.lon},{payload.lat}",  # 高德为 经度,纬度
        "extensions": "base",
        "radius": "1000",
        "batch": "false"
    }
    headers = {"User-Agent": USER_AGENT}
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                AMAP_REVERSE_BASE, 
                params=params, 
                headers=headers, 
                timeout=15.0
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            data = None
    
    if not data or data.get("status") != "1":
        raise HTTPException(status_code=404, detail="逆地理编码失败")
    
    regeocode = data.get("regeocode", {})
    formatted = regeocode.get("formatted_address") or ""
    comp = regeocode.get("addressComponent", {})
    
    return {
        "success": True, 
        "data": {
            "地址": formatted,
            "省": comp.get("province"),
            "市": comp.get("city") if comp.get("city") else comp.get("province"),
            "区县": comp.get("district"),
            "乡镇": (comp.get("township") or "")
        }
    }


@router.post("/location-weather", summary="位置+天气一站式查询")
async def location_weather(payload: ReverseRequest):
    """
    根据经纬度获取位置信息和天气信息（一站式查询）
    
    - **lat**: 纬度
    - **lon**: 经度
    - 返回位置信息和该位置的天气信息
    """
    # 1. 逆地理获取地址
    params = {
        "key": AMAP_API_KEY,
        "location": f"{payload.lon},{payload.lat}",
        "extensions": "base",
        "radius": "1000",
        "batch": "false"
    }
    headers = {"User-Agent": USER_AGENT}
    
    location_data = {}
    city_name = ""
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                AMAP_REVERSE_BASE, 
                params=params, 
                headers=headers, 
                timeout=15.0
            )
            resp.raise_for_status()
            data = resp.json()
            
            if data and data.get("status") == "1":
                regeocode = data.get("regeocode", {})
                comp = regeocode.get("addressComponent", {})
                location_data = {
                    "地址": regeocode.get("formatted_address") or "",
                    "省": comp.get("province"),
                    "市": comp.get("city") if comp.get("city") else comp.get("province"),
                    "区县": comp.get("district"),
                    "乡镇": (comp.get("township") or "")
                }
                city_name = comp.get("city") or comp.get("province") or ""
        except Exception:
            pass
    
    # 2. 获取该城市天气
    weather_data = {}
    if city_name:
        try:
            code_or_city = _get_adcode_or_city(city_name)
            weather_resp = await _amap_get({"city": code_or_city, "extensions": "base"})
            
            if weather_resp and weather_resp.get("status") == "1" and weather_resp.get("lives"):
                live = weather_resp["lives"][0]
                weather_data = {
                    "城市": live.get("city", city_name),
                    "天气": live.get("weather", "未知"),
                    "温度": live.get("temperature", "未知"),
                    "温度单位": "℃",
                    "风向": live.get("winddirection", "未知"),
                    "风力": live.get("windpower", "未知"),
                    "湿度": live.get("humidity", "未知"),
                    "湿度单位": "%",
                    "报告时间": live.get("reporttime", "未知"),
                }
        except Exception:
            pass
    
    return {
        "success": True,
        "data": {
            "location": location_data,
            "weather": weather_data
        }
    }


class GeocodeRequest(BaseModel):
    """地理编码请求模型"""
    address: str = Field(..., description="地址，如：北京市朝阳区建国门外大街")


@router.post("/geocode", summary="地理编码获取经纬度")
async def geocode(payload: GeocodeRequest):
    """
    根据地址获取经纬度（地理编码）
    
    - **address**: 地址名称，如：北京市朝阳区建国门外大街、上海市浦东新区陆家嘴
    - 返回经纬度坐标和详细地址信息
    """
    params = {
        "key": AMAP_API_KEY,
        "address": payload.address,
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
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"地理编码请求失败: {str(e)}")
    
    if not data or data.get("status") != "1":
        error_msg = data.get("info", "地理编码失败") if data else "地理编码失败"
        raise HTTPException(status_code=404, detail=error_msg)
    
    geocodes = data.get("geocodes", [])
    if not geocodes:
        raise HTTPException(status_code=404, detail="未找到匹配的地址")
    
    # 取第一个结果
    geocode_item = geocodes[0]
    location = geocode_item.get("location", "").split(",")  # 高德返回格式：经度,纬度
    
    if len(location) != 2:
        raise HTTPException(status_code=500, detail="解析坐标失败")
    
    longitude = float(location[0])
    latitude = float(location[1])
    
    return {
        "success": True,
        "data": {
            "address": geocode_item.get("formatted_address", payload.address),
            "province": geocode_item.get("province", ""),
            "city": geocode_item.get("city", ""),
            "district": geocode_item.get("district", ""),
            "location": {
                "longitude": longitude,
                "latitude": latitude
            }
        }
    }

