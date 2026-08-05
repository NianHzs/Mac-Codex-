[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ManifestPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$InstallerPath,

    [string]$ExpectedVersion,

    [string]$ExpectedRemoteInstallerName,

    [string]$ReleaseVerifierPath,

    [string]$PublicKeyPath
)

$ErrorActionPreference = 'Stop'

function Require-Value {
    param(
        [Parameter(Mandatory = $true)][object]$Value,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $Value -or ([string]$Value).Trim().Length -eq 0) {
        throw "Release manifest is missing $Name."
    }

    return [string]$Value
}

function Test-ReleaseVersion {
    param([Parameter(Mandatory = $true)][string]$Value)
    return $Value -match '^\d+\.\d+\.\d+$'
}

function Get-RemoteInstallerName {
    param([Parameter(Mandatory = $true)][string]$DownloadUrl)
    try {
        $uri = [System.Uri]$DownloadUrl
    } catch {
        throw "downloadUrl is not a valid absolute URL."
    }

    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -notin @('http', 'https') -or $uri.Query -or $uri.Fragment) {
        throw "downloadUrl must be an absolute HTTP(S) installer URL without query or fragment."
    }

    $name = [System.IO.Path]::GetFileName($uri.AbsolutePath)
    if ([string]::IsNullOrWhiteSpace($name) -or $name -notmatch '\.exe$') {
        throw "downloadUrl must point to a Windows installer executable."
    }

    return $name
}

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "Manifest file was not found: $ManifestPath"
}
if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
    throw "Installer file was not found: $InstallerPath"
}

try {
    $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding utf8 | ConvertFrom-Json
} catch {
    throw "Release manifest is not valid JSON: $($_.Exception.Message)"
}

$version = Require-Value $manifest.version 'version'
if (-not (Test-ReleaseVersion $version)) {
    throw "Release manifest version must be major.minor.patch: $version"
}
if ($ExpectedVersion -and $version -ne $ExpectedVersion) {
    throw "Release manifest version mismatch. Expected $ExpectedVersion, received $version."
}

$downloadUrl = Require-Value $manifest.downloadUrl 'downloadUrl'
$remoteInstallerName = Get-RemoteInstallerName $downloadUrl
if ($remoteInstallerName -notmatch [regex]::Escape("-$version-") -or $remoteInstallerName -notmatch '-windows-x64-setup\.exe$') {
    throw "Remote installer name does not match manifest version/platform: $remoteInstallerName"
}
if ($ExpectedRemoteInstallerName -and $remoteInstallerName -ne $ExpectedRemoteInstallerName) {
    throw "Remote installer name mismatch. Expected $ExpectedRemoteInstallerName, received $remoteInstallerName."
}

$expectedSize = [uint64](Require-Value $manifest.size 'size')
$installerInfo = Get-Item -LiteralPath $InstallerPath
if ([uint64]$installerInfo.Length -ne $expectedSize) {
    throw "Installer size mismatch. Manifest=$expectedSize Actual=$($installerInfo.Length)."
}

$expectedHash = (Require-Value $manifest.sha256 'sha256').ToLowerInvariant()
if ($expectedHash -notmatch '^[a-f0-9]{64}$') {
    throw 'Release manifest sha256 must contain exactly 64 lowercase hexadecimal characters.'
}
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $InstallerPath).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    throw "Installer SHA-256 mismatch. Manifest=$expectedHash Actual=$actualHash."
}

$signature = Require-Value $manifest.signature 'signature'
try {
    $signatureBytes = [System.Convert]::FromBase64String($signature)
} catch {
    throw 'Release manifest signature is not valid Base64.'
}
if ($signatureBytes.Length -ne 64) {
    throw "Release manifest signature must be an Ed25519 64-byte signature; received $($signatureBytes.Length) bytes."
}

$publishedAt = Require-Value $manifest.publishedAt 'publishedAt'
$parsedPublishedAt = [System.DateTimeOffset]::MinValue
if (-not [System.DateTimeOffset]::TryParse($publishedAt, [ref]$parsedPublishedAt)) {
    throw "Release manifest publishedAt is invalid: $publishedAt"
}

$minimumSupportedVersion = Require-Value $manifest.minimumSupportedVersion 'minimumSupportedVersion'
if (-not (Test-ReleaseVersion $minimumSupportedVersion)) {
    throw "minimumSupportedVersion must be major.minor.patch: $minimumSupportedVersion"
}
if ($manifest.mandatory -isnot [bool]) {
    throw 'Release manifest mandatory must be a Boolean.'
}
if ($manifest.notes -isnot [System.Collections.IEnumerable] -or @($manifest.notes).Count -eq 0) {
    throw 'Release manifest notes must contain at least one release note.'
}

if ($ReleaseVerifierPath -or $PublicKeyPath) {
    if (-not $ReleaseVerifierPath -or -not $PublicKeyPath) {
        throw 'ReleaseVerifierPath and PublicKeyPath must be provided together.'
    }
    if (-not (Test-Path -LiteralPath $ReleaseVerifierPath -PathType Leaf)) {
        throw "Release verifier was not found: $ReleaseVerifierPath"
    }
    if (-not (Test-Path -LiteralPath $PublicKeyPath -PathType Leaf)) {
        throw "Release public key was not found: $PublicKeyPath"
    }
    & $ReleaseVerifierPath verify-manifest --public-key $PublicKeyPath --manifest $ManifestPath --installer $InstallerPath
    if ($LASTEXITCODE -ne 0) {
        throw "Release signature verification failed with exit code $LASTEXITCODE."
    }
}

[pscustomobject]@{
    status = 'ok'
    version = $version
    remoteInstallerName = $remoteInstallerName
    installerBytes = [uint64]$installerInfo.Length
    sha256 = $actualHash
    publishedAt = $parsedPublishedAt.ToString('o')
    mandatory = [bool]$manifest.mandatory
}
