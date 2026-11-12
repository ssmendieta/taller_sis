# Contrato Contabilidad v1

Contrato de ABC-249/252/253 para comunicar el cierre de Producción y recibir el
resultado contable. En despliegues reales la aplicación no provisiona recursos;
la infraestructura local de ABC-253 crea recursos exclusivamente en el emulador.

## Enrutamiento

Los tipos de mensaje comparten el mismo sobre y se diferencian con `eventType`.
`eventId` identifica un evento lógico, `correlationId` identifica el flujo completo y
`requestEventId` enlaza una eventual respuesta con el mensaje que la originó.

## Salida: ProduccionCerrada.v1

Este es el mensaje que Producción publica mediante el outbox.
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

## Respuesta: RegistroContableResultado.v1

Producción lo consume desde una suscripción independiente y persiste el inbox y
el resultado sobre el cierre en una sola transacción.

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
`codigoRechazo` (hasta 100 caracteres) y puede incluir `detalle` (hasta 500).
`RECIBIDO` solo significa recepción
administrativa; no representa la aprobación de un asiento contable.

## Estado y transiciones en Producción

Todo cierre nace con `estadoContable=PENDIENTE`. Las únicas transiciones son
`PENDIENTE -> RECIBIDO` y `PENDIENTE -> RECHAZADO`; ambos destinos son finales.
Una respuesta posterior con otro `eventId` se conserva en `eventos_inbox` como
`IGNORADO`, pero no pisa el primer resultado. Una redelivery con el mismo
`eventId` y payload devuelve `DUPLICADO` y no agrega otra fila ni altera el
estado. El mismo `eventId` con contenido distinto es un error permanente.

Antes de aplicar el cambio se busca el `ProduccionCerrada.v1` original por
`data.requestEventId` y se exige coincidencia de `correlationId`, `cierreId`,
`cierreVersion` y `ordenId`. El snapshot productivo sigue siendo inmutable; la
migración 21 solo habilita las columnas controladas del resultado contable.

## Configuración del receptor

```env
PUBSUB_CONTABILIDAD_CONSUMER_ENABLED=false
PUBSUB_CONTABILIDAD_RESULTADOS_TOPIC_ID=taller-contabilidad-resultados-local
PUBSUB_CONTABILIDAD_RESULTADOS_SUBSCRIPTION_ID=taller-produccion-contabilidad-local
```

Con el flag en `false`, la falta de topic o suscripción no impide el arranque.
El consumidor valida los atributos `eventId`, `eventType` y `correlationId`
contra el JSON. Hace ACK después del commit; hace ACK y log para errores
permanentes, y NACK para fallos transitorios.

## Costos base por orden (ABC-345)

Contabilidad y Almacén no existen como sistemas reales en este proyecto: no hay un
equipo externo con quien acordar el contrato, así que **el proyecto define la fuente
de costos**. Es una definición interna de referencia, no un precio contable.

| Decisión | Valor definido |
| --- | --- |
| Fuente de precios | Catálogo de materiales de Producción (`materiales.costo_unitario`, nullable) |
| Moneda | `BOB` (restricción `ck_materiales_moneda_costo`) |
| Precisión | Texto decimal con 4 posiciones, como las cantidades; `NUMERIC(14,4)` en BD |
| Redondeo | Half-up a 4 decimales, con enteros escalados (`BigInt`), nunca `number` |
| Unidad | El precio aplica solo a consumos en la unidad del material; otra unidad (p. ej. `g` frente a `kg`) queda PENDIENTE, sin conversión |

### Ampliación de `ProduccionCerrada.v1` (aditiva y opcional)

Cada consumo agrega `estadoCosto` (`CALCULADO` | `PENDIENTE`) y, solo si es
`CALCULADO`, `costoUnitario` y `costoTotal`. El evento agrega `costoBase`:
`{ moneda: "BOB", fuentePrecios: "CATALOGO_MATERIALES", estado, total? }`, con
`estado` `COMPLETO` (todos calculados; incluye `total`), `PARCIAL` o `PENDIENTE` (sin
`total`: nunca se informa un total parcial). Un cierre sin consumos es `COMPLETO` con
total `0.0000`. Los consumidores v1 ignoran los campos nuevos; los eventos anteriores
no los traen y siguen siendo válidos. Un cambio incompatible requeriría `.v2`.

Si falta el precio, **no se inventa ningún importe**: el consumo queda `PENDIENTE`.

### Trazabilidad e inmutabilidad

Los consumos del evento se copian del snapshot inmutable de cierre (misma
`cantidad`, `unidad` y material) y se ligan por `cierreId`/`cierreVersion`/`resumenId`.
El snapshot **no se modifica** ni se reescribe: `cierres_produccion` conserva solo
cantidades. Los precios se leen del catálogo dentro de la misma transacción del cierre
y el costo queda congelado únicamente en el payload del outbox (los reintentos
conservan el mismo contenido aunque el precio cambie después). Snapshots y eventos
anteriores a ABC-345 no se recalculan.

### Estado de la implementación

