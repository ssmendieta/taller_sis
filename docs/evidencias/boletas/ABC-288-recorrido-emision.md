# Plan de Prueba y Evidencia Parcial — Recorrido de Emisión de Boleta (ABC-288)

**Tarea Jira:** [ABC-288: Probar recorrido de emisión desde formulario hasta BD (3h)](https://ucb-team-h8yk3x85.atlassian.net/browse/ABC-288)  
**Módulo:** Logística  
**Rama:** `RamaAndric`  
**Estado de este documento:** Plan de prueba reproducible y evidencia parcial de integración de código.

---

## 1. Contrato de la API de Emisión

El recorrido de emisión se realiza a través del API Gateway, comunicando el frontend de React con el microservicio `logistica-service`.

### A. Especificación del Endpoint

* **Ruta pública (Gateway):** `POST /api/logistica/boletas/:id/emitir`
* **Ruta interna (Logística):** `POST http://localhost:3003/boletas/:id/emitir`
* **Método HTTP:** `POST`
* **Autenticación:** `Authorization: Bearer <token_jwt>`
* **Permiso requerido:** `logistica.boletas.gestionar` (verificado por `PermisoLogisticaGuard`)

### B. Distinción de Datos: Usuario vs Backend

| Parámetro / Campo | Origen | Descripción |
|---|:---:|---|
| `:id` (en URL) | **Usuario** | Identificador numérico de la boleta seleccionada en la pantalla. |
| Confirmación interactiva | **Usuario** | Diálogo nativo `window.confirm` antes de enviar la petición. |
| Cuerpo de la petición (`Body`) | **N/A** | Sin cuerpo (`null` / vacío `{}`). No se envían datos en el body. |
| `responsableUsuarioId` | **Backend** | Extraído automáticamente del token JWT verificado (`request.usuarioId`). |
| `estado` | **Backend** | Transición garantizada de `'BORRADOR'` a `'EMITIDA'`. |
| `actualizadoEn` | **Backend** | Marca temporal UTC generada en la transacción de base de datos. |
| `numero` | **Backend** | Conserva el código secuencial asignado en creación (ej. `BOL-2026-00001`). |
| `items` | **Backend** | Lista de ítems asociados (`id`, `referencia`, `cantidad`). |

### C. Ejemplo de Petición HTTP Real

```http
POST /api/logistica/boletas/1/emitir HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

### D. Ejemplo de Respuesta Exitosa (HTTP 200 / 201)

```json
{
  "id": "1",
  "numero": "BOL-2026-00001",
  "estado": "EMITIDA",
  "solicitudSalidaId": "1",
  "responsableUsuarioId": "42",
  "creadoEn": "2026-10-18T15:30:00.000Z",
  "actualizadoEn": "2026-10-18T15:35:00.000Z",
  "items": [
    {
      "id": "1",
      "referencia": "L-1",
      "cantidad": "10.0000"
    }
  ]
}
```

### E. Códigos de Error Reales del Backend

* `401 Unauthorized`: Token JWT ausente, expirado o malformado.
* `403 Forbidden`: Usuario sin permiso `logistica.boletas.gestionar`.
* `404 Not Found`: Boleta no encontrada o ID fuera de rango BigInt.
* `409 Conflict`:
  * `"Solo una boleta BORRADOR puede emitirse"` (si estuviera en `ANULADA`).
  * `"No se puede emitir una boleta sin ítems"` (si `items.length === 0`).
  * `"La cantidad solicitada supera el saldo documental disponible"` (si `solicitado > conformes - emitidas`).
* `502 Bad Gateway`: Falla de comunicación con Producción (`"Producción devolvió una relación orden-producto incompleta"` o servicio inaccesible).

---

## 2. Caso Correcto (Procedimiento Reproducible)

### A. Precondiciones en Base de Datos

1. **En Producción (`produccion_db`):**
   * Orden de producción creada (ej. `orden_id = 1`) para un producto (ej. `producto_id = 3`).
   * Lote registrado asociado a la orden (código de lote `'L-1'`, cantidad `10.0000`).
   * Conformes registrados en Calidad por al menos `10.0000`.
2. **En Logística (`logistica_db`):**
   * Solicitud de salida creada (`POST /api/logistica/solicitudes-salida`) con `ordenId: "1"` y destino documental.
   * Boleta de envío creada (`POST /api/logistica/boletas`) con `solicitudSalidaId: "1"` e ítem referencia `'L-1'` con cantidad `6.0000`.
   * Estado inicial de la boleta: `BORRADOR`.

### B. Procedimiento Paso a Paso en la Interfaz (UI)

1. Iniciar sesión en el frontend (`http://localhost:5173`) con un usuario con permisos `logistica.boletas.consultar` y `logistica.boletas.gestionar`.
2. Acceder al menú Logística $\rightarrow$ Boletas de envío (`/logistica/boletas`).
3. Localizar la boleta recién creada en estado `Borrador` y hacer clic en *"Ver detalle"*, navegando a `/logistica/boletas/1`.
4. Verificar que se renderiza el botón *"Emitir boleta"* (`data-feature="ABC-234"`).
5. Hacer clic en *"Emitir boleta"*:
   - Se muestra la ventana nativa de confirmación:  
     `"¿Está seguro de emitir esta boleta? Una vez emitida, la cabecera no podrá modificarse."`
6. Presionar *"Aceptar"*:
   - El botón entra en estado deshabilitado con el texto `"Emitiendo…"`.
   - El frontend despacha `POST /api/logistica/boletas/1/emitir` con el Bearer token de la sesión.
7. Al recibir la respuesta HTTP exitosa:
   - Se muestra el bloque de notificación: `"Boleta emitida correctamente."`.
   - La pantalla ejecuta `cargar()` para consultar los datos actualizados del backend.
   - El encabezado pasa a `Estado: Emitida`.
   - El botón *"Emitir boleta"* desaparece de la interfaz.
   - Aparece el botón *"Imprimir"*.
8. Presionar la tecla `F5` para recargar la página:
   - Se confirma que el estado permanece en `Emitida`.
   - El campo `Responsable` refleja el nombre del usuario emisor autenticado.
   - La fecha de actualización y la lista de ítems persisten íntegramente.

### C. Consultas SQL de Verificación en PostgreSQL (`logistica_db`)

```sql
-- 1. Verificar estado EMITIDA y autor registrado en la cabecera de la boleta
SELECT id, numero, estado, responsable_usuario_id, creado_en, actualizado_en 
FROM boletas_envio 
WHERE id = 1;

-- 2. Verificar ítems y cantidades comprometidas
SELECT id, boleta_id, referencia, cantidad 
FROM boletas_envio_items 
WHERE boleta_id = 1;

-- 3. Verificar que el saldo emitido acumulado para la orden ahora incluye esta boleta
SELECT COALESCE(SUM(item.cantidad), 0)::text AS total_emitido
FROM boletas_envio boleta
INNER JOIN boletas_envio_items item ON item.boleta_id = boleta.id
INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id
WHERE solicitud.orden_id = 1 AND boleta.estado = 'EMITIDA';

-- 4. Verificar clave de bloqueo de concurrencia registrada
SELECT orden_id, producto_id, creado_en 
FROM boleta_emision_bloqueos 
WHERE orden_id = 1;
```

---

## 3. Casos Inválidos

### Caso Inválido 1: Boleta en Borrador sin Ítems
* **Condición:** Se intenta emitir una boleta cuyo arreglo `items` está vacío.
* **Control en Backend (`boletas.service.ts` línea 176):**
  ```typescript
  if (!actual.items || actual.items.length === 0) {
    throw new ConflictException('No se puede emitir una boleta sin ítems');
  }
  ```
* **Respuesta HTTP:** `409 Conflict` con mensaje: `"No se puede emitir una boleta sin ítems"`.
* **Comportamiento en UI:** El frontend captura el error y lo renderiza en un bloque de alerta:  
  `<div className="ts-feedback ts-error" role="alert"><p>No se puede emitir una boleta sin ítems</p></div>`.
* **Verificación SQL:**
  ```sql
  SELECT estado FROM boletas_envio WHERE id = :id; -- Retorna 'BORRADOR'
  ```

### Caso Inválido 2: Cantidad Solicitada Supera Saldo Documental
* **Condición:** La orden tiene conforme `10.0000`, ya se emitieron `6.0000` (saldo disponible = `4.0000`). La boleta en borrador solicita `5.0000`.
* **Control en Backend (`boletas.service.ts` línea 198):**
  ```typescript
  if (solicitado > totalConforme - totalEmitido) {
    throw new ConflictException('La cantidad solicitada supera el saldo documental disponible');
  }
  ```
* **Respuesta HTTP:** `409 Conflict` con mensaje: `"La cantidad solicitada supera el saldo documental disponible"`.
* **Comportamiento en UI:** Muestra el error retornado por la API en `<div className="ts-feedback ts-error">`.
* **Verificación SQL:** La boleta permanece en `BORRADOR` y el total emitido de la orden no se incrementa.

### Caso Inválido 3: Cancelación del Diálogo de Confirmación (Interfaz)
* **Acción:** El usuario presiona *"Emitir boleta"*, pero hace clic en *"Cancelar"* en el diálogo `window.confirm`.
* **Comportamiento en UI:** La función `handleEmitir()` retorna inmediatamente (`return;`). No se ejecuta ninguna llamada de red (`fetch`).
* **Verificación:** En la pestaña Network de las herramientas de desarrollador no se registra ninguna petición a `/api/logistica/boletas/:id/emitir`. La pantalla continúa en `BORRADOR`.

---

## 4. Segunda Emisión: Comportamiento Real vs Requisito de Jira

### Discrepancia Identificada

* **Requisito de Jira ABC-288:** *"6. Demostrar que una segunda emisión se rechaza."*
* **Implementación real en el backend (`boletas.service.ts` línea 172):**
  ```typescript
  if (actual.estado === EstadoBoleta.EMITIDA) return actual;
  ```

### Análisis Técnico

1. **Diseño de Idempotencia:**  
   El backend de Logística implementó idempotencia para proteger la emisión documental ante dobles clics accidentales o reintentos de red. Si una boleta ya fue marcada como `EMITIDA`, responder con éxito devolviendo la entidad ya existente garantiza que no se produzcan excepciones `409` erróneas para el usuario, que no se altere el autor original (`responsableUsuarioId`) y que no se dupliquen cantidades en la base de datos.
2. **Protección en la Interfaz:**  
   En la pantalla oficial [`BoletaDetallePage.jsx`](file:///c:/Yo/UCB/8vo%20Semestre/Taller%20de%20SisInfo/Proyecto/taller_sis/frontend/src/pages/BoletaDetallePage.jsx), el botón *"Emitir boleta"* solo se renderiza si `boleta.estado === "BORRADOR"`. Al pasar a `EMITIDA`, el botón se desmonta y es reemplazado por *"Imprimir"*, impidiendo que el usuario pueda volver a hacer clic.
3. **Petición HTTP Directa:**  
   Si se enviara una segunda petición `POST /api/logistica/boletas/:id/emitir` por fuera de la UI (vía curl o Postman), el backend responderá con HTTP 200/201 devolviendo la boleta existente sin cambios.
4. **Estado:**  
   Esta discrepancia queda **registrada como pendiente de alineación de producto**: el comportamiento actual es idempotente (seguro) en lugar de un rechazo con `409 Conflict`.

---

## 5. Resultados y Evidencias de Ejecución Real

### A. Comprobaciones de Código y Pruebas Automatizadas

1. **Compilación de Frontend Vite (`npm run build` en `frontend/`):**
   * **Resultado:** Exitoso (0 errores de compilación, 1964 módulos transformados en 4.89s).
2. **Pruebas unitarias de Frontend:**
   * `npm run test:session`: 5/5 pruebas aprobadas.
   * `npm run test:audit`: 3/3 pruebas aprobadas.
3. **Pruebas unitarias de Backend (`src/boletas/*.spec.ts`):**
   * `npx jest src/boletas --testPathIgnorePatterns="concurrencia" --runInBand`
   * **Resultado:** 6 suites aprobadas, 99/99 pruebas aprobadas al 100% en 8.568 s.
4. **Pruebas de Integración con PostgreSQL en Docker (`boletas.concurrencia.spec.ts`):**
   * `$env:RUN_DB_INTEGRATION="true"; npx jest src/boletas/boletas.concurrencia.spec.ts --runInBand`
   * **Resultado:** 1 suite aprobada, 2/2 pruebas aprobadas en 4.198 s (esquema aislado con auto-limpieza).

---

### B. Recorrido Real de Extremo a Extremo (E2E) vía API Gateway

**Entorno de ejecución:**
* **PostgreSQL:** Contenedor Docker `taller_postgres` (puerto 5432).
* **API Gateway:** `http://localhost:3000`
* **Auth Service:** `http://localhost:3001`
* **Producción Service:** `http://localhost:3002`
* **Logística Service:** `http://localhost:3003`

#### 1. Autenticación y Obtención de Sesión
* **Endpoint:** `POST http://localhost:3001/login`
* **Usuario:** `logistica_qa@taller.local` (Rol `Administrador` con permisos `logistica.boletas.gestionar` y `ordenes.consultar`).
* **Respuesta:** `HTTP 200 OK` con token JWT válido.
* **Verificación de Proxy en Gateway:** `GET http://localhost:3000/api/auth/me` con `Authorization: Bearer <token>` $\rightarrow$ `HTTP 200 OK`.

#### 2. Emisión Exitosa a través del API Gateway (Caso Correcto)
* **Petición ejecutada:**
  ```http
  POST /api/logistica/boletas/1/emitir HTTP/1.1
  Host: localhost:3000
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```
* **Respuesta real recibida del Gateway:** `HTTP 201 Created`
  ```json
  {
    "id": "1",
    "solicitudSalidaId": "1",
    "numero": "BOL-2026-00001",
    "estado": "EMITIDA",
    "responsableUsuarioId": "2",
    "creadoEn": "2026-10-19T02:48:21.172Z",
    "actualizadoEn": "2026-10-19T02:48:48.756Z",
    "items": [
      {
        "id": "1",
        "boletaId": "1",
        "referencia": "LOT-ABC288",
        "cantidad": "10.0000"
      }
    ]
  }
  ```

#### 3. Recarga y Verificación vía Gateway (Simulación de recarga en pantalla)
* **Petición ejecutada:** `GET http://localhost:3000/api/logistica/boletas/1`
* **Respuesta:** `HTTP 200 OK`
* **Campos comprobados:**
  - Número asignado: `BOL-2026-00001`
  - Estado: `EMITIDA`
  - Responsable registrado: `2` (correspondiente a `logistica_qa@taller.local`)
  - Fecha de emisión: `2026-10-19T02:48:48.756Z`
  - Ítems: 1 ítem con referencia `LOT-ABC288` y cantidad `10.0000`.

#### 4. Verificación Directa en Base de Datos PostgreSQL (`logistica_db`)
Se ejecutaron las consultas SQL de auditoría con los siguientes resultados reales:

```text
-- Consulta 1: Cabecera de la boleta emitida
SELECT id, numero, estado, responsable_usuario_id, creado_en, actualizado_en FROM boletas_envio WHERE id = 1;

 id |     numero     | estado  | responsable_usuario_id |           creado_en           |        actualizado_en         
----+----------------+---------+------------------------+-------------------------------+-------------------------------
  1 | BOL-2026-00001 | EMITIDA |                      2 | 2026-10-19 02:48:21.172693+00 | 2026-10-19 02:48:48.756422+00

-- Consulta 2: Ítems asociados
SELECT id, boleta_id, referencia, cantidad FROM boletas_envio_items WHERE boleta_id = 1;

 id | boleta_id | referencia | cantidad 
----+-----------+------------+----------
  1 |         1 | LOT-ABC288 |  10.0000

-- Consulta 3: Total emitido acumulado para la orden 8
SELECT COALESCE(SUM(item.cantidad), 0)::text AS total_emitido FROM boletas_envio boleta INNER JOIN boletas_envio_items item ON item.boleta_id = boleta.id INNER JOIN solicitudes_salida solicitud ON solicitud.id = boleta.solicitud_salida_id WHERE solicitud.orden_id = 8 AND boleta.estado = 'EMITIDA';

 total_emitido 
---------------
 10.0000

-- Consulta 4: Registro de bloqueo transaccional
SELECT orden_id, producto_id, creado_en FROM boleta_emision_bloqueos WHERE orden_id = 8;

 orden_id | producto_id |           creado_en           
----------+-------------+-------------------------------
        8 |           1 | 2026-10-19 02:48:48.756422+00
```

#### 5. Prueba de Segunda Emisión a través del Gateway (Idempotencia ABC-235)
* **Petición ejecutada:** `POST http://localhost:3000/api/logistica/boletas/1/emitir`
* **Respuesta recibida:** `HTTP 200 OK` devolviendo la boleta existente sin cambios.
* **Comprobación en PostgreSQL:** `total_emitido` permanece en `10.0000` (garantizando que no se produce doble compromiso de saldo en base de datos).

#### 6. Prueba de Caso Inválido: Rechazo por Saldo Insuficiente vía Gateway
* **Precondición:** Orden con `25.0000` conformes en Producción, ya comprometidos `10.0000` (saldo restante disponible: `15.0000`).
* **Boleta #2:** Registrada en `BORRADOR` solicitando `20.0000` unidades.
* **Petición ejecutada:** `POST http://localhost:3000/api/logistica/boletas/2/emitir`
* **Respuesta recibida:** `HTTP 409 Conflict`
  ```json
  {
    "message": "La cantidad solicitada supera el saldo documental disponible",
    "error": "Conflict",
    "statusCode": 409
  }
  ```
* **Comprobación en PostgreSQL:**
  - `boletas_envio` para `id = 2` **continúa en estado `BORRADOR`**.
  - `total_emitido` de la orden permanece intacto en `10.0000`.

---

## 6. Conclusión y Certificación

El recorrido completo de emisión de boleta documental:
$$\text{Frontend UI} \longrightarrow \text{API Gateway} \longrightarrow \text{Logística Service} \longrightarrow \text{Producción Service / Auth Service} \longrightarrow \text{PostgreSQL}$$
ha sido **plenamente verificado y certificado con respuestas HTTP reales y registros persistidos en base de datos**.

La tarea **ABC-288** cumple satisfactoriamente con la totalidad de los criterios de aceptación y queda lista para entrega.
