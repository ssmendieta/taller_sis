# ABC-113: disponibilidad asíncrona por orden

## Recorrido y contrato reutilizado

La pantalla existente `OrdenDetallePage.jsx`, en `/ordenes/:id`, consulta:

- `POST /api/produccion/ordenes/:id/disponibilidad-materiales/consultar`: Bearer, sin body, permiso `materiales.consultar_disponibilidad`, respuesta **202 PENDIENTE**.
- `GET /api/produccion/ordenes/:id/disponibilidad-materiales`: Bearer, permiso `ordenes.consultar`. Devuelve el snapshot persistido, no el inventario local de Producción.

El Gateway quita `/api/produccion` antes de enviar al controlador `ordenes`.
El rol Encargado de Producción ya recibe ambos permisos por las migraciones de Auth; no se agregaron permisos.

El POST bloquea la orden y guarda consulta, sus materiales y el evento outbox en una transacción. El publicador existente envía `DisponibilidadMaterialSolicitada.v1` a `PUBSUB_TOPIC_ID`. Inventarios responde con `DisponibilidadMaterialRespondida.v1`. El consumidor existente lee `PUBSUB_SUBSCRIPTION_ID`, valida `requestEventId`, `correlationId`, orden, consulta, versión y materiales/unidades, y confirma inbox y snapshot juntos antes del ACK.

En el entorno local comprobado, se reutilizan:

| Configuración | Valor local |
| --- | --- |
| Proyecto | `taller-local` |
| Topic de ida y vuelta | `taller-inventarios-local` |
| Suscripción del simulador | `taller-inventarios-simulator-local` |
| Suscripción de Producción | `taller-produccion-inventarios-local` |

Son las dos suscripciones, no dos consumidores de una misma suscripción, las que permiten recibir ambas direcciones en el topic compartido. Los consumidores ignoran los eventos de solicitud/respuesta que no les corresponden.

Los eventos `SolicitudMaterialAlmacen.v1` y `SolicitudMaterialAlmacenEstadoActualizado.v1` siguen siendo del flujo distinto de solicitudes de material: no se usan como respuesta de disponibilidad ni se cambió su contrato.

## Pendiente, errores y reintento

- La pantalla sigue consultando mientras esté pendiente, incluso al volver a abrir el detalle. Bloquea doble clic y descarta respuestas tardías de otra orden.
- Solo `RESPONDIDA`, guardada por el consumidor, muestra las cantidades y el aviso de respuesta. Un ACK del publicador no equivale a respuesta de Inventarios.
- La API agrega `correlation_id`, `publicacion`, `error_respuesta` y `respuesta_esperada_hasta`. No introduce nuevos estados de consulta ni eventos.
- Después de 20 segundos sin respuesta, o si hay error de publicación/respuesta, se permite reintentar. La espera no elimina la consulta; una respuesta válida tardía también puede completarla automáticamente.
- El reintento vuelve a encolar el mismo evento y consulta, conservando `eventId` y correlación. No toma un lease de publicación activo. Una nueva consulta después de una respuesta sí usa la siguiente versión existente.
- El contrato v1 no define un evento de error de Inventarios. Una respuesta que viola el contrato pero identifica exactamente una consulta pendiente deja un diagnóstico persistido y no guarda cantidades parciales. Una correlación ajena no modifica esa consulta.
- El simulador conserva respuesta y `eventId` en su SQLite antes del ACK; después de reiniciar o recibir otra entrega reutiliza esa respuesta.
- El simulador exige stock explícito mediante la variable ya existente `INVENTARIOS_STOCK_JSON`. Si falta un material, registra `REQUEST_RETRY` y no inventa cantidades ni interpreta el error como cero. Esta configuración corresponde al inventario del entorno de pruebas; no demuestra existencias de un Inventarios externo de producción.

La receta inactiva y las condiciones de inicio permanecen vigentes. Consultar disponibilidad no inicia producción, modifica recetas ni descuenta existencias.

## Ejecutar localmente (PowerShell desde la raíz)

La migración nueva es `1710000000022-DisponibilidadReintentos`; la anterior es `1710000000021-ResultadoContableCierre`. Agrega únicamente diagnóstico y vencimiento de espera a la consulta existente.

