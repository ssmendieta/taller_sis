# Flujo Contabilidad v1 (ABC-114 / ABC-406)

Flujo de integración asíncrona entre `produccion-service` y Contabilidad implementado en el Sprint 3 mediante el patrón **Transactional Outbox / Inbox** y mensajería en Google Cloud Pub/Sub.

El diagrama detallado del Sprint 3 con todas las fases de negocio, persistencia, cálculo de costo base (ABC-345) y consumo de respuesta (ABC-348) se encuentra en:
- [09-contabilidad-cierre-costos.mmd](sprint-3/secuencia/09-contabilidad-cierre-costos.mmd)
- [SVG](sprint-3/secuencia/09-contabilidad-cierre-costos.svg) | [PNG](sprint-3/secuencia/09-contabilidad-cierre-costos.png) | [PDF](sprint-3/secuencia/09-contabilidad-cierre-costos.pdf)

```mermaid
sequenceDiagram
    autonumber
    participant P as produccion-service
    participant DB as produccion_db (PostgreSQL)
    participant O as eventos_outbox
    participant PUB as OutboxPublicadorService
    participant T as Google Cloud Pub/Sub
    participant C as Contabilidad (externo)
    participant SUB as PubSubContabilidadConsumerService
    participant IB as eventos_inbox

    Note over P,O: 1. Transacción atómica de cierre y outbox (ABC-345 / ABC-346)
    P->>DB: BEGIN: validar orden FINALIZADA y calcular costo base
    P->>DB: INSERT cierre inmutable + evento ProduccionCerrada.v1 PENDIENTE
    P->>DB: COMMIT único de ambos registros
    P-->>P: Responder 201 Created con snapshot

    Note over PUB,T: 2. Publicación confiable desacoplada (ABC-347)
    PUB->>O: Reclamar evento con lease (PROCESANDO)
    PUB->>T: ProduccionCerrada.v1 (topic PUBSUB_TOPIC_ID)
    alt Pub/Sub confirma
        T-->>PUB: messageId
        PUB->>O: PUBLICADO, messageId y publicado_en
    else Pub/Sub no disponible o timeout
        T--xPUB: Fallo temporal
        PUB->>O: PENDIENTE y próximo intento con backoff (conserva eventId inmutable)
    end

    Note over T,C: 3. Dominio externo de Contabilidad
    T-->>C: Entrega mensaje (at-least-once)
    C->>C: Asiento contable
    C-->>T: RegistroContableResultado.v1 (correlationId, requestEventId)

    Note over SUB,IB: 4. Recepción asíncrona e inbox transaccional (ABC-348 / ABC-349)
    T-->>SUB: Entrega RegistroContableResultado.v1
    SUB->>SUB: Valida contrato contabilidad-v1
    SUB->>DB: BEGIN: deduplicar en eventos_inbox
    alt Mensaje nuevo
        SUB->>DB: UPDATE cierre_produccion (estado_contable = ACEPTADA | RECHAZADA)
        SUB->>IB: INSERT eventos_inbox (PROCESADO)
        SUB->>DB: COMMIT
        SUB-->>T: ACK tras commit
    else Mensaje duplicado
        SUB->>DB: ROLLBACK
        SUB-->>T: ACK inmediato (idempotencia)
    end
```
