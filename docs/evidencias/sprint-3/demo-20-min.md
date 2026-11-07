# Demo del Sprint 3 — guion de 20 minutos

Presenta el **Product Owner**. Un compañero opera el equipo y otro controla el
tiempo. La selección de HU y su justificación está en
[README.md § 2](README.md#2-hu-elegidas-para-la-demo).

| Bloque | Tiempo | Contenido |
| --- | --- | --- |
| 1. Contexto | 00:00–02:00 (2 min) | Problema, arquitectura y alcance del Sprint 3 |
| 2. Producción | 02:00–07:00 (5 min) | ABC-74 pérdidas de materia prima; ABC-70 verificación de materiales |
| 3. Logística | 07:00–12:00 (5 min) | ABC-115 recursos y vigencia; ABC-368 ruta; ABC-374 despacho y entregas |
| 4. Integración adicional | 12:00–16:00 (4 min) | ABC-122 demanda por Pub/Sub: inbox, duplicado y rechazo |
| 5. Evidencias y cierre | 16:00–20:00 (4 min) | Diagramas, Pub/Sub real, Docker, pruebas, commits y pendientes |

## 1. Reglas

- Todo lo que se ejecuta en vivo usa el entorno Docker local. Lo **simulado** se
  dice en voz alta: el emulador de Pub/Sub y la copia de recursos cargada por SQL.
- Las capturas reales (Pub/Sub de Google, Docker) se muestran en el bloque 5.
  No se presentan capturas del emulador como si fueran de Google.
- Si algo falla, se aplica el plan B del bloque y no se depura en vivo.

## 2. Preparación (antes de la demo)

Hacerla el día anterior y repetir los pasos 1 y 5 una hora antes. En los
ejemplos, `2026-11-12` es la fecha de la demo: reemplazarla en todos los pasos.

### 2.1 Entorno

1. Copiar `.env.example` a `.env` y completar credenciales sin subirlas al repositorio.
2. Levantar el emulador y crear el topic y la suscripción de la demanda. El
   emulador no los crea solo:

   ```powershell
   docker compose --profile emulator up -d pubsub-emulator
   $emu = 'http://localhost:8085/v1/projects/taller-local'
   Invoke-RestMethod -Method Put -Uri "$emu/topics/taller-ventas-demanda-local"
   Invoke-RestMethod -Method Put -Uri "$emu/subscriptions/taller-produccion-demanda-local" -ContentType 'application/json' -Body '{"topic":"projects/taller-local/topics/taller-ventas-demanda-local"}'
   ```

3. En `.env`, activar el consumidor de demanda contra el emulador (detalle en
   [pubsub-entorno.md](../../integraciones/pubsub-entorno.md)):
   `GCP_PROJECT_ID=taller-local`, `PUBSUB_EMULATOR_HOST=pubsub-emulator:8085`,
   `PUBSUB_DEMANDA_CONSUMER_ENABLED=true` y
   `PUBSUB_DEMANDA_SUBSCRIPTION_ID=taller-produccion-demanda-local`.
4. Levantar todo y comprobar la salud:

   ```powershell
   docker compose --profile full up -d --build
   docker compose ps
   Invoke-RestMethod http://localhost:3002/health
   Invoke-RestMethod http://localhost:3002/health/database
   Invoke-RestMethod http://localhost:3003/health
   ```

   Abrir `http://localhost:5173`. La captura de `docker compose ps`, los health
   checks y el frontend es la evidencia de ABC-403.

### 2.2 Datos de Producción (ABC-74 y ABC-70)

Con el usuario Encargado de Producción del seed (`produccion@taller.local`):

1. Una receta con `unidad_producto` **kg** y sus materiales.
2. Una orden **ORD-DEMO-A** en curso, para registrar pérdidas.
3. Para ABC-70, una orden planificada **ORD-DEMO-B** cuyo material falte en
   Inventarios (simulador `simuladores/inventarios`; ver [ABC-312](ABC-312.md)).
4. Una orden **ORD-DEMO-C** con lotes conformes en kg, que alimenta la
   solicitud de salida de Logística.

### 2.3 Datos de Logística (ABC-115, ABC-368 y ABC-374)

Con el usuario Encargado de Logística (`logistica@taller.local`):

1. En **Solicitudes de salida** (`/logistica/inicio`), crear una solicitud para
   ORD-DEMO-C. En **Boletas** (`/logistica/boletas/nueva`), crear dos boletas y
   **emitirlas**. La carga total debe ser menor a 1500 kg.
2. Cargar una copia de recursos del ERP para la fecha. Es una **prueba simulada**:
   el entorno no tiene ERP ni simulador del ERP. Así la ruta usa la copia de
   respaldo (ABC-352/353):

   ```powershell
   docker exec -i taller_postgres psql -U <DB_USERNAME del .env> -d logistica_db -c "
   INSERT INTO recursos_externos_snapshots (fecha, version, generado_en, sincronizado_en, datos)
   VALUES ('2026-11-12', 'recursos-logisticos.v1', NOW(), NOW(), '{
     \"version\": \"recursos-logisticos.v1\", \"fecha\": \"2026-11-12\", \"generadoEn\": \"2026-11-11T21:00:00.000Z\",
     \"vehiculos\": [
       {\"idExterno\": \"VEH-01\", \"placa\": \"2345-ABC\", \"descripcion\": \"Camión furgón\", \"capacidad\": {\"valor\": \"1500.0000\", \"unidad\": \"kg\"}, \"disponible\": true},
       {\"idExterno\": \"VEH-02\", \"placa\": \"3456-BCD\", \"descripcion\": null, \"capacidad\": {\"valor\": \"800.0000\", \"unidad\": \"kg\"}, \"disponible\": false}],
     \"choferes\": [
       {\"idExterno\": \"CHO-12\", \"nombre\": \"Juan Pérez\", \"licenciaCategoria\": \"C\", \"disponible\": true},
       {\"idExterno\": \"CHO-07\", \"nombre\": \"Ana Rojas\", \"licenciaCategoria\": null, \"disponible\": false}]
   }'::jsonb)
   ON CONFLICT (fecha) DO UPDATE SET datos = EXCLUDED.datos, generado_en = EXCLUDED.generado_en, sincronizado_en = EXCLUDED.sincronizado_en;"
   ```

3. Crear la ruta por API. La pantalla de planificación (CA-05 de ABC-368) está
   pendiente. Las validaciones de ABC-371 (disponibilidad, solapamientos y
   capacidad) se aplican igual:

   ```powershell
   $login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType 'application/json' -Body (@{ correo = 'logistica@taller.local'; password = '<contraseña del seed>' } | ConvertTo-Json)
   $h = @{ Authorization = "Bearer $($login.accessToken)" }
   $ruta = @{ grupoId = $null; fechaProgramada = '2026-11-12'; vehiculoExternoId = 'VEH-01'; choferExternoId = 'CHO-12'
     paradas = @(@{ destino = 'Tienda Central'; boletaIds = @('<id boleta 1>') }, @{ destino = 'Sucursal Norte'; boletaIds = @('<id boleta 2>') }) } | ConvertTo-Json -Depth 5
   Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/logistica/rutas -Headers $h -ContentType 'application/json' -Body $ruta
   ```

   Respuesta esperada: ruta `PLANIFICADA` con dos paradas. Anotar su id.
4. Comprobar que la ruta aparece en **Historial de rutas** y que su detalle abre
   con el panel **Despachar ruta**.

### 2.4 Mensaje de demanda (ABC-122)

Preparar el mensaje en la consola que se usará en vivo. `productoCodigo` debe
existir en Producción:

```powershell
$emu = 'http://localhost:8085/v1/projects/taller-local'
$evento = @{ eventId = [guid]::NewGuid().ToString(); eventType = 'DemandaRegistrada.v1'; occurredAt = (Get-Date).ToUniversalTime().ToString('o')
  source = 'ventas-service'; correlationId = [guid]::NewGuid().ToString()
  data = @{ origen = 'VENTAS'; demandaExternaId = 'PED-DEMO-001'; fechaRequerida = '2026-11-20'
    items = @(@{ productoCodigo = '<código de producto>'; cantidad = '40.0000'; unidad = 'kg' }) } } | ConvertTo-Json -Depth 6 -Compress
$cuerpo = @{ messages = @(@{ data = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($evento)) }) } | ConvertTo-Json -Depth 4
```

### 2.5 Pestañas abiertas antes de empezar

1. Diagrama de arquitectura o de clases (ABC-405).
2. Frontend con sesión de Producción en el detalle de ORD-DEMO-A.
3. Frontend con sesión de Logística, en otra ventana, en `/logistica/recursos`.
4. Consola PowerShell con `$emu` y `$cuerpo` listos.
5. Terminal con `docker compose logs -f produccion-service`.
6. [README.md](README.md) con las evidencias del bloque 5.

## 3. Guion

### Bloque 1 — Contexto (00:00–02:00)

- El sistema coordina **Producción** y **Logística** de un taller: órdenes,
  materiales, lotes, boletas y rutas. Cada servicio tiene su propia base.
- Arquitectura: frontend → gateway → servicios NestJS (Auth, Producción,
  Logística) con PostgreSQL; integraciones con Inventarios, Contabilidad, Ventas
  (Pub/Sub) y el ERP de recursos (REST).
- Sprint 3: se presentan tres HU funcionales y una integración adicional.

### Bloque 2 — Producción (02:00–07:00)

**ABC-74 Pérdidas de materia prima (3 min)**

1. Abrir ORD-DEMO-A → sección **Pérdidas de materia prima**.
2. Intentar guardar con cantidad `0` y mostrar el error claro.
3. Registrar una pérdida: material, cantidad `2.5`, motivo "Derrame en mezcladora".
   Mostrar que el listado agrega la fila con **autor y fecha del servidor**.
4. Mensaje: la merma queda trazada en la orden; el autor no lo elige el usuario.

**ABC-70 Verificar materiales antes de iniciar (2 min)**

1. Abrir ORD-DEMO-B → la acción **Iniciar** aparece bloqueada con el faltante
   exacto (por ejemplo, "faltan 20 kg").
2. Mensaje: sin insumos suficientes no se inicia la orden, y una consulta
   pendiente no cuenta como disponibilidad.

Plan B: mostrar [ABC-311](ABC-311.md) y [ABC-312](ABC-312.md) y las pruebas
`perdidas-materia-prima.test.mjs` y `disponibilidad-orden.test.mjs`.

### Bloque 3 — Logística (07:00–12:00)

**ABC-115 Recursos y vigencia (1 min)**

1. En `/logistica/recursos`, consultar la fecha de la demo: aparece **Copia de
   respaldo** con la fecha de sincronización. Decir que es una copia cargada
   para la demo, porque no hay ERP en el entorno.
2. Filtrar **Solo disponibles**: queda VEH-01 y CHO-12. Elegirlos y mostrar que
   la selección **no reserva** recursos.

**ABC-368 Ruta planificada (1 min)**

1. Abrir **Historial de rutas** → la ruta de la demo, `PLANIFICADA`, con sus
   paradas y boletas.
2. Explicar las validaciones de asignación (ABC-371): vehículo y chofer
   disponibles, sin otra ruta el mismo día, carga dentro de la capacidad y sin
   mezclar unidades.

**ABC-374 Despacho y entrega (3 min)**

1. **Despachar ruta** con la observación "Salida 8:30". La ruta pasa a tránsito
   con fecha y autor del servidor, y desaparece el botón de despacho (no hay
   doble despacho).
2. **Registrar entrega** de la parada 1 con la observación "Recibió Ana": se ve
   "1 de 2 entregas registradas" y la ruta sigue en tránsito (entrega parcial).
3. Registrar la entrega de la parada 2: la ruta queda **Completada**.
4. Señalar el panel **Notificación a Inventarios**, separado del estado de
   entrega. Ese evento es ABC-384 y está pendiente.

Plan B: pruebas `despacho-ruta.test.mjs` (11) y `despacho.service.spec.ts`, más
la evidencia de rutas de [Gemina](ABC-gemina-rutas-docker.md).

### Bloque 4 — Integración adicional: demanda por Pub/Sub (12:00–16:00)

En vivo con el **emulador** (prueba simulada). La evidencia de Google Cloud real
se muestra en el bloque 5.

1. Publicar la demanda:
   `Invoke-RestMethod -Method Post -Uri "$emu/topics/taller-ventas-demanda-local:publish" -ContentType 'application/json' -Body $cuerpo`
2. En el log de Producción, el consumidor guarda la demanda y el inbox en una
   transacción y hace **ACK después del commit**.
3. En `/demandas`, la demanda PED-DEMO-001 aparece `RECIBIDA` con su ítem.
4. Publicar **el mismo** `$cuerpo` otra vez: el log muestra `DUPLICADO` y la
   pantalla sigue con una sola demanda (idempotencia por `eventId`).
5. Explicar el rechazo trazable (misma demanda con otra fecha →
   `DEMANDA_CONTRADICTORIA`) y que una falla de la base hace NACK para que Pub/Sub
   reintente.

Plan B: tabla de mensajes de la
[evidencia de demanda](ABC-gemina-observaciones-historial-demanda.md) y el
[README del módulo](../../../services/produccion-service/src/demanda/README.md).

### Bloque 5 — Evidencias y cierre (16:00–20:00)

1. **Diagramas** (ABC-405/406/407): clases de Producción y Logística, y las
   secuencias de despacho y de demanda con outbox/inbox.
2. **Pub/Sub real** (ABC-389): captura de Google Cloud con fecha/hora, cuerpo y
   `messageId`.
3. **Docker** (ABC-403): `docker compose ps`, health checks y frontend.
4. **Pruebas y commits**: resumen de pruebas y commits por persona
   ([README § 5](README.md#5-commits-por-persona)).
5. **Pendientes**, dichos con claridad: ABC-381 (endpoints de incidencias),
   ABC-384/386 (evento de salida a Inventarios), pantalla de planificación de
   rutas, vista previa y archivos del reporte (ABC-110) y los pendientes del
   Sprint 2.
6. Preguntas.

Si al momento de la demo falta alguna evidencia de los puntos 1 a 3, se dice
que está pendiente y no se reemplaza con otra.

## 4. Riesgos y mitigación

| Riesgo | Mitigación |
| --- | --- |
| Sin datos de recursos para la fecha, no se pueden crear rutas (ABC-371) | Paso 2.3.2 con la fecha exacta de la demo |
| La unidad del producto no coincide con la capacidad del vehículo | Receta en kg y vehículo en kg (pasos 2.2.1 y 2.3.2) |
| El consumidor de demanda no arranca | Crear topic y suscripción antes de `--profile full` (paso 2.1.2) |
| Token vencido durante la demo | Iniciar sesión justo antes de cada bloque |
| Se pasa del tiempo | Saltar ABC-70 (bloque 2) o el paso 5 del bloque 4 |

## 5. Ensayo cronometrado

Completar después de cada ensayo. Si un bloque se pasa de su tiempo en más de
30 segundos, ajustar el guion antes del siguiente ensayo.

| Ensayo | Fecha | B1 (2:00) | B2 (5:00) | B3 (5:00) | B4 (4:00) | B5 (4:00) | Total | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | *Pendiente* | | | | | | | |
| 2 | *Pendiente* | | | | | | | |
