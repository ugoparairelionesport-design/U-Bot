$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$staging = Join-Path $root 'discloud-package'
$zip = Join-Path $root 'u-bot-discloud.zip'

if (Test-Path $staging) {
  Remove-Item -LiteralPath $staging -Recurse -Force
}

if (Test-Path $zip) {
  Remove-Item -LiteralPath $zip -Force
}

New-Item -ItemType Directory -Path $staging | Out-Null

$items = @(
  'commands',
  'config',
  'Data',
  'Systems',
  'index.js',
  'deploy-commands.js',
  'package.json',
  'package-lock.json',
  'discloud.config',
  '.env'
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination $staging -Recurse -Force
  }
}

$envPath = Join-Path $staging '.env'
if (Test-Path $envPath) {
  $envText = Get-Content -LiteralPath $envPath -Raw
  $envValues = @{}

  $envText -split "`r?`n" | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $envValues[$Matches[1].Trim()] = $Matches[2].Trim()
    }
  }

  $token = $envValues['TOKEN']
  $decodedClientId = $null

  try {
    if ($token) {
      $firstPart = $token.Split('.')[0]
      $padding = (4 - ($firstPart.Length % 4)) % 4
      $decodedClientId = [Text.Encoding]::UTF8.GetString(
        [Convert]::FromBase64String($firstPart + ('=' * $padding))
      )
    }
  } catch {}

  $lines = New-Object System.Collections.Generic.List[string]
  $seen = @{}

  foreach ($line in (Get-Content -LiteralPath $envPath)) {
    if ($line -match '^\s*([^#=]+)=') {
      $key = $Matches[1].Trim()
      $seen[$key] = $true

      if ($key -eq 'CLIENT_ID' -and $decodedClientId -match '^\d{17,20}$') {
        $lines.Add("CLIENT_ID=$decodedClientId")
        continue
      }

      if ($key -eq 'DISCORD_TOKEN' -and [string]::IsNullOrWhiteSpace(($line -split '=', 2)[1]) -and $token) {
        $lines.Add("DISCORD_TOKEN=$token")
        continue
      }
    }

    $lines.Add($line)
  }

  if (-not $seen.ContainsKey('DISCORD_TOKEN') -and $token) {
    $lines.Add("DISCORD_TOKEN=$token")
  }

  if (-not $seen.ContainsKey('CLIENT_ID') -and $decodedClientId -match '^\d{17,20}$') {
    $lines.Add("CLIENT_ID=$decodedClientId")
  }

  if (-not $seen.ContainsKey('GUILD_ID')) {
    $lines.Add('GUILD_ID=1496615869499969576')
  }

  if (-not $seen.ContainsKey('AUTO_DEPLOY')) {
    $lines.Add('AUTO_DEPLOY=true')
  }

  if (-not $seen.ContainsKey('DEPLOY_GLOBAL')) {
    $lines.Add('DEPLOY_GLOBAL=true')
  }

  Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8
}

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -Force
Remove-Item -LiteralPath $staging -Recurse -Force

Get-Item $zip | Select-Object FullName, Length, LastWriteTime
