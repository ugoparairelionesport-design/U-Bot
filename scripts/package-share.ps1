$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$staging = Join-Path $root 'share-package'
$zip = Join-Path $root 'u-bot-share.zip'

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
  'Systems',
  'scripts',
  'index.js',
  'deploy-commands.js',
  'package.json',
  'package-lock.json',
  'discloud.config',
  '.env.example',
  '.discloudignore',
  'SECURITY_SHARE.md'
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination $staging -Recurse -Force
  }
}

$privatePatterns = @(
  '.env',
  'Data',
  'Infos',
  '.git',
  'node_modules',
  'u-bot-discloud.zip',
  'u-bot-share.zip',
  'share-package',
  'discloud-package'
)

foreach ($pattern in $privatePatterns) {
  Get-ChildItem -LiteralPath $staging -Force -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq $pattern } |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -Force
Remove-Item -LiteralPath $staging -Recurse -Force

Get-Item $zip | Select-Object FullName, Length, LastWriteTime
