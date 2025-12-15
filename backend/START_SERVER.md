# 后端服务启动指南

## 问题：localhost 可以访问，但 IP 地址无法访问

### 原因

当后端服务只监听 `127.0.0.1`（localhost）时，只能从本机访问。要从其他机器或通过 IP 地址访问，必须监听 `0.0.0.0`（所有网络接口）。

### 解决方案

## 方法 1：使用启动脚本（推荐）

### Windows PowerShell

```powershell
cd backend
.\run_server.bat
```

**注意：** PowerShell 中执行 `.bat` 文件必须使用 `.\` 前缀！

### Windows CMD

```cmd
cd backend
run_server.bat
```

### Linux/Mac

```bash
cd backend
chmod +x run_server.sh
./run_server.sh
```

## 方法 2：手动启动

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 方法 3：使用 FastAPI CLI

### 开发模式（带热重载）

```bash
cd backend
fastapi dev --host 0.0.0.0 --port 8000
```

### 生产模式

```bash
cd backend
fastapi run --host 0.0.0.0 --port 8000
```

## 验证启动成功

启动后，你应该看到：

```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [xxxxx] using StatReload
INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**关键点：** 必须显示 `http://0.0.0.0:8000`，而不是 `http://127.0.0.1:8000`！

## 测试访问

启动后，可以通过以下地址访问：

- ✅ `http://localhost:8000/docs` - Swagger UI
- ✅ `http://127.0.0.1:8000/docs` - Swagger UI
- ✅ `http://10.62.111.29:8000/docs` - Swagger UI（从其他机器）
- ✅ `http://10.62.111.29:8000/api/v1/agent/map/openapi.json` - OpenAPI Schema

## 常见问题

### 1. 端口被占用

```bash
# Windows
netstat -ano | findstr :8000

# Linux/Mac
lsof -i :8000

# 使用不同端口
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 2. 防火墙阻止访问

**Windows:**
- 控制面板 → Windows Defender 防火墙 → 高级设置
- 入站规则 → 新建规则 → 端口 → TCP → 8000 → 允许连接

**Linux:**
```bash
# Ubuntu/Debian
sudo ufw allow 8000/tcp

# CentOS/RHEL
sudo firewall-cmd --add-port=8000/tcp --permanent
sudo firewall-cmd --reload
```

### 3. 仍然无法访问

检查：
1. 服务是否真的在 `0.0.0.0:8000` 上监听（查看启动日志）
2. 防火墙是否允许 8000 端口
3. 网络是否在同一网段
4. 是否有代理或 VPN 影响

## 快速检查命令

```bash
# 检查服务是否在监听
netstat -ano | findstr :8000  # Windows
netstat -tuln | grep 8000     # Linux

# 应该看到类似：
# TCP    0.0.0.0:8000    0.0.0.0:0    LISTENING    xxxxx
```

如果看到 `127.0.0.1:8000` 而不是 `0.0.0.0:8000`，说明服务没有正确启动。

