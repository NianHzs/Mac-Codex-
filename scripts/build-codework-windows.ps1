$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manager = Join-Path $root 'apps\codex-plus-manager'
$stage = Join-Path $root 'dist\windows\app'
$desktop = [Environment]::GetFolderPath('Desktop')
$version = '1.2.34'
$env:CARGO_INCREMENTAL = '0'
$env:CARGO_BUILD_JOBS = '1'
$env:__COMPAT_LAYER = 'RunAsInvoker'
$env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'CodeworkCodexPlusPlus\cargo-target'
$cargoReleaseDir = Join-Path $env:CARGO_TARGET_DIR 'release'

function Assert-NativeSuccess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName,
        [Parameter(Mandatory = $true)]
        [int]$ExitCode
    )

    if ($ExitCode -ne 0) {
        throw "$CommandName failed with exit code $ExitCode"
    }
}

Push-Location $manager
try {
    npm ci
    Assert-NativeSuccess 'npm ci' $LASTEXITCODE
    npm run check
    Assert-NativeSuccess 'npm run check' $LASTEXITCODE
    npm run vite:build
    Assert-NativeSuccess 'npm run vite:build' $LASTEXITCODE
} finally {
    Pop-Location
}

Push-Location $root
try {
    cargo test --workspace --jobs 1
    Assert-NativeSuccess 'cargo test --workspace --jobs 1' $LASTEXITCODE
    cargo build --release --jobs 1
    Assert-NativeSuccess 'cargo build --release --jobs 1' $LASTEXITCODE

    New-Item -ItemType Directory -Force $stage | Out-Null
    Copy-Item (Join-Path $cargoReleaseDir 'codework-codex-plus-plus.exe') $stage -Force
    Copy-Item (Join-Path $cargoReleaseDir 'codework-codex-plus-plus-manager.exe') $stage -Force

    $makensis = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe'
    if (-not (Test-Path -LiteralPath $makensis)) {
        $makensis = (Get-Command makensis -ErrorAction Stop).Source
    }

    Push-Location 'scripts\installer\windows'
    try {
        & $makensis '/INPUTCHARSET' 'UTF8' "/DVERSION=$version" 'CodeworkCodexPlusPlus.nsi'
        Assert-NativeSuccess 'makensis' $LASTEXITCODE
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

    $legacyAlipayLabel = -join (0x652F, 0x4ED8, 0x5B9D, 0x8D5E, 0x8D4F, 0x7801 | ForEach-Object { [char]$_ })
    $forbiddenStrings = @(
        'BigPizzaV3/Ad-List',
        'cdn.jsdelivr.net/gh/BigPizzaV3/Ad-List',
        'ergouapi.com/r/gh-codexplusplus',
        'cubence.com?source=codexplusplus',
        $legacyAlipayLabel
    )
    foreach ($forbiddenText in $forbiddenStrings) {
        $scanOutput = & rg -F -a -n -- $forbiddenText $stage $installer (Join-Path $manager 'dist') 2>&1
        $scanExit = $LASTEXITCODE
        if ($scanExit -eq 0) {
            throw "Forbidden promotional content found ($forbiddenText):`n$($scanOutput -join [Environment]::NewLine)"
        }
        if ($scanExit -ne 1) {
            throw "rg forbidden-content scan failed for '$forbiddenText' with exit code $scanExit"
        }
    }

    $requiredBinaryStrings = @(
        'Codework Codex++'
    )
    foreach ($requiredText in $requiredBinaryStrings) {
        & rg -F -a -l -- $requiredText $stage | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Required Codework identity is missing from staged binaries: $requiredText"
        }
    }

    $requiredFrontendStrings = @(
        'https://gptproxy.site/register?aff=Kw5y',
        'https://gptproxy.site/v1'
    )
    foreach ($requiredText in $requiredFrontendStrings) {
        & rg -F -l -- $requiredText (Join-Path $manager 'dist') | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Required Codework provider endpoint is missing from the built frontend: $requiredText"
        }
    }

    $desktopInstaller = Join-Path $desktop (Split-Path $installer -Leaf)
    Copy-Item $installer $desktopInstaller -Force
    Write-Output "INSTALLER=$desktopInstaller"
} finally {
    Pop-Location
}
