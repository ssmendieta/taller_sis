# ABC-365 - Suscriptor de confirmación de demanda (validación local)

Fecha de ejecución: 2026-11-07 (America/La_Paz).

> Evidencia simulada: esta ejecución usa el emulador local de Google Pub/Sub y
> no acredita mensajería en Google Cloud real.

## Entorno

- Rama: `RamaSergio`.
- PostgreSQL 15 en Docker, base aislada `produccion_abc365_local`.
- Emulador Pub/Sub: `127.0.0.1:8085`, proyecto `taller-local`.
- Suscripciones: `taller-produccion-demanda-local` y
  `taller-produccion-demanda-confirmacion-local`.

## Caso ejecutado

1. Se publicó `DemandaConfirmada.v1` antes de registrar la demanda.
2. El evento quedó en inbox con estado `PENDIENTE` e `intentos=0`.
3. Se publicó `DemandaRegistrada.v1` para la misma clave externa.
4. El reprocesador correlacionó la confirmación en un intento.
5. La demanda quedó `CONFIRMADA` y el inbox quedó `PROCESADO`.
6. Se volvió a publicar exactamente la misma confirmación.
7. La consulta final confirmó una sola fila de inbox para el `eventId`.

## Resultado observado

```json
{
  "demandaExternaId": "ABC365-LOCAL-1794104090964",
  "confirmacionMessageId": "3",
  "demandaMessageId": "4",
  "duplicateMessageId": "5",
  "pendiente": { "estado": "PENDIENTE", "intentos": 0 },
  "aplicada": {
    "id": "2",
    "estado": "CONFIRMADA",
    "confirmacion_event_id": "775dbc2b-8f65-4e9b-b093-f39310344d61",
    "inbox_estado": "PROCESADO",
    "intentos": 1
  },
  "inboxDuplicados": 1,
  "verificadoEn": "2026-11-08T02:14:53.441Z"
}
```

Comando reproducible, con el servicio iniciado contra la misma base y el
emulador:

```powershell
$env:DB_DATABASE='produccion_abc365_local'
$env:PUBSUB_EMULATOR_HOST='127.0.0.1:8085'
$env:GCP_PROJECT_ID='taller-local'
npm.cmd run verify:demanda-confirmacion-local
```

La primera ejecución integrada detectó que el método heredado de ABC-364
intentaba combinar `FOR UPDATE` con un `LEFT JOIN` de ítems. Se eliminó esa
carga innecesaria de la sección bloqueada y se repitió la prueba completa con
resultado satisfactorio.
