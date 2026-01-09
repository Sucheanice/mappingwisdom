# PowerShell 脚本：检查构建错误
# 在本地运行，确保修复完整后再上传

Write-Host "🔍 检查前端构建错误..." -ForegroundColor Cyan
Write-Host ""

$FRONTEND_DIR = "frontend"

if (-not (Test-Path $FRONTEND_DIR)) {
    Write-Host "❌ 找不到 frontend 目录！" -ForegroundColor Red
    exit 1
}

cd $FRONTEND_DIR

# 检查 package.json 是否包含必要的依赖
Write-Host "📦 检查依赖..." -ForegroundColor Yellow
$packageJson = Get-Content package.json -Raw | ConvertFrom-Json

$requiredDeps = @("antd", "@ant-design/icons", "dayjs")
$missingDeps = @()

foreach ($dep in $requiredDeps) {
    if (-not $packageJson.dependencies.$dep) {
        $missingDeps += $dep
    }
}

if ($missingDeps.Count -gt 0) {
    Write-Host "❌ 缺少依赖: $($missingDeps -join ', ')" -ForegroundColor Red
    Write-Host "   请运行: npm install $($missingDeps -join ' ')" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "   ✅ 依赖检查通过" -ForegroundColor Green
}

# 检查关键文件是否存在
Write-Host ""
Write-Host "📁 检查文件..." -ForegroundColor Yellow
$files = @(
    "src/components/Common/Navbar.tsx",
    "src/routes/login.tsx",
    "src/routes/signup.tsx",
    "src/components/MySQL/SafeAlertAgent.tsx",
    "src/components/MySQL/SmartMapPageThree.tsx",
    "src/routes/_layout/smartMapThree.tsx"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "   ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "   ❌ 找不到: $file" -ForegroundColor Red
        exit 1
    }
}

# 检查关键修复
Write-Host ""
Write-Host "🔧 检查关键修复..." -ForegroundColor Yellow

# 检查 spacing -> gap
$spacingFiles = @(
    "src/components/Common/Navbar.tsx",
    "src/routes/login.tsx",
    "src/routes/signup.tsx"
)

foreach ($file in $spacingFiles) {
    $content = Get-Content $file -Raw
    if ($content -match "spacing=\{[0-9]+\}") {
        Write-Host "   ❌ $file 仍有 spacing 属性" -ForegroundColor Red
        exit 1
    }
}

Write-Host "   ✅ spacing -> gap 修复检查通过" -ForegroundColor Green

# 检查未使用的变量
Write-Host ""
Write-Host "🔍 检查未使用的变量..." -ForegroundColor Yellow

$safeAlertContent = Get-Content "src/components/MySQL/SafeAlertAgent.tsx" -Raw
if ($safeAlertContent -match "const \[mapLoaded, setMapLoaded\]") {
    Write-Host "   ❌ SafeAlertAgent.tsx 中 mapLoaded 未修复" -ForegroundColor Red
    exit 1
}
if ($safeAlertContent -match "const \[selectedMarker, setSelectedMarker\]") {
    Write-Host "   ❌ SafeAlertAgent.tsx 中 selectedMarker 未修复" -ForegroundColor Red
    exit 1
}

$smartMapContent = Get-Content "src/components/MySQL/SmartMapPageThree.tsx" -Raw
if ($smartMapContent -match "const \[drawings, setDrawings\]") {
    Write-Host "   ❌ SmartMapPageThree.tsx 中 drawings 未修复" -ForegroundColor Red
    exit 1
}

$smartMapThreeContent = Get-Content "src/routes/_layout/smartMapThree.tsx" -Raw
if ($smartMapThreeContent -match "const \[clearMode, setClearMode\]") {
    Write-Host "   ❌ smartMapThree.tsx 中 clearMode 未修复" -ForegroundColor Red
    exit 1
}

Write-Host "   ✅ 未使用变量检查通过" -ForegroundColor Green

# 尝试运行 TypeScript 检查
Write-Host ""
Write-Host "🔍 运行 TypeScript 检查..." -ForegroundColor Yellow

if (Test-Path "node_modules") {
    $tscCheck = & npx tsc --noEmit --project tsconfig.build.json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ⚠️  TypeScript 检查发现错误：" -ForegroundColor Yellow
        Write-Host $tscCheck -ForegroundColor Red
        Write-Host ""
        Write-Host "   建议先修复这些错误再上传" -ForegroundColor Yellow
        Write-Host "   或者继续上传，在服务器上查看详细错误" -ForegroundColor Yellow
    } else {
        Write-Host "   ✅ TypeScript 检查通过" -ForegroundColor Green
    }
} else {
    Write-Host "   ⚠️  node_modules 不存在，跳过 TypeScript 检查" -ForegroundColor Yellow
    Write-Host "   建议先运行: npm install" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ 检查完成！" -ForegroundColor Green
Write-Host ""
Write-Host "如果所有检查都通过，可以安全上传文件了。" -ForegroundColor Cyan

cd ..

