# 团队协作指南

本指南说明如何设置 GitHub 仓库以便团队成员协作开发。

## 📋 目录

1. [GitHub 仓库设置](#github-仓库设置)
2. [团队成员权限管理](#团队成员权限管理)
3. [分支保护规则](#分支保护规则)
4. [协作流程](#协作流程)
5. [常见问题](#常见问题)

## 🔧 GitHub 仓库设置

### 1. 仓库可见性设置

访问：`https://github.com/Sucheanice/mappingwisdom/settings`

**选项：**
- **Public（公开）**：任何人都可以查看和克隆代码
- **Private（私有）**：只有被邀请的成员可以访问

**建议：** 如果是内部项目，选择 **Private**

### 2. 邀请团队成员

**步骤：**
1. 进入仓库设置：`Settings` → `Collaborators`
2. 点击 `Add people`
3. 输入团队成员的 GitHub 用户名或邮箱
4. 选择权限级别：
   - **Read（只读）**：只能查看和克隆代码
   - **Write（写入）**：可以推送代码和创建分支
   - **Admin（管理员）**：完全控制权限

**建议权限分配：**
- 普通开发者：**Write**
- 项目负责人：**Admin**

## 🛡️ 分支保护规则（重要！）

为了保护主分支代码质量，**必须设置分支保护规则**。

### 设置步骤：

1. 进入：`Settings` → `Branches`
2. 点击 `Add branch protection rule`
3. 在 `Branch name pattern` 中输入：`main`
4. 勾选以下选项：

#### ✅ 必须勾选的选项：

1. **Require a pull request before merging**
   - ✅ Require approvals: `1`（至少 1 人审核）
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require review from Code Owners（如果有 CODEOWNERS 文件）

2. **Require status checks to pass before merging**
   - ✅ Require branches to be up to date before merging
   - 添加状态检查：`test-backend`、`lint-backend`（如果配置了 CI）

3. **Require conversation resolution before merging**
   - ✅ 确保所有 PR 评论都已解决

4. **Do not allow bypassing the above settings**
   - ✅ 即使是管理员也不能绕过（可选，但推荐）

5. **Restrict who can push to matching branches**
   - ✅ 只允许特定人员直接推送到 main（可选）

6. **Allow force pushes** - ❌ **不要勾选**
7. **Allow deletions** - ❌ **不要勾选**

### 保存设置

点击 `Create` 保存规则。

## 🔄 协作流程

### 标准 Git Flow

```
main (主分支，受保护)
  │
  ├── feature/user-login (功能分支)
  ├── feature/map-display (功能分支)
  ├── fix/bug-123 (修复分支)
  └── docs/update-readme (文档分支)
```

### 团队成员开发流程

#### 1. 克隆仓库

```bash
git clone https://github.com/Sucheanice/mappingwisdom.git
cd mappingwisdom
```

#### 2. 创建功能分支

```bash
# 确保本地 main 分支是最新的
git checkout main
git pull origin main

# 创建并切换到新分支
git checkout -b feature/your-feature-name
```

**分支命名规范：**
- `feature/功能名称` - 新功能
- `fix/问题描述` - Bug 修复
- `docs/文档更新` - 文档修改
- `refactor/重构内容` - 代码重构
- `test/测试内容` - 测试相关

#### 3. 开发并提交

```bash
# 编写代码...

# 添加文件到暂存区
git add .

# 提交（使用清晰的提交信息）
git commit -m "feat: 添加用户登录功能"

# 推送到远程仓库
git push origin feature/your-feature-name
```

**提交信息格式（Conventional Commits）：**
- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具相关

#### 4. 创建 Pull Request (PR)

1. 推送分支后，访问 GitHub 仓库页面
2. 会看到提示："Compare & pull request"，点击它
3. 填写 PR 信息：
   - **标题**：简洁描述功能
   - **描述**：
     - 功能说明
     - 修改内容
     - 测试情况
     - 截图（如果有 UI 变更）
4. 选择审核者（Reviewers）
5. 点击 `Create pull request`

#### 5. 代码审核

- 审核者会检查代码
- 可能会提出修改建议
- 根据反馈修改代码并推送更新

#### 6. 合并代码

- 审核通过后，点击 `Merge pull request`
- 选择合并方式：
  - **Create a merge commit**（推荐）- 保留完整历史
  - **Squash and merge** - 压缩为单个提交
  - **Rebase and merge** - 线性历史
- 确认合并

#### 7. 清理分支

合并后可以删除远程分支：
```bash
git checkout main
git pull origin main
git branch -d feature/your-feature-name  # 删除本地分支
```

## 📝 PR 模板（可选）

可以在 `.github/pull_request_template.md` 创建 PR 模板，让团队成员填写标准化的 PR 信息。

## 🔍 代码审查检查清单

审核 PR 时检查：

- [ ] 代码符合项目规范
- [ ] 没有提交敏感信息（`.env`、密码等）
- [ ] 代码有必要的注释
- [ ] 新功能包含测试
- [ ] 更新了相关文档
- [ ] 没有破坏现有功能
- [ ] 提交信息清晰

## ⚠️ 重要规则

### ❌ 禁止的操作

1. **不要直接推送到 main 分支**
   - 必须通过 PR 合并
   - 除非是紧急修复（需要特殊权限）

2. **不要提交敏感信息**
   - `.env` 文件
   - API keys
   - 密码
   - 数据库连接信息

3. **不要强制推送（force push）到共享分支**
   - 会破坏其他人的代码

4. **不要在 main 分支上直接开发**
   - 始终创建功能分支

### ✅ 推荐做法

1. **定期同步 main 分支**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **保持分支更新**
   ```bash
   git checkout feature/your-feature
   git merge main  # 或 git rebase main
   ```

3. **提交前检查**
   ```bash
   # 后端
   cd backend
   pytest
   ruff check .
   
   # 前端
   cd frontend
   npm run lint
   npm test
   ```

4. **小步提交**
   - 频繁提交，每次提交一个完整的小功能
   - 便于回滚和审查

## 🆘 常见问题

### Q: 如何解决合并冲突？

1. 更新本地 main 分支
2. 合并到你的功能分支
3. 解决冲突
4. 提交并推送

```bash
git checkout main
git pull origin main
git checkout feature/your-feature
git merge main
# 解决冲突...
git add .
git commit -m "fix: 解决合并冲突"
git push origin feature/your-feature
```

### Q: 如何撤销一次提交？

```bash
# 撤销最后一次提交（保留更改）
git reset --soft HEAD~1

# 完全撤销（丢弃更改）
git reset --hard HEAD~1
```

### Q: 如何更新已提交的 PR？

直接推送到对应的分支即可，PR 会自动更新。

### Q: 如何回退到之前的版本？

```bash
git checkout main
git pull origin main
git revert <commit-hash>
git push origin main
```

## 📚 相关文档

- [CONTRIBUTING.md](./CONTRIBUTING.md) - 详细的贡献指南
- [README.md](./README.md) - 项目说明和快速开始
- [development.md](./development.md) - 开发环境设置

## 💡 最佳实践总结

1. ✅ 使用功能分支开发
2. ✅ 通过 PR 合并代码
3. ✅ 代码审查后再合并
4. ✅ 保持提交信息清晰
5. ✅ 定期同步主分支
6. ✅ 不要提交敏感信息
7. ✅ 保持代码整洁和规范

---

**需要帮助？** 创建 Issue 或联系项目维护者。

