# Evidencia Sprint 3 — observaciones, historial de rutas y demanda

Rama `ramagemina`. Ejecución local del 03/11/2026 con PostgreSQL 15 y, para la
demanda, el **emulador** de Pub/Sub (prueba simulada, no Google real).
Usuarios de prueba: `produccion@taller.local` (Encargado de Producción),
`logistica@taller.local` (Encargado de Logística), `supervisor@taller.local` (Supervisor).

| Subtarea | Responsable en Jira | Commit |
| --- | --- | --- |
| ABC-321 entidad de observaciones | Andrés (hecha por Gemina, coordinado) | `473ae57` |
| ABC-322 endpoints de observaciones | Gemina | `13b3cae` |
| ABC-323 formulario y listado en la orden | Gemina | `90b2c4a` |
| ABC-391 endpoint de historial de rutas | Andrés (hecha por Gemina, coordinado) | `32690dc` |
| ABC-392 pantalla de historial de rutas | Gemina | `9dbd877` |
| ABC-355 entidad de demanda | Andrés (hecha por Gemina, coordinado) | `a49f199` |
| ABC-356 suscriptor de demanda | Andrés (hecha por Gemina, coordinado) | `cff5590` |
| ABC-357 validación e idempotencia | Gemina | `df312ed` |

## Pruebas automatizadas

| Proyecto | Resultado |
| --- | --- |
| produccion-service `npx jest` | 549 aprobadas, 153 omitidas (flags de BD real), 0 fallidas |
| logistica-service `npx jest` | 271 aprobadas, 35 omitidas, 0 fallidas |
| frontend `node --test scripts/*.test.mjs` | 140 aprobadas, 0 fallidas (incluye `test:observaciones` 8 y `test:historial-rutas` 9) |
| frontend `npm run build` | compila sin errores |

## ABC-322 — API de observaciones (vía Producción :3002 con token de Auth)

| # | Caso | HTTP |
| --- | --- | --- |
| 1 | Encargado registra OBSERVACION en orden 2 | 201, autor "Paula Producción" desde la sesión |
| 2 | Encargado registra INCIDENCIA en orden 2 | 201 |
| 3 | Descripción solo con espacios | 400 |
| 4 | Orden inexistente 999 | 404 |
| 5 | Enviar `autorUsuarioId` en el cuerpo | 400 (campo no permitido) |
| 6 | Supervisor intenta registrar | 403 |
| 7 | Supervisor consulta orden 2 | 200, la INCIDENCIA (más reciente) primero |
| 8 | Consulta orden 1 | 200, lista vacía (aislamiento entre órdenes) |

Migración `ObservacionesOrden1710000000023` aplicada en `produccion_db`.
ABC-323 consultado a través del gateway (`/api/produccion/observaciones/orden/2`).

## ABC-391 — historial de rutas (vía gateway)

| # | Consulta | Resultado |
| --- | --- | --- |
| 1 | Sin filtros | 5 rutas, orden fecha desc e id desc |
| 2 | `page=2&limit=2` | rutas 1 y 4, 3 páginas |
| 3 | `chofer=CHO-12` | rutas 5 y 3 |
| 4 | `estado=PLANIFICADA&chofer=CHO-12` | ruta 5 |
| 5 | `fechaDesde=2026-11-05&fechaHasta=2026-11-06` | rutas 4 y 3 |
| 6 | `chofer=NADIE` | 0 rutas, 0 páginas |
| 7 | Rango invertido | 400 |

Tres de las cinco rutas se insertaron por SQL solo para tener estados
DESPACHADA/COMPLETADA, porque el endpoint de despacho pertenece a otra subtarea.

## ABC-355/356/357 — demanda por Pub/Sub (emulador)

Topic `taller-ventas-demanda-local`, suscripción `taller-produccion-demanda-local`,
`PUBSUB_DEMANDA_CONSUMER_ENABLED=true`. Migraciones `Demandas1710000000024` y
`DemandasRechazadas1710000000025` aplicadas.

| messageId | Mensaje | Resultado |
| --- | --- | --- |
| 1 | PED-LIVE-001 válido | PROCESADO, demanda 1 RECIBIDA |
| 2 | Mismo mensaje reenviado | DUPLICADO, demanda 1 |
| 3 | Mismo pedido, otro eventId, cantidad `"40"` | DUPLICADO, demanda 1, inbox IGNORADO |
| 4 | Mismo pedido con otra fecha | RECHAZADO `DEMANDA_CONTRADICTORIA`; la demanda 1 conserva 20/11 |
| 5 | Unidad `cajas` | RECHAZADO `EVENTO_INVALIDO` con el campo `data.items[0].unidad` |
| 6 y 7 | PED-LIVE-002 dos veces en paralelo | PROCESADO + DUPLICADO, una sola demanda |
| 8 | Texto que no es JSON | ACK con `DEMANDA_RECHAZADA` en el log |

Al final quedaron 2 demandas, 2 ítems, 2 rechazos trazados y 0 mensajes
pendientes en la suscripción.

## Pendiente

- ABC-359: repetir la demanda con Google Cloud Pub/Sub real y el publicador de Ventas.
- ABC-358: endpoint y pantalla de consulta de demandas (Andrés).
- ABC-393: detalle de ruta con entregas e incidencias (la pantalla actual es el detalle básico).
