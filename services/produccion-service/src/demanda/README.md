# Demanda de Ventas / Facturación (ABC-122)

Producción recibe pedidos por Google Cloud Pub/Sub y los guarda como demandas
`RECIBIDA`. No crea órdenes automáticamente; ABC-365 recibe su confirmación.

## Contrato `DemandaRegistrada.v1` (propuesto, a confirmar con Ventas)

Ejemplo completo en `integraciones/contratos/ventas-demanda-v1.ts`.

```json
{
  "eventId": "<uuid>", "eventType": "DemandaRegistrada.v1", "occurredAt": "<ISO 8601>",
  "source": "ventas-service", "correlationId": "<uuid>",
  "data": {
    "origen": "VENTAS",
    "demandaExternaId": "PED-2026-0042",
    "fechaRequerida": "2026-11-15",
    "items": [{ "productoCodigo": "GAL-001", "cantidad": "40.0000", "unidad": "kg" }]
  }
}
```

## Configuración (ABC-356)

| Variable | Uso |
| --- | --- |
| `PUBSUB_DEMANDA_CONSUMER_ENABLED` | `true` activa el consumidor (por defecto `false`) |
| `PUBSUB_DEMANDA_SUBSCRIPTION_ID` | suscripción de Producción al topic de Ventas |
| `GCP_PROJECT_ID` | proyecto de Pub/Sub |
| `PUBSUB_DEMANDA_CONFIRMACION_CONSUMER_ENABLED` | `true` activa el consumidor de `DemandaConfirmada.v1` |
| `PUBSUB_DEMANDA_CONFIRMACION_SUBSCRIPTION_ID` | suscripción existente para confirmaciones |
| `PUBSUB_DEMANDA_CONFIRMACION_RETRY_MAX_ATTEMPTS` | máximo de intentos persistentes de correlación (por defecto 5) |
| `PUBSUB_DEMANDA_CONFIRMACION_RETRY_INTERVAL_MS` | intervalo local entre intentos (por defecto 5000 ms) |

## Confirmación `DemandaConfirmada.v1` (ABC-365)

```json
{
  "eventId": "<uuid>", "eventType": "DemandaConfirmada.v1", "occurredAt": "<ISO 8601>",
  "source": "ventas-service", "correlationId": "<uuid>",
  "data": { "origen": "VENTAS", "demandaExternaId": "PED-2026-0042" }
}
```

La confirmación y el inbox se guardan en una transacción. Una redelivery con el
mismo `eventId` no repite el efecto. Si la demanda aún no existe, el inbox queda
`PENDIENTE`, se reintenta de forma acotada y permanece trazable incluso al agotar
los intentos. La aplicación consume una suscripción existente; no crea recursos
de Google Cloud.

## Comportamiento

| Mensaje | Resultado | ACK |
| --- | --- | --- |
| Válido y nuevo | demanda + ítems + inbox `PROCESADO` en una transacción | después del commit |
| Mismo `eventId` y contenido (redelivery) | `DUPLICADO`, sin escribir | sí |
| Otro `eventId`, misma demanda y mismo contenido (ABC-357) | `DUPLICADO`, inbox `IGNORADO` | sí |
| Misma demanda con contenido distinto (ABC-357) | rechazo `DEMANDA_CONTRADICTORIA` en `demandas_rechazadas`; la demanda válida no cambia | sí |
| Datos inválidos (ABC-357) | rechazo `EVENTO_INVALIDO` con el campo y motivo | sí |
| Mismo `eventId` con otro contenido | rechazo `EVENTO_CONTRADICTORIO` | sí |
| No es JSON | se registra `DEMANDA_RECHAZADA` en el log (no tiene id para trazar) | sí |
| Falla transitoria (base caída, etc.) | sin cambios | **NACK**, Pub/Sub reintenta |

Reglas de datos (ABC-357): origen `VENTAS` o `FACTURACION`, id externo de 1 a 80
caracteres, fecha `YYYY-MM-DD` real, al menos un ítem, producto no repetido,
cantidad decimal positiva en texto con hasta 4 decimales y unidad del catálogo.
Las cantidades se normalizan (`"40"` = `"40.0000"`) antes de comparar contenidos.

Entregas simultáneas de la misma demanda: la demanda existente se bloquea y la
restricción `uq_demanda_origen_externa` garantiza una sola fila; la entrega que
pierde se reintenta una vez y responde `DUPLICADO`.

## Consultas HTTP

- `GET /demandas`: bandeja general de demandas recibidas, con filtros por origen y estado.
- `GET /demandas/planificables`: bandeja exclusiva de demandas `CONFIRMADA`, con filtro por
  origen y paginación. El estado no es un parámetro permitido y la consulta es de solo lectura:
  no crea órdenes ni modifica demandas (ABC-366).
