$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
$Python = Join-Path $Root "ai-proxy\.venv\Scripts\python.exe"

if (-not $Npm) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("ResearchBox 缺少运行组件，请联系管理员获取桌面安装包。", "ResearchBox") | Out-Null
  exit 1
}
if (-not (Test-Path $Python)) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("ResearchBox 后台组件未安装完整，请重新安装。", "ResearchBox") | Out-Null
  exit 1
}

function Test-Service([string]$Url) {
  try { return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2).StatusCode -eq 200 } catch { return $false }
}

if (-not (Test-Service "http://127.0.0.1:8766/health")) {
  Start-Process -FilePath $Python -ArgumentList "ai-proxy/main.py" -WorkingDirectory $Root -WindowStyle Hidden
}
if (-not (Test-Service "http://127.0.0.1:8765/health")) {
  Start-Process -FilePath $Python -ArgumentList "asr-agent/main.py" -WorkingDirectory $Root -WindowStyle Hidden
}
if (-not (Test-Service "http://127.0.0.1:5173/")) {
  Start-Process -FilePath $Npm -ArgumentList "run", "dev", "--", "--host", "127.0.0.1" -WorkingDirectory $Root -WindowStyle Hidden
}

for ($attempt = 0; $attempt -lt 30; $attempt++) {
  if (Test-Service "http://127.0.0.1:5173/") { break }
  Start-Sleep -Milliseconds 500
}
Start-Process "http://127.0.0.1:5173/"
