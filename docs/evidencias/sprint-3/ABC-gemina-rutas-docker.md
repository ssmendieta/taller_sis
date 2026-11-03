# Evidencia Sprint 3 — rutas, agrupación y Docker

Rama `ramagemina`, base `develop` 00b9882. Ejecución local del 03/11/2026 en
Windows 11 con Docker Desktop 29.4.1 y PostgreSQL 15 (`taller_postgres`).

| Subtarea | Commit |
| --- | --- |
| ABC-360 reglas de compatibilidad | `62453cb` |
| ABC-361 cálculo de prioridad | `6e706dc` |
| ABC-369 entidades ruta y parada | `f699937` |
| ABC-370 crear y editar ruta | `8e9a7d9` |
| ABC-375 máquina de estados ruta/entrega | `caad7b4` |
| ABC-400 Dockerfiles Producción y Logística | `cd98648` |

## Pruebas automatizadas (jest, logistica-service)

`npx jest` → 27 suites, **255 pruebas aprobadas**, 35 omitidas (suites de
persistencia que requieren flags), 0 fallidas. Base previa: 192 aprobadas.
Auth: `logistica-rutas-permisos.migration.spec.ts` 2/2 aprobadas.

## ABC-369 / ABC-375 — migraciones contra PostgreSQL real

Al arrancar el contenedor `logistica-service`:

```
Migration CrearRutas1710000000005 has been executed successfully.
Migration EstadosDespachoEntrega1710000000006 has been executed successfully.
```

Tras `docker restart`: `No migrations are pending`; las tablas `rutas`,
`rutas_paradas` y `rutas_paradas_boletas` y las 3 boletas previas se conservan.

## ABC-370 — API real con sesión de Auth

Usuarios de prueba: `logistica@taller.local` (Encargado de Logística) y
`supervisor@taller.local` (Supervisor). Boletas: 1 EMITIDA, 2 ANULADA, 3 BORRADOR.
Llamadas directas a `logistica-service` (:3003) con el token de Auth (:3001).

| # | Caso | HTTP | Respuesta |
| --- | --- | --- | --- |
| 1 | Crear ruta con boleta 1 (EMITIDA) | 201 | ruta 1 PLANIFICADA |
| 2 | Boleta 2 ANULADA | 409 | Solo se pueden asignar boletas EMITIDAS: 2 (ANULADA) |
| 3 | Boleta 3 BORRADOR | 409 | Solo se pueden asignar boletas EMITIDAS: 3 (BORRADOR) |
| 4 | Boleta 1 en otra ruta activa | 409 | Boletas ya asignadas a otra ruta activa: 1 (ruta 1) |
| 5 | Boleta inexistente 999 | 404 | Boletas no encontradas: 999 |
| 6 | Fecha 2026-02-30 | 400 | fechaProgramada debe ser una fecha válida YYYY-MM-DD |
| 7 | Editar ruta PLANIFICADA (VEH-01 → VEH-02) | 200 | vehículo actualizado |
| 8 | Supervisor intenta crear | 403 | No tiene permisos para esta operación |
| 9 | Supervisor consulta la ruta | 200 | ruta 1 |
| 10 | Ruta inexistente | 404 | Ruta no encontrada |
| 11 | Editar ruta DESPACHADA (estado fijado por SQL) | 409 | Solo se puede editar una ruta PLANIFICADA (estado actual: DESPACHADA) |
| 12 | 3 POST simultáneos con la misma boleta (ruta 1 cancelada) | 201, 409, 409 | solo se crea la ruta 2 |

El caso 11 fija el estado por SQL porque el endpoint de despacho pertenece a
otra subtarea de ABC-374.

## ABC-400 — imágenes Docker

```
docker build --secret id=extra_ca,src=<certificado Avast> -t taller_sis-logistica-service services/logistica-service
docker build --secret id=extra_ca,src=<certificado Avast> -t taller_sis-produccion-service services/produccion-service
docker compose --profile full up -d --no-build produccion-service logistica-service
```

| Imagen | Tamaño | Estado | Health |
| --- | --- | --- | --- |
| taller_sis-produccion-service | 411 MB | healthy | `{"database":"connected","status":"ok"}` |
| taller_sis-logistica-service | 312 MB | healthy | `{"status":"ok"}` |

El equipo de prueba tiene Avast con inspección HTTPS; sin el secreto `extra_ca`
`npm ci` falla con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. En equipos sin
inspección el secreto no es necesario.

## Pendiente (otras subtareas)

- Solapamiento de vehículo/chofer y capacidad (ABC-371); validación contra el ERP (ABC-115).
- Tabla de grupos (ABC-362); hasta entonces `rutas.grupo_id` no tiene FK.
- Endpoints de despacho y entrega que usen las transiciones de ABC-375.
- Pantalla de planificación de rutas (CA-05 de ABC-368).
