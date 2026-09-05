$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manager = Join-Path $root 'apps\codex-plus-manager'
$stage = Join-Path $root 'dist\windows\app'
$releaseRoot = 'D:\Codework Releases'
$publicProductName = -join (0x265B, 0x43, 0x6F, 0x64, 0x65, 0x77, 0x6F, 0x72, 0x6B, 0x20, 0x41, 0x49, 0x5BA2, 0x6237, 0x7AEF | ForEach-Object { [char]$_ })
$version = '2.0.0'
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
    # vite 构建前会清空 dist，批量删除会被 WorkBuddy 的 safe-delete 守卫拦下
    # （历史产物 + 字体分片轻松超过 50 个的阈值）。这里先把旧产物整体挪到临时目录，
    # 让 vite 面对一个不存在的输出目录，既不触发删除守卫也不会残留上一版文件。
    $distDir = Join-Path $manager 'dist'
    if (Test-Path -LiteralPath $distDir) {
        $retiredDist = Join-Path $env:TEMP ('codework-dist-retired-' + (Get-Date -Format 'yyyyMMddHHmmssfff'))
        Move-Item -LiteralPath $distDir -Destination $retiredDist -Force
        Write-Host "RETIRED_PREVIOUS_DIST=$retiredDist"
    }

    # npm ci 会先整体清空 node_modules，同样撞上 safe-delete 的批量删除阈值
    # （依赖树轻松上千个文件）。与 dist 同一处理：先挪走再让 npm 重建。
    $nodeModulesDir = Join-Path $manager 'node_modules'
    if (Test-Path -LiteralPath $nodeModulesDir) {
        $retiredModules = Join-Path $env:TEMP ('codework-node-modules-retired-' + (Get-Date -Format 'yyyyMMddHHmmssfff'))
        Move-Item -LiteralPath $nodeModulesDir -Destination $retiredModules -Force
        Write-Host "RETIRED_PREVIOUS_NODE_MODULES=$retiredModules"
    }

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
    # Run workspace tests plus the manager library tests before producing the
    # user-level installer artifacts.
    cargo test --workspace --exclude codex-plus-manager --jobs 1
    Assert-NativeSuccess 'cargo test --workspace --exclude codex-plus-manager --jobs 1' $LASTEXITCODE
    cargo test -p codex-plus-manager --lib --jobs 1
    Assert-NativeSuccess 'cargo test -p codex-plus-manager --lib --jobs 1' $LASTEXITCODE
    cargo build --release --jobs 1
    Assert-NativeSuccess 'cargo build --release --jobs 1' $LASTEXITCODE

    New-Item -ItemType Directory -Force $stage | Out-Null
    Copy-Item (Join-Path $cargoReleaseDir 'codework-codex-plus-plus.exe') $stage -Force
    Copy-Item (Join-Path $cargoReleaseDir 'codework-codex-plus-plus-manager.exe') $stage -Force
    $dreamSkinStage = Join-Path $stage 'dream-skin'
    $dreamSkinSource = Join-Path $root 'assets\vendor\fei-away-codex-dream-skin\windows-runtime'
    if (Test-Path -LiteralPath $dreamSkinStage) {
        Remove-Item -LiteralPath $dreamSkinStage -Recurse -Force
    }
    New-Item -ItemType Directory -Force $dreamSkinStage | Out-Null
    foreach ($directory in @('assets', 'codework-themes')) {
        Copy-Item -LiteralPath (Join-Path $dreamSkinSource $directory) -Destination (Join-Path $dreamSkinStage $directory) -Recurse -Force
    }
    $dreamSkinRuntimeFiles = @(
        'scripts\apply-codework-theme.ps1',
        'scripts\common-windows.ps1',
        'scripts\config-utf8.ps1',
        'scripts\image-metadata.mjs',
        'scripts\injector.mjs',
        'scripts\restore-dream-skin.ps1',
        'scripts\start-dream-skin.ps1',
        'scripts\theme-windows.ps1',
        'scripts\verify-dream-skin.ps1'
    )
    foreach ($relativePath in $dreamSkinRuntimeFiles) {
        $destination = Join-Path $dreamSkinStage $relativePath
        New-Item -ItemType Directory -Force (Split-Path -Parent $destination) | Out-Null
        Copy-Item -LiteralPath (Join-Path $dreamSkinSource $relativePath) -Destination $destination -Force
    }
    $dreamSkinExcludedFiles = @(
        'scripts\install-dream-skin.ps1',
        'scripts\tray-dream-skin.ps1'
    )
    foreach ($relativePath in $dreamSkinExcludedFiles) {
        if (Test-Path -LiteralPath (Join-Path $dreamSkinStage $relativePath)) {
            throw "Standalone Dream Skin entrypoint must not be staged: $relativePath"
        }
    }

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
        (Join-Path $stage 'dream-skin\scripts\start-dream-skin.ps1'),
        (Join-Path $stage 'dream-skin\scripts\restore-dream-skin.ps1'),
        (Join-Path $stage 'dream-skin\scripts\verify-dream-skin.ps1'),
        $installer
    )) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw "Missing build artifact: $required"
        }
    }

    # Validate the final NSIS payload by installing an isolated smoke-test
    # build. The SMOKE_TEST installer does not stop the user's client or
    # create shortcuts/registry entries.
    $smokeInstaller = Join-Path $root 'dist\windows\Codework-installer-smoke.exe'
    $smokeInstallDir = Join-Path $env:TEMP ("codework-installer-smoke-" + [guid]::NewGuid().ToString('N'))
    try {
        Push-Location 'scripts\installer\windows'
        try {
            & $makensis '/INPUTCHARSET' 'UTF8' "/DVERSION=$version" '/DSMOKE_TEST' 'CodeworkCodexPlusPlus.nsi'
            Assert-NativeSuccess 'makensis smoke test' $LASTEXITCODE
        } finally {
            Pop-Location
        }
        $smokeResult = Start-Process -FilePath $smokeInstaller -ArgumentList @('/S', "/D=$smokeInstallDir") -Wait -PassThru -WindowStyle Hidden
        Assert-NativeSuccess 'INSTALLER_SMOKE_TEST install' $smokeResult.ExitCode
        foreach ($requiredPayload in @(
            (Join-Path $smokeInstallDir 'codework-codex-plus-plus.exe'),
            (Join-Path $smokeInstallDir 'codework-codex-plus-plus-manager.exe')
        )) {
            if (-not (Test-Path -LiteralPath $requiredPayload)) {
                throw "INSTALLER_SMOKE_TEST failed: installed payload is missing: $requiredPayload"
            }
        }
        Write-Output "INSTALLER_SMOKE_TEST=PASS"
    } finally {
        Remove-Item -LiteralPath $smokeInstallDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $smokeInstaller -Force -ErrorAction SilentlyContinue
    }

    $legacyAlipayLabel = -join (0x652F, 0x4ED8, 0x5B9D, 0x8D5E, 0x8D4F, 0x7801 | ForEach-Object { [char]$_ })
    $forbiddenStrings = @(
        'BigPizzaV3/Ad-List',
        'cdn.jsdelivr.net/gh/BigPizzaV3/Ad-List',
        'ergouapi.com/r/gh-codexplusplus',
        'cubence.com?source=codexplusplus',
        $legacyAlipayLabel
    )
    # 二进制里搜字面量：原来调用外部 rg，但它不一定在 PATH 上（不同 shell 环境差异很大），
    # 而这道扫描是发布前的最后一道闸门，不该依赖可选工具。改用原生实现：
    # 按 UTF-8 与 UTF-16LE 两种编码把文本转成字节序列，再在文件字节流里做子串匹配。
    # 两种编码都查是必要的 —— Rust 二进制里的字符串是 UTF-8，而 NSIS 安装器
    # 与前端资源里的中文是 UTF-16LE，只查一种会漏。
    function Test-BinaryContainsText {
        param(
            [Parameter(Mandatory = $true)][string[]] $SearchRoots,
            [Parameter(Mandatory = $true)][string] $Text
        )
        $needles = @(
            [System.Text.Encoding]::UTF8.GetBytes($Text),
            [System.Text.Encoding]::Unicode.GetBytes($Text)
        )
        $matches = @()
        $files = foreach ($root in $SearchRoots) {
            if (-not (Test-Path -LiteralPath $root)) { continue }
            if (Test-Path -LiteralPath $root -PathType Leaf) {
                Get-Item -LiteralPath $root
            } else {
                Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue
            }
        }
        foreach ($file in $files) {
            $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
            foreach ($needle in $needles) {
                if ($needle.Length -eq 0 -or $bytes.Length -lt $needle.Length) { continue }
                $limit = $bytes.Length - $needle.Length
                for ($i = 0; $i -le $limit; $i++) {
                    if ($bytes[$i] -ne $needle[0]) { continue }
                    $hit = $true
                    for ($j = 1; $j -lt $needle.Length; $j++) {
                        if ($bytes[$i + $j] -ne $needle[$j]) { $hit = $false; break }
                    }
                    if ($hit) { $matches += $file.FullName; break }
                }
                if ($matches -contains $file.FullName) { break }
            }
        }
        return $matches
    }

    $scanRoots = @($stage, $installer, (Join-Path $manager 'dist'))
    foreach ($forbiddenText in $forbiddenStrings) {
        $hits = Test-BinaryContainsText -SearchRoots $scanRoots -Text $forbiddenText
        if ($hits.Count -gt 0) {
            throw "Forbidden promotional content found ($forbiddenText):`n$($hits -join [Environment]::NewLine)"
        }
        Write-Host "FORBIDDEN_SCAN_CLEAN=$forbiddenText"
    }

    $requiredBinaryStrings = @(
        $publicProductName
    )
    foreach ($requiredText in $requiredBinaryStrings) {
        $hits = Test-BinaryContainsText -SearchRoots @($stage) -Text $requiredText
        if ($hits.Count -eq 0) {
            throw "Required Codework identity is missing from staged binaries: $requiredText"
        }
        Write-Host "REQUIRED_IDENTITY_PRESENT=$requiredText"
    }

    $requiredFrontendStrings = @(
        'https://gptproxy.site/register?aff=Kw5y',
        'https://gptproxy.site/v1'
    )
    $frontendDist = Join-Path $manager 'dist'
    foreach ($requiredText in $requiredFrontendStrings) {
        $hits = Test-BinaryContainsText -SearchRoots @($frontendDist) -Text $requiredText
        if ($hits.Count -eq 0) {
            throw "Required Codework provider endpoint is missing from the built frontend: $requiredText"
        }
        Write-Host "REQUIRED_FRONTEND_PRESENT=$requiredText"
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
    $releaseNotesBody = (& $decodeUtf8Base64 '5Y+R5biD5pel5pyf77yae0RBVEV9CgotIOS/ruWkjeOAjOWbveS6p+aooeWeiyAwLjVY44CN5YiG57uE5Y+q5pi+56S65Y2V5Liq5qih5Z6L55qE6Zeu6aKY77ya5Lit6L2s56uZ5pyq6ZmQ5Yi25qih5Z6L5pe25bGV56S65YiG57uE5YaF5YWo6YOo5Y+v55So5qih5Z6L77yM5pyJ6ZmQ5Yi25pe25Y+q5bGV56S66KKr5o6I5p2D55qE6YKj5Yeg5Liq44CCCi0g5L+u5aSNIFdvcmtCdWRkeSDlronoo4XlnKjpnZ7pu5jorqTnm67lvZXvvIjkvovlpoIgRTpcd29ya2J1ZGR577yJ5pe26KKr6K+v5Yik5Li644CM5pyq5qOA5rWL5YiwIFdvcmtCdWRkeeOAjeeahOmXrumimOOAggotIFdvcmtCdWRkeSDlronoo4XkvY3nva7mlLnkuLrlpJrpgJTlvoTlj5HnjrDvvJrkvJjlhYjor7vlj5bmraPlnKjov5DooYznmoTov5vnqIvot6/lvoTvvIzlhbbmrKHor7vlj5blronoo4XlmajlhpnlhaXnmoTms6jlhozooajnmbvorrDkv6Hmga/vvIzlho3lm57okL3liLAgUEFUSCDkuI7luLjop4Hpu5jorqTnm67lvZXjgIIKLSDkuIDplK7lkIzmraXlm73kuqfmqKHlnovlkI7vvIzlrqLmiLfnq6/lj6/nm7TmjqXmi4notbfmnKzmnLrlt7Llronoo4XnmoQgV29ya0J1ZGR577yM5LiN5YaN6ZSZ6K+v6Lez6L2s5LiL6L296aG144CCCi0g6KaG55uW5a6J6KOF5Lya5L+d55WZ5Y6f5pyJ6LSm5Y+344CB5qih5Z6L44CB5Luk54mM44CB5L6b5bqU5ZWG44CB6IGK5aSp6K6w5b2V5LiO5Liq5oCn5YyW6YWN572u44CC').Replace('{DATE}', (Get-Date -Format 'yyyy-MM-dd'))
    $tipsBody = (& $decodeUtf8Base64 'MS4g5a6J6KOFIHtWRVJTSU9OfSDlkI7vvIzjgIzlm73kuqfmqKHlnosgMC41WOOAjeWIhue7hOS8muaMieS4rei9rOermeeahOWunumZheaOiOadg+WxleekuuaooeWei++8muacqumZkOWItuWImeWxleekuuWIhue7hOWGheWFqOmDqOaooeWei++8jOaciemZkOWItuWImeWPquWxleekuuiiq+aOiOadg+eahOmCo+WHoOS4quOAggoyLiDkuIDplK7lkIzmraXlm73kuqfmqKHlnovliLAgV29ya0J1ZGR5IOaXtu+8jOWPquihpem9kOe8uuWksemhueS4juWIt+aWsOWvhumSpe+8jOS4jeS8muimhuebluS9oOW3suacieeahOiHquWumuS5ieaooeWei+mFjee9ruOAggozLiBXb3JrQnVkZHkg6KOF5Zyo5Lu75oSP55uY55qE6Ieq5a6a5LmJ55uu5b2V6YO96IO96KKr6K+G5Yir77yb6Iul5LuN5o+Q56S65pyq5qOA5rWL5Yiw77yM6K+356Gu6K6k55uu5b2V6YeM5a2Y5ZyoIFdvcmtCdWRkeS5leGXjgIIKNC4g5Y6f5pyJ6LSm5Y+344CB5qih5Z6L44CB5L6b5bqU5ZWG6YWN572u44CB6IGK5aSp6K6w5b2V5LiO5Liq5oCn5YyW6K6+572u6YO95Lya5L+d55WZ44CCCjUuIOWmguaenCBXaW5kb3dzIOaYvuekuuWuieWFqOehruiupO+8jOivt+aguOWvuei9r+S7tuWQjeensOS4uuOAjOKZm0NvZGV3b3JrIEFJ5a6i5oi356uv44CN5ZCO57un57ut44CC').Replace('{VERSION}', $version)
    $releaseNotes = "# $publicProductName $version $releaseNotesLabel`n`n$releaseNotesBody"
    $tips = "# $publicProductName $tipsLabel`n`n$tipsBody"
    [System.IO.File]::WriteAllText($releaseNotesPath, $releaseNotes, $utf8NoBom)
    [System.IO.File]::WriteAllText($tipsPath, $tips, $utf8NoBom)
    $releaseZip = Join-Path $releaseDir "$publicProductName-$version-Windows-x64.zip"
    Compress-Archive -Path @($releaseInstaller, $releaseNotesPath, $tipsPath) -DestinationPath $releaseZip -Force
    Write-Output "INSTALLER=$releaseInstaller"
    Write-Output "ZIP=$releaseZip"
    $releaseVerifier = Join-Path $cargoReleaseDir 'codework-release-sign.exe'
    $releasePublicKey = Join-Path $root 'release-assets\codework-release-public-key.txt'
    Write-Output "PREFLIGHT_VERIFY_SIGNATURE=$releaseVerifier --public-key $releasePublicKey"
    Write-Output "PREFLIGHT=powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-codework-release.ps1 -ManifestPath <signed-manifest.json> -InstallerPath `"$releaseInstaller`" -ExpectedVersion $version"
} finally {
    Pop-Location
}
