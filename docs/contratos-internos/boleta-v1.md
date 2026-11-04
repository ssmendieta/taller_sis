# Contrato interno de boleta v1

Contrato documental de ABC-233 para una futura integración entre Logística y
Despachos. Este documento no habilita una integración productiva, no publica a
Despachos y no crea topics ni suscripciones.

## Significado de negocio

Una **boleta emitida** es la constancia documental de que Logística registró
un traspaso de producto conforme. No confirma carga, salida de vehículo,
despacho, recepción del destinatario ni entrega física.

El estado de despacho o entrega pertenece a otro proceso y a otro contrato. El
evento `BoletaEmisionDocumentalRegistrada.v1` no representa ni permite inferir
ese estado. Del mismo modo,
`BoletaEmisionDocumentalRecepcionConfirmada.v1` solo confirmaría que el sistema
contraparte recibió el documento, no que recibió físicamente los productos.

## Enrutamiento por definir

El repositorio no contiene nombres acordados de recursos Pub/Sub para el flujo
Logística/Despachos. Por tanto, no se adopta el topic compartido de Producción
como recurso de este contrato.

| Recurso futuro | Nombre |
| --- | --- |
| Topic de ida, Logística a Despachos | **por definir** |
| Suscripción de Despachos a boletas | **por definir** |
| Topic de vuelta, Despachos a Logística | **por definir** |
| Suscripción de Logística a respuestas | **por definir** |

Antes de implementar la integración se debe acordar:

- proyecto y ambiente de cada recurso;
- nombres completos de topics y suscripciones;
- si ida y vuelta usan recursos dedicados o compartidos con filtrado;
- identificador definitivo de `source` para Despachos;
- permisos IAM de publicador y suscriptor;
- retención, reintentos, dead-letter policy y filtros por `eventType`;
- responsable de provisionar y operar cada recurso.

## Sobre común y atributos

Ambos mensajes reutilizan `PubSubEvent<T>`: `eventId`, `eventType`,
`occurredAt`, `source`, `correlationId` y `data`. `eventType` termina en `.v1`;
un cambio incompatible requiere una nueva versión.

El publicador también debe enviar como atributos Pub/Sub `eventId`,
`eventType`, `source` y `correlationId`, con los mismos valores del JSON.
`messageId` lo asigna Google y no forma parte del payload.

`correlationId` identifica todo el intercambio. La respuesta conserva el mismo
valor y además copia el `eventId` de salida en `data.requestEventId`. Una
respuesta tiene su propio `eventId`.

## Salida futura: BoletaEmisionDocumentalRegistrada.v1

Solo se construiría desde una boleta validada que ya quedó `EMITIDA`. El
ejemplo incluye el identificador local y la versión inmutable de la boleta.

```json
{
  "eventId": "c7cdedb8-9d1e-479c-887e-5351cc78162a",
  "eventType": "BoletaEmisionDocumentalRegistrada.v1",
  "occurredAt": "2026-10-18T01:10:08.652Z",
  "source": "logistica-service",
  "correlationId": "c5f93833-6ab8-4a24-877c-a60545d49a8c",
  "data": {
    "boletaId": "10",
    "boletaVersion": 1,
    "boletaNumero": "BOL-2026-00010",
    "solicitudSalidaId": "7",
    "ordenId": "8",
    "ordenCodigo": "ORD-0008",
    "responsableUsuarioId": "42",
    "emitidaAt": "2026-10-18T01:10:08.652Z",
    "destinoDocumental": "Almacén central",
    "items": [
      {
        "referencia": "L-1",
        "cantidad": "6.0000"
      }
    ]
  }
}
```

`boletaId` identifica el documento local. `boletaVersion` identifica su
representación inmutable; la primera emisión usa `1`. Reintentar el mismo
evento conserva `eventId`, `boletaId`, `boletaVersion`, `correlationId` y todo
el contenido. Las cantidades viajan como texto decimal con cuatro posiciones.

