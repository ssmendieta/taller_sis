# Evidencia de Integración ABC-243 — Simulador de Inventarios (Ida y Vuelta)

**Tarea:** [ABC-243](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-243) — *Construir simulador y prueba de ida/vuelta (5h)*  
**Componente:** `simuladores/inventarios/`  
**Entorno de pruebas:** Local con emulador oficial de Google Cloud Pub/Sub (`gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators`) y SQLite nativo de Node.js 22.

---

## 1. Requisitos Previos y Variables de Entorno

### Requisitos del Sistema
- Node.js `v22.20.0` (incluye `node:sqlite` nativo y test runner `node:test`).
- Docker / Docker Compose para el contenedor `taller_pubsub_emulator`.

### Variables de Entorno Configuradas (Sin Secretos)

```env
# Conexión al emulador
PUBSUB_EMULATOR_HOST=127.0.0.1:8085
GCP_PROJECT_ID=taller-local

# Recursos del Simulador de Inventarios
INVENTARIOS_INPUT_SUBSCRIPTION_ID=taller-inventarios-simulator-local
INVENTARIOS_OUTPUT_TOPIC_ID=taller-inventarios-respuestas-local
INVENTARIOS_STATE_PATH=./data/inventarios.db

# Configuración de Producción (Consumidor de Respuestas)
PUBSUB_TOPIC_ID=taller-solicitudes-material-local
PUBSUB_SUBSCRIPTION_ID=taller-produccion-inventarios-local
PUBSUB_CONSUMER_ENABLED=true
```

---

## 2. Topología de Topics y Suscripciones Utilizada

| Dirección | Recurso Pub/Sub | Nombre Asignado |
| :--- | :--- | :--- |
| **Ida (Producción $\rightarrow$ Inventarios)** | Topic de Solicitudes | `taller-solicitudes-material-local` |
| **Ida (Producción $\rightarrow$ Inventarios)** | Suscripción del Simulador | `taller-inventarios-simulator-local` |
| **Vuelta (Inventarios $\rightarrow$ Producción)** | Topic de Respuestas | `taller-inventarios-respuestas-local` |
| **Vuelta (Inventarios $\rightarrow$ Producción)** | Suscripción de Producción | `taller-produccion-inventarios-local` |

---

## 3. Comandos de Ejecución

### A. Arrancar Emulador Pub/Sub
```powershell
docker compose --profile emulator up -d pubsub-emulator
```

### B. Inicializar Topics y Suscripciones en el Emulador
```powershell
$env:PUBSUB_EMULATOR_HOST = '127.0.0.1:8085'
.\scripts\emulador-pubsub.ps1 `
  -ProjectId 'taller-local' `
  -IdaTopic 'taller-solicitudes-material-local' `
  -IdaSubscription 'taller-inventarios-simulator-local' `
  -VueltaTopic 'taller-inventarios-respuestas-local' `
  -VueltaSubscription 'taller-produccion-inventarios-local'
