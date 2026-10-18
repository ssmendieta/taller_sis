# Evidencia · Probar caída, duplicado y permisos de integraciones

HU: *Como administrador, quiero consultar mensajes pendientes y reintentar publicaciones fallidas, para recuperar el intercambio con Inventarios y Contabilidad.*

- Fecha de ejecución: 15/10/2026, 10:50:34 p. m.
- Rama: RamaTats (con origin/develop unido, incluye ABC-242 y ABC-267)
- Comando (en `services/produccion-service`): `npx jest src/integraciones`
- Resultado: **57 pruebas pasan, 0 fallan**, 6 omitidas (necesitan PostgreSQL real: `OUTBOX_DB_REAL=1`)
- Archivo de pruebas: `services/produccion-service/src/integraciones/integraciones.caida-duplicado-permisos.spec.ts`

## Preparación (anotada antes de ejecutar)

| Dato | Valor |
|---|---|
| Orden de prueba | ORD-0015 (id 15) |
| Solicitud de material | 27 · Harina de trigo HAR-001 · 12.5 kg |
| eventId | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` |
| correlationId | `9a7e2f10-3c4b-4d5e-8f60-718293a4b5c6` |
| eventType | `SolicitudMaterialAlmacen.v1` |
| Destino (topic) | `topic-id-de-ejemplo` (marcador de `.env.example`) |
| Cuenta con permiso | Administrador (id 1): `integraciones.reintentar` |
| Cuenta sin permiso | Operario (id 43): `ordenes.consultar`, `materiales.solicitar` |

El evento se genera con `crearEventoSolicitudMaterial` (la misma función que usa la solicitud real). Intervienen la API HTTP real del panel (controlador, guard de permisos y servicio de ABC-267), el publicador real del outbox (ABC-242) y `PubSubPublisherService`. Solo se simulan Auth, la base de datos (en memoria, con las mismas reglas de bloqueo que `TypeOrmOutboxStore`) y el cliente de Google Pub/Sub.

## Resultado esperado y obtenido

| Caso | Esperado | Obtenido |
|---|---|---|
| Publicador detenido | Evento PENDIENTE, 0 intentos, destino visible, nada publicado | ✅ PENDIENTE · 0 intentos · `publicadorHabilitado: false` |
| Publicador restaurado | Se publica una vez; un segundo ciclo no lo vuelve a publicar | ✅ PUBLICADO · messageId `msg-1` · 1 mensaje en la suscripción |
| Pub/Sub caído | PENDIENTE con intento y error; respeta la espera; al volver, se publica con el mismo eventId | ✅ PENDIENTE · 1 intento · `14 UNAVAILABLE…` → PUBLICADO · 2 intentos |
| Reintento administrativo con Pub/Sub caído | 202; no suma intentos ni borra el error; no publica por sí solo | ✅ 202 «Reintento programado» · 1 intento · error conservado |
| Suscriptor detenido | PUBLICADO solo indica aceptación de Pub/Sub; reintentar el outbox no reenvía (409) | ✅ PUBLICADO · mensaje sin consumir · reintento → 409 · sin nueva publicación |
| Mensaje repetido: dos reintentos seguidos | Un solo evento y una sola publicación | ✅ 202 + 202 · 1 evento · 1 mensaje |
| Mensaje repetido: confirmación perdida | El reenvío conserva eventId y correlationId para que el receptor deduplique | ✅ 2 mensajes con el mismo eventId y correlationId · 1 evento en el outbox |
| Rol sin permiso: POST de reintento | 403 y no publica nada | ✅ 403 · sin transacción · sin publicación · evento sin cambios |
| Rol sin permiso: consulta del panel | 403 | ✅ 403 · sin consultar la base |
| Sin sesión / Auth caído | 401 / 503 y no publica nada | ✅ 401 / 503 · evento sin cambios |

## Caso válido

Publicador detenido → el administrador ve en el panel el evento `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` en **PENDIENTE** con 0 intentos y destino `topic-id-de-ejemplo`. Al restaurar el publicador, el evento pasa a **PUBLICADO** (messageId `msg-1`, 1 intento) y un segundo ciclo no lo vuelve a publicar: **sin doble efecto**.

## Caso rechazado

El operario sin `integraciones.reintentar` invoca `POST /api/produccion/integraciones/eventos/1/reintentar` → **403** «No tiene permisos para esta operación». No se abre la transacción, no se llama a Pub/Sub y el evento queda exactamente igual.

## IDs y estados observados en el panel (para Jira)

Respuestas reales de la API durante la ejecución (cada fila corresponde a una consulta o un reintento):

| Paso | HTTP | eventId | Estado | Intentos | messageId | Último error / mensaje |
|---|---|---|---|---|---|---|
| Publicador detenido: el administrador consulta el panel | 200 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PENDIENTE | 0 | — | — |
| Publicador restaurado: el evento sale y no se vuelve a publicar | 200 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PUBLICADO | 1 | msg-1 | — |
| Pub/Sub caído: el evento sigue pendiente con el error | 200 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PENDIENTE | 1 | — | 14 UNAVAILABLE: No connection established |
| Pub/Sub recuperado: publicado con el mismo eventId | 200 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PUBLICADO | 2 | msg-2 | — |
| Pub/Sub caído: el administrador programa un reintento | 202 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PENDIENTE | 1 | — | 14 UNAVAILABLE: No connection established |
| Suscriptor detenido: Pub/Sub aceptó y el mensaje espera en la suscripción | 200 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PUBLICADO | 1 | msg-1 | — |
| Suscriptor detenido: reintento de un evento ya publicado | 409 | — | — | — | — | El evento ya fue publicado o está siendo procesado |
| Mensaje repetido: primer reintento | 202 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PENDIENTE | 1 | — | 14 UNAVAILABLE: No connection established |
| Mensaje repetido: segundo reintento seguido | 202 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PENDIENTE | 1 | — | 14 UNAVAILABLE: No connection established |
| Mensaje repetido: confirmación perdida y reenvío con el mismo eventId | 200 | `5d0c1c9e-8a51-4f0b-9b8e-6f1d2a3b4c5d` | PUBLICADO | 2 | msg-2 | — |
| Rol sin permiso: el operario invoca el POST de reintento | 403 | — | — | — | — | No tiene permisos para esta operación |
| Rol sin permiso: el operario consulta el panel | 403 | — | — | — | — | No tiene permisos para esta operación |
| Reintento sin sesión | 401 | — | — | — | — | Debe iniciar sesión |
| Reintento con Auth no disponible | 503 | — | — | — | — | No se pudo comprobar la sesión con Auth |

## Detalle por prueba

- ✅ publicador detenido y restaurado (ejemplo de la HU) › válido: el evento queda pendiente con el publicador detenido y al restaurarlo se publica una sola vez (40 ms)
- ✅ Pub/Sub caído › conserva el evento pendiente con intento y error, respeta la espera y al volver Pub/Sub lo publica una vez (7 ms)
- ✅ Pub/Sub caído › el reintento administrativo adelanta el intento sin contar intentos ni borrar el error, y no publica por sí solo (4 ms)
- ✅ suscriptor detenido › publicado solo indica que Pub/Sub aceptó el mensaje y el reintento del outbox no reenvía (409) (6 ms)
- ✅ mensaje repetido › dos reintentos seguidos del administrador no duplican el evento ni la publicación (6 ms)
- ✅ mensaje repetido › si se pierde la confirmación tras publicar, el reenvío conserva eventId y correlationId para que el receptor deduplique (5 ms)
- ✅ rol sin permiso › rechazado: el operario sin integraciones.reintentar recibe 403 en el POST y no se publica nada (3 ms)
- ✅ rol sin permiso › el operario tampoco puede consultar el panel → 403 (2 ms)
- ✅ rol sin permiso › POST sin sesión → 401 y no se publica nada (2 ms)
- ✅ rol sin permiso › POST con Auth no disponible → 503 y no se publica nada (3 ms)

## Control de las pruebas

Para comprobar que las pruebas detectan errores reales, se alteró temporalmente el código y luego se restauró sin cambios:

- Permitir reintentar siempre (incluso eventos publicados): **2 pruebas fallaron**.
- Proteger el POST con `ordenes.consultar` en lugar de `integraciones.reintentar`: **4 pruebas fallaron**.

## Regresión de `src/integraciones`

| Archivo | Pasan | Omitidas (BD real) |
|---|---|---|
| pubsub.config.spec.ts | 4 | 0 |
| inventario-almacen-v1.validator.spec.ts | 11 | 0 |
| outbox.config.spec.ts | 2 | 0 |
| outbox.persistencia.spec.ts | 1 | 1 |
| contratos-salida.spec.ts | 1 | 0 |
| integraciones.persistencia.spec.ts | 0 | 5 |
| pubsub-publisher.service.spec.ts | 5 | 0 |
| integraciones.http.spec.ts | 19 | 0 |
| outbox-publicador.service.spec.ts | 4 | 0 |
| integraciones.caida-duplicado-permisos.spec.ts | 10 | 0 |

## Límites y coordinación con Sergio

- **Pub/Sub simulado.** No se enviaron mensajes al proyecto de Google Cloud. La prueba con GCP real (`npm run pubsub:smoke` y el ciclo detener → crear solicitud → restaurar) necesita las credenciales del entorno de Sergio.
- **No hay suscriptor ni inbox en el repositorio.** Según `docs/integraciones/inventarios-v1.md`, la suscripción, el consumidor y el inbox llegan con ABC-243/ABC-244. Por eso «suscriptor detenido» y «mensaje repetido» se prueban del lado del publicador: Pub/Sub acepta el mensaje aunque nadie lo consuma, y los reenvíos llevan el mismo `eventId` para que el receptor deduplique. La deduplicación del receptor queda pendiente de esas tareas.
- **Reintento ≠ redelivery.** El reintento del panel solo adelanta el próximo intento de publicación del outbox; no reenvía mensajes ya aceptados por Pub/Sub ni confirma que Inventarios o Contabilidad completaron la operación.
- **Pruebas con PostgreSQL real omitidas** (`OUTBOX_DB_REAL=1`): la contraseña de `.env` no autentica contra la base local.