- Implementado: migración 29 (`costo_unitario`, `moneda_costo`), campo opcional
  `costoUnitario` en `POST/PUT /materiales`, cálculo (`calcular-costo-base.ts`),
  ampliación del contrato, `validarCostoBaseProduccionCerradaV1` y seed demo
  (HAR-001 y MAN-001 con precio; AZU-001 sin precio, para mostrar `PENDIENTE`).
- Pendiente: integración con un sistema de Contabilidad real (no existe), historial
  de precios con vigencia, conversión entre unidades, otras monedas y que el
  consumidor valide el contrato ampliado. La mensajería real en Docker
  corresponde a ABC-399, no a esta subtarea.

### Cómo se valida

- `cd services/produccion-service && npx jest src/integraciones src/cierre-produccion src/materiales`
  (pruebas unitarias del cálculo, generador y validador; son simuladas, sin broker).
- `CIERRE_DB_REAL=1 npx jest src/cierre-produccion/cierre-produccion.persistencia.spec.ts`
  con PostgreSQL real en un esquema aislado: el payload del outbox trae costos, los
  consumos sin precio o en otra unidad quedan `PENDIENTE` y el snapshot no cambia.
- Para el demo: `npm run migration:run` y `npm run seed:demo`; luego cerrar una orden y
  revisar `eventos_outbox.payload`.

## Reglas de versión e idempotencia

- `eventType` termina en `.v1`; un cambio incompatible requiere `.v2`.
- `cierreId` junto con `cierreVersion` identifica el resumen inmutable.
- Reintentar una publicación conserva `eventId` y el contenido original.
- Las cantidades decimales viajan como texto con cuatro posiciones.
- Los consumidores futuros deben ignorar campos opcionales desconocidos.

## Evidencia local de publicación

### Conexión de negocio y outbox (ABC-121, subtarea 2)

`POST /cierres-produccion` conserva el permiso `ordenes.finalizar_cancelar`.
Prepara el snapshot validado de ABC-299 y su `ProduccionCerrada.v1` en la misma
transacción `REPEATABLE READ`, dentro de `produccion_db`. Si falla la inserción
del evento, se revierte también el snapshot; no se llama a Google desde esa
transacción. La respuesta 201 confirma la persistencia local de ambos registros,
sin esperar la disponibilidad del broker. El GET existente sigue consultando
el snapshot guardado.

El mensaje se construye exclusivamente desde la fila inmutable recién leída.
`cierreId` y `resumenId` contienen ambos el `id` persistido de `CierreProduccion`,
como texto: el modelo actual guarda cierre y resumen en una sola entidad.
`cierreVersion` conserva la versión explícita del snapshot y `occurredAt` su
`fechaCierre`. Los identificadores ilustrativos del ejemplo no imponen un formato.
El contrato v1 conserva sus campos actuales: solicitada y conforme; producida y
defectuosa permanecen en el snapshot sin agregar campos al contrato de ABC-249.
Los consumos mantienen cantidades decimales y unidades separadas.

El evento usa `aggregateType=CierreProduccion` y `aggregateId=snapshot.id`.
La restricción existente del outbox permite un único evento de este tipo por
snapshot; la restricción orden/versión y el bloqueo de orden impiden duplicar
el negocio. Repetir el POST devuelve 409; no reenvía ni crea otra versión.
Una versión nueva solicitada explícitamente genera su propio snapshot y evento.
Los snapshots anteriores a esta integración no se encolan automáticamente.

Después del commit, el publicador existente reclama pendientes con lease y
envía el payload persistido al único `PUBSUB_TOPIC_ID`. Un fallo devuelve el
evento a `PENDIENTE` con espera exponencial. Cada reintento conserva `eventId`,
`correlationId`, fechas y contenido, aunque se hayan corregido los datos fuente.
Los pendientes sobreviven al reinicio y se procesan al recuperar la conexión
con `PUBSUB_ENABLED=true` y las credenciales externas ya configuradas.

La confirmación de Google guarda `PUBLICADO`, `messageId` y `publicadoEn` en el
outbox. No modifica el snapshot ni declara `RECIBIDO` por Contabilidad. Si Google
acepta el mensaje pero falla el guardado local de la confirmación, puede haber
otra entrega con el mismo `eventId`: el consumidor futuro debe deduplicarlo.
Se garantiza un solo efecto de negocio local, no una sola entrega al broker.

Las pruebas `cierre-produccion.persistencia.spec.ts`, con `CIERRE_DB_REAL=1`,
usan PostgreSQL real en un esquema aislado y simulan únicamente Auth y el cliente
de Google. Comprueban rollback si falla el outbox, invisibilidad antes del commit,
broker caído y recuperación tras reiniciar Nest, payload congelado, confirmación
local perdida y POST concurrentes. No envían mensajes a Google real.

La prueba `contratos-salida.spec.ts` publica el ejemplo mediante un cliente
simulado y comprueba que usa exactamente el único `topicId` configurado. Una
prueba real, fuera del alcance local, solo necesitaría registrar `eventId`,
`correlationId`, `messageId` y `topicId`; no requiere leer una respuesta.