```

### C. Ejecutar Pruebas Automatizadas Unitarias y de Integración
```powershell
cd simuladores/inventarios
$env:PUBSUB_EMULATOR_HOST = '127.0.0.1:8085'
npm test
```

### D. Ejecutar Demostración E2E de Ida y Vuelta
```powershell
cd simuladores/inventarios
$env:PUBSUB_EMULATOR_HOST = '127.0.0.1:8085'
node demo-ida-vuelta.js
```

---

## 4. Evidencia de Ejecución de Pruebas Automatizadas

Resultado de la suite de pruebas en `simuladores/inventarios/`:

```text
TAP version 13
# Subtest: validarEntrada acepta una solicitud bien formada
ok 1 - validarEntrada acepta una solicitud bien formada
# Subtest: validarEntrada rechaza eventType no soportado (ej. MaterialesSolicitados.v1)
ok 2 - validarEntrada rechaza eventType no soportado (ej. MaterialesSolicitados.v1)
# Subtest: validarEntrada rechaza source que no sea produccion-service
ok 3 - validarEntrada rechaza source que no sea produccion-service
# Subtest: validarEntrada rechaza UUIDs invalidos
ok 4 - validarEntrada rechaza UUIDs invalidos
# Subtest: validarEntrada rechaza atributos de Pub/Sub discrepantes
ok 5 - validarEntrada rechaza atributos de Pub/Sub discrepantes
# Subtest: validarEntrada rechaza items vacios o repetidos
ok 6 - validarEntrada rechaza items vacios o repetidos
# Subtest: validarEntrada rechaza unidades invalidas o cantidades con mas de 4 decimales
ok 7 - validarEntrada rechaza unidades invalidas o cantidades con mas de 4 decimales
# Subtest: crearRespuesta genera evento de aceptacion APROBADA con version incrementada
ok 8 - crearRespuesta genera evento de aceptacion APROBADA con version incrementada
# Subtest: crearRespuesta genera evento de rechazo CANCELADA en modo rechazo
ok 9 - crearRespuesta genera evento de rechazo CANCELADA en modo rechazo
# Subtest: crearRespuesta genera rechazo automatico si un material tiene SIN_STOCK
ok 10 - crearRespuesta genera rechazo automatico si un material tiene SIN_STOCK
# Subtest: Recorrido real Pub/Sub (Ida y Vuelta con Emulador)
ok 11 - Recorrido real Pub/Sub (Ida y Vuelta con Emulador)
# Subtest: StateStore guarda una nueva solicitud e inserta la respuesta pendiente en SQLite
ok 12 - StateStore guarda una nueva solicitud e inserta la respuesta pendiente en SQLite
# Subtest: StateStore detecta solicitud duplicada y preserva el eventId original de la respuesta
ok 13 - StateStore detecta solicitud duplicada y preserva el eventId original de la respuesta
# Subtest: StateStore detecta conflicto si el mismo eventId llega con payload alterado
ok 14 - StateStore detecta conflicto si el mismo eventId llega con payload alterado
# Subtest: StateStore sobrevive a reinicio en disco y recupera respuestas pendientes
ok 15 - StateStore sobrevive a reinicio en disco y recupera respuestas pendientes
# Subtest: StateStore no marca como enviada una respuesta si falla la publicacion
ok 16 - StateStore no marca como enviada una respuesta si falla la publicacion
1..16
# tests 16
# pass 16
# fail 0
```

---

## 5. Recorrido Real de Ida y Vuelta Observado (`demo-ida-vuelta.js`)

### Caso A: Flujo Normal (Aceptación `APROBADA`)

#### 1. Solicitud emitida por Producción (`SolicitudMaterialAlmacen.v1`)
```json
{
  "eventId": "ae1becc8-ccb4-45e8-acb7-f451b5f19615",
  "eventType": "SolicitudMaterialAlmacen.v1",
  "occurredAt": "2026-10-18T17:45:26.471Z",
  "source": "produccion-service",
  "correlationId": "b6a76053-fae5-4774-a2c3-d9bd4de70bf2",
  "data": {
    "solicitudId": "45",
    "solicitudVersion": 1,
    "ordenId": 10,
    "ordenCodigo": "ORD-2026-0010",
    "solicitanteUsuarioId": "7",
    "fechaNecesaria": "2026-10-22",
    "items": [
      {
        "materialId": "3",
        "materialCodigo": "HAR-001",
        "materialNombre": "Harina de trigo especial",
        "cantidad": "50.0000",
        "unidad": "kg"
      }
    ]
  }
}
```
- **Pub/Sub `messageId` de solicitud:** `3`

#### 2. Consumo y persistencia en SQLite (`inventarios-demo.db`)
El simulador procesa el mensaje, realiza deduplicación canónica e inserta en SQLite:
```text
[SIMULADOR] Evento recibido: action=REQUEST_STORED solicitudId=45 eventId=ae1becc8-ccb4-45e8-acb7-f451b5f19615 pubsubMessageId=3
```

#### 3. Respuesta emitida por el Simulador (`SolicitudMaterialAlmacenEstadoActualizado.v1`)
```json
{
  "eventId": "9d21bcab-17ca-42bc-8770-2157a45a1895",
  "eventType": "SolicitudMaterialAlmacenEstadoActualizado.v1",
  "occurredAt": "2026-10-18T17:45:26.544Z",
  "source": "almacen-service",
  "correlationId": "b6a76053-fae5-4774-a2c3-d9bd4de70bf2",
  "data": {
    "solicitudId": "45",
    "solicitudVersion": 2,
    "requestEventId": "ae1becc8-ccb4-45e8-acb7-f451b5f19615",
    "ordenId": 10,
    "estadoAnterior": "PENDIENTE",
    "estadoNuevo": "APROBADA",
    "actualizadoAt": "2026-10-18T17:45:26.544Z",
    "motivo": "Materiales disponibles y reservados exitosamente en inventarios"
  }
}
```
- **Pub/Sub `messageId` de respuesta:** `4`
- El simulador actualiza su registro en SQLite a estado `SENT` con `messageId: 4`.

#### 4. Consumo en Producción
```text
  -> Respuesta recibida en Produccion con messageId: 4
  -> response eventId: 9d21bcab-17ca-42bc-8770-2157a45a1895
  -> requestEventId referido: ae1becc8-ccb4-45e8-acb7-f451b5f19615
  -> correlationId: b6a76053-fae5-4774-a2c3-d9bd4de70bf2
  -> estadoNuevo: APROBADA
  -> solicitudVersion: 2
