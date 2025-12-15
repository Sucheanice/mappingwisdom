@echo off
REM 启动后端服务，监听所有网络接口（0.0.0.0），允许外部访问
echo ========================================
echo 正在启动后端服务...
echo ========================================
echo 监听地址: 0.0.0.0:8000
echo.
echo 可以通过以下地址访问:
echo   - http://localhost:8000/docs
echo   - http://127.0.0.1:8000/docs
echo   - http://10.62.111.29:8000/docs
echo   - http://10.62.111.29:8000/api/v1/agent/map/openapi.json
echo.
echo ========================================
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