```powershell
Push-Location services/produccion-service
$env:DB_DATABASE = 'produccion_db'
npm run migration:show
npm run migration:run
Pop-Location

docker compose --profile emulator up -d pubsub-emulator
$env:PUBSUB_EMULATOR_HOST = '127.0.0.1:8085'
.\scripts\emulador-pubsub.ps1 -ProjectId 'taller-local' -IdaTopic 'taller-inventarios-local' -IdaSubscription 'taller-inventarios-simulator-local' -VueltaTopic 'taller-inventarios-local' -VueltaSubscription 'taller-produccion-inventarios-local'

$env:PUBSUB_ENABLED = 'true'
$env:GCP_PROJECT_ID = 'taller-local'
$env:PUBSUB_TOPIC_ID = 'taller-inventarios-local'
$env:PUBSUB_CONSUMER_ENABLED = 'true'
$env:PUBSUB_SUBSCRIPTION_ID = 'taller-produccion-inventarios-local'
$env:PUBSUB_EMULATOR_HOST = 'host.docker.internal:8085'
$env:OUTBOX_POLL_INTERVAL_MS = '1000'
docker compose up -d --no-deps --build produccion-service frontend
```

Usa los valores DB_HOST/DB_PORT de tu entorno para alcanzar PostgreSQL desde Windows; `DB_DATABASE` debe ser **produccion_db**, no Auth ni Logística. El comando anterior presupone Auth y Gateway ya levantados. Si no lo están, inicia el stack según el README.

En otra terminal, desde la raíz, carga el JSON proporcionado por Inventarios para este entorno, por código o ID de material y en la unidad que figura en la consulta. No completes cantidades a partir de lo requerido por la receta:

```powershell
Push-Location simuladores/inventarios
node --version
npm ci
$env:PUBSUB_EMULATOR_HOST = '127.0.0.1:8085'
$env:GCP_PROJECT_ID = 'taller-local'
$env:INVENTARIOS_INPUT_SUBSCRIPTION_ID = 'taller-inventarios-simulator-local'
$env:INVENTARIOS_OUTPUT_TOPIC_ID = 'taller-inventarios-local'
$env:INVENTARIOS_STOCK_JSON = Read-Host 'JSON de existencias configuradas de Inventarios, por código de material'
npm start
```

El simulador usa `node:sqlite`: requiere Node **22.13 o posterior**. No inicies dos procesos con la misma suscripción para esta verificación. No cambies el estado SQLite mientras el proceso está activo.

## Qué observar

1. Entra con el permiso de consulta y abre la orden. Pulsa **Solicitar disponibilidad**: estado pendiente y botón deshabilitado; las columnas no presentan cantidades inventadas.
2. Producción registra `PUBLICACION_OUTBOX_CONFIRMADA`, con `eventId` y `correlationId`.
3. El simulador registra `AVAILABILITY_RESPONSE_SENT`, con `requestEventId`, `eventId` de respuesta, `consultaId` y la misma correlación.
4. Producción registra `RESPUESTA_INVENTARIO_RECIBIDA`, resultado `PROCESADO`. El GET devuelve `RESPONDIDA` y los valores recibidos; la pantalla se actualiza sola.
5. Al cerrar y volver a abrir la orden, permanecen los valores persistidos. Una respuesta repetida registra `DUPLICADO` y no cambia el snapshot.
6. Sin simulador, la consulta sigue pendiente y, después de 20 segundos, ofrece **Reintentar disponibilidad**. Al arrancarlo se procesa el mensaje pendiente. Un fallo de publicación registra `PUBLICACION_OUTBOX_FALLIDA`; no se muestra éxito ni se pierde el evento.
7. `ORD-2026-00005` conserva su receta inactiva y el inicio bloqueado.

```powershell
docker compose logs -f --tail 100 produccion-service
```

## Comprobaciones automatizadas

```powershell
Push-Location frontend
npm run test:disponibilidad
node --test --test-concurrency=1 scripts/*.test.mjs
npm run build
Pop-Location

Push-Location simuladores/inventarios
npm test
Pop-Location

Push-Location services/produccion-service
npm test -- --runInBand
npm run build
$env:DISPONIBILIDAD_DB_REAL = '1'
$env:DB_DATABASE = 'produccion_db'
$env:PUBSUB_EMULATOR_HOST = '127.0.0.1:8085'
npm test -- --runInBand disponibilidad.persistencia
Pop-Location
```