```

---

### Caso B: Redelivery de Solicitud (Idempotencia y Deduplicación)

Se reenvió a Pub/Sub la misma solicitud de material con el mismo `eventId: ae1becc8-ccb4-45e8-acb7-f451b5f19615` (nuevo `messageId: 5` asignado por Pub/Sub):
```text
[SIMULADOR] Evento recibido: action=REQUEST_DUPLICATE solicitudId=45 eventId=ae1becc8-ccb4-45e8-acb7-f451b5f19615 pubsubMessageId=5
```
- El simulador confirmó el mensaje (`ACK`) inmediatamente.
- Reutilizó la respuesta previa persistida sin publicar un nuevo evento ni duplicar efectos en base de datos.

---

### Caso C: Solicitud Rechazada (Rechazo `CANCELADA`)

Se emitió una solicitud con material marcado como `SIN_STOCK` (`materialCodigo: "MAT-SIN_STOCK-99"`, `solicitudId: 46`, `eventId: 8d4035b0-d8e8-41de-81a2-4a8fcc7fcde6`, `messageId: 6`).

- **Respuesta generada por el Simulador:**
```json
{
  "eventId": "2932bd24-60f4-4fa0-890f-919796f9fa53",
  "eventType": "SolicitudMaterialAlmacenEstadoActualizado.v1",
  "occurredAt": "2026-10-18T17:45:28.090Z",
  "source": "almacen-service",
  "correlationId": "0d204a11-5369-450f-bc1e-141a0210fec6",
  "data": {
    "solicitudId": "46",
    "solicitudVersion": 2,
    "requestEventId": "8d4035b0-d8e8-41de-81a2-4a8fcc7fcde6",
    "ordenId": 10,
    "estadoAnterior": "PENDIENTE",
    "estadoNuevo": "CANCELADA",
    "actualizadoAt": "2026-10-18T17:45:28.090Z",
    "motivo": "Stock insuficiente en almacen para cubrir los materiales solicitados"
  }
}
```
- **Pub/Sub `messageId` de respuesta:** `7`.
- **Producción:** Recibió y procesó el cambio a `CANCELADA`.

---

## 6. Persistencia y Tolerancia a Fallos en SQLite (`node:sqlite`)

1. **Atomicidad de guardado:** En `StateStore.receive()`, la inserción de la solicitud recibida en la tabla `inbox` y la inserción de la respuesta correlacionada en `responses` (`status = 'PENDING'`) se ejecuta dentro de un bloque transaccional `BEGIN IMMEDIATE ... COMMIT;`.
2. **Recuperación tras caídas:** Si el proceso finaliza de forma abrupta antes de publicar la respuesta, al reiniciar `index.js` ejecuta `flushPending()`, el cual recupera las respuestas con `status = 'PENDING'` ordenadas por `created_at ASC` y las despacha preservando su `eventId` original.
3. **Registro de `messageId`:** Solo después de que `client.topic().publishMessage()` resuelve con éxito, se invoca `store.markSent(responseEventId, messageId)`, fijando `status = 'SENT'` y la fecha UTC.
4. **Protección contra mensajes venenosos:** Errores irrecuperables de sintaxis o esquema (`MensajePermanenteError`) son confirmados (`ACK`) emitiendo un diagnóstico `REQUEST_REJECTED` en logs para evitar bucles infinitos en Pub/Sub.

---

## 7. Limitaciones y Alcance

- Las pruebas se ejecutaron íntegramente sobre el emulador local oficial de Google Cloud Pub/Sub, sin requerir credenciales de Google Cloud ni contactar infraestructura en la nube.
- La persistencia local en SQLite utiliza la biblioteca estándar nativa de Node.js `node:sqlite`, eliminando dependencias de compilación en C++ en Windows.
- No se modificaron archivos fuera del alcance asignado (`simuladores/inventarios/` y `docs/evidencias/inventarios/`).

---

## 8. Evidencia E2E con backend real

Esta verificación ejecutó el ciclo completo con el backend real de NestJS (`services/produccion-service/`), el simulador de inventarios (`simuladores/inventarios/index.js`), el emulador de Pub/Sub (`127.0.0.1:8085`) y una base de datos PostgreSQL completamente aislada.

### A. Aislamiento de Base de Datos y Entorno
- **Base de datos de pruebas aislada:** `produccion_test_abc243`.
- Se verificó previamente que la base no existía antes de ser creada para este ensayo (`CREATE DATABASE produccion_test_abc243;`).
- Se aplicaron las 14 migraciones TypeORM oficiales exclusivamente sobre `produccion_test_abc243`, dejando la base compartida `produccion_db` intacta.
- **Microservicio de Producción:** Ejecutado en puerto `3002`, conectado a `produccion_test_abc243` y al emulador local con `PUBSUB_ENABLED=true` y `PUBSUB_CONSUMER_ENABLED=true`.
- **Servicio Auth:** Mock local en `http://127.0.0.1:3001` respondiendo al endpoint `/me` exigido por `PermisoProduccionGuard` con los permisos `materiales.solicitar` y `materiales.consultar_disponibilidad`.
- **Simulador:** Ejecutado en paralelo conectado a `taller-inventarios-simulator-local` y `taller-inventarios-respuestas-local`.

