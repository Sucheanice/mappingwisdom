# 贡献指南

感谢您对 MappingWisdom 项目的关注！我们欢迎所有形式的贡献。

## 开始之前

### 环境准备

1. **克隆仓库**
   ```bash
   git clone https://github.com/Sucheanice/mappingwisdom.git
   cd mappingwisdom
   ```

2. **配置环境变量**
   ```bash
   # 复制环境变量示例文件
   cp env.example .env
   # 编辑 .env 文件，填入必要的配置信息
   ```

3. **安装依赖**
   
   **后端（Python）**
   - 确保使用 Python 3.11（项目要求）
   - 检查 Python 版本：`python --version`
   ```bash
   cd backend
   # 使用 poetry 或 uv
   poetry install
   # 或
   uv sync
   ```
   
   **前端（Node.js）**
   ```bash
   cd frontend
   npm install
   ```

4. **启动开发环境**
   
   使用 Docker Compose：
   ```bash
   docker compose up -d
   ```
   
   或分别启动：
   ```bash
   # 后端
   cd backend
   python -m uvicorn app.main:app --reload
   
   # 前端
   cd frontend
   npm run dev
   ```

## 开发流程

### 1. 创建分支

从 `main` 分支创建功能分支：
```bash
git checkout -b feature/your-feature-name
```

分支命名规范：
- `feature/` - 新功能
- `fix/` - 错误修复
- `docs/` - 文档更新
- `refactor/` - 代码重构
- `test/` - 测试相关

### 2. 编写代码

- 遵循项目的代码风格
- 添加必要的注释和文档
- 确保代码通过 lint 检查
- 编写或更新相关测试

### 3. 提交代码

使用清晰的提交信息：
```bash
git commit -m "feat: 添加新功能描述"
```

提交信息格式（遵循 Conventional Commits）：
- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具相关

### 4. 推送并创建 Pull Request

```bash
git push origin feature/your-feature-name
```

然后在 GitHub 上创建 Pull Request。

## 代码规范

### Python (后端)

- 使用 `ruff` 进行代码检查和格式化
- 遵循 PEP 8 风格指南
- 使用类型提示（Type Hints）
- 运行测试确保通过：
  ```bash
  cd backend
  pytest
  ```

### TypeScript/React (前端)

- 使用 `biome` 进行代码检查和格式化
- 遵循 React 最佳实践
- 使用 TypeScript 类型定义
- 运行测试确保通过：
  ```bash
   cd frontend
   npm run lint
   npm test
   ```

## 安全注意事项

⚠️ **重要：不要提交敏感信息**

- 不要提交 `.env` 文件
- 不要硬编码 API keys、密码等敏感信息
- 使用环境变量管理配置
- 如果意外提交了敏感信息，请立即联系维护者

## 测试

在提交 PR 之前，请确保：

1. 所有测试通过
2. 代码通过 lint 检查
3. 新功能包含相应的测试用例
4. 更新了相关文档

## 文档

- 更新 `README.md` 如果添加了新功能
- 在代码中添加必要的注释
- 更新 API 文档（如果修改了 API）

## 问题反馈

如果发现 bug 或有功能建议，请：

1. 检查是否已有相关 issue
2. 如果没有，创建新的 issue，描述清楚问题或建议
3. 提供复现步骤（如果是 bug）

## 代码审查

所有 PR 都需要经过代码审查：

- 维护者会审查代码
- 可能需要根据反馈进行修改
- 审查通过后代码会被合并

## 许可证

通过贡献代码，您同意您的贡献将在项目的许可证下发布。

## 获取帮助

如有问题，可以：

- 查看项目文档
- 查看 [协作指南](./COLLABORATION_GUIDE.md) 了解团队协作流程
- 创建 issue
- 联系项目维护者

## GitHub 仓库设置

如果你是项目管理员，请参考 [COLLABORATION_GUIDE.md](./COLLABORATION_GUIDE.md) 设置：
- 团队成员权限
- 分支保护规则
- PR 审核流程

再次感谢您的贡献！🎉

