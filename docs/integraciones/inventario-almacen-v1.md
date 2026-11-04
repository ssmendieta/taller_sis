# Contratos Inventario/Almacén v1

Contratos de ABC-277 implementados por ABC-278. Producción envía mensajes al
topic existente de `PUBSUB_TOPIC_ID` y consume respuestas desde la suscripción
configurada en `PUBSUB_SUBSCRIPTION_ID`. La aplicación usa outbox e inbox; no
crea recursos de Google Cloud ni accede a la base de datos externa.

## Mensajes salientes de este sprint

### DisponibilidadMaterialSolicitada.v1

```json
{
  "eventId": "d59541e7-d44c-4138-92e1-3432310cd1aa",
  "eventType": "DisponibilidadMaterialSolicitada.v1",
  "occurredAt": "2026-10-11T18:10:00.000Z",
  "source": "produccion-service",
  "correlationId": "67bfbe4d-9a02-4cb9-b707-d68434ba2c4a",
  "data": {
    "consultaId": "DISP-ORD-0015-V1",
    "consultaVersion": 1,
    "ordenId": 15,
    "ordenCodigo": "ORD-0015",
    "fechaNecesaria": "2026-10-13",
    "materiales": [{
      "materialId": "8",
      "materialCodigo": "HAR-001",
      "materialNombre": "Harina de trigo",
      "cantidadRequerida": "12.5000",
      "unidad": "kg"
    }]
  }
}
```

### SolicitudMaterialAlmacen.v1

```json
{
  "eventId": "de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6",
  "eventType": "SolicitudMaterialAlmacen.v1",
  "occurredAt": "2026-10-11T18:15:00.000Z",
  "source": "produccion-service",
  "correlationId": "81a265f2-15ec-430c-98e5-e1fa08bb7412",
  "data": {
    "solicitudId": "27",
    "solicitudVersion": 1,
    "ordenId": 15,
    "ordenCodigo": "ORD-0015",
    "solicitanteUsuarioId": "42",
    "fechaNecesaria": "2026-10-13",
    "items": [{
      "materialId": "8",
      "materialCodigo": "HAR-001",
      "materialNombre": "Harina de trigo",
      "cantidad": "12.5000",
      "unidad": "kg"
    }]
  }
}
```

`solicitudId` corresponde a la solicitud local persistida. El contrato conserva
los estados locales existentes `PENDIENTE`, `APROBADA` y `CANCELADA`.

## Mensajes entrantes

### DisponibilidadMaterialRespondida.v1

Mantiene `consultaId`, `consultaVersion`, `ordenId` y `correlationId`; incluye
`requestEventId`, `vigenteAt` y por cada material la cantidad disponible y uno
de los estados `SUFICIENTE`, `INSUFICIENTE` o `FALTANTE`.

```json
{
  "eventId": "fa7c5d18-9fb9-44c0-b59c-bf4452495647",
  "eventType": "DisponibilidadMaterialRespondida.v1",
  "occurredAt": "2026-10-11T18:10:03.000Z",
  "source": "inventario-service",
  "correlationId": "67bfbe4d-9a02-4cb9-b707-d68434ba2c4a",
  "data": {
    "consultaId": "DISP-ORD-0015-V1",
    "consultaVersion": 1,
    "requestEventId": "d59541e7-d44c-4138-92e1-3432310cd1aa",
    "ordenId": 15,
    "vigenteAt": "2026-10-11T18:10:03.000Z",
    "materiales": [{
      "materialId": "8",
      "materialCodigo": "HAR-001",
      "materialNombre": "Harina de trigo",
      "cantidadRequerida": "12.5000",
      "unidad": "kg",
      "cantidadDisponible": "20.0000",
      "estado": "SUFICIENTE"
    }]
  }
}
```

### SolicitudMaterialAlmacenEstadoActualizado.v1

```json
{
  "eventId": "9d08a84e-1f44-40b0-87be-e161d399371d",
  "eventType": "SolicitudMaterialAlmacenEstadoActualizado.v1",
  "occurredAt": "2026-10-11T18:15:05.000Z",
  "source": "almacen-service",
  "correlationId": "81a265f2-15ec-430c-98e5-e1fa08bb7412",
  "data": {
    "solicitudId": "27",
    "solicitudVersion": 2,
    "requestEventId": "de5d85ad-f8c5-4731-a75d-d8bd25ea2bf6",
    "ordenId": 15,
    "estadoAnterior": "PENDIENTE",
    "estadoNuevo": "APROBADA",
    "actualizadoAt": "2026-10-11T18:15:05.000Z"
  }
}
```

## Reglas de estado e idempotencia

- La disponibilidad global es suficiente solo cuando todos los materiales son
  `SUFICIENTE`.
- Una orden permanece bloqueada si la disponibilidad vigente contiene
  `INSUFICIENTE` o `FALTANTE`.
- Un `eventId` procesado no debe volver a producir efectos.
- El mismo `eventId` con contenido diferente es un error de integridad.
- Una respuesta con `consultaVersion` anterior no reemplaza la vigente.
- Una actualización con `solicitudVersion` anterior no retrocede el estado.
- Reintentar un mensaje saliente conserva `eventId` y la identidad de negocio.

El consumidor confirma los mensajes permanentes inválidos para evitar poison
messages y solicita redelivery cuando el fallo es transitorio. El inbox y la
actualización de negocio se confirman en una misma transacción.

## API y persistencia en Producción

- `POST /ordenes/:id/disponibilidad-materiales/consultar` crea o reutiliza una
  consulta `PENDIENTE` y guarda su evento outbox atómicamente.
- `GET /ordenes/:id/disponibilidad-materiales` devuelve el snapshot externo más
  reciente; no consulta `inventario_material` ni produce mensajes.
- `consultas_disponibilidad` conserva versión, correlación, eventos y vigencia.
- `consulta_disponibilidad_items` conserva el snapshot requerido y respondido.
- Una orden no puede iniciar sin una respuesta vigente, ni cuando algún material
  está `INSUFICIENTE` o `FALTANTE`.

## Campos obligatorios

Todos los mensajes requieren `eventId`, `eventType`, `occurredAt`, `source`,
`correlationId` y `data`. Los identificadores, versiones, fechas, materiales,
cantidades y unidades mostrados en cada ejemplo también son obligatorios. Solo
`motivo`, `codigoRechazo` y `detalle` son opcionales según el resultado.
