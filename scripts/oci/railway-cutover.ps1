[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Inspect', 'Stop', 'Rollback')]
  [string]$Action,
  [Parameter(Mandatory = $true)]
  [string]$StateFile,
  [string]$Server,
  [string]$Confirmation,
  [string]$PlatformProjectId = 'c15feea7-8c81-4a1f-8f40-b27ffdc1c062',
  [string]$EvolutionProjectId = 'e9dc5502-a36f-4f25-ba1d-2edef184e6c9',
  [string]$Environment = 'production'
)

$ErrorActionPreference = 'Stop'
$services = @(
  [pscustomobject]@{ Project=$PlatformProjectId; Service='worker' },
  [pscustomobject]@{ Project=$PlatformProjectId; Service='api' },
  [pscustomobject]@{ Project=$PlatformProjectId; Service='web' },
  [pscustomobject]@{ Project=$EvolutionProjectId; Service='embratel-rec-relay' },
  [pscustomobject]@{ Project=$EvolutionProjectId; Service='evolution-api' }
)

function Invoke-RailwayJson([string[]]$Arguments) {
  $raw = & railway @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Railway falhou: railway $($Arguments -join ' ')" }
  if ([string]::IsNullOrWhiteSpace(($raw -join ''))) { return $null }
  return ($raw | ConvertFrom-Json)
}

function Get-ServiceScale($Item) {
  $deployments = Invoke-RailwayJson @('deployment','list','-p',$Item.Project,'-e',$Environment,'-s',$Item.Service,'--json')
  $current = $deployments | Where-Object status -eq 'SUCCESS' | Select-Object -First 1
  if ($null -eq $current) { throw "Deployment ativo nao encontrado: $($Item.Service)" }
  $regions = [ordered]@{}
  foreach ($property in $current.meta.serviceManifest.deploy.multiRegionConfig.PSObject.Properties) {
    $regions[$property.Name] = [int]$property.Value.numReplicas
  }
  if ($regions.Count -eq 0) { throw "Regiao nao encontrada: $($Item.Service)" }
  return [pscustomobject]@{ Project=$Item.Project; Service=$Item.Service; Regions=$regions }
}

function Set-ServiceScale($Item, [bool]$Stop) {
  $regionArgs = foreach ($entry in $Item.Regions.GetEnumerator()) {
    '{0}={1}' -f $entry.Key, $(if ($Stop) { 0 } else { $entry.Value })
  }
  Invoke-RailwayJson (@('scale','-p',$Item.Project,'-e',$Environment,'-s',$Item.Service) + $regionArgs + '--json') | Out-Null
}

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) { throw 'Railway CLI nao encontrado.' }
$statePath = [IO.Path]::GetFullPath($StateFile)

if ($Action -eq 'Inspect') {
  $state = foreach ($item in $services) { Get-ServiceScale $item }
  $state | ForEach-Object { Write-Host ("{0}: {1}" -f $_.Service, (($_.Regions.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', ')) }
  $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding utf8
  Write-Host "Estado salvo em $statePath. Nenhum servico foi alterado."
  exit 0
}

if ($Action -eq 'Stop') {
  if ($Confirmation -ne 'STOP-RAILWAY-WRITERS') { throw 'Use -Confirmation STOP-RAILWAY-WRITERS.' }
  if ([string]::IsNullOrWhiteSpace($Server)) { throw '-Server e obrigatorio para criar o marcador de corte.' }
  $state = foreach ($item in $services) { Get-ServiceScale $item }
  $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding utf8
  $stopped = [Collections.Generic.List[object]]::new()
  try {
    foreach ($item in $state) {
      Set-ServiceScale $item $true
      $stopped.Add($item)
      Write-Host "Parado: $($item.Service)"
    }
    & ssh "ubuntu@$Server" 'mkdir -p /srv/comunora/state && touch /srv/comunora/state/source-writers-stopped'
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel criar o marcador no servidor OCI.' }
  } catch {
    foreach ($item in $stopped) { try { Set-ServiceScale $item $false } catch {} }
    throw
  }
  Write-Host 'Writers Railway parados. Execute imediatamente a migracao final.'
  exit 0
}

if (-not (Test-Path -LiteralPath $statePath)) { throw "Arquivo de estado ausente: $statePath" }
$saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
foreach ($item in $saved) {
  $regions = [ordered]@{}
  foreach ($property in $item.Regions.PSObject.Properties) { $regions[$property.Name] = [int]$property.Value }
  Set-ServiceScale ([pscustomobject]@{ Project=$item.Project; Service=$item.Service; Regions=$regions }) $false
  Write-Host "Restaurado: $($item.Service)"
}
if (-not [string]::IsNullOrWhiteSpace($Server)) {
  & ssh "ubuntu@$Server" 'rm -f /srv/comunora/state/source-writers-stopped'
}
Write-Host 'Servicos Railway restaurados. Reponha tambem o DNS pelo backup Cloudflare.'
