# Contrato Contabilidad v1

Contrato de ABC-249 para comunicar el cierre de Producción. Durante este sprint
Producción **solo publica** en el único topic indicado por `PUBSUB_TOPIC_ID`.
No se crean topics ni suscripciones y no se consumen respuestas.

## Enrutamiento

Los tipos de mensaje comparten el mismo sobre y se diferencian con `eventType`.
`eventId` identifica una entrega, `correlationId` identifica el flujo completo y
`requestEventId` enlaza una eventual respuesta con el mensaje que la originó.

## Salida: ProduccionCerrada.v1

Este es el único mensaje de este contrato que Producción publicará en el sprint.
Solo debe construirse para una orden `FINALIZADA` con un resumen de cierre
inmutable y validado.

```json
{
  "eventId": "7eb50b45-f4f1-47a6-9af5-1f0f98711dd8",
  "eventType": "ProduccionCerrada.v1",
  "occurredAt": "2026-10-11T18:00:00.000Z",
  "source": "produccion-service",
  "correlationId": "461f20b3-526f-48c2-82b8-713c0f709b3c",
  "data": {
    "cierreId": "CIERRE-ORD-0015-V1",
    "cierreVersion": 1,
    "resumenId": "RES-ORD-0015-V1",
    "ordenId": 15,
    "ordenCodigo": "ORD-0015",
    "producto": {
      "productoId": 3,
      "codigo": "PAN-001",
      "nombre": "Pan integral",
      "unidad": "unidad"
    },
    "cantidadSolicitada": "30.0000",
    "cantidadConforme": "30.0000",
    "consumos": [{
      "materialId": "8",
      "materialCodigo": "HAR-001",
      "materialNombre": "Harina de trigo",
      "cantidad": "12.5000",
      "unidad": "kg"
    }],
    "finalizadaAt": "2026-10-11T17:55:00.000Z"
  }
}
```

## Respuesta futura: RegistroContableResultado.v1

Se define para estabilizar el contrato, pero Producción no se suscribe, no lo
lee y no lo persiste durante este sprint.

```json
{
  "eventId": "f03b8547-47aa-4c66-a93c-d8f6162730c7",
  "eventType": "RegistroContableResultado.v1",
  "occurredAt": "2026-10-11T18:00:03.000Z",
  "source": "contabilidad-simulator",
  "correlationId": "461f20b3-526f-48c2-82b8-713c0f709b3c",
  "data": {
    "cierreId": "CIERRE-ORD-0015-V1",
    "cierreVersion": 1,
    "ordenId": 15,
    "requestEventId": "7eb50b45-f4f1-47a6-9af5-1f0f98711dd8",
    "estado": "RECIBIDO",
    "procesadoAt": "2026-10-11T18:00:03.000Z"
  }
}
```

Los estados permitidos son `RECIBIDO` y `RECHAZADO`. Un rechazo debe incluir
`codigoRechazo` y puede incluir `detalle`. `RECIBIDO` solo significa recepción
administrativa; no representa la aprobación de un asiento contable.

## Reglas de versión e idempotencia

- `eventType` termina en `.v1`; un cambio incompatible requiere `.v2`.
- `cierreId` junto con `cierreVersion` identifica el resumen inmutable.
- Reintentar una publicación conserva `eventId` y el contenido original.
- Las cantidades decimales viajan como texto con cuatro posiciones.
- Los consumidores futuros deben ignorar campos opcionales desconocidos.

## Evidencia local de publicación

La prueba `contratos-salida.spec.ts` publica el ejemplo mediante un cliente
simulado y comprueba que usa exactamente el único `topicId` configurado. Una
prueba real, fuera del alcance local, solo necesitaría registrar `eventId`,
`correlationId`, `messageId` y `topicId`; no requiere leer una respuesta.
