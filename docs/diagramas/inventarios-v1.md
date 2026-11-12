# Flujos de Integración con Inventarios / Almacén v1 (ABC-113 / ABC-384 / ABC-406)

Este documento centraliza los flujos de mensajería asíncrona hacia el servicio externo de Inventarios y Almacén mediante Google Cloud Pub/Sub con garantía transaccional Outbox/Inbox.

---

## 1. Salida de Productos y Despacho Logístico (Sprint 3: ABC-384 / ABC-406)

Notificación del despacho de rutas de entrega a Inventarios para la baja física de stock, confirmada mediante Transactional Outbox y respuesta asíncrona procesada en Inbox (`SalidaInventarioResultado.v1`).

Diagrama oficial del incremento:
- [10-inventarios-despacho-salida.mmd](sprint-3/secuencia/10-inventarios-despacho-salida.mmd)
- [SVG](sprint-3/secuencia/10-inventarios-despacho-salida.svg) | [PNG](sprint-3/secuencia/10-inventarios-despacho-salida.png) | [PDF](sprint-3/secuencia/10-inventarios-despacho-salida.pdf)

```mermaid
sequenceDiagram
    autonumber
    participant LG as logistica-service
    participant DB as logistica_db (PostgreSQL)
    participant O as eventos_outbox
    participant PUB as OutboxPublicadorLogisticaService
    participant T as Google Cloud Pub/Sub
    participant I as Inventarios / Almacén
    participant SUB as PubSubResultadoSalidaConsumer
    participant IB as eventos_inbox

    Note over LG,O: 1. Despacho y Outbox en la misma transacción (ABC-385 / ABC-386)
    LG->>DB: BEGIN: actualizar ruta a DESPACHADA
    LG->>O: INSERT evento inventarios.salida.v1 PENDIENTE
    LG->>DB: COMMIT único
    LG-->>LG: 200 OK Ruta despachada

    Note over PUB,T: 2. Publicación confiable Outbox (ABC-386)
    PUB->>O: Reclamar evento con lease (PROCESANDO)
    PUB->>T: DespachoRutaRegistrado.v1 (topic PUBSUB_LOGISTICA_TOPIC_ID)
    alt Pub/Sub confirma
        T-->>PUB: messageId
        PUB->>O: PUBLICADO + messageId
    else Fallo transitorio
        PUB->>O: PENDIENTE con reintento y backoff (conserva eventId inmutable)
    end

    Note over T,I: 3. Dominio de Inventarios
    T-->>I: Entrega evento (at-least-once)
    I->>I: Descuenta inventario físico o rechaza si no hay stock
    I-->>T: SalidaInventarioResultado.v1 (ACEPTADA | RECHAZADA)

    Note over SUB,IB: 4. Recepción asíncrona e Inbox transaccional (ABC-387)
    T-->>SUB: Entrega SalidaInventarioResultado.v1
    SUB->>DB: BEGIN: verificar duplicados en eventos_inbox
    alt Mensaje nuevo
        SUB->>DB: UPDATE rutas SET inventario_estado = ACEPTADA | RECHAZADA
        SUB->>IB: INSERT eventos_inbox PROCESADO
        SUB->>DB: COMMIT
        SUB-->>T: ACK tras commit
    else Mensaje duplicado
        SUB->>DB: ROLLBACK
        SUB-->>T: ACK inmediato (idempotencia)
    end
```

---

## 2. Solicitud y Disponibilidad de Materiales en Producción (ABC-113 / ABC-70)

- Verificación previa de disponibilidad de materiales antes de iniciar orden: [06-produccion-inicio-orden.svg](sprint-3/secuencia/06-produccion-inicio-orden.svg).
