# ABC-441: secuencia del aviso ProductoTerminadoIngresado

Diagrama de secuencia del aviso asíncrono que `produccion-service` envía a Inventarios cuando un lote conforme queda terminado. Corresponde a la subtarea **ABC-441** de la historia **ABC-411** y se elaboró junto con **ABC-438** y **ABC-439**. El contrato está en `docs/integraciones/producto-terminado-ingresado-v1.md`.

> **Estado: borrador estimado.** ABC-438 y ABC-439 aún no existen. Los estados y la política de reintento salen del outbox ya implementado en `services/produccion-service/src/integraciones/outbox/`. El endpoint de creación del lote y el `aggregateType` son una estimación y deben revisarse cuando esas tareas se integren.

---

## 1. Alcance

- **Incluido:** creación del lote, escritura en el outbox, publicación, reintento, idempotencia y suscripción de prueba.
- **No incluido:** el registro real del producto en Inventarios. Inventarios no es real; se prueba con una suscripción de prueba en el emulador.

---

## 2. Estados del aviso (`eventos_outbox.estado`)

| Estado | Significado | Origen |
| :--- | :--- | :--- |
| `PENDIENTE` | Creado con el lote, o devuelto tras un fallo, a la espera de `proximo_intento_en` | Código existente |
| `PROCESANDO` | Reclamado por un publicador con lease (`OUTBOX_LEASE_MS`, 30 s) | Código existente |
| `PUBLICADO` | El topic confirmó con un `messageId` | Código existente |

No hay un estado de fallo definitivo: un error vuelve el aviso a `PENDIENTE` y guarda `ultimo_error`.

## 3. Reintento

| Parámetro | Valor por defecto | Variable |
| :--- | :--- | :--- |
| Espera inicial | 5 s | `OUTBOX_RETRY_BASE_MS` |
| Espera máxima | 300 s | `OUTBOX_RETRY_MAX_MS` |
| Fórmula | `min(base × 2^(intentos-1), máximo)` | — |
| Frecuencia de sondeo | 5 s | `OUTBOX_POLL_INTERVAL_MS` |
| Lote por ciclo | 20 | `OUTBOX_BATCH_SIZE` |
| Límite de intentos | Ninguno | — |

## 4. Idempotencia y entrega

- Un reintento conserva el mismo `eventId` y los mismos datos del lote.
- Un índice único (`aggregateType`, `aggregateId`, `eventType`) evita dos avisos para el mismo lote.
- La entrega es **al menos una vez**: el broker no garantiza entrega única. El receptor debe ignorar un `eventId` ya procesado.

---

## 5. Diagrama

Fuente: [`producto-terminado-ingresado.mmd`](producto-terminado-ingresado.mmd). Exportación: [`producto-terminado-ingresado.png`](producto-terminado-ingresado.png).

```mermaid
sequenceDiagram
    autonumber
    actor E as Encargado de Producción
    participant PR as produccion-service
    participant DB as produccion_db
    participant PUB as OutboxPublicadorService
    participant T as Topic Pub/Sub (PUBSUB_TOPIC_ID)
    participant S as Suscripción de prueba (Inventarios simulado)

    Note over PR,DB: Estimado: endpoint y aggregateType pendientes de ABC-438 y ABC-439
    E->>PR: registrar lote conforme de la orden
    PR->>DB: BEGIN
    PR->>DB: INSERT lote (código, cantidad conforme, fecha)
    PR->>DB: INSERT eventos_outbox (ProductoTerminadoIngresado.v1, estado PENDIENTE, intentos 0)
    alt el evento ya existe para el lote (aggregateType + aggregateId + eventType)
        PR->>DB: ROLLBACK
        PR-->>E: 409 sin evento duplicado
    else primer registro del lote
        PR->>DB: COMMIT
        PR-->>E: 201 lote creado (el aviso se publica aparte)
    end

    loop cada OUTBOX_POLL_INTERVAL_MS (5 s)
        PUB->>DB: reclamar pendientes vencidos y marcar PROCESANDO con lease de 30 s
        PUB->>PUB: validarProductoTerminadoIngresadoV1(payload)
        PUB->>T: publish(payload, eventId)
        alt publicación confirmada
            T-->>PUB: messageId
            PUB->>DB: UPDATE a PUBLICADO (messageId, publicado_en)
        else error de publicación
            T--xPUB: error
            PUB->>DB: UPDATE a PENDIENTE (ultimo_error, proximo_intento_en = ahora + min(5 s x 2^(n-1), 300 s))
            Note over PUB,DB: Reintento con el mismo eventId y los mismos datos, sin límite de intentos
        end
    end

    T->>S: entrega del mensaje (al menos una vez)
    alt eventId nuevo
        S->>S: registrar eventId y procesar
    else eventId ya procesado
        S->>S: ignorar duplicado
    end
    S-->>T: ACK

    Note over PUB,S: Si se pierde el ACK o la confirmación, el aviso se publica otra vez. El broker no garantiza entrega única, por eso la idempotencia es del receptor por eventId
```
