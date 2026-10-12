# ABC-113: flujo de mensajes Producción–Inventarios v1

El [contrato](../integraciones/inventarios-v1.md) reutiliza los nombres de eventos
existentes. Los pasos de envío de solicitudes de negocio y recepción de respuestas
son futuros; esta subtarea únicamente los documenta.

```mermaid
sequenceDiagram
    participant DB as produccion_db (ABC-73)
    participant P as produccion-service
    participant T as Topic existente PUBSUB_TOPIC_ID
    participant I as Inventarios/Almacén (externo)
    participant R as Transporte de respuesta pendiente
    Note over DB,P: ABC-73 ya persiste solicitud y todos sus ítems juntos
    DB-->>P: Solicitud 27, orden 15, material 8, 12.5000 kg
    Note over P,T: Publicador genérico existente; conectar ABC-73 queda pendiente
    P->>T: SolicitudMaterialAlmacen.v1 (envío futuro)
    Note over P,T: eventId propio A, correlationId C
    Note over T,I: Suscripción de Inventarios sin nombre/configuración en el repositorio
    T-->>I: Solicitud correlacionada (entrega futura)
    I-->>R: SolicitudMaterialAlmacenEstadoActualizado.v1 (respuesta futura)
    Note over I,R: eventId propio B, correlationId C, requestEventId A
    Note over I,R: solicitudId 27, ordenId 15, PENDIENTE a APROBADA
    Note over R,P: Topic/ruta, suscripción y consumidor de respuesta pendientes
    R-->>P: Respuesta correlacionada (recepción futura)
    Note over DB,P: La respuesta refiere los ítems originales; no cambia stock por este contrato
```

| Nombre del plan | Nombre real representado en el diagrama |
| --- | --- |
| `MaterialesSolicitados.v1` | `SolicitudMaterialAlmacen.v1` |
| `MaterialesSolicitudRespondida.v1` | `SolicitudMaterialAlmacenEstadoActualizado.v1` |

`A`, `B` y `C` son abreviaturas para explicar la relación. Los UUID completos
están en los ejemplos JSON del contrato. El transporte de respuesta es un paso
pendiente, no un nombre de topic o suscripción configurado.
