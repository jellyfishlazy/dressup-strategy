$ErrorActionPreference = 'Stop'



$ModuleRoot = Split-Path -Parent $PSScriptRoot

$SharedNodeModules = Join-Path (Resolve-Path (Join-Path $ModuleRoot '..\..')) 'my-projects\node_modules'

$BuildScript = Join-Path $ModuleRoot 'scripts\build-cn-search-index.mjs'



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



if (-not (Test-Path -LiteralPath $SharedNodeModules)) {

    Write-Host ''

    Write-Host '找不到共用 node_modules:' -ForegroundColor Red

    Write-Host $SharedNodeModules -ForegroundColor Red

    Write-Host '請在 my-projects 目錄執行 npm install 後再試。' -ForegroundColor Yellow

    Write-Host ''

    exit 1

}



if (-not (Test-Path -LiteralPath (Join-Path $SharedNodeModules 'opencc-js\package.json'))) {

    Write-Host ''

    Write-Host 'opencc-js 未安裝。' -ForegroundColor Red

    Write-Host '請在 my-projects 目錄執行 npm install 後再試。' -ForegroundColor Yellow

    Write-Host ''

    exit 1

}



$nodeExe = Find-NodeExe

if (-not $nodeExe) {

    Write-Host ''

    Write-Host '找不到 Node.js (node.exe)。' -ForegroundColor Red

    Write-Host '請安裝 Node.js: https://nodejs.org/' -ForegroundColor Yellow

    Write-Host ''

    exit 1

}



if (-not (Test-Path -LiteralPath $BuildScript)) {

    Write-Host ('找不到建索引腳本: ' + $BuildScript) -ForegroundColor Red

    exit 1

}



$env:CN_SEARCH_NODE_MODULES = $SharedNodeModules



Write-Host ''

Write-Host '重建陸服搜尋索引…' -ForegroundColor Cyan

Write-Host ('node_modules: ' + $SharedNodeModules) -ForegroundColor DarkGray

Write-Host ''



Set-Location $ModuleRoot

& $nodeExe $BuildScript

$exitCode = $LASTEXITCODE



Write-Host ''

if ($exitCode -eq 0) {

    Write-Host '索引重建完成。' -ForegroundColor Green

    Write-Host '可雙擊「開啟陸服搜尋.bat」使用更新後的搜尋頁。' -ForegroundColor DarkGray

} else {

    Write-Host ('索引重建失敗 (exit code ' + $exitCode + ')。') -ForegroundColor Red

}



Write-Host ''

pause

exit $exitCode

