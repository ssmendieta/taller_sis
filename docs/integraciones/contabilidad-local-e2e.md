# Demo local Contabilidad v1 (ABC-252 / ABC-253)

Esta guía opera **solo con el emulador de Pub/Sub**. Ningún comando crea, borra,
consume ni confirma recursos de Google Cloud reales.

## Recursos locales configurables

| Dirección | Topic local predeterminado | Suscripción local predeterminada |
|---|---|---|
| Producción → Contabilidad | `taller-produccion-cerrada-local` | `taller-contabilidad-simulator-local` |
| Contabilidad → Producción | `taller-contabilidad-resultados-local` | `taller-produccion-contabilidad-local` |

Los cinco nombres, incluido el proyecto `taller-local`, se pueden cambiar con
`TALLER_PUBSUB_PROJECT_ID`, `TALLER_CONTABILIDAD_IDA_TOPIC`,
`TALLER_CONTABILIDAD_IDA_SUBSCRIPTION`, `TALLER_CONTABILIDAD_VUELTA_TOPIC` y
`TALLER_CONTABILIDAD_VUELTA_SUBSCRIPTION` antes de ejecutar el script.

## 1. Emulador e infraestructura

En una terminal con Google Cloud CLI y Java instalados:

```powershell
gcloud beta emulators pubsub start --project=taller-local --host-port=127.0.0.1:8085
```

Alternativa equivalente, si no hay CLI/Java local: el perfil `emulator` ejecuta
ese mismo comando dentro de la imagen oficial de Google Cloud CLI:

```powershell
docker compose --profile emulator up -d pubsub-emulator
```

En otra terminal:

```powershell
$env:PUBSUB_EMULATOR_HOST='127.0.0.1:8085'
$env:TALLER_PUBSUB_PROJECT_ID='taller-local'
./scripts/emulador-pubsub.ps1
```

El script aborta si falta `PUBSUB_EMULATOR_HOST` o si parece apuntar a Google.

## 2. Migración y servicio de Producción

```powershell
cd services/produccion-service
npm.cmd run migration:run
$env:PUBSUB_EMULATOR_HOST='127.0.0.1:8085'
$env:GCP_PROJECT_ID='taller-local'
$env:PUBSUB_ENABLED='true'
$env:PUBSUB_TOPIC_ID='taller-produccion-cerrada-local'
$env:PUBSUB_CONTABILIDAD_CONSUMER_ENABLED='true'
$env:PUBSUB_CONTABILIDAD_RESULTADOS_TOPIC_ID='taller-contabilidad-resultados-local'
$env:PUBSUB_CONTABILIDAD_RESULTADOS_SUBSCRIPTION_ID='taller-produccion-contabilidad-local'
$env:PUBSUB_CONSUMER_ENABLED='false'
npm.cmd run start:dev
```

`PUBSUB_CONSUMER_ENABLED=false` mantiene apagado el consumidor de Inventarios;
la demo usa una suscripción contable separada.

## 3. Simulador como segundo proceso

```powershell
cd simuladores/contabilidad
npm.cmd install
$env:PUBSUB_EMULATOR_HOST='127.0.0.1:8085'
$env:GCP_PROJECT_ID='taller-local'
$env:CONTABILIDAD_INPUT_SUBSCRIPTION_ID='taller-contabilidad-simulator-local'
$env:CONTABILIDAD_OUTPUT_TOPIC_ID='taller-contabilidad-resultados-local'
$env:CONTABILIDAD_STATE_PATH="$PWD/data/state.jsonl"
npm.cmd start
```

El journal JSONL persiste tanto el inbox como la respuesta pendiente. Primero se
añade y sincroniza `RECEIVED`, luego se hace ACK, se publica la respuesta y se
añade `SENT`. Una caída después de publicar pero antes de guardar `SENT` puede
republicar el mismo mensaje lógico; conserva el mismo `eventId`, por lo que el
inbox de Producción garantiza un solo efecto.

## 4. Casos funcionales

Obtenga tokens mediante `POST /login` usando cuentas reales del sistema. El
Encargado de Producción posee `ordenes.finalizar_cancelar`; Supervisor no lo
posee. No incluya credenciales en la evidencia.

1. Finalice una orden con el flujo funcional existente y ejecute
   `POST /cierres-produccion` con el token autorizado.
2. Para `RECIBIDO`, use una orden cuyo snapshot tenga cantidad conforme mayor a
   cero. Para `RECHAZADO`, use cantidad conforme igual a cero.
3. Repita el POST con Supervisor y compruebe HTTP 403 sin filas nuevas.
4. Para una redelivery, publique dos veces el mismo payload y atributos en el
   topic local de ida; el journal tendrá un solo `RECEIVED` lógico.
5. Para interrupción, arranque una vez con
   `CONTABILIDAD_SIMULATOR_CRASH_AFTER_SAVE_ONCE=true`. Debe terminar con código
   86 después de persistir. Reinícielo con el flag en `false`; reenviará la
   respuesta pendiente antes de comenzar a consumir.

Consultas de verificación (sin datos secretos):

```sql
SELECT id, orden_id, estado_contable, resultado_contable_event_id,
       resultado_contable_en, codigo_rechazo_contable
FROM cierres_produccion ORDER BY id DESC;

SELECT event_id, correlation_id, event_type, estado, message_id, detalle
FROM eventos_inbox
WHERE event_type = 'RegistroContableResultado.v1'
ORDER BY recibido_en DESC;
```

La validación con Pub/Sub real queda pendiente hasta que existan topics y
suscripciones provisionados por quien tenga permisos. Esta guía no autoriza
consumo ni ACK sobre ninguna suscripción real.
