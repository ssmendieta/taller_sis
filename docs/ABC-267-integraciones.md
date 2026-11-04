# ABC-267: administración de outbox

## Flujo acordado antes de implementar

1. La solicitud y el evento se guardan atómicamente. Reintentar solo adelanta el próximo intento del mismo evento.
2. El worker reclama el evento y publica después del commit, conservando eventId y correlationId.
3. Si Pub/Sub falla o está deshabilitado, el evento permanece pendiente; programar un reintento no confirma publicación ni procesamiento del receptor.

La API exige `integraciones.reintentar` tanto para consultar como para reintentar. El permiso se asigna inicialmente a Administrador.

## Contrato para ABC-268

Enviar `Authorization: Bearer <accessToken>` a ambos endpoints del gateway:

- `GET /api/produccion/integraciones/eventos?estado=PENDIENTE&page=1&limit=20`
- `POST /api/produccion/integraciones/eventos/:id/reintentar` (sin cuerpo).

El GET devuelve `{ items, total, page, limit }`. Estado es opcional y admite
`PENDIENTE`, `PROCESANDO`, `PUBLICADO`; page comienza en 1 (máximo 1000000) y limit
en 20 (máximo 100). Orden descendente por creación e ID. Cada item contiene:

| Campo | Significado |
| --- | --- |
| id | ID interno bigint representado como string; usar en el POST |
| eventId, correlationId, eventType | Identidad estable y trazabilidad |
| destinoConfigurado | Topic de la configuración actual, no destino histórico persistido |
| publicadorHabilitado | Si el worker está habilitado por configuración |
| estado, intentos | Estado de publicación e intentos reclamados por el worker |
| ultimoError | Diagnóstico limitado a 500 caracteres, o null |
| creadoEn, ultimoIntentoEn, proximoIntentoEn, publicadoEn | Fechas ISO, con null cuando corresponda |
| messageId | ID de aceptación por Pub/Sub, no confirmación del negocio receptor |
| puedeReintentar | Indicación para el botón; el POST vuelve a comprobarlo bajo bloqueo |

No se devuelve el payload ni el token de bloqueo. La respuesta de POST es
`202 { mensaje: "Reintento programado", evento: <item> }`. No incrementa intentos
ni borra el diagnóstico. Conserva el mismo evento y adelanta su próximo intento;
si ya estaba vencido, no retrasa su fecha. Con publicador deshabilitado permanece
pendiente hasta habilitarlo.

Errores: 400 parámetros inválidos; 401 sin sesión; 403 sin permiso; 404 evento
inexistente; 409 publicado o procesamiento con lease vigente; 503 Auth no disponible.
No convertir un 409 en éxito: refrescar el listado y mostrar el motivo.

El panel de ABC-268 no existe en esta rama al implementar ABC-267. Cuando se integre:

1. Comprobar `integraciones.reintentar` para mostrar el acceso (la API también lo exige).
2. Cargar el GET real, mostrar vacío/cargando/error y usar `total` para paginar.
3. Deshabilitar el botón sin `puedeReintentar` y mientras la petición está en curso.
4. Enviar POST sin reemplazar el payload; mostrar «Reintento programado» y refrescar GET.
5. Mostrar pendiente/publicado como estado del transporte, nunca como procesamiento
   confirmado de Inventarios o Contabilidad.

## Persistencia, concurrencia y límites

POST usa transacción y bloqueo de fila compartido con el protocolo del worker.
Solo recupera `PROCESANDO` cuando el lease ya venció; invalida el token anterior.
Una confirmación tardía de ese token no puede modificar el evento recuperado.
Pub/Sub puede entregar duplicados, especialmente si la publicación ocurrió antes
de un fallo de confirmación: el receptor debe deduplicar por eventId. Esta API no
promete entrega exactamente una vez ni reemplaza el trabajo del receptor/ABC-275.

La migración Auth `1710000000012-IntegracionesReintentar` es idempotente al subir.
Su reversión elimina este permiso y todas sus asignaciones, incluidas las
personalizadas, sin afectar otros permisos. No revierte otras migraciones.

## Verificación reproducible (PowerShell)

En `services/produccion-service`:

```powershell
$env:OUTBOX_DB_REAL='1'
$env:SOLICITUDES_DB_REAL='1'
npm.cmd test -- --runInBand
npx.cmd tsc --noEmit
```

En `services/auth-service`:

```powershell
$env:AUTH_DB_REAL='1'
npm.cmd test -- --runInBand
npx.cmd tsc --noEmit
npm.cmd run migration:show
# Aplicar cuando la única migración pendiente sea la esperada:
npm.cmd run migration:run
```

Las pruebas nuevas PostgreSQL usan esquemas exclusivos temporales, sin publicar
mensajes reales. Cubren permiso/idempotencia/rollback, paginación, reintentos
repetidos, lease vencido, confirmación obsoleta y competencia con el worker.
Las HTTP ejercitan controladores y guard reales con Auth y conexión a BD simulados.
La verificación del panel y del efecto único en un receptor real sigue pendiente.

## Resultado local (2026-10-14)

- Rama de implementación: `RamaSergio`; sin merge ni push a develop.
- Regresión Producción con BD habilitada: 344 pruebas aprobadas, 68 omitidas,
  cero fallos. Después se agregó el caso de recuperación completa y se repitió
  su suite: 5/5 pruebas PostgreSQL aprobadas.
- Regresión Auth con la nueva prueba de BD habilitada: 82 aprobadas, 1 omitida,
  cero fallos.
- Pruebas HTTP nuevas: 19 aprobadas. Pruebas PostgreSQL nuevas: 6 aprobadas
  (5 de Producción y 1 de migración Auth).
- TypeScript sin errores en ambos servicios; `git diff --check` limpio.
- Migración del permiso aplicada correctamente a Auth local y confirmada por
  `migration:show`; no se aplicaron migraciones ajenas pendientes.
- No se enviaron mensajes a GCP ni se verificó un receptor real en esta entrega.