### B. Comando de Reproducción
```powershell
cd simuladores/inventarios
node e2e-produccion-live.js
```

### C. Métricas y Datos Comprobados en la Ejecución Viva

```json
{
  "resultado": "COMPLETO",
  "database": "produccion_test_abc243",
  "solicitudId": "1",
  "ordenId": 1,
  "estadoAntes": "PENDIENTE",
  "versionAntes": 1,
  "estadoDespues": "APROBADA",
  "versionDespues": 2,
  "solicitudEventId": "354d0180-e4e7-46a1-bf16-15b74a43518b",
  "solicitudPubSubMessageId": "8",
  "respuestaEventId": "1cb18030-897e-4678-951c-039f3451fed6",
  "respuestaPubSubMessageId": "9",
  "correlationId": "5d9d0940-a5c0-464b-95d9-b48370acf826",
  "inboxEstado": "PROCESADO"
}
```

### D. Trazabilidad Documental y Persistencia Verificada

1. **Petición HTTP a Producción (ABC-73):**
   - Endpoint: `POST http://127.0.0.1:3002/solicitudes-material`
   - Payload: `{"ordenId": 1, "items": [{"materialId": 1, "cantidad": 20.0, "unidad": "kg"}]}`
   - Respuesta HTTP: `201 Created`, `id = 1`, `estado = PENDIENTE`, `solicitudVersion = 1`.
2. **Publicación Outbox (Producción $\rightarrow$ Pub/Sub):**
   - Fila en `eventos_outbox`: `event_id = 354d0180-e4e7-46a1-bf16-15b74a43518b`, `event_type = SolicitudMaterialAlmacen.v1`.
   - El worker `OutboxPublicadorService` reclamó la fila y publicó al topic `taller-solicitudes-material-local`.
   - Pub/Sub devolvió `messageId: 8`. La fila pasó a `estado = PUBLICADO`.
3. **Consumo y Respuesta del Simulador (Inventarios):**
   - El simulador recibió `messageId: 8`.
   - Persistió en SQLite (`inventarios-live-e2e.db`) en una transacción atómica el inbox y la respuesta.
   - Publicó `SolicitudMaterialAlmacenEstadoActualizado.v1` (`eventId: 1cb18030-897e-4678-951c-039f3451fed6`) al topic `taller-inventarios-respuestas-local` obteniendo `messageId: 9`.
   - Marcó en SQLite la respuesta como `SENT` con `message_id: 9`.
4. **Consumo Inbox y Actualización en BD (Producción):**
   - El consumidor real `PubSubInventarioConsumerService` recibió el mensaje `messageId: 9`.
   - `ProcesadorRespuestaInventarioService` validó el contrato y la correlación con la solicitud original.
   - Insertó en `eventos_inbox` con `estado = PROCESADO` y `message_id = 9`.
   - Actualizó la fila en `solicitudes_material`:
     - `estado`: `'PENDIENTE'` $\rightarrow$ `'APROBADA'`
     - `solicitud_version`: `1` $\rightarrow$ `2`
     - `estado_actualizado_en`: `2026-10-18T20:09:13.607Z`
     - `motivo_estado`: `'Materiales disponibles y reservados exitosamente en inventarios'`

