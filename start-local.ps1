$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host '需要先安装 Node.js 22.13 或更高版本：https://nodejs.org/' -ForegroundColor Yellow
  Read-Host '安装完成后重新运行本文件。按 Enter 退出'
  exit 1
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
  Write-Host "当前 Node.js 版本过低：$(node --version)。需要 22.13 或更高版本。" -ForegroundColor Yellow
  Read-Host '升级后重新运行。按 Enter 退出'
  exit 1
}

if (-not (Test-Path -LiteralPath '.\node_modules')) { npm install }
if (-not (Test-Path -LiteralPath '.\dist')) { npm run build }

$server = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','start' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/' -TimeoutSec 2
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) { throw '本地服务启动超时，请查看 npm run start 的输出。' }
  Start-Process 'http://127.0.0.1:3000/'
  Write-Host '寒渊导演台已启动：http://127.0.0.1:3000/' -ForegroundColor Green
  Write-Host '关闭本窗口即可停止本地服务。'
  Wait-Process -Id $server.Id
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id }
}
