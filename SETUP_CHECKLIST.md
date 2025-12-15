# GitHub 仓库设置检查清单

作为项目管理员，请按照以下步骤设置仓库，确保团队成员可以安全协作。

## ✅ 必须完成的设置

### 1. 仓库可见性
- [ ] 进入 `Settings` → `General`
- [ ] 设置仓库为 **Private**（如果是内部项目）
- [ ] 或保持 **Public**（如果是开源项目）

### 2. 邀请团队成员
- [ ] 进入 `Settings` → `Collaborators`
- [ ] 点击 `Add people`
- [ ] 添加所有团队成员
- [ ] 设置权限：
  - 普通开发者：**Write**
  - 项目负责人：**Admin**

### 3. 分支保护规则（⚠️ 非常重要！）

- [ ] 进入 `Settings` → `Branches`
- [ ] 点击 `Add branch protection rule`
- [ ] 分支名称：`main`
- [ ] 勾选以下选项：

#### 必须勾选：
- [ ] ✅ **Require a pull request before merging**
  - [ ] Require approvals: `1`
  - [ ] Dismiss stale pull request approvals when new commits are pushed
- [ ] ✅ **Require status checks to pass before merging**
  - [ ] Require branches to be up to date before merging
- [ ] ✅ **Require conversation resolution before merging**
- [ ] ✅ **Do not allow bypassing the above settings**（推荐）

#### 不要勾选：
- [ ] ❌ Allow force pushes
- [ ] ❌ Allow deletions

### 4. 更新文档
- [ ] 确认 `README.md` 中的仓库地址正确
- [ ] 确认 `CONTRIBUTING.md` 中的仓库地址正确
- [ ] 团队成员已阅读 `COLLABORATION_GUIDE.md`

### 5. 环境变量配置
- [ ] 确认 `.env` 文件在 `.gitignore` 中
- [ ] 确认 `env.example` 文件已提交
- [ ] 提醒团队成员复制 `env.example` 为 `.env`

## 📋 可选设置（推荐）

### 6. Issue 模板
- [ ] 创建 Issue 模板（`.github/ISSUE_TEMPLATE/`）
- [ ] Bug 报告模板
- [ ] 功能请求模板

### 7. PR 模板
- [ ] 创建 PR 模板（`.github/pull_request_template.md`）
- [ ] 包含必要的检查清单

### 8. CODEOWNERS 文件
- [ ] 创建 `.github/CODEOWNERS`
- [ ] 指定代码审查负责人

### 9. 标签（Labels）
- [ ] 设置项目标签：
  - `bug` - Bug 报告
  - `feature` - 新功能
  - `enhancement` - 功能改进
  - `documentation` - 文档
  - `help wanted` - 需要帮助
  - `good first issue` - 适合新手

### 10. 项目看板（Projects）
- [ ] 创建项目看板（可选）
- [ ] 设置列：待办、进行中、已完成

## 🎯 快速验证

设置完成后，验证：

1. **测试分支保护**
   ```bash
   # 尝试直接推送到 main（应该失败）
   git checkout main
   git commit --allow-empty -m "test"
   git push origin main
   # 应该提示需要 PR
   ```

2. **测试 PR 流程**
   - [ ] 创建一个测试分支
   - [ ] 推送并创建 PR
   - [ ] 确认需要审核才能合并

3. **通知团队成员**
   - [ ] 发送仓库链接给团队成员
   - [ ] 提醒阅读协作指南
   - [ ] 提供环境配置说明

## 📚 相关文档

- [COLLABORATION_GUIDE.md](./COLLABORATION_GUIDE.md) - 详细的协作指南
- [CONTRIBUTING.md](./CONTRIBUTING.md) - 贡献指南
- [README.md](./README.md) - 项目说明

---

**设置完成后，团队成员就可以开始协作了！** 🎉

