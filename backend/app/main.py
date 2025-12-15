import sentry_sdk
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.routing import APIRoute
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import HTMLResponse

from app.api.main import api_router
from app.core.config import settings
from app.core.weather_monitor import start_monitoring, stop_monitoring


def custom_generate_unique_id(route: APIRoute) -> str:
    # 处理没有 tags 的情况（如 /docs, /redoc 等）
    if route.tags:
        return f"{route.tags[0]}-{route.name}"
    return route.name


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    print("应用启动中...")
    # 注意：监控任务默认不启动，需要用户手动点击"启动监控"按钮
    
    # 从数据库加载地图状态到内存（方案3：数据库作为唯一数据源）
    try:
        from app.core.mysql_db import get_mysql_session
        from app.core.load_map_state import load_map_state_from_db
        
        # 获取数据库会话
        session = next(get_mysql_session())
        load_map_state_from_db(session)
        session.close()
    except Exception as e:
        print(f"⚠️ 加载地图状态失败（不影响启动）：{e}")
    
    yield
    # 关闭时
    print("应用关闭中...")
    stop_monitoring()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=None,  # 禁用默认的 docs，我们将自定义
    redoc_url=None,  # 禁用默认的 redoc，我们将自定义
    generate_unique_id_function=custom_generate_unique_id,
    lifespan=lifespan,
)


# 自定义 Swagger UI，使用更可靠的 CDN（unpkg 作为主要 CDN）
@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html(req: Request) -> HTMLResponse:
    root_path = req.scope.get("root_path", "").rstrip("/")
    openapi_url = root_path + app.openapi_url
    html = get_swagger_ui_html(
        openapi_url=openapi_url,
        title=f"{app.title} - Swagger UI",
        # 使用 unpkg CDN，如果无法访问可以尝试其他 CDN
        swagger_js_url="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css",
    )
    # 自定义 logo：将 FastAPI logo 替换为"测智慧"
    # 获取 HTML 内容（body 是 bytes）
    html_content = html.body.decode("utf-8") if isinstance(html.body, bytes) else str(html.body)
    
    # 添加自定义 CSS 和 JavaScript 来替换 logo
    custom_css_js = """
    <style>
        .swagger-ui .topbar { display: none !important; }
        .swagger-ui .topbar-wrapper { display: none !important; }
        .swagger-ui .topbar .download-url-wrapper { display: none !important; }
        .swagger-ui .info .title { 
            font-size: 36px;
            font-weight: bold;
            color: #009639;
            margin: 20px 0;
        }
        .swagger-ui .info .title small {
            display: none;
        }
    </style>
    <script>
        window.addEventListener('load', function() {
            // 隐藏 FastAPI logo (topbar)
            setTimeout(function() {
                const topbar = document.querySelector('.swagger-ui .topbar');
                if (topbar) {
                    topbar.style.display = 'none';
                }
                const topbarWrapper = document.querySelector('.swagger-ui .topbar-wrapper');
                if (topbarWrapper) {
                    topbarWrapper.style.display = 'none';
                }
                // 替换标题为"测智慧"
                const title = document.querySelector('.swagger-ui .info .title');
                if (title) {
                    title.innerHTML = '<span style="font-size: 36px; font-weight: bold; color: #009639;">测智慧</span>';
                }
            }, 100);
        });
    </script>
    """
    # 将自定义 CSS/JS 插入到 HTML 的 </head> 标签之前
    html_content = html_content.replace("</head>", custom_css_js + "</head>")
    return HTMLResponse(content=html_content)


# 自定义 ReDoc 作为备用文档
@app.get("/redoc", include_in_schema=False)
async def custom_redoc_html(req: Request) -> HTMLResponse:
    root_path = req.scope.get("root_path", "").rstrip("/")
    openapi_url = root_path + app.openapi_url
    return get_redoc_html(
        openapi_url=openapi_url,
        title=f"{app.title} - ReDoc",
        redoc_js_url="https://unpkg.com/redoc@2/bundles/redoc.standalone.js",
    )

# Set all CORS enabled origins
# Note: CORS middleware only handles HTTP, not WebSocket
# WebSocket connections need to be handled in the endpoint itself
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)
