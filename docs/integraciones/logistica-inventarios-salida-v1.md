# Contrato v1: salida de productos de Logística a Inventarios (ABC-384)

ABC-385. Fuente de verdad del código:
`services/logistica-service/src/integraciones/contratos/inventarios-salida-v1.ts`
y su validador. **Contrato propuesto por Logística; debe confirmarse con el
equipo de Inventarios** antes de la integración real.

## Flujo

1. Al despachar una ruta (ABC-376), Logística guarda `DespachoRutaRegistrado.v1`
   en su outbox **en la misma transacción** que el despacho (ABC-386).
2. El publicador del outbox lo envía a Pub/Sub después del commit y guarda el
   `messageId`. Publicar **no** significa que Inventarios registró la salida.
3. Inventarios responde `SalidaInventarioResultado.v1` con `ACEPTADA` o
   `RECHAZADA`. Logística la aplica a la ruta una sola vez (ABC-387).

Ambos mensajes llevan atributos Pub/Sub `eventId`, `eventType`, `source` y
`correlationId`, iguales a los del cuerpo. La respuesta conserva el
`correlationId` del despacho y referencia su `eventId` en `requestEventId`.

## `DespachoRutaRegistrado.v1` (Logística → Inventarios)

```json
{
  "eventId": "5b0c8a1e-2f4d-4c6b-9a7e-1d2c3b4a5f60",
  "eventType": "DespachoRutaRegistrado.v1",
  "occurredAt": "2026-11-12T14:00:00.000Z",
  "source": "logistica-service",
  "correlationId": "8f7e6d5c-4b3a-4291-8c7d-6e5f4a3b2c1d",
  "data": {
    "rutaId": "9",
    "fechaProgramada": "2026-11-12",
    "despachadaEn": "2026-11-12T14:00:00.000Z",
    "despachadaPorUsuarioId": "4",
    "vehiculoExternoId": "VEH-01",
    "choferExternoId": "CHO-07",
    "boletas": [
      {
        "boletaId": "1",
        "numero": "BOL-2026-00001",
        "ordenId": "2",
        "items": [{ "loteReferencia": "LOT-GAL-001", "cantidad": "6.0000" }]
      }
    ]
  }
}
```

| Campo | Regla |
| --- | --- |
| `rutaId`, `despachadaPorUsuarioId`, `boletaId`, `ordenId` | id positivo como texto |
| `fechaProgramada` | `AAAA-MM-DD` |
| `despachadaEn`, `occurredAt` | ISO 8601 con zona horaria |
| `boletas` | al menos una, sin repetir; solo boletas EMITIDAS de paradas no anuladas |
| `items[].cantidad` | decimal positivo en texto con exactamente 4 decimales |

Un mismo despacho genera **un solo** evento lógico: el outbox tiene unicidad por
ruta y tipo de evento. Los reintentos reenvían el mismo `eventId` y cuerpo.

## `SalidaInventarioResultado.v1` (Inventarios → Logística)

```json
{
  "eventId": "0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b",
  "eventType": "SalidaInventarioResultado.v1",
  "occurredAt": "2026-11-12T14:00:05.000Z",
  "source": "inventarios-service",
  "correlationId": "8f7e6d5c-4b3a-4291-8c7d-6e5f4a3b2c1d",
  "data": {
    "rutaId": "9",
    "requestEventId": "5b0c8a1e-2f4d-4c6b-9a7e-1d2c3b4a5f60",
    "estado": "RECHAZADA",
    "procesadoAt": "2026-11-12T14:00:05.000Z",
    "codigoRechazo": "LOTE_SIN_STOCK",
    "detalle": "El lote LOT-GAL-001 no tiene existencias"
  }
}
```

| Campo | Regla |
| --- | --- |
| `estado` | `ACEPTADA` o `RECHAZADA` |
| `codigoRechazo` | obligatorio con `RECHAZADA`; prohibido con `ACEPTADA` |
| `detalle` | opcional, hasta 500 caracteres |
| `requestEventId` | `eventId` del despacho; con `rutaId` y `correlationId` debe coincidir con el evento enviado |

El primer resultado final de una ruta es el que vale: una respuesta posterior se
registra como IGNORADA. El mismo `eventId` con otro contenido es un rechazo
permanente.
