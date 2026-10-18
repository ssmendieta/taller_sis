# ABC-113: flujo de mensajes Producción–Inventarios v1

El [contrato](../integraciones/inventarios-v1.md) reutiliza los nombres de eventos
existentes. ABC-242 conecta el alta de solicitudes con Pub/Sub mediante outbox y
ABC-278 recibe respuestas mediante una suscripción e inbox idempotente.

1. Solicitud, ítems y evento `PENDIENTE` se guardan en una sola transacción.
2. Tras el commit, el publicador reclama el evento y envía su payload inmutable.
3. La confirmación guarda `messageId`; un fallo conserva el evento para reintentar.

```mermaid
sequenceDiagram
    participant DB as produccion_db
    participant P as produccion-service
    participant O as eventos_outbox
    participant T as Topic existente PUBSUB_TOPIC_ID
    participant I as Inventarios/Almacén (externo)
    participant R as Suscripción PUBSUB_SUBSCRIPTION_ID
    participant N as eventos_inbox
    P->>DB: BEGIN: guardar solicitud 27 e ítems
    P->>O: guardar evento A/C como PENDIENTE
    P->>DB: COMMIT único
    Note over P,O: Pub/Sub no participa en la transacción de negocio
    P->>O: reclamar por lease (PROCESANDO)
    P->>T: SolicitudMaterialAlmacen.v1
    Note over P,T: eventId propio A, correlationId C
    alt Pub/Sub confirma
        T-->>P: messageId de Google
        P->>O: PUBLICADO + messageId
    else Pub/Sub falla o el proceso se interrumpe
        P->>O: PENDIENTE con error, o lease vence
        P->>T: reintento con los mismos A, C y payload
    end
    Note over T,I: Suscripción de Inventarios sin nombre/configuración en el repositorio
    T-->>I: Solicitud correlacionada
    I-->>R: SolicitudMaterialAlmacenEstadoActualizado.v1
    Note over I,R: eventId propio B, correlationId C, requestEventId A
    Note over I,R: solicitudId 27, ordenId 15, PENDIENTE a APROBADA
    R-->>P: Respuesta correlacionada
    P->>N: Inbox + actualización de solicitud (transacción)
    P-->>R: ACK después del commit
    Note over DB,P: La respuesta refiere los ítems originales; no cambia stock por este contrato
```

| Nombre del plan | Nombre real representado en el diagrama |
| --- | --- |
| `MaterialesSolicitados.v1` | `SolicitudMaterialAlmacen.v1` |
| `MaterialesSolicitudRespondida.v1` | `SolicitudMaterialAlmacenEstadoActualizado.v1` |

`A`, `B` y `C` son abreviaturas para explicar la relación. Los UUID completos
están en los ejemplos JSON del contrato. El repositorio configura el transporte
pero no crea el topic ni la suscripción en Google Cloud.
