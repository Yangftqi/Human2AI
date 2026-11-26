param(
    [switch]$UseTempTarget
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$version = (Get-Content "$repoRoot\package.json" -Raw | ConvertFrom-Json).version

Write-Host "=== [1/3] Building Windows Release (.exe) v$version ===" -ForegroundColor Cyan
& "$PSScriptRoot\win-build.ps1" -UseTempTarget:$UseTempTarget
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== [2/3] Building Signed Android Release (.apk) v$version ===" -ForegroundColor Cyan
& "$PSScriptRoot\android-build.ps1" -UseTempTarget:$UseTempTarget
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== [3/3] Packaging Public Distribution Bundle & SHA256SUMS ===" -ForegroundColor Cyan
$distDir = "$repoRoot\release\dist"
if (Test-Path $distDir) { Remove-Item -Recurse -Force $distDir }
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# Stage Windows portable zip
$winStage = "$distDir\Human2AI-v$version-windows-x64-portable"
New-Item -ItemType Directory -Force -Path $winStage | Out-Null
Copy-Item -Force "$repoRoot\release\windows\human2ai.exe" $winStage
if (Test-Path "$repoRoot\release\windows\WebView2Loader.dll") {
    Copy-Item -Force "$repoRoot\release\windows\WebView2Loader.dll" $winStage
}
foreach ($doc in @("LICENSE", "LICENSE-ASSETS", "PRIVACY.md", "README.md")) {
    if (Test-Path "$repoRoot\$doc") {
        Copy-Item -Force "$repoRoot\$doc" $winStage
    }
}

$winZip = "$distDir\Human2AI-v$version-windows-x64-portable.zip"
Compress-Archive -Path "$winStage\*" -DestinationPath $winZip -Force
Remove-Item -Recurse -Force $winStage

# Copy versioned Android APK
$apkDist = "$distDir\Human2AI-v$version-android-arm64.apk"
Copy-Item -Force "$repoRoot\release\android\human2ai-arm64.apk" $apkDist

# Generate SHA256SUMS.txt
$hashLines = @()
foreach ($file in @($winZip, $apkDist)) {
    $hash = (Get-FileHash -Path $file -Algorithm SHA256).Hash.ToLowerInvariant()
    $name = Split-Path $file -Leaf
    $hashLines += "$hash  $name"
}
Set-Content -Path "$distDir\SHA256SUMS.txt" -Value ($hashLines -join "`n") -Encoding UTF8

Write-Host "`n=== Release Artifacts Ready (v$version) ===" -ForegroundColor Green
Get-ChildItem "$repoRoot\release" -Recurse -File | ForEach-Object {
    Write-Host ("  {0} ({1:N2} MB)" -f $_.FullName, ($_.Length / 1MB))
}
