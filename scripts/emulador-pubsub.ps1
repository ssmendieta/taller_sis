param(
  [string]$ProjectId = $(if ($env:TALLER_PUBSUB_PROJECT_ID) { $env:TALLER_PUBSUB_PROJECT_ID } else { 'taller-local' }),
  [string]$IdaTopic = $(if ($env:TALLER_CONTABILIDAD_IDA_TOPIC) { $env:TALLER_CONTABILIDAD_IDA_TOPIC } else { 'taller-produccion-cerrada-local' }),
  [string]$IdaSubscription = $(if ($env:TALLER_CONTABILIDAD_IDA_SUBSCRIPTION) { $env:TALLER_CONTABILIDAD_IDA_SUBSCRIPTION } else { 'taller-contabilidad-simulator-local' }),
  [string]$VueltaTopic = $(if ($env:TALLER_CONTABILIDAD_VUELTA_TOPIC) { $env:TALLER_CONTABILIDAD_VUELTA_TOPIC } else { 'taller-contabilidad-resultados-local' }),
  [string]$VueltaSubscription = $(if ($env:TALLER_CONTABILIDAD_VUELTA_SUBSCRIPTION) { $env:TALLER_CONTABILIDAD_VUELTA_SUBSCRIPTION } else { 'taller-produccion-contabilidad-local' }),
  [string]$DemandaTopic = $(if ($env:TALLER_DEMANDA_TOPIC) { $env:TALLER_DEMANDA_TOPIC } else { 'taller-ventas-demanda-local' }),
  [string]$DemandaSubscription = $(if ($env:PUBSUB_DEMANDA_SUBSCRIPTION_ID) { $env:PUBSUB_DEMANDA_SUBSCRIPTION_ID } else { 'taller-produccion-demanda-local' }),
  [string]$ConfirmacionDemandaTopic = $(if ($env:TALLER_DEMANDA_CONFIRMACION_TOPIC) { $env:TALLER_DEMANDA_CONFIRMACION_TOPIC } else { 'taller-ventas-demanda-confirmacion-local' }),
  [string]$ConfirmacionDemandaSubscription = $(if ($env:PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID) { $env:PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID } else { 'taller-produccion-demanda-confirmacion-local' })
)

$ErrorActionPreference = 'Stop'
if (-not $env:PUBSUB_EMULATOR_HOST) {
  throw 'PUBSUB_EMULATOR_HOST es obligatorio. Este script se niega a operar fuera del emulador.'
}
if ($env:PUBSUB_EMULATOR_HOST -match 'googleapis\.com') {
  throw 'PUBSUB_EMULATOR_HOST parece apuntar a Google real; operación cancelada.'
}

$base = "http://$($env:PUBSUB_EMULATOR_HOST)/v1/projects/$ProjectId"
function Put-EmulatorResource([string]$Uri, [hashtable]$Body) {
  try {
    Invoke-RestMethod -Method Put -Uri $Uri -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Compress) | Out-Null
    Write-Host "CREADO $Uri"
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
      Write-Host "YA_EXISTE $Uri"
    } else {
      throw
    }
  }
}

Put-EmulatorResource "$base/topics/$IdaTopic" @{}
Put-EmulatorResource "$base/topics/$VueltaTopic" @{}
Put-EmulatorResource "$base/subscriptions/$IdaSubscription" @{ topic = "projects/$ProjectId/topics/$IdaTopic" }
Put-EmulatorResource "$base/subscriptions/$VueltaSubscription" @{ topic = "projects/$ProjectId/topics/$VueltaTopic" }
Put-EmulatorResource "$base/topics/$DemandaTopic" @{}
Put-EmulatorResource "$base/subscriptions/$DemandaSubscription" @{ topic = "projects/$ProjectId/topics/$DemandaTopic" }
Put-EmulatorResource "$base/topics/$ConfirmacionDemandaTopic" @{}
Put-EmulatorResource "$base/subscriptions/$ConfirmacionDemandaSubscription" @{ topic = "projects/$ProjectId/topics/$ConfirmacionDemandaTopic" }

Write-Host "EMULADOR_LISTO project=$ProjectId demandaSubscription=$DemandaSubscription confirmacionDemandaSubscription=$ConfirmacionDemandaSubscription"