La prueba de broker crea un schema PostgreSQL y un proyecto del emulador aislados, usa los mismos nombres de topic/suscripciones, ejecuta el publicador, consumidor y proceso del simulador reales y limpia esos recursos. Comprueba fallo de publicación, recuperación, consultas simultáneas, unidades distintas, correlación y redelivery. Sus cantidades son fixtures exclusivos de prueba, sin modificar las órdenes ni el stock del entorno del usuario. La prueba del simulador de solicitudes de material anterior puede omitirse si su topic específico no está creado; la nueva prueba de disponibilidad exige el emulador activo.

La revisión visual usa el componente y estilos reales con fixtures de prueba: escritorio 1440/1024/768 y móvil 767/390/320 px, con tabla desplazable y controles sin solapamiento.

## Archivos de esta corrección y resultados

Frontend:

- `frontend/src/pages/OrdenDetallePage.jsx`: conecta el seguimiento y reorganiza exclusivamente el panel de materiales.
- `frontend/src/hooks/useDisponibilidadOrden.js`: lectura inicial, POST, polling, errores, reintento, correlación y cancelación al cambiar de orden/desmontar.
- `frontend/src/styles/disponibilidad-orden.css`: estilos limitados al panel, con Grid y tabla desplazable.
- `frontend/scripts/disponibilidad-orden.test.mjs` y `frontend/package.json`: 10 casos específicos y comando `test:disponibilidad`.

Producción (rutas relativas a `services/produccion-service/src/`):

- `ordenes/ordenes.service.ts`: diagnóstico del envío y reencolado transaccional del mismo evento.
- `integraciones/disponibilidad/entities/consulta-disponibilidad.entity.ts`: espera y diagnóstico persistidos.
- `database/migrations/1710000000022-DisponibilidadReintentos.ts`: agrega esas dos columnas sin modificar los estados ni contratos.
- `integraciones/inbox/procesador-respuesta-inventario.service.ts`: registra rechazo solo cuando todos los identificadores coinciden; una respuesta válida limpia el error.
- `integraciones/inbox/pubsub-inventario-consumer.service.ts`: ignora solicitudes propias del topic compartido.
- `ordenes/ordenes.disponibilidad-asincrona.spec.ts`, `ordenes/ordenes.disponibilidad.http.spec.ts`, `integraciones/inbox/procesador-disponibilidad.service.spec.ts`, `integraciones/inbox/pubsub-inventario-consumer.service.spec.ts` e `integraciones/disponibilidad/disponibilidad.persistencia.spec.ts`: envío, permisos HTTP, correlación, rechazo, publicación real y deduplicación.
- `ordenes/ordenes.flujo.spec.ts`, `ordenes/ordenes.precondiciones.spec.ts` y `ordenes/ordenes.service.spec.ts`: adapta fixtures al diagnóstico adicional; mantiene las comprobaciones de inicio existentes.

Simulador:

- `simuladores/inventarios/contract.js`: exige stock explícito válido, sin asumir disponibilidad.
- `simuladores/inventarios/index.js` y `simuladores/inventarios/state-store.js`: persisten y reutilizan respuestas de disponibilidad en SQLite.
- `simuladores/inventarios/contract.test.js`: stock ausente/inválido e identidad de respuesta después de reiniciar.

Documentación: este archivo y `ABC-278-disponibilidad-local.md`, corregido para eliminar la disponibilidad ficticia por defecto.

Resultados locales: **505 pruebas de Producción aprobadas**, 153 omitidas por sus flags/dependencias externas; **123 de frontend aprobadas**; **19 del simulador aprobadas**, una prueba anterior de otro topic omitida. Habilitando PostgreSQL y emulador, **8 pruebas de disponibilidad persistida y consumidor aprobadas**, incluyendo el recorrido real del broker. Ambas compilaciones terminaron correctamente y `git diff --check` no detectó errores. Auth confirma ambos permisos para Encargado de Producción. No se aplicó la migración a la base habitual ni se recrearon los servicios: hay que ejecutar los comandos de arranque anteriores para probar la pantalla con esta versión.
