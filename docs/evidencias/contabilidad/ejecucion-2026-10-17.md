# Evidencia local ABC-252 / ABC-253 — 2026-10-17

## Alcance y entorno

Toda esta evidencia se obtuvo contra el **emulador local de Pub/Sub**, proyecto
ficticio `taller-local`. No se creó, borró, consumió ni confirmó ningún recurso
real; no se usaron las suscripciones de ningún grupo. La validación contra
Pub/Sub real queda pendiente hasta que existan recursos provisionados y permiso
explícito para usarlos.

Se usaron dos procesos separados:

- `produccion-service` real en `http://localhost:3102`, conectado a la base
  aislada `produccion_contabilidad_demo`;
- `simuladores/contabilidad/index.js`, con journal JSONL persistente.

El emulador se levantó con el perfil Docker, que ejecuta internamente:

```powershell
gcloud beta emulators pubsub start --project=taller-local --host-port=0.0.0.0:8085
$env:PUBSUB_EMULATOR_HOST='127.0.0.1:8085'
powershell.exe -ExecutionPolicy Bypass -File ./scripts/emulador-pubsub.ps1
```

El script creó solo estos recursos locales:

```text
taller-produccion-cerrada-local
taller-contabilidad-simulator-local
taller-contabilidad-resultados-local
taller-produccion-contabilidad-local
```

La migración 21 se aplicó tanto a la base habitual local como a la base aislada;
en esta última se ejecutaron las 14 migraciones desde cero. Los fixtures se
crearon con:

```powershell
$env:DB_DATABASE='produccion_contabilidad_demo'
npm.cmd run seed:contabilidad-demo
```

Auth real confirmó los roles existentes `Encargado de Producción` y `Supervisor`.
Se crearon cuentas temporales mediante `POST /users`, se inició sesión mediante
`POST /login`, y Producción comprobó cada sesión mediante `/me`. No se guardaron
tokens ni contraseñas en esta evidencia. Al terminar, las tres cuentas temporales
con prefijo `abc253.` se dieron de baja lógica mediante la API real; la operación
es recuperable y no afectó cuentas preexistentes.

Comandos de los procesos y verificaciones (las credenciales se leyeron en
memoria desde la configuración local y nunca se imprimieron):

```powershell
# Producción: variables del emulador + base aislada
$env:PORT='3102'
$env:DB_DATABASE='produccion_contabilidad_demo'
$env:PUBSUB_EMULATOR_HOST='127.0.0.1:8085'
$env:GCP_PROJECT_ID='taller-local'
$env:PUBSUB_ENABLED='true'
$env:PUBSUB_TOPIC_ID='taller-produccion-cerrada-local'
$env:PUBSUB_CONTABILIDAD_CONSUMER_ENABLED='true'
$env:PUBSUB_CONTABILIDAD_RESULTADOS_TOPIC_ID='taller-contabilidad-resultados-local'
$env:PUBSUB_CONTABILIDAD_RESULTADOS_SUBSCRIPTION_ID='taller-produccion-contabilidad-local'
npm.cmd run start

# Simulador, desde simuladores/contabilidad
$env:CONTABILIDAD_INPUT_SUBSCRIPTION_ID='taller-contabilidad-simulator-local'
$env:CONTABILIDAD_OUTPUT_TOPIC_ID='taller-contabilidad-resultados-local'
npm.cmd start

# Duplicados y consulta segura de evidencia
npm.cmd run publish:contabilidad-duplicate
npm.cmd run publish:contabilidad-response-duplicate
npm.cmd run verify:contabilidad-demo
```

## Logs correlacionados de ambos procesos

Caso válido, simulador:

```json
{"process":"contabilidad-simulator","action":"REQUEST_STORED","messageId":"1","eventId":"bcdbe37c-2e7c-4d35-9647-c7379059d09f","responseEventId":"6eacb84f-fb48-483e-a36c-f9a5918bca41","correlationId":"bf6dba72-9ec7-49fc-8c3d-08f2d8f8c44f"}
{"process":"contabilidad-simulator","action":"RESPONSE_SENT","messageId":"2","eventId":"6eacb84f-fb48-483e-a36c-f9a5918bca41","requestEventId":"bcdbe37c-2e7c-4d35-9647-c7379059d09f","correlationId":"bf6dba72-9ec7-49fc-8c3d-08f2d8f8c44f","estado":"RECIBIDO"}
```

Redelivery de esa respuesta, proceso Producción:

```json
{"codigo":"RESULTADO_CONTABLE_RECIBIDO","messageId":"9","eventId":"6eacb84f-fb48-483e-a36c-f9a5918bca41","cierreId":"1","resultado":"DUPLICADO","correlationId":"bf6dba72-9ec7-49fc-8c3d-08f2d8f8c44f","requestEventId":"bcdbe37c-2e7c-4d35-9647-c7379059d09f"}
```

Los dos procesos muestran el mismo `correlationId`; el `eventId` de la respuesta
es propio y su `requestEventId` apunta al evento de cierre original.

Caso rechazado, simulador:

