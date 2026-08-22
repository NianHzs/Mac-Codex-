param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z]+)*$')]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$X64Dmg,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$Arm64Dmg,

    [string]$X64Zip,
    [string]$Arm64Zip,
    [string]$SshHost = '115.190.199.191',
    [int]$SshPort = 2222,
    [string]$SshUser = 'root',
    [string]$IdentityFile = "$HOME/.ssh/id_rsa",
    [string]$PublicBaseUrl = 'http://115.190.199.191:20080/downloads',
    [switch]$ReplaceExisting
)

$ErrorActionPreference = 'Stop'

$releaseDirectory = '/var/lib/docker/volumes/xiaoshuai-lottery_lottery_data/_data/downloads'
$sshDestination = "${SshUser}@${SshHost}"
$sshBase = @(
    '-F', 'NUL',
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-i', $IdentityFile,
    '-p', $SshPort.ToString()
)

function Assert-ReleaseFile {
    param(
        [string]$Path,
        [string]$ExpectedName
    )

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if ([IO.Path]::GetFileName($resolved) -ne $ExpectedName) {
        throw "Expected $ExpectedName, received $([IO.Path]::GetFileName($resolved))."
    }

    return [PSCustomObject]@{
        Path = $resolved
        Name = $ExpectedName
        Size = (Get-Item -LiteralPath $resolved).Length
        Sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolved).Hash.ToLowerInvariant()
    }
}

function Add-OptionalReleaseFile {
    param(
        [System.Collections.Generic.List[object]]$Files,
        [string]$Path,
        [string]$ExpectedName
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Optional release file does not exist: $Path"
    }

    $Files.Add((Assert-ReleaseFile -Path $Path -ExpectedName $ExpectedName))
}

$files = [System.Collections.Generic.List[object]]::new()
$files.Add((Assert-ReleaseFile -Path $X64Dmg -ExpectedName "Codework-AI客户端-$Version-macos-x64.dmg"))
$files.Add((Assert-ReleaseFile -Path $Arm64Dmg -ExpectedName "Codework-AI客户端-$Version-macos-arm64.dmg"))
Add-OptionalReleaseFile -Files $files -Path $X64Zip -ExpectedName "Codework-AI客户端-$Version-macos-x64.zip"
Add-OptionalReleaseFile -Files $files -Path $Arm64Zip -ExpectedName "Codework-AI客户端-$Version-macos-arm64.zip"

$safeBaseUrl = $PublicBaseUrl.TrimEnd('/')
$assets = @{}
foreach ($file in $files) {
    $architecture = if ($file.Name -match 'macos-x64') { 'x64' } else { 'arm64' }
    $format = if ($file.Name.EndsWith('.dmg')) { 'dmg' } else { 'zip' }
    if (-not $assets.ContainsKey($architecture)) {
        $assets[$architecture] = @{}
    }
    $assets[$architecture][$format] = [ordered]@{
        fileName = $file.Name
        downloadUrl = "$safeBaseUrl/$([uri]::EscapeDataString($file.Name))"
        size = $file.Size
        sha256 = $file.Sha256
    }
}

$manifest = [ordered]@{
    version = $Version
    publishedAt = [DateTime]::UtcNow.ToString('o')
    assets = $assets
}
$manifestName = 'codework-ai-client-macos.json'
$manifestPath = Join-Path ([IO.Path]::GetTempPath()) "$manifestName.$Version.$PID"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
$manifestInfo = [PSCustomObject]@{
    Path = $manifestPath
    Name = $manifestName
    Size = (Get-Item -LiteralPath $manifestPath).Length
    Sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
}
$files.Add($manifestInfo)

$existingCheck = ($files | ForEach-Object { "test ! -e '$releaseDirectory/$($_.Name)'" }) -join ' && '
if ($ReplaceExisting) {
    $existingCheck = 'true'
}

& ssh @sshBase $sshDestination "set -eu; test -d '$releaseDirectory'; $existingCheck"
if ($LASTEXITCODE -ne 0) {
    throw 'A target file already exists on 1Panel. Use a new version, or rerun with -ReplaceExisting after confirming the replacement.'
}

$stageDirectory = "/tmp/codework-macos-$Version-$PID"
& ssh @sshBase $sshDestination "set -eu; mkdir -p '$stageDirectory'"
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to create the remote staging directory.'
}

foreach ($file in $files) {
    & scp @sshBase $file.Path "${sshDestination}:$stageDirectory/$($file.Name)"
    if ($LASTEXITCODE -ne 0) {
        throw "Upload failed: $($file.Name)"
    }
}

$checks = ($files | ForEach-Object { "test `"`$(sha256sum '$stageDirectory/$($_.Name)' | awk '{print `$1}')`" = '$($_.Sha256)'" }) -join ' && '
& ssh @sshBase $sshDestination "set -eu; $checks"
if ($LASTEXITCODE -ne 0) {
    throw 'Remote SHA-256 verification failed. No files were published.'
}

foreach ($file in $files) {
    & ssh @sshBase $sshDestination "set -eu; install -m 0644 '$stageDirectory/$($file.Name)' '$releaseDirectory/$($file.Name)'"
    if ($LASTEXITCODE -ne 0) {
        throw "Publish failed: $($file.Name)"
    }
}

foreach ($file in $files) {
    $head = Invoke-WebRequest -UseBasicParsing -Method Head -TimeoutSec 30 "$safeBaseUrl/$([uri]::EscapeDataString($file.Name))"
    if ($head.StatusCode -ne 200 -or [int64]$head.Headers['Content-Length'] -ne $file.Size) {
        throw "Public verification failed: $($file.Name)"
    }
}

Remove-Item -LiteralPath $manifestPath -Force
Write-Host "Published Codework AI客户端 macOS $Version to $safeBaseUrl"
Write-Host "Manifest: $safeBaseUrl/$manifestName"
