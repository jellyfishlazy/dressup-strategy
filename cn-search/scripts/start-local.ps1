$ErrorActionPreference = 'Stop'

$ModuleRoot = Split-Path -Parent $PSScriptRoot
$Port = if ($env:PORT) { [int]$env:PORT } else { 8000 }
$Url = "http://127.0.0.1:$Port/cn-search/"

function Find-NodeExe {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) { return $cmd.Source }
    $candidates = @(
        'C:\Program Files\nodejs\node.exe',
        'C:\Program Files (x86)\nodejs\node.exe'
    )
    foreach ($p in $candidates) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    return $null
}

function Test-ServerReady {
    param([string]$TargetUrl)
    try {
        $resp = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 2
        return $resp.StatusCode -eq 200
    } catch {
        return $false
    }
}

$nodeExe = Find-NodeExe
if (-not $nodeExe) {
    Write-Host ''
    Write-Host '找不到 Node.js (node.exe)。' -ForegroundColor Red
    Write-Host '請安裝 Node.js: https://nodejs.org/' -ForegroundColor Yellow
    Write-Host '安裝後重新雙擊此檔案即可。' -ForegroundColor Yellow
    Write-Host ''
    exit 1
}

if (-not (Test-ServerReady -TargetUrl $Url)) {
    $serverScript = Join-Path $ModuleRoot 'scripts\dev-server.mjs'
    if (-not (Test-Path -LiteralPath $serverScript)) {
        Write-Host ('找不到 dev-server: ' + $serverScript) -ForegroundColor Red
        exit 1
    }
    Start-Process -FilePath $nodeExe `
        -ArgumentList ('"' + $serverScript + '"') `
        -WorkingDirectory $ModuleRoot `
        -WindowStyle Hidden | Out-Null

    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-ServerReady -TargetUrl $Url) {
            $ready = $true
            break
        }
    }
    if (-not $ready) {
        Write-Host ''
        Write-Host '本機伺服器未能就緒 (port ' -NoNewline -ForegroundColor Red
        Write-Host $Port -NoNewline -ForegroundColor Red
        Write-Host ')。' -ForegroundColor Red
        Write-Host '請確認埠號未被占用，或在 cn-search 目錄執行 npm run serve' -ForegroundColor Yellow
        Write-Host ''
        exit 1
    }
}

Start-Process $Url
exit 0