# GitHub Pages Zero-Git Publisher (Uses GitHub REST API via PowerShell)
# Uploads the entire 3D Math Track Game to a GitHub repository and enables GitHub Pages
# without requiring Git to be installed on Windows!

param(
    [string]$Token = "",
    [string]$RepoName = "math-track-3d"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  🚀 3D 正負數加減法操場賽跑 - 一鍵發布至 GitHub Pages" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host ""
    Write-Host "請輸入您的 GitHub Personal Access Token (需勾選 repo 權限)：" -ForegroundColor Yellow
    Write-Host "（若尚未建立，將為您開啟 GitHub Token 產生頁面，點選最下方 Generate token 即可複製）" -ForegroundColor Gray
    $openChoice = Read-Host "是否要先開啟 GitHub 網頁產生 Token？(Y/N，若已有 Token 請按 N)"
    if ($openChoice -match "^[Yy]") {
        Start-Process "https://github.com/settings/tokens/new?scopes=repo&description=MathTrack3D-Pages"
    }
    $Token = (Read-Host "請貼上您的 GitHub Token (ghp_... 或 github_pat_...)").Trim()
}

if ([string]::IsNullOrWhiteSpace($Token)) {
    Write-Host "❌ 未輸入 Token，取消發布。" -ForegroundColor Red
    exit 1
}

$inputRepo = Read-Host "請輸入要建立的 GitHub 專案名稱 (直接按 Enter 預設為 $RepoName)"
if (-not [string]::IsNullOrWhiteSpace($inputRepo)) {
    $RepoName = $inputRepo.Trim()
}

$headers = @{
    "Authorization" = "Bearer $Token"
    "Accept"        = "application/vnd.github+json"
    "User-Agent"    = "MathTrack3D-Publisher"
}

# 1. Verify User
Write-Host "`n[1/4] 正在驗證 GitHub 帳號..." -ForegroundColor Cyan
try {
    $user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -Method Get
    $owner = $user.login
    Write-Host "✅ 已登入帳號：$owner" -ForegroundColor Green
} catch {
    Write-Host "❌ Token 驗證失敗，請確認 Token 是否正確且具備 repo 權限。" -ForegroundColor Red
    exit 1
}

# 2. Create or Check Repository
Write-Host "[2/4] 正在檢查/建立公開儲存庫 $owner/$RepoName..." -ForegroundColor Cyan
$repoExists = $false
try {
    $existingRepo = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$RepoName" -Headers $headers -Method Get
    $repoExists = $true
    Write-Host "✅ 儲存庫 $owner/$RepoName 已存在，將更新檔案。" -ForegroundColor Green
} catch {
    $createBody = @{
        name        = $RepoName
        description = "3D 正負數加減法操場賽跑遊戲 (Three.js + Blender GLB)"
        private     = $false
        auto_init   = $false
    } | ConvertTo-Json
    $created = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers -Method Post -Body $createBody -ContentType "application/json"
    Write-Host "✅ 成功建立公開儲存庫：$($created.html_url)" -ForegroundColor Green
}

# 3. Upload All Web Files via GitHub Contents API
Write-Host "[3/4] 正在上傳遊戲網頁與 3D 模型檔案..." -ForegroundColor Cyan
$filesToUpload = @(
    "index.html",
    ".nojekyll",
    "README.md",
    "css/style.css",
    "assets/character_rigged.glb",
    "js/glb-data.js",
    "js/sound.js",
    "js/math-engine.js",
    "js/character-builder.js",
    "js/world-scene.js",
    "js/multiplayer.js",
    "js/main.js",
    "blender/generate_character_glb.py"
)

$projectRoot = $PSScriptRoot
foreach ($relPath in $filesToUpload) {
    $localFile = Join-Path $projectRoot ($relPath.Replace('/', '\'))
    if (-not (Test-Path $localFile)) { continue }

    $bytes = [System.IO.File]::ReadAllBytes($localFile)
    $b64 = [Convert]::ToBase64String($bytes)
    $apiUrl = "https://api.github.com/repos/$owner/$RepoName/contents/$relPath"

    $sha = $null
    try {
        $existingFile = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get
        $sha = $existingFile.sha
    } catch {}

    $putObj = @{
        message = "Deploy $relPath"
        content = $b64
        branch  = "main"
    }
    if ($sha) { $putObj.sha = $sha }

    $putBody = $putObj | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Put -Body $putBody -ContentType "application/json" | Out-Null
    Write-Host "  ✔ 已上傳 $relPath" -ForegroundColor Gray
}

# 4. Enable GitHub Pages
Write-Host "[4/4] 正在啟用 GitHub Pages 網站服務..." -ForegroundColor Cyan
try {
    $pagesBody = @{
        source = @{
            branch = "main"
            path   = "/"
        }
    } | ConvertTo-Json -Depth 4
    Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$RepoName/pages" -Headers $headers -Method Post -Body $pagesBody -ContentType "application/json" | Out-Null
    Write-Host "✅ 已成功開啟 GitHub Pages！" -ForegroundColor Green
} catch {
    Write-Host "ℹ️ GitHub Pages 已啟用或正在建置中。" -ForegroundColor Yellow
}

$pagesUrl = "https://$owner.github.io/$RepoName/"
$repoUrl  = "https://github.com/$owner/$RepoName"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🎉 發布完成！" -ForegroundColor Green
Write-Host "📦 GitHub 儲存庫網址 : $repoUrl" -ForegroundColor White
Write-Host "🌐 遊戲公開網頁網址  : $pagesUrl" -ForegroundColor Yellow
Write-Host "（首次啟用 GitHub Pages 約需等待 1~2 分鐘生效，跨載具掃描 QR Code 即可直接連線！）" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan

Start-Process $repoUrl
