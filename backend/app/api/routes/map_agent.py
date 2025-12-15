"""
地图工具 Agent API
为 Dify Agent 提供地图操控功能
支持 Function Calling 和 OpenAPI 两种方式
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Security
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field, field_validator

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
from app.core.mysql_db import get_mysql_session
from app.core.config import settings
from sqlmodel import Session

# API Key 认证（可选，用于 Dify 等外部系统）
api_key_header = APIKeyHeader(
    name="X-API-Key",
    auto_error=False,  # 不自动报错，允许无认证访问
    description="API Key for authentication (optional)"
)

# 从环境变量获取 API Key，如果没有则使用默认值
# ⚠️ 警告：生产环境必须通过环境变量 MAP_AGENT_API_KEY 配置，默认值仅用于开发
MAP_AGENT_API_KEY = os.environ.get("MAP_AGENT_API_KEY", "dify-map-agent-key-2024")


async def verify_api_key(api_key: Optional[str] = Security(api_key_header)) -> bool:
    """
    验证 API Key（可选）
    如果提供了 API Key，则验证；如果没有提供，允许访问（用于开发环境）
    """
    if api_key is None:
        # 如果没有提供 API Key，检查是否允许无认证访问
        # 在生产环境中，你可能想要返回 False
        allow_no_auth = os.environ.get("MAP_AGENT_ALLOW_NO_AUTH", "true").lower() == "true"
        return allow_no_auth
    
    # 验证 API Key
    return api_key == MAP_AGENT_API_KEY

router = APIRouter(prefix="/agent/map", tags=["地图Agent"])


# ========== Function Calling 格式的工具定义 ==========

class FunctionCallingTool(BaseModel):
    """Function Calling 格式的工具定义"""
    type: str = "function"
    function: Dict[str, Any]


def get_map_tools_function_calling() -> List[Dict[str, Any]]:
    """获取 Function Calling 格式的地图工具定义"""
    return [
        {
            "type": "function",
            "function": {
                "name": "add_map_marker",
                "description": "⚠️ 注意：此工具需要精确的经纬度坐标。如果用户只说位置名称（如'天安门'、'天府广场'）而没有提供坐标，必须使用 search_and_locate 工具。此工具仅适用于：1) 用户明确提供了坐标（例如：'在坐标 116.3974, 39.9093 添加标记点'）；2) 从其他工具结果中获取了坐标后添加标记点。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "标记点的名称，从用户输入中提取。例如：用户说'在天安门广场标记一个点'，则 name='天安门广场'。"
                        },
                        "longitude": {
                            "type": "number",
                            "description": "经度（-180 到 180），必须从用户输入中提取或从其他工具结果中获取。如果用户没有提供坐标，应该先使用 search_and_locate 工具搜索位置。例如：116.3974"
                        },
                        "latitude": {
                            "type": "number",
                            "description": "纬度（-90 到 90），必须从用户输入中提取或从其他工具结果中获取。如果用户没有提供坐标，应该先使用 search_and_locate 工具搜索位置。例如：39.9093"
                        },
                        "description": {
                            "type": "string",
                            "description": "标记点的描述信息（可选）"
                        }
                    },
                    "required": ["name", "longitude", "latitude"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_and_locate",
                "description": "✅ 这是标记位置的首选工具！当用户说'在XX地方标记一个点'、'帮我标记XX'、'在XX添加标记'时，必须使用此工具。例如：用户说'在天安门帮我标记一个点'，则使用此工具，query='天安门'，add_marker=true。此工具会自动搜索位置、移动地图、并添加标记点。支持城市名称、地址、地标等搜索。如果用户只提供了位置名称而没有坐标，必须使用此工具，不要使用 add_map_marker。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "搜索关键词，从用户输入中提取位置名称。例如：用户说'在天府广场标记一个点'，则 query='天府广场'；用户说'搜索北京市'，则 query='北京市'。支持城市名称、地址、地标等。"
                        },
                        "zoom": {
                            "type": "integer",
                            "description": "缩放级别（1-20），默认15。数字越大越详细。通常使用默认值即可，除非用户明确要求。",
                            "default": 15,
                            "minimum": 1,
                            "maximum": 20
                        },
                        "add_marker": {
                            "type": "boolean",
                            "description": "是否添加标记点，默认true。如果用户明确说'标记'、'添加标记点'，则设置为true；如果用户只说'搜索'或'定位'，可以设置为false。",
                            "default": True
                        }
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "switch_map_layer",
                "description": "切换地图图层类型。可以切换为标准地图、卫星地图或路网地图。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "layer_type": {
                            "type": "string",
                            "enum": ["osm", "satellite", "terrain"],
                            "description": "图层类型：osm(标准地图)、satellite(卫星地图)、terrain(路网地图)"
                        }
                    },
                    "required": ["layer_type"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "add_map_drawing",
                "description": "在地图上绘制图形。支持绘制点、线、多边形、圆形等。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "drawing_type": {
                            "type": "string",
                            "enum": ["point", "line", "polygon", "circle"],
                            "description": "绘制类型：point(点)、line(线)、polygon(多边形)、circle(圆形)"
                        },
                        "coordinates": {
                            "type": "array",
                            "description": "坐标数组。point: [[lon, lat]]，line: [[lon1, lat1], [lon2, lat2], ...]，polygon: [[lon1, lat1], [lon2, lat2], ...]，circle: [[center_lon, center_lat], [point_on_circle_lon, point_on_circle_lat]]",
                            "items": {
                                "type": "array",
                                "items": {"type": "number"},
                                "minItems": 2,
                                "maxItems": 2
                            }
                        },
                        "drawing_id": {
                            "type": "string",
                            "description": "绘制图形的唯一标识ID（可选，系统会自动生成）"
                        }
                    },
                    "required": ["drawing_type", "coordinates"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "measure_distance",
                "description": "测量两个位置之间的距离。这是最常用的测量工具，适合以下场景：1) 用户说'测量XX到XX的距离'（例如：'测量天府广场到春熙路的距离'）；2) 用户说'这两个标记点之间有多远'；3) 用户提供了两个坐标点。可以自动查找标记点并计算距离，支持通过标记点名称、标记点ID或直接提供坐标。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "marker1_name": {
                            "type": "string",
                            "description": "第一个位置的名称（如'天府广场'），从用户输入中提取。如果用户说'测量天府广场到春熙路的距离'，则 marker1_name='天府广场'。"
                        },
                        "marker2_name": {
                            "type": "string",
                            "description": "第二个位置的名称（如'春熙路'），从用户输入中提取。如果用户说'测量天府广场到春熙路的距离'，则 marker2_name='春熙路'。"
                        },
                        "marker1_id": {
                            "type": "string",
                            "description": "第一个标记点的ID（可选，如果知道标记点ID可以使用）"
                        },
                        "marker2_id": {
                            "type": "string",
                            "description": "第二个标记点的ID（可选，如果知道标记点ID可以使用）"
                        },
                        "point1": {
                            "type": "array",
                            "description": "第一个位置的坐标 [经度, 纬度]（可选，如果用户提供了坐标）",
                            "items": {"type": "number"},
                            "minItems": 2,
                            "maxItems": 2
                        },
                        "point2": {
                            "type": "array",
                            "description": "第二个位置的坐标 [经度, 纬度]（可选，如果用户提供了坐标）",
                            "items": {"type": "number"},
                            "minItems": 2,
                            "maxItems": 2
                        },
                        "unit": {
                            "type": "string",
                            "enum": ["m", "km", "mile"],
                            "description": "距离单位：m(米)、km(公里)、mile(英里)，默认km",
                            "default": "km"
                        }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "measure_area",
                "description": "测量一个区域（多边形）的面积。适合以下场景：1) 用户说'测量这个区域的面积'；2) 用户说'计算多边形的面积'；3) 用户提供了坐标列表。可以自动查找已绘制的多边形或根据坐标列表计算面积。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "drawing_id": {
                            "type": "string",
                            "description": "已绘制的多边形图形的ID（可选，如果用户要测量已绘制的多边形）"
                        },
                        "coordinates": {
                            "type": "array",
                            "description": "多边形的坐标列表 [[lon1, lat1], [lon2, lat2], ...]（可选，如果用户提供了坐标）",
                            "items": {
                                "type": "array",
                                "items": {"type": "number"},
                                "minItems": 2,
                                "maxItems": 2
                            }
                        },
                        "unit": {
                            "type": "string",
                            "enum": ["m²", "km²", "hectare"],
                            "description": "面积单位：m²(平方米)、km²(平方公里)、hectare(公顷)，默认km²",
                            "default": "km²"
                        }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "add_map_measurement",
                "description": "添加地图测量结果（已计算好的值）。用于手动添加测量结果，通常不需要使用，优先使用 measure_distance 或 measure_area 工具。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "measurement_type": {
                            "type": "string",
                            "enum": ["length", "area"],
                            "description": "测量类型：length(距离)、area(面积)"
                        },
                        "value": {
                            "type": "string",
                            "description": "测量结果值，例如：'100.50 m' 或 '25.30 m²'"
                        },
                        "coordinates": {
                            "type": "array",
                            "description": "测量图形的坐标数据",
                            "items": {
                                "type": "array",
                                "items": {"type": "number"},
                                "minItems": 2,
                                "maxItems": 2
                            }
                        },
                        "measurement_id": {
                            "type": "string",
                            "description": "测量结果的唯一标识ID（可选，系统会自动生成）"
                        }
                    },
                    "required": ["measurement_type", "value", "coordinates"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "clear_map_all",
                "description": "清除地图上的所有内容，包括标记点、绘制图形和测量结果。",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "remove_map_drawing",
                "description": "删除指定的绘制图形。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "drawing_id": {
                            "type": "string",
                            "description": "要删除的绘制图形的ID"
                        }
                    },
                    "required": ["drawing_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "remove_map_measurement",
                "description": "删除指定的测量结果。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "measurement_id": {
                            "type": "string",
                            "description": "要删除的测量结果的ID"
                        }
                    },
                    "required": ["measurement_id"]
                }
            }
        }
    ]


# ========== 工具调用请求模型 ==========

class ToolCallRequest(BaseModel):
    """工具调用请求"""
    name: str = Field(..., description="工具名称")
    arguments: Union[Dict[str, Any], str] = Field(..., description="工具参数（JSON对象或字符串）")
    
    @field_validator('arguments', mode='before')
    @classmethod
    def normalize_arguments(cls, v: Any) -> Any:
        """将字符串参数转换为对象（兼容 Dify 等工具）"""
        if isinstance(v, str):
            # 如果是字符串，尝试解析 JSON
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                # 不是 JSON 字符串，返回原字符串，让后续逻辑处理
                return v
        return v


class ToolCallResponse(BaseModel):
    """工具调用响应"""
    success: bool
    result: Any
    message: Optional[str] = None


# ========== 工具调用处理器 ==========

@router.get("/tools", summary="获取地图工具定义（Function Calling格式）")
async def get_tools(
    api_key_valid: bool = Depends(verify_api_key)
) -> Dict[str, Any]:
    """获取 Function Calling 格式的地图工具定义列表"""
    if not api_key_valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API Key. Please provide X-API-Key header."
        )
    return {
        "tools": get_map_tools_function_calling(),
        "format": "function_calling"
    }


@router.post("/call", summary="调用地图工具")
async def call_tool(
    request: ToolCallRequest,
    session: Session = Depends(get_mysql_session),
    api_key_valid: bool = Depends(verify_api_key)
) -> ToolCallResponse:
    """执行地图工具调用"""
    if not api_key_valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API Key. Please provide X-API-Key header."
        )
    
    tool_name = request.name
    args = request.arguments
    
    # 兼容处理：如果 arguments 仍然是字符串（验证器未能转换），尝试转换为对象
    # 这主要是为了兼容 Dify 等工具可能直接传入字符串的情况
    if isinstance(args, str):
        if tool_name == "search_and_locate":
            # 对于搜索工具，字符串直接作为 query 参数
            args = {"query": args}
        elif tool_name == "switch_map_layer":
            # 对于切换图层，字符串作为 layer_type
            args = {"layer_type": args}
        else:
            # 其他工具，尝试解析 JSON 字符串
            try:
                args = json.loads(args)
            except (json.JSONDecodeError, TypeError):
                raise HTTPException(
                    status_code=400,
                    detail=f"参数格式错误：arguments 应该是对象，但收到字符串 '{args}'。对于 {tool_name}，请提供正确的参数对象。例如：{{\"query\": \"{args}\"}}"
                )
    
    # 确保 args 是字典
    if not isinstance(args, dict):
        raise HTTPException(
            status_code=400,
            detail=f"参数格式错误：arguments 必须是对象（字典），但收到 {type(args).__name__}。"
        )
    
    try:
        if tool_name == "add_map_marker":
            # 添加标记点
            import uuid
            from datetime import datetime
            marker_id = f"agent_{uuid.uuid4().hex[:8]}"
            
            marker = Marker(
                id=marker_id,
                name=args.get("name"),
                coordinate=[args.get("longitude"), args.get("latitude")],
                description=args.get("description"),
                created_at=datetime.now().isoformat()
            )
            
            result = await add_marker(marker=marker, session=session)
            return ToolCallResponse(
                success=True,
                result=result,
                message=f"已在地图上添加标记点：{args.get('name')}"
            )
        
        elif tool_name == "search_and_locate":
            # 搜索并定位
            locate_req = LocateRequest(
                query=args.get("query"),
                zoom=args.get("zoom", 15),
                add_marker=args.get("add_marker", True)
            )
            result = await locate(locate_req, session=session)
            return ToolCallResponse(
                success=True,
                result=result,
                message=result.get("message", f"已定位到：{args.get('query')}")
            )
        
        elif tool_name == "switch_map_layer":
            # 切换图层
            layer_type = args.get("layer_type")
            result = await switch_layer(layer_type=layer_type)
            return ToolCallResponse(
                success=True,
                result=result,
                message=result.get("message", f"已切换为{layer_type}图层")
            )
        
        elif tool_name == "add_map_drawing":
            # 添加绘制图形
            import uuid
            from datetime import datetime
            drawing_id = args.get("drawing_id") or f"agent_draw_{uuid.uuid4().hex[:8]}"
            
            drawing = Drawing(
                id=drawing_id,
                type=args.get("drawing_type"),
                coordinates=args.get("coordinates"),
                style=None,
                created_at=datetime.now().isoformat()
            )
            
            result = await add_drawing(drawing=drawing, session=session)
            return ToolCallResponse(
                success=True,
                result=result,
                message=f"已添加{args.get('drawing_type')}绘制图形"
            )
        
        elif tool_name == "measure_distance":
            # 测量两个位置之间的距离
            result = await measure_distance(
                marker1_id=args.get("marker1_id"),
                marker1_name=args.get("marker1_name"),
                marker2_id=args.get("marker2_id"),
                marker2_name=args.get("marker2_name"),
                point1=args.get("point1"),
                point2=args.get("point2"),
                unit=args.get("unit", "km"),
                session=session
            )
            return ToolCallResponse(
                success=True,
                result=result,
                message=result.get("message", f"两点间距离为 {result.get('distance_str')}")
            )
        
        elif tool_name == "measure_area":
            # 测量多边形区域的面积
            result = await measure_area(
                drawing_id=args.get("drawing_id"),
                coordinates=args.get("coordinates"),
                unit=args.get("unit", "km²"),
                session=session
            )
            return ToolCallResponse(
                success=True,
                result=result,
                message=result.get("message", f"区域面积为 {result.get('area_str')}")
            )
        
        elif tool_name == "add_map_measurement":
            # 添加测量结果（已计算好的值）
            import uuid
            from datetime import datetime
            measurement_id = args.get("measurement_id") or f"agent_meas_{uuid.uuid4().hex[:8]}"
            
            measurement = Measurement(
                id=measurement_id,
                type=args.get("measurement_type"),
                value=args.get("value"),
                coordinates=args.get("coordinates"),
                created_at=datetime.now().isoformat()
            )
            
            result = await add_measurement(measurement=measurement, session=session)
            return ToolCallResponse(
                success=True,
                result=result,
                message=f"已添加{args.get('measurement_type')}测量结果：{args.get('value')}"
            )
        
        elif tool_name == "clear_map_all":
            # 清除所有内容
            result = await clear_all(session=session)
            return ToolCallResponse(
                success=True,
                result=result,
                message="已清除地图上的所有内容"
            )
        
        elif tool_name == "remove_map_drawing":
            # 删除绘制图形
            from app.api.routes.map import remove_drawing
            result = await remove_drawing(
                drawing_id=args.get("drawing_id"),
                session=session
            )
            return ToolCallResponse(
                success=True,
                result=result,
                message=f"已删除绘制图形：{args.get('drawing_id')}"
            )
        
        elif tool_name == "remove_map_measurement":
            # 删除测量结果
            from app.api.routes.map import remove_measurement
            result = await remove_measurement(
                measurement_id=args.get("measurement_id"),
                session=session
            )
            return ToolCallResponse(
                success=True,
                result=result,
                message=f"已删除测量结果：{args.get('measurement_id')}"
            )
        
        else:
            raise HTTPException(
                status_code=400,
                detail=f"未知的工具名称：{tool_name}。支持的工具：add_map_marker, search_and_locate, switch_map_layer, add_map_drawing, measure_distance, measure_area, add_map_measurement, clear_map_all, remove_map_drawing, remove_map_measurement"
            )
    
    except HTTPException:
        # 重新抛出 HTTPException（如 400 错误）
        raise
    except Exception as e:
        # 其他异常返回错误响应
        return ToolCallResponse(
            success=False,
            result=None,
            message=f"工具调用失败：{str(e)}"
        )


# ========== OpenAPI Schema 导出 ==========

@router.get("/openapi.json", summary="获取地图工具 OpenAPI Schema")
async def get_openapi_schema(
    request: Request,
    api_key_valid: bool = Depends(verify_api_key)
):
    """生成 OpenAPI 格式的 API 文档，供 Dify 使用"""
    if not api_key_valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API Key. Please provide X-API-Key header."
        )
    
    # 优先使用配置中的 MAP_AGENT_API_BASE
    if settings.MAP_AGENT_API_BASE:
        base_url = settings.MAP_AGENT_API_BASE.rstrip("/")
    else:
        # 从环境变量获取
        import os
        backend_url = os.environ.get("BACKEND_URL") or os.environ.get("API_BASE_URL") or os.environ.get("MAP_AGENT_API_BASE")
        if backend_url:
            base_url = backend_url.rstrip("/")
        else:
            # 最后使用请求的 base_url（可能不准确，因为 Dify 在另一台服务器上）
            base_url = str(request.base_url).rstrip("/")
    
    print(f"[OpenAPI Schema] 生成的 base_url: {base_url}")
    
    schema = {
        "openapi": "3.0.0",
        "info": {
            "title": "地图操控 API",
            "description": "提供地图标记、定位、绘制、测量等功能",
            "version": "1.0.0"
        },
        "servers": [
            {
                "url": f"{base_url}/api/v1/agent/map",
                "description": "地图 Agent API"
            }
        ],
        "security": [
            {
                "ApiKeyAuth": []
            }
        ],
        "paths": {
            "/call": {
                "post": {
                    "summary": "调用地图工具",
                    "description": "执行地图操作工具调用。支持的工具：add_map_marker（添加标记点）、search_and_locate（搜索位置）、switch_map_layer（切换图层）、add_map_drawing（添加绘制图形）、measure_distance（测量距离）、measure_area（测量面积）、add_map_measurement（添加测量结果）、clear_map_all（清除所有内容）、remove_map_drawing（删除绘制图形）、remove_map_measurement（删除测量结果）",
                    "operationId": "callMapTool",
                    "security": [
                        {
                            "ApiKeyAuth": []
                        }
                    ],
                    "requestBody": {
                        "required": True,
                        "description": "工具调用请求，包含工具名称和参数",
                        "content": {
                            "application/json": {
                                "schema": {
                                    "$ref": "#/components/schemas/ToolCallRequest"
                                },
                                "examples": {
                                    "add_marker": {
                                        "summary": "添加标记点示例",
                                        "value": {
                                            "name": "add_map_marker",
                                            "arguments": {
                                                "name": "天安门广场",
                                                "longitude": 116.3974,
                                                "latitude": 39.9093,
                                                "description": "北京市中心广场"
                                            }
                                        }
                                    },
                                    "search_location": {
                                        "summary": "搜索位置示例",
                                        "value": {
                                            "name": "search_and_locate",
                                            "arguments": {
                                                "query": "北京市",
                                                "zoom": 15,
                                                "add_marker": True
                                            }
                                        }
                                    },
                                    "switch_layer": {
                                        "summary": "切换图层示例",
                                        "value": {
                                            "name": "switch_map_layer",
                                            "arguments": {
                                                "layer_type": "satellite"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "工具调用成功",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "$ref": "#/components/schemas/ToolCallResponse"
                                    },
                                    "examples": {
                                        "success": {
                                            "summary": "成功响应示例",
                                            "value": {
                                                "success": True,
                                                "result": {
                                                    "success": True,
                                                    "marker": {
                                                        "id": "agent_abc123",
                                                        "name": "天安门广场",
                                                        "coordinate": [116.3974, 39.9093]
                                                    }
                                                },
                                                "message": "已在地图上添加标记点：天安门广场"
                                            }
                                        },
                                        "error": {
                                            "summary": "错误响应示例",
                                            "value": {
                                                "success": False,
                                                "result": None,
                                                "message": "工具调用失败：参数验证错误"
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "400": {
                            "description": "请求参数错误",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "detail": {
                                                "type": "string",
                                                "example": "未知的工具名称：invalid_tool"
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "500": {
                            "description": "服务器内部错误",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "detail": {
                                                "type": "string",
                                                "example": "工具调用失败：数据库连接错误"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "components": {
            "securitySchemes": {
                "ApiKeyAuth": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "X-API-Key",
                    "description": "API Key for authentication. Default: dify-map-agent-key-2024"
                }
            },
            "schemas": {
                "ToolCallRequest": {
                    "type": "object",
                    "required": ["name", "arguments"],
                    "description": "工具调用请求",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "工具名称。⚠️ 重要：如果用户只说位置名称（如'天安门'、'天府广场'）要标记，必须使用 search_and_locate，不要使用 add_map_marker（add_map_marker 需要精确坐标）。支持的工具：search_and_locate（搜索位置并标记，首选）、add_map_marker（需要精确坐标）、switch_map_layer（切换图层）、add_map_drawing（绘制图形）、measure_distance（测量距离）、measure_area（测量面积）、add_map_measurement（添加测量结果）、clear_map_all（清除所有内容）、remove_map_drawing（删除绘制图形）、remove_map_measurement（删除测量结果）",
                            "enum": [
                                "add_map_marker",
                                "search_and_locate",
                                "switch_map_layer",
                                "add_map_drawing",
                                "measure_distance",
                                "measure_area",
                                "add_map_measurement",
                                "clear_map_all",
                                "remove_map_drawing",
                                "remove_map_measurement"
                            ],
                            "example": "add_map_marker"
                        },
                        "arguments": {
                            "type": "object",
                            "description": "工具参数，根据不同的工具名称，参数结构不同。详见各工具的说明。对于 search_and_locate，必须包含 'query' 字段（字符串类型）。",
                            "additionalProperties": True,
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "搜索关键词（仅用于 search_and_locate 工具）"
                                },
                                "zoom": {
                                    "type": "integer",
                                    "description": "缩放级别（仅用于 search_and_locate 工具）",
                                    "minimum": 1,
                                    "maximum": 20
                                },
                                "add_marker": {
                                    "type": "boolean",
                                    "description": "是否添加标记点（仅用于 search_and_locate 工具）"
                                },
                                "layer_type": {
                                    "type": "string",
                                    "enum": ["osm", "satellite", "terrain"],
                                    "description": "图层类型（仅用于 switch_map_layer 工具）"
                                },
                                "name": {
                                    "type": "string",
                                    "description": "标记点名称（仅用于 add_map_marker 工具）"
                                },
                                "longitude": {
                                    "type": "number",
                                    "description": "经度（仅用于 add_map_marker 工具）",
                                    "minimum": -180,
                                    "maximum": 180
                                },
                                "latitude": {
                                    "type": "number",
                                    "description": "纬度（仅用于 add_map_marker 工具）",
                                    "minimum": -90,
                                    "maximum": 90
                                }
                            },
                            "examples": {
                                "add_marker": {
                                    "summary": "添加标记点参数",
                                    "value": {
                                        "name": "天安门广场",
                                        "longitude": 116.3974,
                                        "latitude": 39.9093,
                                        "description": "北京市中心广场"
                                    }
                                },
                                "search_location": {
                                    "summary": "搜索位置参数",
                                    "value": {
                                        "query": "北京市",
                                        "zoom": 15,
                                        "add_marker": True
                                    }
                                },
                                "switch_layer": {
                                    "summary": "切换图层参数",
                                    "value": {
                                        "layer_type": "satellite"
                                    }
                                }
                            }
                        }
                    }
                },
                "ToolCallResponse": {
                    "type": "object",
                    "description": "工具调用响应",
                    "properties": {
                        "success": {
                            "type": "boolean",
                            "description": "工具调用是否成功",
                            "example": True
                        },
                        "result": {
                            "type": "object",
                            "description": "工具调用的结果数据，结构取决于调用的工具",
                            "additionalProperties": True
                        },
                        "message": {
                            "type": "string",
                            "description": "响应消息，描述操作结果",
                            "example": "已在地图上添加标记点：天安门广场"
                        }
                    },
                    "required": ["success"]
                }
            }
        }
    }
    
    # 返回格式化的 JSON 响应
    return JSONResponse(
        content=schema,
        media_type="application/json",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-API-Key"
        }
    )

