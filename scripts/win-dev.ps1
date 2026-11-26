$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$env:CARGO_TARGET_DIR = "$repoRoot\src-tauri\target"
$env:CARGO_HOME = "$repoRoot\.cache\cargo"
$env:Path = "$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-gnu\bin;$env:USERPROFILE\.cargo\bin;$env:Path;C:\mingw64\bin"

pnpm tauri dev
