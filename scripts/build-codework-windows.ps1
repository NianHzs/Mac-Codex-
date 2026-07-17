$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manager = Join-Path $root 'apps\codex-plus-manager'
$stage = Join-Path $root 'dist\windows\app'
$releaseRoot = 'D:\Codework Releases'
$publicProductName = -join (0x265B, 0x43, 0x6F, 0x64, 0x65, 0x77, 0x6F, 0x72, 0x6B, 0x20, 0x41, 0x49, 0x5BA2, 0x6237, 0x7AEF | ForEach-Object { [char]$_ })
$version = '1.3.19'
$env:CARGO_INCREMENTAL = '0'
$env:CARGO_BUILD_JOBS = '1'
$env:__COMPAT_LAYER = 'RunAsInvoker'
$env:CARGO_TARGET_DIR = 'D:\CodeworkBuildCache\cargo-target'
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

    $installer = Join-Path $root "dist\windows\$publicProductName-$version-windows-x64-setup.exe"
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
        $publicProductName
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

    $releaseDir = Join-Path $releaseRoot "$publicProductName-$version"
    New-Item -ItemType Directory -Force $releaseDir | Out-Null
    $releaseInstaller = Join-Path $releaseDir (Split-Path $installer -Leaf)
    Copy-Item $installer $releaseInstaller -Force
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    $decodeUtf8Base64 = {
        param([string]$value)
        [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($value))
    }
    $releaseNotesLabel = & $decodeUtf8Base64 '5pu05paw6K+05piO'
    $releaseNotesFilenameSuffix = & $decodeUtf8Base64 'LeabtOaWsOivtOaYji5tZA=='
    $tipsLabel = & $decodeUtf8Base64 '5L2/55So5bCP6LS05aOr'
    $tipsFilenameSuffix = & $decodeUtf8Base64 'LeS9v+eUqOWwj+i0tOWjqy5tZA=='
    $releaseNotesPath = Join-Path $releaseDir "$publicProductName-$version$releaseNotesFilenameSuffix"
    $tipsPath = Join-Path $releaseDir "$publicProductName-$version$tipsFilenameSuffix"
    $releaseNotesBody = & $decodeUtf8Base64 '5Y+R5biD5pel5pyf77yaMjAyNi0wNy0xNwoKLSDkv67lpI3lrpjmlrkgQ2hhdEdQVC9Db2RleCDljp/nlJ/moIfpopjmoI/nmoflhqDkuI3pmo/ouqvku73lj5jljJbnmoTpl67popjjgIIKLSDpobbpg6jnmoflhqDnjrDlnKjkvJrpmo/ouqvku73lkIzmraXvvJrnrqHnkIblkZjnmoflrrbok53jgIHmgLvnm5Hpk7bok53jgIHoh7PlsIogVklQIOmHkeiJsuOAgeWIm+Wni+S6uuaal+e6ouOAgeaZrumAmiBWSVAg6Zu+6Z2S6JOd44CCCi0g5LyY5YyW5Y6f55Sf56qX5Y+j5qCH6aKY5qCP5Yi35paw5LiO6Lqr5Lu95L+h5oGv5ZCM5q2l56iz5a6a5oCn44CC'
    $tipsBody = & $decodeUtf8Base64 'MS4g54mI5pys5pu05paw5Ye6546w4oCc5Y+R546w5paw54mI5pys4oCd5pe277yM5Y+v5YWI5p+l55yL5pu05paw6K+05piO77yb6YCJ5oup4oCc5pqC5LiN5pu05paw4oCd5LiN5b2x5ZON57un57ut5L2/55So44CCCjIuIOeCueWHu+KAnOeri+WNs+abtOaWsOKAneWQjuivt+S/neaMgee9kee7nOeos+Wumu+8jOS4i+i9veWujOaIkOS8muiHquWKqOmAgOWHuuWuouaIt+err+W5tuWQr+WKqOWuieijheeoi+W6j++8m+WOn+aciemFjee9ruS8muS/neeVmeOAggozLiDigJzkuIvovb3lrpjmlrkgQ2hhdEdQVOKAneWPqui1sCBNaWNyb3NvZnQgU3RvcmXvvJvlpoLns7vnu5/opoHmsYLnmbvlvZXllYblupfmiJbnoa7orqTorrjlj6/vvIzmjInns7vnu5/mj5DnpLrlrozmiJDljbPlj6/jgIIKNC4g5pu05paw6L+H56iL5Lit5aaC6YGH57O757uf5o+Q56S65paH5Lu25q2j5Zyo5L2/55So77yM6K+36YCA5Ye65a6i5oi356uv5oiW5Y+z5LiL6KeS5omY55uY5Lit55qEIENvZGV3b3JrIOWQjuWGnee7p+e7reOAgg=='
    $releaseNotesBody = & $decodeUtf8Base64 '5Y+R5biD5pel5pyf77yaMjAyNi0wNy0xNwoKLSDkv67lpI3kuKrmgKfljJbkuLvpopjlnKjpg6jliIbnlLXohJHkuIrpga7mmpflt6bkvqfmoI/mloflrZfnmoTpl67popjvvIzku7vliqHjgIHpobnnm67kuI7lr7nor53liJfooajlp4vnu4jkv53mjIHmuIXmmbDlj6/or7vjgIIKLSDkv67lpI3lrpjmlrkgQ2hhdEdQVC9Db2RleCDljp/nlJ/moIfpopjmoI/nmoflhqDkuI3pmo/ouqvku73lj5jljJbnmoTpl67popjjgIIKLSDpobbpg6jnmoflhqDnjrDlnKjkvJrpmo/ouqvku73lkIzmraXvvJrnrqHnkIblkZjnmoflrrbok53jgIHmgLvnm5Hpk7bok53jgIHoh7PlsIogVklQIOmHkeiJsuOAgeWIm+Wni+S6uuaal+e6ouOAgeaZrumAmiBWSVAg6Zu+6Z2S6JOd44CCCi0g5LyY5YyW5Y6f55Sf56qX5Y+j5qCH6aKY5qCP5Yi35paw5LiO6Lqr5Lu95L+h5oGv5ZCM5q2l56iz5a6a5oCn44CC'
    $tipsBody = & $decodeUtf8Base64 'MS4g5a6J6KOFIDEuMy4xOCDlkI7pppbmrKHmiZPlvIDor7fnmbvlvZUg4pmbQ29kZXdvcmsgQUkg5a6Y5pa56LSm5Y+377yM6Lqr5Lu95Yi35paw5ZCOIENvZGV4IOmhtuagj+eah+WGoOS8muWcqOe6piAyIOenkuWGheWQjOatpeOAggoyLiDlnKggU2tpbGwg5biC5Zy654K55Ye75Y2h54mH5YaF4oCc5L2/55So6K+05piO4oCd77yM5Y+v5YWI5LqG6Kej6YCC55So5Zy65pmv5ZKM6Kem5Y+R5pa55byP5YaN5a6J6KOF44CCCjMuIOS4gOmUruabtOaWsOaXtuivt+S/neaMgee9kee7nOeos+Wumu+8m+S4i+i9veWujOaIkOWQjuWuouaIt+err+S8muiHquWKqOmAgOWHuuOAgeWuieijheW5tumHjeaWsOaJk+W8gO+8jOaXoOmcgOWGjeasoeaJi+WKqOWuieijheOAggo0LiDmm7TmlrDkuI3kvJrmuIXpmaTmnKzmnLrlt7LmnInotKblj7fku6TniYzjgIHkvpvlupTllYbphY3nva7jgIHogYrlpKnorrDlvZXlkozkuKrmgKfljJborr7nva7jgIIKNS4g5aaC5p6cIFdpbmRvd3Mg5pi+56S65a6J5YWo56Gu6K6k77yM6K+35qC45a+56L2v5Lu25ZCN56ew5Li64oCc4pmbQ29kZXdvcmsgQUnlrqLmiLfnq6/igJ3lkI7nu6fnu63jgII='
    $releaseNotesBody = & $decodeUtf8Base64 '5Y+R5biD5pel5pyf77yaMjAyNi0wNy0xNwoKLSDkv67lpI0gQ29kZXgg6aG25qCP55qH5Yag5aeL57uI5pi+56S66YeR6Imy55qE6Zeu6aKY77yM546w5Lya6ZqP5bey5qC46aqM6Lqr5Lu95a6e5pe25YiH5o2i77ya566h55CG5ZGY55qH5a626JOd44CB5Yib5aeL5Lq65pqX57qi44CB5oC755uR6ZO26JOd44CB6Iez5bCKIFZJUCDph5HoibLjgIHmma7pgJogVklQIOaflOWSjOiTneOAggotIFNraWxsIOW4guWcuuavj+S4quWumOaWuSBTa2lsbCDlop7liqDigJzkvb/nlKjor7TmmI7igJ3vvIzlj6/mn6XnnIvpgILnlKjlnLrmma/jgIHop6blj5HmlrnlvI/jgIHovpPlh7rlhoXlrrnlkozkvb/nlKjmj5DphpLvvJvor7TmmI7lj6/nlLHmnI3liqHnq6/lrp7ml7bmm7TmlrDjgIIKLSDlrozlloTlrqLmiLfnq6/kuIDplK7mm7TmlrDvvJrkuIvovb3lrozmiJDlkI7oh6rliqjpgIDlh7rml6fniYjjgIHpnZnpu5jopobnm5blronoo4Xlubboh6rliqjlkK/liqjmlrDniYjvvIzkv53nlZnmnKzmnLrotKblj7fjgIHkvpvlupTllYblkozkuKrmgKfljJbphY3nva7jgIIKLSDkvJjljJbmm7TmlrDmj5DnpLrkuI4gQ29kZXgg6L+e5o6l56iz5a6a5oCn77yM5YeP5bCR6YeN5aSN5pON5L2c44CC'
    $releaseNotes = "# $publicProductName $version $releaseNotesLabel`n`n$releaseNotesBody"
    $tips = "# $publicProductName $tipsLabel`n`n$tipsBody"
    [System.IO.File]::WriteAllText($releaseNotesPath, $releaseNotes, $utf8NoBom)
    [System.IO.File]::WriteAllText($tipsPath, $tips, $utf8NoBom)
    $releaseZip = Join-Path $releaseDir "$publicProductName-$version-Windows-x64.zip"
    Compress-Archive -Path @($releaseInstaller, $releaseNotesPath, $tipsPath) -DestinationPath $releaseZip -Force
    Write-Output "INSTALLER=$releaseInstaller"
    Write-Output "ZIP=$releaseZip"
} finally {
    Pop-Location
}