```json
{"process":"contabilidad-simulator","action":"RESPONSE_SENT","messageId":"4","eventId":"5d607f7f-7496-455d-8060-ef1bf7eec717","requestEventId":"a5117517-eeac-4aac-9f68-3da8a0b46be8","correlationId":"17f365ce-94d0-4b33-b12d-c4ab072594c1","estado":"RECHAZADO"}
```

## Estados observados en PostgreSQL

Después de los casos normal y rechazado:

| Cierre | Orden | Antes | Después | Outbox | Inbox |
|---|---:|---|---|---|---|
| 1 | 1 | `PENDIENTE` | `RECIBIDO` | `PUBLICADO` | `PROCESADO` |
| 2 | 2 | `PENDIENTE` | `RECHAZADO` | `PUBLICADO` | `PROCESADO` |

La verificación devolvió `inbox_total=2` y `inbox_event_ids=2`. Después de
publicar dos veces el mismo request, esos contadores siguieron en 2 y el
simulador registró dos `REQUEST_DUPLICATE`, sin producir otra respuesta lógica.

## Interrupción entre guardar y responder

Primera ejecución, con `CONTABILIDAD_SIMULATOR_CRASH_AFTER_SAVE_ONCE=true`:

```json
{"process":"contabilidad-simulator","action":"REQUEST_STORED","messageId":"7","eventId":"a821543a-d865-4bc6-916a-975d7f883cd1","responseEventId":"0ee80155-2698-46bd-aaaf-6e0dfdf61d9f","correlationId":"b4c204be-c295-438a-9777-f61ed74144fc"}
{"process":"contabilidad-simulator","action":"CRASH_AFTER_SAVE","eventId":"a821543a-d865-4bc6-916a-975d7f883cd1"}
```

Antes de reiniciar: cierre 3 `PENDIENTE`, outbox `PUBLICADO`, sin inbox contable.
Al reiniciar con el mismo journal y el flag en `false`:

```json
{"process":"contabilidad-simulator","action":"RESPONSE_SENT","messageId":"8","eventId":"0ee80155-2698-46bd-aaaf-6e0dfdf61d9f","requestEventId":"a821543a-d865-4bc6-916a-975d7f883cd1","correlationId":"b4c204be-c295-438a-9777-f61ed74144fc","estado":"RECIBIDO"}
{"process":"contabilidad-simulator","action":"REQUEST_DUPLICATE","messageId":"7","eventId":"a821543a-d865-4bc6-916a-975d7f883cd1","responseEventId":"0ee80155-2698-46bd-aaaf-6e0dfdf61d9f","correlationId":"b4c204be-c295-438a-9777-f61ed74144fc"}
```

Después: cierre 3 `RECIBIDO`, inbox `PROCESADO`, `inbox_total=3` y
`inbox_event_ids=3`. La respuesta pendiente conservó su `eventId` y la redelivery
del request no generó una segunda respuesta lógica.

## Esperado vs. obtenido

| Caso | Esperado | Obtenido |
|---|---|---|
| Válido | 201, ida/vuelta, estado `RECIBIDO` | 201; outbox `PUBLICADO`; cierre `RECIBIDO`; correlación coincidente. |
| Rechazado | Regla cantidad conforme cero, `RECHAZADO` | 201 inicial; respuesta `RECHAZADO`; código `SIN_PRODUCCION_CONFORME`; estado final correcto. |
| Sin permiso | Supervisor recibe 403, sin efecto | HTTP 403 antes del caso rechazado; el cierre se creó solo con el Encargado. |
| Request duplicado | Una respuesta lógica | Dos publicaciones; dos `REQUEST_DUPLICATE`; contadores de inbox sin cambio. |
| Response duplicada | ACK e inbox/estado sin cambio | Log de Producción `resultado=DUPLICADO`; 3 filas y 3 `eventId` únicos antes/después. |
| Interrupción | Recuperar pendiente tras reinicio | `PENDIENTE` antes; `RECIBIDO` después; mismo response `eventId`; sin doble efecto. |

## Pruebas ejecutadas

```text
produccion-service build: PASÓ
suite completa sin flags de BD: 57 suites pasaron, 5 omitidas; 485 tests pasaron, 138 omitidos
ABC-252 con PostgreSQL real: 4 suites, 11 tests pasaron (4 del procesador/BD)
cierre-produccion.persistencia con PostgreSQL real: 49 tests pasaron
simulador: 3 tests pasaron
```

Los dos mensajes `ERROR [ExceptionsHandler]` vistos en la suite de cierre son
fallos inyectados deliberadamente para comprobar rollback; la suite terminó con
código 0 y 49/49 pruebas aprobadas.

Incidente de entorno resuelto: `node --test` falló inicialmente con
`Error: spawn EPERM`; se configuró `--test-isolation=none` y las mismas tres
pruebas pasaron en un solo proceso.

El cliente de Google emitió durante la demo la advertencia no bloqueante
`MetadataLookupWarning: received unexpected error = All promises were rejected`;
el transporte al emulador continuó y todos los mensajes/ACK fueron observados.

La cuarta prueba PostgreSQL ejecuta el consumidor con el procesador real: fuerza
una excepción al intentar el primer ACK después del commit, comprueba el NACK,
reentrega el mismo mensaje, observa ACK y `DUPLICADO`, y confirma una sola fila
de inbox y un único cambio de estado.
