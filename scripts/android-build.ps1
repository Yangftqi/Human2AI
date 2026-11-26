param(
    [switch]$UseTempTarget
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$tempTarget = if ($UseTempTarget) { "$env:LOCALAPPDATA\h2ai-rel-android-tmp" } else { $null }

$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "D:\DevTools\jdk-17" }
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "D:\DevTools\android-sdk" }
$env:NDK_HOME = if ($env:NDK_HOME) { $env:NDK_HOME } else { "D:\DevTools\android-sdk\ndk\28.2.13676358" }
$env:CARGO_TARGET_DIR = if ($UseTempTarget) { $tempTarget } else { "$repoRoot\src-tauri\target" }
$env:CARGO_HOME = "$repoRoot\.cache\cargo"
$env:GRADLE_USER_HOME = "$repoRoot\.cache\gradle"

$ndkBin = "$env:NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$buildTools = "$env:ANDROID_HOME\build-tools\36.0.0"
$env:Path = "$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-gnu\bin;$env:USERPROFILE\.cargo\bin;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$ndkBin;$buildTools;$env:Path;C:\mingw64\bin"

# Forward HTTP/HTTPS proxy to JVM/Gradle if configured in environment
$proxyUrl = if ($env:HTTPS_PROXY) { $env:HTTPS_PROXY } elseif ($env:HTTP_PROXY) { $env:HTTP_PROXY } else { $null }
if ($proxyUrl -and $proxyUrl -match '^(?:https?://)?([^:]+):(\d+)') {
    $pHost = $Matches[1]
    $pPort = $Matches[2]
    $env:GRADLE_OPTS = "-Dhttp.proxyHost=$pHost -Dhttp.proxyPort=$pPort -Dhttps.proxyHost=$pHost -Dhttps.proxyPort=$pPort $env:GRADLE_OPTS"
}

function Resolve-SigningConfig {
    # 1. Highest priority: Environment variables (recommended for CI / public release)
    if ($env:H2AI_KEYSTORE_PATH -and $env:H2AI_KEYSTORE_PASS) {
        return @{
            KeystorePath = $env:H2AI_KEYSTORE_PATH
            KeyAlias     = if ($env:H2AI_KEYSTORE_ALIAS) { $env:H2AI_KEYSTORE_ALIAS } else { "human2ai" }
            StorePass    = $env:H2AI_KEYSTORE_PASS
            KeyPass      = if ($env:H2AI_KEY_PASS) { $env:H2AI_KEY_PASS } else { $env:H2AI_KEYSTORE_PASS }
            IsOfficial   = $true
        }
    }

    # 2. Second priority: Local gitignored signing config (.cache/signing.local.json)
    $localConfigPath = "$repoRoot\.cache\signing.local.json"
    if (Test-Path $localConfigPath) {
        $cfg = Get-Content $localConfigPath -Raw | ConvertFrom-Json
        if ($cfg.keystorePath -and $cfg.storePass) {
            return @{
                KeystorePath = $cfg.keystorePath
                KeyAlias     = if ($cfg.keyAlias) { $cfg.keyAlias } else { "human2ai" }
                StorePass    = $cfg.storePass
                KeyPass      = if ($cfg.keyPass) { $cfg.keyPass } else { $cfg.storePass }
                IsOfficial   = $true
            }
        }
    }

    # 3. Fallback: Local-only ephemeral dev keystore (never commit secrets into script)
    New-Item -ItemType Directory -Force -Path "$repoRoot\.cache" | Out-Null
    $devKeystore = "$repoRoot\.cache\human2ai-dev-local.jks"
    $devPassFile = "$repoRoot\.cache\human2ai-dev-local.pass"
    if (-not (Test-Path $devPassFile)) {
        $randPass = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 20 | ForEach-Object { [char]$_ })
        Set-Content -Path $devPassFile -Value $randPass -NoNewline
    }
    $devPass = (Get-Content $devPassFile -Raw).Trim()

    if (-not (Test-Path $devKeystore)) {
        & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v `
            -keystore $devKeystore -storetype PKCS12 `
            -keyalg RSA -keysize 2048 -validity 10000 `
            -alias human2ai-dev -storepass $devPass -keypass $devPass `
            -dname "CN=Human2AI Dev Local, OU=LocalDev, O=Human2AI, L=Local, ST=Local, C=CN"
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }

    Write-Host "[WARN] 未检测到正式签名配置，当前使用本机临时开发证书签名！" -ForegroundColor Yellow
    Write-Host "       公开发行前请通过环境变量 (H2AI_KEYSTORE_PATH / H2AI_KEYSTORE_PASS) 或 .cache/signing.local.json 配置正式 Keystore。" -ForegroundColor Yellow
    return @{
        KeystorePath = $devKeystore
        KeyAlias     = "human2ai-dev"
        StorePass    = $devPass
        KeyPass      = $devPass
        IsOfficial   = $false
    }
}

