[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,
  [string]$PlatformProjectId = 'c15feea7-8c81-4a1f-8f40-b27ffdc1c062',
  [string]$EvolutionProjectId = 'e9dc5502-a36f-4f25-ba1d-2edef184e6c9',
  [string]$Environment = 'production'
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if ($outputRoot.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'O diretorio de segredos deve ficar fora do repositorio.'
}

function Get-RailwayVariables([string]$ProjectId, [string]$Service) {
  $raw = & railway variable list -p $ProjectId -e $Environment -s $Service --json 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Falha ao ler variaveis Railway de $Service." }
  return ($raw | ConvertFrom-Json)
}

function Get-SecretHex([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return [Convert]::ToHexString($buffer).ToLowerInvariant()
}

function Get-Value($Object, [string]$Name, [string]$Default = '') {
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) { return $Default }
  return [string]$property.Value
}

function ConvertTo-DotEnvValue([AllowNull()][string]$Value) {
  if ($null -eq $Value) { $Value = '' }
  $escaped = $Value.Replace('\', '\\').Replace('"', '\"').Replace('$', '$$').Replace("`r", '').Replace("`n", '\n')
  return '"' + $escaped + '"'
}

function Write-EnvFile([string]$Name, [Collections.IDictionary]$Values) {
  $path = Join-Path $outputRoot $Name
  $lines = foreach ($key in $Values.Keys) { '{0}={1}' -f $key, (ConvertTo-DotEnvValue ([string]$Values[$key])) }
  [IO.File]::WriteAllLines($path, $lines, [Text.UTF8Encoding]::new($false))
}

function Copy-Variables($Source, [Collections.IDictionary]$Target) {
  foreach ($property in $Source.PSObject.Properties) {
    if ($property.Name -match '^(RAILWAY_|NIXPACKS_)') { continue }
    if ($property.Name -in @('DATABASE_URL', 'DATABASE_ADMIN_URL', 'REDIS_URL', 'EVOLUTION_API_URL')) { continue }
    $Target[$property.Name] = [string]$property.Value
  }
}

if (-not (Get-Command railway -ErrorAction SilentlyContinue)) { throw 'Railway CLI nao encontrado.' }
& railway whoami *> $null
if ($LASTEXITCODE -ne 0) { throw 'Railway CLI nao esta autenticado.' }

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
& icacls $outputRoot /inheritance:r /grant:r "$env:USERNAME`:(OI)(CI)F" *> $null

$platformApi = Get-RailwayVariables $PlatformProjectId 'api'
$platformWorker = Get-RailwayVariables $PlatformProjectId 'worker'
$platformWeb = Get-RailwayVariables $PlatformProjectId 'web'
$platformSourceDb = Get-RailwayVariables $PlatformProjectId 'Postgres'
$platformSourceRedis = Get-RailwayVariables $PlatformProjectId 'Redis'
$evolutionApi = Get-RailwayVariables $EvolutionProjectId 'evolution-api'
$evolutionRelay = Get-RailwayVariables $EvolutionProjectId 'embratel-rec-relay'
$evolutionSourceDb = Get-RailwayVariables $EvolutionProjectId 'Postgres'
$evolutionSourceRedis = Get-RailwayVariables $EvolutionProjectId 'Redis'

$platformAdminPassword = Get-SecretHex 32
$platformRuntimePassword = Get-SecretHex 32
$platformRedisPassword = Get-SecretHex 32
$evolutionDbPassword = Get-SecretHex 32
$evolutionRedisPassword = Get-SecretHex 32
$relaySecret = Get-SecretHex 32
$backupPassword = Get-SecretHex 32

$evolutionKey = Get-Value $evolutionApi 'AUTHENTICATION_API_KEY'
if ([string]::IsNullOrWhiteSpace($evolutionKey)) { throw 'AUTHENTICATION_API_KEY da Evolution esta vazia.' }

$platformRuntime = [ordered]@{}
Copy-Variables $platformApi $platformRuntime
Copy-Variables $platformWorker $platformRuntime
$platformRuntime['NODE_ENV'] = 'production'
$platformRuntime['PORT'] = '3000'
$platformRuntime['DATABASE_URL'] = "postgresql://plataforma_runtime:$platformRuntimePassword@platform-postgres:5432/plataforma"
$platformRuntime['REDIS_URL'] = "redis://default:$platformRedisPassword@platform-redis:6379/0"
$platformRuntime['WEB_APP_URL'] = 'https://app.comunora.com.br'
$platformRuntime['API_PUBLIC_URL'] = 'https://api.comunora.com.br'
$platformRuntime['CORS_ORIGINS'] = 'https://app.comunora.com.br,https://comunora.com.br'
$platformRuntime['EVOLUTION_API_URL'] = 'https://evolution.179-198-124-8.sslip.io'
$platformRuntime['EVOLUTION_API_KEY'] = $evolutionKey
$platformRuntime['GOOGLE_OAUTH_REDIRECT_URI'] = 'https://api.comunora.com.br/auth/google/callback'
$platformRuntime['GOOGLE_CALENDAR_OAUTH_REDIRECT_URI'] = 'https://api.comunora.com.br/integracoes/google-calendar/callback'

foreach ($required in @('JWT_SECRET', 'SECRETS_MASTER_KEY', 'ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN')) {
  if ([string]::IsNullOrWhiteSpace([string]$platformRuntime[$required])) { throw "Variavel obrigatoria ausente no Railway: $required" }
}

$evolutionTarget = [ordered]@{}
Copy-Variables $evolutionApi $evolutionTarget
$evolutionTarget['SERVER_URL'] = 'https://evolution.179-198-124-8.sslip.io'
$evolutionTarget['DATABASE_CONNECTION_URI'] = "postgresql://evolution:$evolutionDbPassword@evolution-postgres:5432/evolution"
$evolutionTarget['CACHE_REDIS_URI'] = "redis://default:$evolutionRedisPassword@evolution-redis:6379/0"
$evolutionTarget['AUTHENTICATION_API_KEY'] = $evolutionKey

$relayTarget = [ordered]@{
  NODE_ENV = 'production'
  PORT = '8788'
  EVOLUTION_BASE_URL = 'https://evolution.179-198-124-8.sslip.io'
  EVOLUTION_INSTANCE = Get-Value $evolutionRelay 'EVOLUTION_INSTANCE'
  EVOLUTION_TOKEN = $evolutionKey
  WHATSAPP_FO_GROUP_ID = Get-Value $evolutionRelay 'WHATSAPP_FO_GROUP_ID'
  WHATSAPP_BS_GROUP_ID = Get-Value $evolutionRelay 'WHATSAPP_BS_GROUP_ID'
  WHATSAPP_GROUP_IDS = Get-Value $evolutionRelay 'WHATSAPP_GROUP_IDS' (Get-Value $evolutionRelay 'WHATSAPP_GROUP_ID')
  RELAY_SHARED_SECRET = $relaySecret
  REDIS_URL = "redis://default:$evolutionRedisPassword@evolution-redis:6379/0"
  REDIS_KEY_PREFIX = 'embratel-rec-relay'
  DEDUP_TTL_MS = '21600000'
}

Write-EnvFile 'platform-db.env' ([ordered]@{ POSTGRES_USER='plataforma_admin'; POSTGRES_PASSWORD=$platformAdminPassword; POSTGRES_DB='plataforma'; PGDATA='/var/lib/postgresql/data/pgdata' })
Write-EnvFile 'platform-redis.env' ([ordered]@{ REDIS_PASSWORD=$platformRedisPassword; REDIS_APPENDONLY='yes' })
Write-EnvFile 'platform-runtime.env' $platformRuntime
Write-EnvFile 'platform-admin.env' ([ordered]@{ NODE_ENV='production'; DATABASE_ADMIN_URL="postgresql://plataforma_admin:$platformAdminPassword@platform-postgres:5432/plataforma"; DATABASE_RUNTIME_USER='plataforma_runtime'; DATABASE_RUNTIME_PASSWORD=$platformRuntimePassword; PGSSL='false' })
Write-EnvFile 'evolution-db.env' ([ordered]@{ POSTGRES_USER='evolution'; POSTGRES_PASSWORD=$evolutionDbPassword; POSTGRES_DB='evolution'; PGDATA='/var/lib/postgresql/data/pgdata' })
Write-EnvFile 'evolution-redis.env' ([ordered]@{ REDIS_PASSWORD=$evolutionRedisPassword; REDIS_APPENDONLY='yes' })
Write-EnvFile 'evolution.env' $evolutionTarget
Write-EnvFile 'relay.env' $relayTarget
Write-EnvFile 'cloudflared.env' ([ordered]@{ TUNNEL_TOKEN='CHANGE_ME_FROM_TERRAFORM_OUTPUT' })
Write-EnvFile 'cloudflare-api.env' ([ordered]@{ CF_API_TOKEN='CHANGE_ME'; CF_ZONE_ID='CHANGE_ME'; CF_TUNNEL_CNAME='CHANGE_ME.cfargotunnel.com' })
Write-EnvFile 'backup.env' ([ordered]@{ RESTIC_REPOSITORY='CHANGE_ME'; RESTIC_PASSWORD=$backupPassword; AWS_ACCESS_KEY_ID='CHANGE_ME'; AWS_SECRET_ACCESS_KEY='CHANGE_ME'; AWS_DEFAULT_REGION='sa-saopaulo-1'; RESTIC_CACHE_DIR='/srv/comunora/cache/restic'; RESTIC_QUOTA_BYTES='16106127360' })
Write-EnvFile 'migration-source.env' ([ordered]@{
  SOURCE_PLATFORM_DATABASE_URL = Get-Value $platformSourceDb 'DATABASE_PUBLIC_URL' (Get-Value $platformSourceDb 'DATABASE_URL')
  SOURCE_PLATFORM_REDIS_URL = Get-Value $platformSourceRedis 'REDIS_PUBLIC_URL' (Get-Value $platformSourceRedis 'REDIS_URL')
  SOURCE_EVOLUTION_DATABASE_URL = Get-Value $evolutionSourceDb 'DATABASE_PUBLIC_URL' (Get-Value $evolutionSourceDb 'DATABASE_URL')
  SOURCE_EVOLUTION_REDIS_URL = Get-Value $evolutionSourceRedis 'REDIS_PUBLIC_URL' (Get-Value $evolutionSourceRedis 'REDIS_URL')
})

$composeValues = [ordered]@{
  COMUNORA_ENV_DIR='/etc/comunora/env'
  COMUNORA_DATA_DIR='/srv/comunora/data'
  COMUNORA_STATE_DIR='/srv/comunora/state'
}
foreach ($name in @('NEXT_PUBLIC_API_URL','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_DOCS_URL','NEXT_PUBLIC_STATUS_URL','NEXT_PUBLIC_BRAND_NAME','NEXT_PUBLIC_SUPPORT_EMAIL')) {
  $composeValues[$name] = Get-Value $platformWeb $name
}
Write-EnvFile 'compose.env' $composeValues

[IO.File]::WriteAllText((Join-Path $outputRoot 'extension-relay-secret.txt'), $relaySecret + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $outputRoot 'README.txt'), "Segredos exportados sem exibir valores. Preencha os campos CHANGE_ME, envie *.env para /etc/comunora/env com modo 0600 e apague esta pasta local depois do corte.`r`n", [Text.UTF8Encoding]::new($false))

Get-ChildItem -LiteralPath $outputRoot -File | ForEach-Object { & icacls $_.FullName /inheritance:r /grant:r "$env:USERNAME`:F" *> $null }
Write-Host "Arquivos de configuracao criados com ACL restrita em $outputRoot. Nenhum valor secreto foi impresso."
