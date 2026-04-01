#!/usr/bin/env pwsh
# Electron 重启测试脚本

Write-Host "`n=== Electron 图标测试脚本 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 杀死所有 Electron 进程
Write-Host "📌 步骤 1: 清理旧进程..." -ForegroundColor Yellow
$electronProcesses = Get-Process | Where-Object {$_.ProcessName -like "*electron*"}
if ($electronProcesses) {
    $electronProcesses | ForEach-Object { 
        Write-Host "  - 终止进程: $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "  ✅ 已清理 $($electronProcesses.Count) 个进程" -ForegroundColor Green
} else {
    Write-Host "  ✅ 没有运行中的 Electron 进程" -ForegroundColor Green
}

Start-Sleep -Milliseconds 500

# 2. 验证图标文件
Write-Host "`n📌 步骤 2: 验证图标文件..." -ForegroundColor Yellow
$iconPath = Join-Path (Get-Location).Path "public\icon.png"
if (Test-Path $iconPath) {
    $iconSize = (Get-Item $iconPath).Length
    Write-Host "  ✅ 图标文件存在: $iconPath" -ForegroundColor Green
    Write-Host "  📏 文件大小: $iconSize 字节" -ForegroundColor Gray
} else {
    Write-Host "  ❌ 图标文件不存在: $iconPath" -ForegroundColor Red
    exit 1
}

# 3. 重新编译 TypeScript
Write-Host "`n📌 步骤 3: 重新编译 Electron 主进程..." -ForegroundColor Yellow
npx tsc -p ./electron/tsconfig.electron.json
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ 编译成功" -ForegroundColor Green
} else {
    Write-Host "  ❌ 编译失败" -ForegroundColor Red
    exit 1
}

# 4. 启动 Electron
Write-Host "`n📌 步骤 4: 启动 Electron..." -ForegroundColor Yellow
Write-Host "  提示: 查看控制台输出中的图标路径调试信息" -ForegroundColor Cyan
Write-Host ""
npm run electron