try {
    # 1. Build frontend dist and copy to Android assets
    pnpm build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $assetsDir = "$repoRoot\src-tauri\gen\android\app\src\main\assets"
    if (Test-Path $assetsDir) { Remove-Item -Recurse -Force $assetsDir }
    New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
    Copy-Item -Recurse -Force "$repoRoot\dist\*" $assetsDir

    # 2. Compile stripped Release Rust shared library for arm64-v8a with custom-protocol
    $env:CC_aarch64_linux_android = "$ndkBin\aarch64-linux-android24-clang.cmd"
    $env:CXX_aarch64_linux_android = "$ndkBin\aarch64-linux-android24-clang++.cmd"
    $env:AR_aarch64_linux_android = "$ndkBin\llvm-ar.exe"
    $env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$ndkBin\aarch64-linux-android24-clang.cmd"

    Push-Location "$repoRoot\src-tauri"
    cargo build --release --target aarch64-linux-android --features tauri/custom-protocol
    $cargoExit = $LASTEXITCODE
    Pop-Location
    if ($cargoExit -ne 0) { exit $cargoExit }

    $builtSo = "$env:CARGO_TARGET_DIR\aarch64-linux-android\release\libhuman2ai_lib.so"
    $soAscii = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($builtSo))
    $mainJs = Get-ChildItem "$repoRoot\dist\assets" -Filter "index-*.js" | Select-Object -First 1
    if ($soAscii.Contains("Failed to request ") -or ($mainJs -and -not $soAscii.Contains($mainJs.Name))) {
        throw "编译产物 libhuman2ai_lib.so 未正确嵌入前端资产 (custom-protocol)，Android 端可能错误回退至 devUrl!"
    }

    # 3. Copy .so directly into jniLibs
    $jniDir = "$repoRoot\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
    New-Item -ItemType Directory -Force -Path $jniDir | Out-Null
    Copy-Item -Force $builtSo "$jniDir\libhuman2ai_lib.so"

    # 4. Assemble arm64 Release APK via Gradle (use SDK aapt2 directly)
    Push-Location "$repoRoot\src-tauri\gen\android"
    .\gradlew.bat assembleArm64Release -x rustBuildArm64Release "-Pandroid.aapt2FromMavenOverride=$buildTools\aapt2.exe"
    $gradleExit = $LASTEXITCODE
    .\gradlew.bat --stop 2>$null
    Pop-Location
    if ($gradleExit -ne 0) { exit $gradleExit }

    $unsignedApk = Get-ChildItem "$repoRoot\src-tauri\gen\android\app\build\outputs\apk\arm64\release" -Filter "*.apk" | Select-Object -First 1
    if (-not $unsignedApk) {
        throw "未找到编译生成的 arm64 Release APK"
    }

    # 5. Resolve signing credentials (Env -> .cache/signing.local.json -> Local dev fallback)
    $signing = Resolve-SigningConfig
    if (-not (Test-Path $signing.KeystorePath)) {
        throw "指定的 Android Keystore 不存在: $($signing.KeystorePath)"
    }

    # 6. Zipalign & sign APK into release/android/human2ai-arm64.apk
    $outDir = "$repoRoot\release\android"
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    $alignedApk = "$outDir\human2ai-arm64-aligned.apk"
    $finalApk = "$outDir\human2ai-arm64.apk"

    & "$buildTools\zipalign.exe" -f -p 4 $unsignedApk.FullName $alignedApk
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & "$buildTools\apksigner.bat" sign `
        --ks $signing.KeystorePath --ks-key-alias $signing.KeyAlias `
        --ks-pass "pass:$($signing.StorePass)" --key-pass "pass:$($signing.KeyPass)" `
        --out $finalApk $alignedApk
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Remove-Item -Force $alignedApk -ErrorAction SilentlyContinue
    Remove-Item -Force "$finalApk.idsig" -ErrorAction SilentlyContinue

    & "$buildTools\apksigner.bat" verify --print-certs $finalApk
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $apkInfo = Get-Item $finalApk
    Write-Host ("Android Release APK exported to: {0} ({1:N2} MB)" -f $apkInfo.FullName, ($apkInfo.Length / 1MB)) -ForegroundColor Green
} finally {
    if ($tempTarget -and (Test-Path $tempTarget)) {
        Remove-Item -Recurse -Force $tempTarget -ErrorAction SilentlyContinue
    }
}
