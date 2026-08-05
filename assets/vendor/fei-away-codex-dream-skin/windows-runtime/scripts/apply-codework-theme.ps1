[CmdletBinding()]
param(
  [string]$ThemeId,
  [string]$ThemeDirectory,
  [string]$StateRoot
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
. (Join-Path $PSScriptRoot 'theme-windows.ps1')

$skillRoot = Split-Path -Parent $PSScriptRoot
$stateRoot = if ($StateRoot) { [System.IO.Path]::GetFullPath($StateRoot) } else { Join-Path $HOME '.codework-codex-plus-plus\DreamSkin' }
$source = $null
$theme = $null
$imagePath = $null

if ($ThemeDirectory) {
  $managedThemes = [System.IO.Path]::GetFullPath((Join-Path $stateRoot 'themes'))
  $source = [System.IO.Path]::GetFullPath($ThemeDirectory)
  if (-not (Test-DreamSkinThemePathWithin -Path $source -Root $managedThemes)) {
    throw 'Staged Codework theme is outside the managed store.'
  }
  Assert-DreamSkinNoReparseComponents -Path $source
  $themePath = Join-Path $source 'theme.json'
  if (-not (Test-Path -LiteralPath $themePath -PathType Leaf)) { throw 'Staged Codework theme metadata is unavailable.' }
  $theme = (Read-DreamSkinUtf8File -Path $themePath) | ConvertFrom-Json -ErrorAction Stop
  if (-not $theme.assetName) { throw 'Staged Codework theme asset is unavailable.' }
  $imagePath = [System.IO.Path]::GetFullPath((Join-Path $source "$($theme.assetName)"))
  if (-not (Test-DreamSkinThemePathWithin -Path $imagePath -Root $source)) { throw 'Staged Codework theme image is invalid.' }
  $theme | Add-Member -NotePropertyName image -NotePropertyValue "$($theme.assetName)" -Force
  if (-not $theme.palette) {
    $theme | Add-Member -NotePropertyName palette -NotePropertyValue ([pscustomobject]@{}) -Force
  }
} else {
  if ($ThemeId -notmatch '^[a-z][a-z0-9-]{0,63}$') { throw 'Theme ID is invalid.' }
  $source = Join-Path (Join-Path $skillRoot 'codework-themes') $ThemeId
  $themePath = Join-Path $source 'theme.json'
  if (-not (Test-Path -LiteralPath $themePath -PathType Leaf)) { throw 'Selected Codework theme is unavailable.' }
  $theme = (Read-DreamSkinUtf8File -Path $themePath) | ConvertFrom-Json -ErrorAction Stop
  $imagePath = Join-Path $source "$($theme.image)"
}

$null = Initialize-DreamSkinThemeStore -SkillRoot $skillRoot -StateRoot $stateRoot
$null = Set-DreamSkinActiveTheme -ImagePath $imagePath -Theme $theme -StateRoot $stateRoot