## Respuesta futura: BoletaEmisionDocumentalRecepcionConfirmada.v1

Este mensaje confirmaría exclusivamente la recepción técnica/documental del
evento por la contraparte.

```json
{
  "eventId": "3c20e3b5-72fe-4cd2-95ee-dd73808c46da",
  "eventType": "BoletaEmisionDocumentalRecepcionConfirmada.v1",
  "occurredAt": "2026-10-18T01:10:11.652Z",
  "source": "despachos-service",
  "correlationId": "c5f93833-6ab8-4a24-877c-a60545d49a8c",
  "data": {
    "boletaId": "10",
    "boletaVersion": 1,
    "requestEventId": "c7cdedb8-9d1e-479c-887e-5351cc78162a",
    "estadoRecepcionDocumental": "RECIBIDO",
    "procesadoAt": "2026-10-18T01:10:11.652Z"
  }
}
```

`estadoRecepcionDocumental` admite `RECIBIDO` o `RECHAZADO`. Un rechazo debe
incluir `codigoRechazo` y puede incluir `detalle`. Ninguno de estos estados es
un estado de despacho o entrega física. El valor definitivo de `source` de la
contraparte también debe acordarse antes de implementar.

## Idempotencia y evolución

- Un consumidor deduplica por `eventId`.
- El mismo `eventId` con contenido diferente es un error de integridad.
- Una respuesta debe coincidir simultáneamente en `correlationId`,
  `data.requestEventId`, `data.boletaId` y `data.boletaVersion`.
- Campos nuevos compatibles pueden agregarse como opcionales; cambios
  incompatibles requieren `.v2`.
- Este contrato no define comandos ni eventos de carga, despacho, transporte,
  recepción de mercadería o entrega.

## Evidencia de prueba

Se realizó una sola publicación mediante el `PubSubPublisherService` existente.
No se publicó a un recurso de Despachos, no se creó ni borró ninguna
suscripción y no se hizo pull.

| Dato | Evidencia |
| --- | --- |
| Topic técnico solicitado | `projects/project-a96e5fe1-5ba6-4698-a85/topics/ucb-sis323-sub-g` |
| `eventId` | `fe5c43f4-2c0f-4211-8a59-2c76d44be5ca` |
| `messageId` asignado por Google | `22046936713059191` |
| Fecha y hora local | `2026-10-17T21:10:08.652-04:00` (`America/La_Paz`) |
| Fecha y hora del evento | `2026-10-18T01:10:08.652Z` |

Contenido publicado:

```json
{
  "eventId": "fe5c43f4-2c0f-4211-8a59-2c76d44be5ca",
  "eventType": "BoletaContratoPrueba.v1",
  "occurredAt": "2026-10-18T01:10:08.652Z",
  "source": "logistica-service",
  "correlationId": "ab8f5cb4-0afa-465a-9d3c-e1f41b41b401",
  "data": {
    "boletaId": "10",
    "boletaVersion": 1,
    "boletaNumero": "BOL-2026-00010",
    "solicitudSalidaId": "7",
    "ordenId": "8",
    "ordenCodigo": "ORD-0008",
    "responsableUsuarioId": "42",
    "emitidaAt": "2026-10-18T01:10:08.652Z",
    "destinoDocumental": "Almacén central",
    "items": [
      {
        "referencia": "L-1",
        "cantidad": "6.0000"
      }
    ]
  }
}
```

Los atributos enviados fueron `eventId`, `eventType`, `source` y
`correlationId`, con los mismos valores del payload. El `topicId` confirmado
por el publicador fue `ucb-sis323-sub-g`.

La lectura por otro proceso **no se comprobó en real** porque no se definió ni
se usó una suscripción disponible para esta prueba. El `messageId` demuestra la
aceptación de la publicación por Google Pub/Sub, no el consumo del mensaje por
Despachos u otro proceso.
