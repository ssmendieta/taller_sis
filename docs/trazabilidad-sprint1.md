# Trazabilidad Sprint 1

Cada fila: subtarea Jira → endpoint(s) → archivo(s) → pantalla(s) → prueba(s).
Los títulos de historias/subtareas son los de Jira (proyecto ABC); si un título
difiere, vale la clave ABC. Alcance: historias ABC-65, 66, 67, 80, 81, 84, 86,
87, 88, 90, 103, 104, 112, 158 y sus subtareas, incluida ABC-151.

Leyenda de pruebas: `jest auth` = `npx jest` en auth-service, `jest prod` = en
produccion-service, `e2e NNN` = caso del script `scripts/e2e/e2e-sprint1.mjs`
(`npm run e2e` en la raíz, contra el gateway).

## Autenticación y sesión (ABC-80, ABC-167, ABC-176, ABC-177)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-167 credenciales correctas | ABC-80 login | POST /api/auth/login | auth-service/src/auth/auth.service.ts | LoginPage.jsx | jest auth auth.service.spec; e2e 167 |
| ABC-167 contraseña incorrecta | ABC-80 login | POST /api/auth/login → 401 | auth-service/src/auth/auth.service.ts | LoginPage.jsx (muestra error) | jest auth auth.service.spec; e2e 167 |
| ABC-167 usuario inexistente/deshabilitado | ABC-80 login | POST /api/auth/login → 401/403 | auth-service/src/auth/auth.service.ts | LoginPage.jsx (muestra error) | jest auth auth.service.spec; e2e 167 |
| ABC-167 distintos roles | ABC-80 login | POST /api/auth/login (payload con rolId) | auth-service/src/auth/auth.service.ts | SesionContext.jsx, MainLayout.jsx | jest auth auth.service.spec; e2e 167 |
| ABC-176 cierre manual | ABC-80 sesión | POST /api/auth/logout | auth-service/src/auth/auth.controller.ts, auth.service.ts, sesiones/sesiones.service.ts | MainLayout.jsx (Cerrar sesión → cerrarSesionServidor) | jest auth auth.service.spec + sesiones.service.spec; e2e 167 |
| ABC-177 expiración por inactividad | ABC-80 sesión | GET /api/auth/me → 401 tras 15 min | auth-service/src/sesiones/sesiones.service.ts, authz/jwt.strategy.ts, migración 1710000000005 | SesionContext.jsx (cierre local) | jest auth sesiones.service.spec; e2e 167 (logout) |
| ABC-151 autorización backend | Transversal | GET /api/auth/me → permisos [{id,codigo,nombre}] | auth-service/src/authz/*, produccion-service/src/auth/*.guard.ts | ProtectedRoute.jsx, permisos.js | jest auth authz.spec; jest prod permiso-produccion.guard.spec; e2e 166 |

## Usuarios (ABC-88, ABC-156, ABC-157, ABC-180, ABC-181)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-180 crear válido / ABC-165 crear+duplicado | ABC-88 usuarios | POST /api/auth/users (409 duplicado) | auth-service/src/usuarios/usuarios.service.ts, usuarios.controller.ts | UsuarioPage.jsx (muestra error servidor) | jest auth usuarios.service.spec; e2e 165 |
| ABC-165 editar | ABC-88 usuarios | PUT /api/auth/users/:id | auth-service/src/usuarios/usuarios.service.ts | UsuarioPage.jsx | jest auth usuarios.service.spec; e2e 165 |
| ABC-180 asignar/cambiar rol | ABC-88 usuarios | PUT /api/auth/users/:id {rol_id} | auth-service/src/usuarios/usuarios.service.ts | UsuarioPage.jsx | jest auth usuarios.service.spec; e2e 165 |
| ABC-156 desactivar / activar | ABC-88 usuarios | PATCH /api/auth/users/:id/status | auth-service/src/usuarios/usuarios.service.ts | UsuarioPage.jsx (confirmación) | jest auth usuarios.service.spec; e2e 165 |
| ABC-157 baja lógica + filtro | ABC-88 usuarios | DELETE /api/auth/users/:id; GET /api/auth/users?incluirEliminados=true | auth-service/src/usuarios/usuarios.service.ts, usuarios.controller.ts | UsuarioPage.jsx (filtro Dados de baja) | jest auth usuarios.service.spec; e2e 165 |
| ABC-88 autoprotección admin | ABC-88 usuarios | PATCH /status y DELETE → 409 (propia cuenta / último admin) | auth-service/src/usuarios/usuarios.service.ts | UsuarioPage.jsx (muestra 409) | jest auth usuarios.service.spec (ABC-88); e2e WP5 |
| ABC-155 nombre completo obligatorio | ABC-88 usuarios | POST/PUT /api/auth/users (validación) | auth-service/src/usuarios/dto/*.ts | UsuarioPage.jsx | jest auth usuarios.service.spec |

## Roles y permisos (ABC-87, ABC-150, ABC-152, ABC-153, ABC-166, ABC-134)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-152 crear rol + 409 duplicado | ABC-87 roles | POST /api/auth/roles | auth-service/src/roles/roles.service.ts, roles.controller.ts, dto/create-role.dto.ts | RolesPage.jsx + RoleModal.jsx | jest auth roles.reglas.spec; e2e 166 |
| ABC-87 listar/consultar roles | ABC-87 roles | GET /api/auth/roles, GET /api/auth/roles/:id | auth-service/src/roles/roles.service.ts | RolesPage.jsx | jest auth roles.service.spec; e2e 166 |
| ABC-87 editar/desactivar rol | ABC-87 roles | PATCH /api/auth/roles/:id (D3: sin DELETE; no desactivar con usuarios activos) | auth-service/src/roles/roles.service.ts | RolesPage.jsx | jest auth roles.reglas.spec; e2e 166 |
| ABC-150 reemplazar permisos | ABC-87 roles | PUT /api/auth/roles/:id/permisos | auth-service/src/roles/roles.service.ts, dto/reemplazar-permisos-rol.dto.ts | PermissionsModal.jsx | e2e 166 |
| ABC-151 Admin conserva críticos | ABC-87 roles | PUT /api/auth/roles/:id/permisos → 409 si falta usuarios.gestionar o roles_permisos.gestionar | auth-service/src/roles/roles.service.ts | RolesPage.jsx (muestra 409) | jest auth roles.reglas.spec |
| ABC-153 catálogo de permisos | ABC-87 roles | GET /api/auth/permisos (solo lectura) | auth-service/src/permisos/permisos.service.ts, permisos.controller.ts | PermissionsModal.jsx (agrupado por módulo) | e2e 166 |
| ABC-166 matriz por permiso | Transversal | Todos /api/produccion/* exigen permiso (401 sin token, 403 sin permiso) | produccion-service/src/auth/permiso-produccion.guard.ts, docs/matriz-permisos-sprint-1.md | MainLayout.jsx, ProtectedRoute.jsx, AppRoutes.jsx | jest prod permiso-produccion.guard.spec; e2e 166 |
| ABC-134 alinear recetas/materiales | Transversal | GET /recetas* → recetas.gestionar; GET /materiales* → materiales.consultar_disponibilidad; POST/PUT/DELETE /materiales → recetas.gestionar | produccion-service/src/recetas/recetas.controller.ts, src/materiales/materiales.controller.ts | RecetasPage.jsx, MaterialesPage.jsx | e2e WP9 |

## Administrador y datos base (ABC-182, ABC-179, ABC-139, ABC-143)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-182 seed admin idempotente | ABC-103 base | (comando) npm run seed:admin en auth-service | auth-service/src/seeds/seed-admin.ts, seed-admin.helpers.ts | — (flujo operativo, README) | jest auth seed-admin.helpers.spec; verificación: 2 ejecuciones sin duplicar |
| ABC-179 seed demo | ABC-103 base | (comando) npm run seed:demo en produccion-service | produccion-service/src/seeds/seed-demo.ts | — (flujo operativo, README) | verificación: 2 ejecuciones (3 materiales, receta PAN-001) |
| ABC-139 validación materiales | ABC-90 materiales | POST /api/produccion/materiales (409 duplicado); PUT vacío → 400 | produccion-service/src/materiales/materiales.service.ts | MaterialesPage.jsx (muestra error) | jest prod materiales.service.spec; e2e WP9 |
| ABC-143 inventario simulado lectura | ABC-103 base | GET /api/produccion/inventario/material/:id (sin endpoints de escritura) | produccion-service/src/inventario/inventario.controller.ts, docs/integracion-erp-inventarios.md | MaterialesPage.jsx (columna Disponible) | e2e WP9 |

## Auditoría (ABC-90, ABC-164, ABC-183, ABC-184, ABC-185, ABC-186)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-164 auditar usuarios | ABC-90 auditoría | (interno) CREACION_USUARIO, MODIFICACION_USUARIO, CAMBIO_ROL, CAMBIO_ESTADO, ELIMINACION_LOGICA | auth-service/src/usuarios/usuarios.service.ts | — (visible en auditoría) | jest auth usuarios.service.spec; e2e 165/186 |
| ABC-164 auditar roles/permisos | ABC-90 auditoría | (interno) CREACION_ROL, MODIFICACION_ROL, CAMBIO_PERMISOS_ROL | auth-service/src/roles/roles.service.ts | — (visible en auditoría) | e2e 186 |
| ABC-183 nombres actor/afectado | ABC-90 auditoría | GET /api/auth/auditoria (paginado con usuario_actor_nombre) | auth-service/src/auditoria/auditoria.service.ts | ConsultaAuditoriaPage.jsx | jest auth auditoria.service.spec; e2e 186 |
| ABC-184 filtros usuario/acción/fechas | ABC-90 auditoría | GET /api/auth/auditoria?usuario=&accion=&fechaDesde=&fechaHasta= | auth-service/src/auditoria/auditoria.service.ts, dto/query-auditoria.dto.ts | ConsultaAuditoriaPage.jsx (filtros locales) | jest auth auditoria.service.spec; e2e 186 |
| ABC-185 restablecimiento auditado | ABC-90 auditoría | PUT /api/auth/users/:id {password} → MODIFICACION_USUARIO sin guardar hash | auth-service/src/usuarios/usuarios.service.ts | UsuarioPage.jsx | jest auth usuarios.service.spec |
| ABC-186 inmutabilidad | ABC-90 auditoría | (BD) trigger trg_auditoria_inmutable; sin rutas de escritura | auth-service/src/database/migrations/1710000000006-AuditoriaInmutable.ts | ConsultaAuditoriaPage.jsx (sin demo) | jest auth auditoria-inmutable.spec; e2e 186 |

## Órdenes backend (ABC-116, ABC-117, ABC-118, ABC-119, ABC-141, ABC-147, ABC-148, ABC-149)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-116 crear válida | ABC-86 órdenes | POST /api/produccion/ordenes → 201 (D5: responsable = autenticado) | produccion-service/src/ordenes/ordenes.service.ts, dto/create-orden.dto.ts | OrdenPage.jsx (sin campo responsable) | jest prod ordenes.creacion.spec + validaciones.spec; e2e 168 |
| ABC-168 incompleta/cantidad/conexión | ABC-86 órdenes | POST → 400 (incompleta, cantidad, fecha); errores visibles | produccion-service/src/ordenes/ordenes.service.ts | OrdenPage.jsx (errorGuardado) | jest prod ordenes.creacion.spec; e2e 168 |
| ABC-117 código secuencial | ABC-86 órdenes | POST → ORD-AAAA-NNNNN (secuencia BD) | produccion-service/src/database/migrations/1710000000007, ordenes.service.ts | OrdenPage.jsx (muestra código) | jest prod ordenes.creacion.spec + validaciones.spec; e2e 168 |
| ABC-141 receta 404/409 + snapshots | ABC-86 órdenes | POST valida receta existente/activa; columnas responsable_nombre (D2) | produccion-service/src/ordenes/ordenes.service.ts | OrdenPage.jsx | jest prod ordenes.validaciones.spec; e2e 168 |
| ABC-118/169 consulta | ABC-86 órdenes | GET /api/produccion/ordenes/buscar?estado=&producto=&fechaDesde=&fechaHasta= | produccion-service/src/ordenes/ordenes.service.ts, ordenes.controller.ts | ConsultaOrdenesPage.jsx | jest prod ordenes.consulta.spec; e2e 169 |
| ABC-147 detalle con avance | ABC-86 órdenes | GET /api/produccion/ordenes/:id (producto, responsable, acumulado, pendiente) | produccion-service/src/ordenes/ordenes.service.ts | ConsultaOrdenesPage.jsx, OrdenesPage.jsx | e2e 169 |
| ABC-148/170 flujo de estados | ABC-86 órdenes | PATCH /api/produccion/ordenes/:id/estado | produccion-service/src/ordenes/ordenes.service.ts, estado-orden.* | ConsultaOrdenesPage.jsx | jest prod ordenes.service.spec + flujo.spec; e2e 170 |
| ABC-149 historial con nombre | ABC-86 órdenes | GET /api/produccion/ordenes/:id/historial | produccion-service/src/ordenes/ordenes.service.ts | (detalle, e2e) | jest prod ordenes.service.spec; e2e 169 |

## Cálculo y disponibilidad (ABC-171, ABC-172)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-171 cálculo | ABC-84 materiales | POST /api/produccion/material-calculation/calcular (DTO, 400 nunca 500) | produccion-service/src/material-calculation/* | (usado por órdenes) | e2e 171 |
| ABC-172 disponibilidad | ABC-84 materiales | GET /api/produccion/ordenes/:id/disponibilidad-materiales; GET /api/produccion/ordenes/:id/materiales (servicio compartido) | produccion-service/src/ordenes/ordenes.service.ts, src/material-calculation/material-calculation.service.ts | ConsultaOrdenesPage.jsx | jest prod ordenes.service.spec; e2e 171 |

## Inicio, avances, cierre (ABC-190, ABC-197, ABC-193)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-190 inicio 6 casos | ABC-86 órdenes | PATCH .../estado EN_PRODUCCION (409 con faltantes, 400 PENDIENTE, 409 receta inactiva) | produccion-service/src/ordenes/ordenes.service.ts | ConsultaOrdenesPage.jsx (Iniciar) | jest prod ordenes.precondiciones.spec; e2e 190 |
| ABC-197 avances 6 casos | ABC-86 órdenes | POST /api/produccion/avances/:ordenId; GET /avances/:ordenId y /total | produccion-service/src/avances_produccion/avances_produccion.service.ts | OrdenesPage.jsx | jest prod avances_produccion.service.spec; e2e 197 |
| ABC-193 cierre/cancelación 6 casos | ABC-86 órdenes | PATCH .../estado FINALIZADA/CANCELADA (D4: incompleta permitida con confirmación UI) | produccion-service/src/ordenes/ordenes.service.ts | ConsultaOrdenesPage.jsx (confirmación) | jest prod ordenes.service.spec; e2e 193 |

## Recetas y materiales UI (ABC-135, ABC-136, ABC-137, ABC-138)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-135 listado con materiales | ABC-81 recetas | GET /api/produccion/recetas | produccion-service/src/recetas/recetas.service.ts | RecetasPage.jsx | e2e WP9 |
| ABC-136 crear/editar/desactivar | ABC-81 recetas | POST /api/produccion/recetas; PATCH /api/produccion/recetas/:id; PATCH /:id/desactivar | produccion-service/src/recetas/recetas.service.ts | RecetasPage.jsx (errores reales) | e2e WP9 |
| ABC-137 nueva versión + anteriores | ABC-81 recetas | POST /api/produccion/recetas/:id/versiones; GET /:id/versiones | produccion-service/src/recetas/recetas-version.service.ts, recetas.service.ts | RecetasPage.jsx | e2e WP9 |
| ABC-138 bloqueo 409 con órdenes | ABC-81 recetas | PATCH /api/produccion/recetas/:id {materiales} → 409 | produccion-service/src/recetas/recetas.service.ts | RecetasPage.jsx (sugiere nueva versión) | jest prod recetas.versionado.spec; e2e WP9 |
| ABC-135 materiales UI | ABC-81 recetas | GET/POST/PUT /api/produccion/materiales | produccion-service/src/materiales/materiales.service.ts | MaterialesPage.jsx | jest prod materiales.service.spec; e2e WP9 |

## Documentación e infraestructura (ABC-158, ABC-159, ABC-160, ABC-161, ABC-162, ABC-163, ABC-173, ABC-198)

| Subtarea | Historia | Endpoint(s) | Archivo(s) | Pantalla(s) | Prueba(s) |
| --- | --- | --- | --- | --- | --- |
| ABC-158 base monorepo | Transversal | /health de gateway y servicios | api-gateway/*, services/*, docker-compose.yml | SystemStatusPage.jsx (/estado) | e2e salud |
| ABC-159 README ejecutable | Transversal | — | README.md | — | verificación: pasos literales sobre BD limpia |
| ABC-160 variables de entorno | Transversal | — | .env.example (JWT_SECRET, AUTH_SERVICE_URL, ADMIN_*, SESION_*) | — | verificación: arranque con JWT_SECRET |
| ABC-161 compose con JWT obligatorio | Transversal | — | docker-compose.yml (${JWT_SECRET:?…}) | — | verificación: compose sin JWT falla con mensaje |
| ABC-162 orden de arranque + seeds | Transversal | — | README.md, docker-compose.yml, seeds | — | verificación: auth → producción → seeds → e2e |
| ABC-163 tests y e2e | Transversal | — | scripts/e2e/e2e-sprint1.mjs, package.json (raíz) | — | jest auth+prod, frontend, npm run e2e |
| ABC-173 higiene de build | Transversal | — | tsconfig*.json (tsBuildInfoFile en dist) | — | verificación: rm dist + build 4 servicios |
| ABC-198 huérfanos fuera | Transversal | — | (eliminados) login.css, Placeholder.jsx, usePlaceholder.js, test-e2e.ps1 | — | build frontend OK |

## Historias de Sprint 1

| Historia | Alcance cubierto en este cierre |
| --- | --- |
| ABC-65 | Autenticación base (login, /me) — WP1/WP4 |
| ABC-66 | Gestión de usuarios — WP5 |
| ABC-67 | Roles y permisos — WP1/WP2 |
| ABC-80 | Sesión (login/logout/expiración) — WP1/WP4 |
| ABC-81 | Recetas y materiales — WP9 |
| ABC-84 | Cálculo y disponibilidad — WP7 |
| ABC-86 | Órdenes (crear, consultar, flujo, inicio, avances, cierre) — WP7 |
| ABC-87 | Roles y permisos reales — WP2 |
| ABC-88 | Usuarios y autoprotección admin — WP5 |
| ABC-90 | Auditoría y materiales — WP6/WP9 |
| ABC-103 | Datos base (seeds, inventario simulado) — WP3 |
| ABC-104 | Autorización por permisos — WP1 |
| ABC-112 | Consulta de órdenes para Supervisor — WP1/WP7 |
| ABC-158 | Base monorepo e infraestructura — WP11 |

Nota: si en Jira alguna de estas historias tiene más subtareas que las listadas
arriba, están fuera del alcance declarado (Logística, dashboards, reportes,
integración ERP real, ABC-70 en adelante) o corresponden a trabajo previo ya
integrado en develop.
