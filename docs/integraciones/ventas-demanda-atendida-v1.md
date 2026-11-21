# Contrato DemandaAtendida v1 (ABC-431)

Aviso asíncrono de un solo sentido: `produccion-service` informa a Ventas y
Marketplace que una demanda quedó atendida, para que Ventas avise al cliente
que su pedido está listo. No se espera respuesta.

| Rol | Servicio |
|---|---|
| Emisor | `produccion-service` (`source: "produccion-service"`) |
| Receptores | Ventas y Marketplace |

Se publica en el topic compartido (`PUBSUB_TOPIC_ID`) mediante el outbox
existente (ver `pubsub-entorno.md`). Ventas y Marketplace no son reales: el
contrato se prueba con una suscripción de prueba en el emulador, identificada
como prueba.

## Versión

La versión va en el nombre del evento: `DemandaAtendida.v1`. El validador
rechaza cualquier otro `eventType`. Un cambio incompatible será `.v2`, sin
modificar v1.

## Ejemplo

```json
{
  "eventId": "8d2a4f6b-3c1e-4b7a-9e5d-1f0a2b3c4d5e",
  "eventType": "DemandaAtendida.v1",
  "occurredAt": "2026-11-20T15:30:00.000Z",
  "source": "produccion-service",
  "correlationId": "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  "data": {
    "demandaId": "12",
    "origen": "VENTAS",
    "demandaExternaId": "PED-2026-0042",
    "items": [
      { "productoCodigo": "PROD-001", "cantidadAtendida": "10.0000", "unidad": "UN" },
      { "productoCodigo": "PROD-002", "cantidadAtendida": "2.5000", "unidad": "KG" }
    ],
    "fechaAtencion": "2026-11-20T15:29:58.000Z"
  }
}
```

## Campos (todos obligatorios)

| Campo | Tipo | Regla | Origen |
|---|---|---|---|
| `eventId` | UUID | identifica el evento; clave de idempotencia | outbox |
| `eventType` | texto | exactamente `DemandaAtendida.v1` | — |
| `occurredAt` | ISO 8601 con zona | | momento del evento |
| `source` | texto | `produccion-service` | — |
| `correlationId` | UUID | | — |
| `data.demandaId` | texto | BIGINT positivo | `demandas.id` |
| `data.origen` | texto | `VENTAS` o `FACTURACION` | `demandas.origen` |
| `data.demandaExternaId` | texto | no vacío, máximo 80 caracteres | `demandas.demanda_externa_id` |
| `data.items` | lista | al menos 1 elemento | `demandas_items` |
| `data.items[].productoCodigo` | texto | no vacío, máximo 80; no se repite en la lista | `demandas_items.producto_codigo` |
| `data.items[].cantidadAtendida` | texto decimal | mayor que 0, hasta 4 decimales | `demandas_items.cantidad` |
| `data.items[].unidad` | texto | no vacío, máximo 20 caracteres | `demandas_items.unidad` |
| `data.fechaAtencion` | ISO 8601 con zona | | momento en que la demanda queda atendida |

Hoy no existe atención parcial: `cantidadAtendida` es igual a la cantidad de la
demanda. Si se agrega atención parcial, el cambio se evalúa como `.v2` o como
campo nuevo compatible.

Identificadores y cantidades se serializan como texto para conservar la
precisión de `BIGINT` y `NUMERIC`, igual que los demás contratos.

## Idempotencia

Se emite un solo evento por demanda. Un reintento de publicación conserva el
mismo `eventId` y los mismos datos. El receptor debe ignorar un `eventId` ya
procesado.

## Validación

`validarDemandaAtendidaV1` (en
`services/produccion-service/src/integraciones/contratos/`) acepta el ejemplo y
lanza `DemandaAtendidaV1InvalidoError`, con la lista de `{campo, motivo}`, ante
mensajes incompletos o inválidos.
