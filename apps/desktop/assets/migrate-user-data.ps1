param(
  [Parameter(Mandatory = $true)][string]$LegacyRoot,
  [Parameter(Mandatory = $true)][string]$TargetRoot
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $LegacyRoot -PathType Container)) { exit 0 }
New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null

# Runtime code and disposable caches must not be copied into roaming user data.
# Everything else is user-owned state. A denylist makes future state types
# survive upgrades even when this installer predates them.
$excluded = @{
  'versions' = $true; 'node' = $true; 'hermes-agent' = $true
  'offline-runtime' = $true; 'active-version' = $true
  'runtime-manifest.json' = $true; 'hermes-setup.exe' = $true
  '.hermes-update-in-progress' = $true; '.karna-offline-runtime.json' = $true
  'cache' = $true; 'audio_cache' = $true; 'image_cache' = $true
  'logs' = $true; 'temp' = $true; 'tmp' = $true; '__pycache__' = $true
  '.update_check' = $true; '.skills_prompt_snapshot.json' = $true
  'models_dev_cache.json' = $true; 'provider_models_cache.json' = $true
  'ollama_cloud_models_cache.json' = $true
}

function Copy-MissingTree([string]$Source, [string]$Destination) {
  $item = Get-Item -Force -LiteralPath $Source
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return }
  if ($item.PSIsContainer) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    foreach ($child in Get-ChildItem -Force -LiteralPath $Source) {
      Copy-MissingTree $child.FullName (Join-Path $Destination $child.Name)
    }
    return
  }
  if (-not (Test-Path -LiteralPath $Destination)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
  }
}

foreach ($entry in Get-ChildItem -Force -LiteralPath $LegacyRoot) {
  if ($excluded.ContainsKey($entry.Name) -or $entry.Name.StartsWith('.karna-update-')) { continue }
  Copy-MissingTree $entry.FullName (Join-Path $TargetRoot $entry.Name)
}

$marker = Join-Path $TargetRoot '.karna-installer-migration.json'
@{
  schemaVersion = 1
  migratedAt = [DateTime]::UtcNow.ToString('o')
  legacyRuntimeHome = $LegacyRoot
} | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding UTF8

exit 0
