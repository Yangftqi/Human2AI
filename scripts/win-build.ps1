param(
    [switch]$UseTempTarget
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$tempTarget = if ($UseTempTarget) { "$env:LOCALAPPDATA\h2ai-rel-win-tmp" } else { $null }
$env:CARGO_TARGET_DIR = if ($UseTempTarget) { $tempTarget } else { "$repoRoot\src-tauri\target" }
$env:CARGO_HOME = "$repoRoot\.cache\cargo"
$env:Path = "$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-gnu\bin;$env:USERPROFILE\.cargo\bin;$env:Path;C:\mingw64\bin"

try {
    pnpm tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $outDir = "$repoRoot\release\windows"
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    Copy-Item -Force "$env:CARGO_TARGET_DIR\release\human2ai.exe" "$outDir\human2ai.exe"

    $wv2 = Get-ChildItem "$env:CARGO_TARGET_DIR\release\build" -Recurse -Filter "WebView2Loader.dll" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1
    if ($wv2) {
        Copy-Item -Force $wv2.FullName "$outDir\WebView2Loader.dll"
    }

    Write-Host "Windows Release exported to: $outDir" -ForegroundColor Green
    Get-ChildItem $outDir -File | ForEach-Object {
        Write-Host ("  - {0} ({1:N2} MB)" -f $_.Name, ($_.Length / 1MB))
    }
} finally {
    if ($tempTarget -and (Test-Path $tempTarget)) {
        Remove-Item -Recurse -Force $tempTarget -ErrorAction SilentlyContinue
    }
}
