$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$envPath = Join-Path $root '.env'

if (-not (Test-Path $envPath)) {
  Write-Host '.env introuvable' -ForegroundColor Red
  exit 1
}

$values = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $values[$Matches[1].Trim()] = $Matches[2].Trim()
  }
}

function Test-KeyPresent($name) {
  return $values.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($values[$name])
}

$requiredGroups = @(
  @{ Label = 'TOKEN ou DISCORD_TOKEN'; Keys = @('TOKEN', 'DISCORD_TOKEN') },
  @{ Label = 'CLIENT_ID'; Keys = @('CLIENT_ID') },
  @{ Label = 'GUILD_ID'; Keys = @('GUILD_ID') }
)

$optionalGroups = @(
  @{ Label = 'GROQ_API_KEY - IA, annonces, correction'; Keys = @('GROQ_API_KEY') },
  @{ Label = 'TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET - lives Twitch'; Keys = @('TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET') },
  @{ Label = 'YOUTUBE_API_KEY - lives YouTube'; Keys = @('YOUTUBE_API_KEY') },
  @{ Label = 'PUBLIC_BASE_URL ou APP_URL - images locales /assets'; Keys = @('PUBLIC_BASE_URL', 'APP_URL') }
)

Write-Host 'Secrets obligatoires' -ForegroundColor Cyan
foreach ($group in $requiredGroups) {
  $ok = $false
  foreach ($key in $group.Keys) {
    if (Test-KeyPresent $key) { $ok = $true }
  }
  $mark = if ($ok) { 'OK' } else { 'MANQUANT' }
  $color = if ($ok) { 'Green' } else { 'Red' }
  Write-Host ("- {0}: {1}" -f $group.Label, $mark) -ForegroundColor $color
}

Write-Host ''
Write-Host 'Secrets optionnels' -ForegroundColor Cyan
foreach ($group in $optionalGroups) {
  $present = 0
  foreach ($key in $group.Keys) {
    if (Test-KeyPresent $key) { $present++ }
  }

  $ok = $present -eq $group.Keys.Count
  $partial = $present -gt 0 -and -not $ok
  $mark = if ($ok) { 'OK' } elseif ($partial) { 'PARTIEL' } else { 'VIDE' }
  $color = if ($ok) { 'Green' } elseif ($partial) { 'Yellow' } else { 'DarkGray' }
  Write-Host ("- {0}: {1}" -f $group.Label, $mark) -ForegroundColor $color
}
