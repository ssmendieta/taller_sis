# ABC-275: reintentos y diagnóstico de publicación

## Flujo antes de modificar código

1. Producción guarda la operación y su evento outbox en la misma transacción; el evento nace `PENDIENTE`.
2. Después del commit, un worker adquiere un lease, conserva `eventId` y `correlationId`, y publica el mensaje en Pub/Sub.
3. Si Pub/Sub falla, se guardan error y fechas y el mismo evento se reprograma; una entrega repetida debe ser deduplicada por `eventId` en el receptor.

## Estados y propiedad del evento

- `PENDIENTE`: reclamable cuando `proximo_intento_en` ha llegado.
- `PROCESANDO`: reservado hasta `bloqueo_hasta` mediante `bloqueo_token`.
- `PUBLICADO`: Pub/Sub devolvió un `messageId` y el propietario vigente guardó la confirmación.

El reclamo se ejecuta en una transacción PostgreSQL con bloqueo pesimista y
`SKIP LOCKED`. Dos workers pueden consultar al mismo tiempo, pero solo uno recibe
cada fila. Un lease vencido puede recuperarse con un token nuevo.

Las confirmaciones y fallos se escriben de forma condicional usando ID, estado y
token. Si el resultado llega después de perder el lease, no modifica la fila y
el ciclo incrementa `resultadosObsoletos`, además de emitir
`RESULTADO_OUTBOX_OBSOLETO` con el tipo de resultado tardío.

## Política de reintento

La espera se calcula después del fallo:

```text
min(OUTBOX_RETRY_BASE_MS * 2^(intentos - 1), OUTBOX_RETRY_MAX_MS)
```

El fallo conserva el payload, `eventId` y `correlationId`; registra
`ultimo_error`, mantiene `ultimo_intento_en`, programa `proximo_intento_en` y
libera el lease. El siguiente reclamo incrementa `intentos`.

## Garantía de entrega

El publicador ofrece entrega al menos una vez. Si Pub/Sub acepta un mensaje y el
proceso cae antes de guardar `PUBLICADO`, el evento puede publicarse de nuevo.
Por eso el receptor debe registrar `eventId` con unicidad y aplicar el efecto de
negocio en la misma transacción que su inbox.

Este repositorio aún no contiene el simulador, consumidor ni inbox asignados a
ABC-243 y ABC-244. ABC-275 preserva la identidad necesaria para deduplicar, pero
la comprobación del único efecto de negocio requiere integrar uno de esos
receptores. ABC-269 es responsable de guardar la evidencia de esa prueba en
Jira.

## Verificación local

```powershell
cd services/produccion-service
npm.cmd test -- --runInBand src/integraciones/outbox
npm.cmd run build
```

Con PostgreSQL local configurado:

```powershell
$env:OUTBOX_DB_REAL='1'
npm.cmd test -- --runInBand src/integraciones/outbox/outbox.persistencia.spec.ts
```

Las pruebas cubren backoff desde el fallo, recuperación de leases, identidad
estable, confirmaciones obsoletas y competencia entre dos reclamos.
