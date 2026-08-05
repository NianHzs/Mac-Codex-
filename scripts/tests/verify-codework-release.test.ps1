$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot '..\verify-codework-release.ps1'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("codework-release-preflight-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $tempRoot | Out-Null

try {
    $installer = Join-Path $tempRoot 'codework-ai-client-9.8.7-windows-x64-setup.exe'
    [System.IO.File]::WriteAllBytes($installer, [byte[]](1, 2, 3, 4, 5))
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
    $signature = [Convert]::ToBase64String([byte[]](0..63))
    $manifest = Join-Path $tempRoot 'codework-ai-client-windows.json'
    @{
        version = '9.8.7'
        downloadUrl = 'https://updates.example.test/downloads/codework-ai-client-9.8.7-windows-x64-setup.exe'
        size = 5
        sha256 = $hash
        signature = $signature
        publishedAt = '2026-07-28T09:01:00+08:00'
        minimumSupportedVersion = '1.3.20'
        mandatory = $false
        notes = @('Release preflight fixture')
    } | ConvertTo-Json | Set-Content -LiteralPath $manifest -Encoding utf8

    $verified = & $scriptPath -ManifestPath $manifest -InstallerPath $installer -ExpectedVersion '9.8.7' -ExpectedRemoteInstallerName 'codework-ai-client-9.8.7-windows-x64-setup.exe'
    if ($verified.status -ne 'ok' -or $verified.sha256 -ne $hash) {
        throw 'Preflight did not report the expected successful verification result.'
    }

    $invalid = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
    $invalid.sha256 = '0' * 64
    $invalid | ConvertTo-Json | Set-Content -LiteralPath $manifest -Encoding utf8
    $failed = $false
    try {
        & $scriptPath -ManifestPath $manifest -InstallerPath $installer | Out-Null
    } catch {
        $failed = $_.Exception.Message -match 'SHA-256 mismatch'
    }
    if (-not $failed) {
        throw 'Preflight accepted a manifest whose SHA-256 does not match the installer.'
    }

    Write-Output 'PASS: Codework release preflight validates release identity and rejects a mismatched installer.'
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
