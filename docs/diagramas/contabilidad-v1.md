# Flujo Contabilidad v1

La secuencia actual de ABC-114 está en
[09-contabilidad-cierre-costos.mmd](sprint-3/secuencia/09-contabilidad-cierre-costos.mmd), con
[PNG](sprint-3/secuencia/09-contabilidad-cierre-costos.png),
[SVG](sprint-3/secuencia/09-contabilidad-cierre-costos.svg) y
[PDF](sprint-3/secuencia/09-contabilidad-cierre-costos.pdf).

Incluye el cierre y outbox en una transacción, la publicación asíncrona de
`ProduccionCerrada.v1` con el costo base del catálogo en BOB (ABC-345), los reintentos con la misma identidad y el consumo de
`RegistroContableResultado.v1`. El estado contable termina en `RECIBIDO` o
`RECHAZADO`; el consumidor evita reaplicar duplicados y confirma después del
commit. `PUBLICADO` indica confirmación del broker, no recepción contable.

La revisión y los límites están en
[ABC-406](../evidencias/sprint-3/ABC-406.md). El contrato está en
[Contabilidad v1](../integraciones/contabilidad-v1.md).
