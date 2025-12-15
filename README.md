# MappingWisdom

一个基于 FastAPI 和 React 的智能地图应用系统，提供地图可视化、地理编码、天气查询、对话式地图操作等功能。

## 技术栈

## Technology Stack and Features

- ⚡ [**FastAPI**](https://fastapi.tiangolo.com) - Python 后端 API 框架
    - 🧰 [SQLModel](https://sqlmodel.tiangolo.com) - Python SQL 数据库 ORM
    - 🔍 [Pydantic](https://docs.pydantic.dev) - 数据验证和设置管理
    - 💾 [PostgreSQL](https://www.postgresql.org) - 主数据库
    - 💾 [MySQL](https://www.mysql.com) - 辅助数据库（用于地图数据存储）
- 🚀 [React](https://react.dev) - 前端框架
    - 💃 TypeScript、Hooks、Vite 等现代前端技术栈
    - 🎨 [Chakra UI](https://chakra-ui.com) - UI 组件库
    - 🗺️ [OpenLayers](https://openlayers.org) - 地图可视化
    - 🤖 自动生成的前端 API 客户端
    - 🧪 [Playwright](https://playwright.dev) - 端到端测试
    - 🦇 深色模式支持
- 🐋 [Docker Compose](https://www.docker.com) - 开发和生产环境容器化
- 🔒 默认安全密码哈希
- 🔑 JWT (JSON Web Token) 身份验证
- 📫 基于邮件的密码恢复
- ✅ [Pytest](https://pytest.org) 测试框架
- 📞 [Traefik](https://traefik.io) - 反向代理/负载均衡器
- 🏭 GitHub Actions CI/CD

## 主要功能

- 🗺️ **地图可视化** - 基于 OpenLayers 的交互式地图
- 📍 **地理编码服务** - 地址与坐标互转
- 🌤️ **天气查询** - 实时天气信息获取
- 💬 **对话式地图操作** - 集成 Dify AI 的智能地图助手
- 📊 **数据管理** - 店铺位置、标记点等数据存储
- 🔐 **用户认证** - JWT 身份验证和权限管理

### Dashboard Login

[![API docs](img/login.png)](https://github.com/fastapi/full-stack-fastapi-template)

### Dashboard - Admin

[![API docs](img/dashboard.png)](https://github.com/fastapi/full-stack-fastapi-template)

### Dashboard - Create User

[![API docs](img/dashboard-create.png)](https://github.com/fastapi/full-stack-fastapi-template)

### Dashboard - Items

[![API docs](img/dashboard-items.png)](https://github.com/fastapi/full-stack-fastapi-template)

### Dashboard - User Settings

[![API docs](img/dashboard-user-settings.png)](https://github.com/fastapi/full-stack-fastapi-template)

### Dashboard - Dark Mode

[![API docs](img/dashboard-dark.png)](https://github.com/fastapi/full-stack-fastapi-template)

### Interactive API Documentation

[![API docs](img/docs.png)](https://github.com/fastapi/full-stack-fastapi-template)

## 快速开始

### 前置要求

- Python 3.10+
- Node.js 18+
- Docker 和 Docker Compose（可选，用于容器化部署）
- PostgreSQL 数据库
- MySQL 数据库（可选）

### 安装步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/your-org/mappingwisdom.git
   cd mappingwisdom
   ```

2. **配置环境变量**
   ```bash
   # 复制环境变量示例文件
   cp env.example .env
   # 编辑 .env 文件，填入必要的配置信息
   ```
   
   ⚠️ **重要**：必须修改以下配置：
   - `SECRET_KEY` - 生成密钥：`python -c "import secrets; print(secrets.token_urlsafe(32))"`
   - `FIRST_SUPERUSER_PASSWORD` - 管理员密码
   - `POSTGRES_PASSWORD` - PostgreSQL 密码
   - `MYSQL_PASSWORD` - MySQL 密码（如果使用）
   - `AMAP_API_KEY` - 高德地图 API Key（必需）
   - `VITE_AMAP_API_KEY` - 前端高德地图 API Key

3. **启动服务**

   使用 Docker Compose（推荐）：
   ```bash
   docker compose up -d
   ```

   或手动启动：
   ```bash
   # 后端
   cd backend
   poetry install  # 或 uv sync
   python -m uvicorn app.main:app --reload
   
   # 前端（新终端）
   cd frontend
   npm install
   npm run dev
   ```

4. **访问应用**
   - 前端：http://localhost:5173
   - 后端 API：http://localhost:8000
   - API 文档：http://localhost:8000/docs

### 如何配置私有仓库

If you want to have a private repository, GitHub won't allow you to simply fork it as it doesn't allow changing the visibility of forks.

But you can do the following:

- Create a new GitHub repo, for example `my-full-stack`.
- Clone this repository manually, set the name with the name of the project you want to use, for example `my-full-stack`:

```bash
git clone git@github.com:fastapi/full-stack-fastapi-template.git my-full-stack
```

- Enter into the new directory:

```bash
cd my-full-stack
```

- Set the new origin to your new repository, copy it from the GitHub interface, for example:

```bash
git remote set-url origin git@github.com:octocat/my-full-stack.git
```

- Add this repo as another "remote" to allow you to get updates later:

```bash
git remote add upstream git@github.com:fastapi/full-stack-fastapi-template.git
```

- Push the code to your new repository:

```bash
git push -u origin master
```

### Update From the Original Template

After cloning the repository, and after doing changes, you might want to get the latest changes from this original template.

- Make sure you added the original repository as a remote, you can check it with:

```bash
git remote -v

origin    git@github.com:octocat/my-full-stack.git (fetch)
origin    git@github.com:octocat/my-full-stack.git (push)
upstream    git@github.com:fastapi/full-stack-fastapi-template.git (fetch)
upstream    git@github.com:fastapi/full-stack-fastapi-template.git (push)
```

- Pull the latest changes without merging:

```bash
git pull --no-commit upstream master
```

This will download the latest changes from this template without committing them, that way you can check everything is right before committing.

- If there are conflicts, solve them in your editor.

- Once you are done, commit the changes:

```bash
git merge --continue
```

### 环境变量配置

详细的环境变量说明请参考 `env.example` 文件。主要配置项包括：

**必需配置：**
- `SECRET_KEY` - 应用密钥
- `FIRST_SUPERUSER` / `FIRST_SUPERUSER_PASSWORD` - 管理员账户
- `POSTGRES_*` - PostgreSQL 数据库配置
- `AMAP_API_KEY` / `VITE_AMAP_API_KEY` - 高德地图 API Key

**可选配置：**
- `MYSQL_*` - MySQL 数据库配置
- `DIFY_*` - Dify AI 配置（用于对话式地图操作）
- `SMTP_*` - 邮件服务配置
- `SENTRY_DSN` - 错误追踪配置

### 生成密钥

使用以下命令生成安全密钥：

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

多次运行以生成不同的密钥。

## How To Use It - Alternative With Copier

This repository also supports generating a new project using [Copier](https://copier.readthedocs.io).

It will copy all the files, ask you configuration questions, and update the `.env` files with your answers.

### Install Copier

You can install Copier with:

```bash
pip install copier
```

Or better, if you have [`pipx`](https://pipx.pypa.io/), you can run it with:

```bash
pipx install copier
```

**Note**: If you have `pipx`, installing copier is optional, you could run it directly.

### Generate a Project With Copier

Decide a name for your new project's directory, you will use it below. For example, `my-awesome-project`.

Go to the directory that will be the parent of your project, and run the command with your project's name:

```bash
copier copy https://github.com/fastapi/full-stack-fastapi-template my-awesome-project --trust
```

If you have `pipx` and you didn't install `copier`, you can run it directly:

```bash
pipx run copier copy https://github.com/fastapi/full-stack-fastapi-template my-awesome-project --trust
```

**Note** the `--trust` option is necessary to be able to execute a [post-creation script](https://github.com/fastapi/full-stack-fastapi-template/blob/master/.copier/update_dotenv.py) that updates your `.env` files.

### Input Variables

Copier will ask you for some data, you might want to have at hand before generating the project.

But don't worry, you can just update any of that in the `.env` files afterwards.

The input variables, with their default values (some auto generated) are:

- `project_name`: (default: `"FastAPI Project"`) The name of the project, shown to API users (in .env).
- `stack_name`: (default: `"fastapi-project"`) The name of the stack used for Docker Compose labels and project name (no spaces, no periods) (in .env).
- `secret_key`: (default: `"changethis"`) The secret key for the project, used for security, stored in .env, you can generate one with the method above.
- `first_superuser`: (default: `"admin@example.com"`) The email of the first superuser (in .env).
- `first_superuser_password`: (default: `"changethis"`) The password of the first superuser (in .env).
- `smtp_host`: (default: "") The SMTP server host to send emails, you can set it later in .env.
- `smtp_user`: (default: "") The SMTP server user to send emails, you can set it later in .env.
- `smtp_password`: (default: "") The SMTP server password to send emails, you can set it later in .env.
- `emails_from_email`: (default: `"info@example.com"`) The email account to send emails from, you can set it later in .env.
- `postgres_password`: (default: `"changethis"`) The password for the PostgreSQL database, stored in .env, you can generate one with the method above.
- `sentry_dsn`: (default: "") The DSN for Sentry, if you are using it, you can set it later in .env.

## 开发文档

- **后端开发**：查看 [backend/README.md](./backend/README.md)
- **前端开发**：查看 [frontend/README.md](./frontend/README.md)
- **部署指南**：查看 [deployment.md](./deployment.md)
- **开发指南**：查看 [development.md](./development.md)
- **贡献指南**：查看 [CONTRIBUTING.md](./CONTRIBUTING.md)

## 安全注意事项

⚠️ **重要**：在发布到生产环境之前，请确保：

1. 修改所有默认密码和密钥
2. 配置正确的环境变量（不要使用硬编码的默认值）
3. 不要将 `.env` 文件提交到 Git 仓库
4. 使用强密码和安全的密钥

代码中包含的默认 API Key 和密码仅用于开发环境，生产环境必须通过环境变量配置。

## 贡献

欢迎贡献代码！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何参与项目。

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。
