param(
  [string]$BaseUrl = "http://115.190.199.191:20080/downloads/codework-skills"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repoRoot "official-skills"
$outputRoot = Join-Path $repoRoot "release-assets\codework-skills"
$template = Get-Content -Raw -Encoding UTF8 (Join-Path $sourceRoot "index.template.json") | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$publishedSkills = @()
foreach ($skill in $template.skills) {
  $skillRoot = Join-Path $sourceRoot $skill.id
  $skillFile = Join-Path $skillRoot "SKILL.md"
  if (-not (Test-Path -LiteralPath $skillFile)) { throw "Missing $skillFile" }
  $fileName = "$($skill.id)-$($skill.version).zip"
  $archivePath = Join-Path $outputRoot $fileName
  Compress-Archive -Path (Join-Path $skillRoot "*") -DestinationPath $archivePath -Force
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash.ToLowerInvariant()
  $publishedSkills += [ordered]@{
    id = $skill.id; name = $skill.name; description = $skill.description; version = $skill.version
    author = "Codework AI"; tags = @($skill.tags); homepage = ""; usage = $skill.usage
    packageUrl = "$($BaseUrl.TrimEnd('/'))/$fileName"; sha256 = $hash
  }
}

$manifest = [ordered]@{
  version = 1
  updatedAt = [DateTime]::UtcNow.ToString("o")
  skills = $publishedSkills
}
$manifestJson = $manifest | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(
  (Join-Path $outputRoot "index.json"),
  $manifestJson,
  [System.Text.UTF8Encoding]::new($false)
)
Write-Host "Built $($publishedSkills.Count) official Skill packages in $outputRoot"
