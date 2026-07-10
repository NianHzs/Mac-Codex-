$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manager = Join-Path $root 'apps\codex-plus-manager'
$stage = Join-Path $root 'dist\windows\app'
$desktop = [Environment]::GetFolderPath('Desktop')
$version = '1.2.34'
$env:CARGO_INCREMENTAL = '0'
$env:CARGO_BUILD_JOBS = '1'
$env:__COMPAT_LAYER = 'RunAsInvoker'

Push-Location $manager
try {
    npm ci
    npm run check
    npm run vite:build
} finally {
    Pop-Location
}

Push-Location $root
try {
    cargo test --workspace --jobs 1
    cargo build --release --jobs 1

    New-Item -ItemType Directory -Force $stage | Out-Null
    Copy-Item 'target\release\codework-codex-plus-plus.exe' $stage -Force
    Copy-Item 'target\release\codework-codex-plus-plus-manager.exe' $stage -Force

    $makensis = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe'
    if (-not (Test-Path -LiteralPath $makensis)) {
        $makensis = (Get-Command makensis -ErrorAction Stop).Source
    }

    Push-Location 'scripts\installer\windows'
    try {
        & $makensis '/INPUTCHARSET' 'UTF8' "/DVERSION=$version" 'CodeworkCodexPlusPlus.nsi'
        if ($LASTEXITCODE -ne 0) {
            throw "NSIS failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    $installer = Join-Path $root "dist\windows\Codework-CodexPlusPlus-$version-windows-x64-setup.exe"
    foreach ($required in @(
        (Join-Path $stage 'codework-codex-plus-plus.exe'),
        (Join-Path $stage 'codework-codex-plus-plus-manager.exe'),
        $installer
    )) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw "Missing build artifact: $required"
        }
    }

    $forbidden = 'BigPizzaV3/Ad-List|cdn\.jsdelivr\.net/gh/BigPizzaV3/Ad-List|ergouapi\.com/r/gh-codexplusplus|cubence\.com\?source=codexplusplus|支付宝赞赏码'
    $scanOutput = & rg -a -n $forbidden $stage $installer 2>&1
    $scanExit = $LASTEXITCODE
    if ($scanExit -eq 0) {
        throw "Forbidden promotional content found:`n$($scanOutput -join [Environment]::NewLine)"
    }
    if ($scanExit -ne 1) {
        throw "rg forbidden-content scan failed with exit code $scanExit"
    }

    $requiredPattern = 'Codework Codex\+\+|gptproxy\.site/register\?aff=Kw5y|gptproxy\.site/v1'
    & rg -a -n $requiredPattern $stage | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Required Codework identity or provider endpoint is missing from staged binaries.'
    }

    $desktopInstaller = Join-Path $desktop (Split-Path $installer -Leaf)
    Copy-Item $installer $desktopInstaller -Force
    Write-Output "INSTALLER=$desktopInstaller"
} finally {
    Pop-Location
}
