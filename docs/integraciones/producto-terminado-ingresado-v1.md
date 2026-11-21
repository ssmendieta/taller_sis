# Contrato ProductoTerminadoIngresado v1 (ABC-437)

Aviso asíncrono de un solo sentido: `produccion-service` informa a Inventarios
que un lote conforme quedó terminado, para que el almacén registre el producto
como disponible. No se espera respuesta.

| Rol | Servicio |
|---|---|
| Emisor | `produccion-service` (`source: "produccion-service"`) |
| Receptor | Inventarios/Almacén |

Se publica en el topic compartido (`PUBSUB_TOPIC_ID`) mediante el outbox
existente (ver `pubsub-entorno.md`). Inventarios no es real: el contrato se
prueba con una suscripción de prueba en el emulador, identificada como prueba.

## Versión

La versión va en el nombre del evento: `ProductoTerminadoIngresado.v1`. El
validador rechaza cualquier otro `eventType`. Un cambio incompatible será
`.v2`, sin modificar v1.

## Ejemplo

```json
{
  "eventId": "3b1f6c1e-6f0a-4c52-9d5e-2a7f3c9b8e41",
  "eventType": "ProductoTerminadoIngresado.v1",
  "occurredAt": "2026-11-20T15:30:00.000Z",
  "source": "produccion-service",
  "correlationId": "c4a8d2f7-1b63-4e9a-8f05-7d2e6b9a1c33",
  "data": {
    "loteId": "4",
    "loteCodigo": "L-0004",
    "ordenId": 15,
    "ordenCodigo": "ORD-0015",
    "productoId": "3",
    "cantidadConforme": "10.0000",
    "fechaIngreso": "2026-11-20T15:29:58.000Z"
  }
}
```

## Campos (todos obligatorios)

| Campo | Tipo | Regla | Origen |
|---|---|---|---|
| `eventId` | UUID | identifica el evento; clave de idempotencia | outbox |
| `eventType` | texto | exactamente `ProductoTerminadoIngresado.v1` | — |
| `occurredAt` | ISO 8601 con zona | | momento del evento |
| `source` | texto | `produccion-service` | — |
| `correlationId` | UUID | | — |
| `data.loteId` | texto | BIGINT positivo | `lotes.id` |
| `data.loteCodigo` | texto | no vacío | `lotes.codigo` |
| `data.ordenId` | entero | positivo | orden del lote |
| `data.ordenCodigo` | texto | no vacío | orden del lote |
| `data.productoId` | texto | BIGINT positivo | producto de la orden |
| `data.cantidadConforme` | texto decimal | mayor que 0, hasta 4 decimales | `lotes.cantidad` |
| `data.fechaIngreso` | ISO 8601 con zona | | `lotes.fecha_hora` |

Identificadores y cantidades se serializan como texto para conservar la
precisión de `BIGINT` y `NUMERIC`, igual que los demás contratos.

## Idempotencia

Un reintento de publicación conserva el mismo `eventId` y los mismos datos del
lote. El receptor debe ignorar un `eventId` ya procesado.

## Validación

`validarProductoTerminadoIngresadoV1` (en
`services/produccion-service/src/integraciones/contratos/`) acepta el ejemplo y
lanza `ProductoTerminadoIngresadoV1InvalidoError`, con la lista de
`{campo, motivo}`, ante mensajes incompletos o inválidos.
