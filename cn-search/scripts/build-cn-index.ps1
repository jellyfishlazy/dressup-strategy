$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$BuildScript = Join-Path $PSScriptRoot 'build-cn-search-index.mjs'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { $null }
if (-not $nodeExe) {
    foreach ($candidate in @('C:\Program Files\nodejs\node.exe', 'C:\Program Files (x86)\nodejs\node.exe')) {
        if (Test-Path -LiteralPath $candidate) { $nodeExe = $candidate; break }
    }
}
if (-not $nodeExe) { throw 'Install Node.js 24 and run npm ci in the repository root.' }
Push-Location $RepoRoot
try {
    & $nodeExe --input-type=module -e "import { importOpencc } from './cn-search/scripts/shared-deps.mjs'; await importOpencc();"
    if ($LASTEXITCODE -ne 0) { throw 'Run npm ci in the repository root before rebuilding.' }
    & $nodeExe $BuildScript
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($exitCode -eq 0) { Write-Host 'Index rebuilt.' } else { Write-Host "Index build failed ($exitCode)." }
pause
exit $exitCode
