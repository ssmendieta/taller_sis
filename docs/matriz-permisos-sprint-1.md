Matriz de Permisos – Sprint 1 (fuente de verdad)

Roles

- Administrador
- Encargado de Producción
- Encargado de Logística (sin funciones en Sprint 1)
- Supervisor

Catálogo real en BD (`permisos.codigo`, migración `1710000000001-AuthSeed`):

`usuarios.gestionar`, `roles_permisos.gestionar`, `auditoria.consultar`,
`ordenes.crear`, `ordenes.consultar`, `ordenes.cambiar_estado`,
`ordenes.iniciar`, `ordenes.registrar_avance`, `ordenes.finalizar_cancelar`,
`recetas.gestionar`, `materiales.calcular`,
`materiales.consultar_disponibilidad`, `materiales.solicitar` (catálogo, sin asignar en Sprint 1).

Asignación vigente (migración `1710000000003-AlignPermisosMatriz` + ajuste
`1710000000008-EncargadoConsultaOrdenes`): el Encargado de Producción conserva
`ordenes.consultar` porque sin lectura no puede operar sus propias órdenes
(listar, ver detalle, iniciar desde la pantalla de consulta). El Supervisor
sigue sin ningún permiso de mutación.

| Permiso                                | Código                                | Administrador | Encargado de Producción | Encargado de Logística | Supervisor |
| -------------------------------------- | ------------------------------------- | ------------- | ----------------------- | ---------------------- | ---------- |
| Iniciar sesión                         | —                                     | ✓             | ✓                       | ✓                      | ✓          |
| Gestionar usuarios                     | `usuarios.gestionar`                  | ✓             | —                       | —                      | —          |
| Gestionar roles y permisos             | `roles_permisos.gestionar`            | ✓             | —                       | —                      | —          |
| Gestionar recetas                      | `recetas.gestionar`                   | —             | ✓                       | —                      | —          |
| Crear órdenes de producción            | `ordenes.crear`                       | —             | ✓                       | —                      | —          |
| Actualizar estado de órdenes           | `ordenes.cambiar_estado`              | —             | ✓                       | —                      | —          |
| Calcular materiales                    | `materiales.calcular`                 | —             | ✓                       | —                      | —          |
| Consultar disponibilidad de materiales | `materiales.consultar_disponibilidad` | —             | ✓                       | —                      | —          |
| Iniciar orden de producción            | `ordenes.iniciar`                     | —             | ✓                       | —                      | —          |
| Finalizar/cancelar orden               | `ordenes.finalizar_cancelar`          | —             | ✓                       | —                      | —          |
| Registrar avance de producción         | `ordenes.registrar_avance`            | —             | ✓                       | —                      | —          |
| Consultar órdenes de producción        | `ordenes.consultar`                   | —             | ✓                       | —                      | ✓          |
| Consultar auditoría                    | `auditoria.consultar`                 | ✓             | —                       | —                      | —          |

Mapa ruta → permiso (produccion-service, `PermisoProduccionGuard` decide solo por permiso):

- `POST /ordenes` → `ordenes.crear`
- `PATCH /ordenes/:id/estado` → `ordenes.cambiar_estado` (`EN_PRODUCCION` exige `ordenes.iniciar`; `FINALIZADA`/`CANCELADA` exigen `ordenes.finalizar_cancelar`)
- `GET /ordenes`, `/ordenes/buscar`, `/ordenes/codigo/:c`, `/ordenes/:id`, `/:id/historial`, `/:id/materiales`, `/:id/disponibilidad-materiales` → `ordenes.consultar`
- `POST /avances/:ordenId`, `POST /avances-produccion` → `ordenes.registrar_avance`; `GET /avances/:ordenId`, `/avances/:ordenId/total`, `GET /avances-produccion*` → `ordenes.consultar`
- `POST /material-calculation/calcular` → `materiales.calcular` (DTO validado, 400 nunca 500)
- `GET /inventario/material/:id`, `GET /materiales`, `GET /materiales/:id` → `materiales.consultar_disponibilidad`
- `POST/PUT/DELETE /materiales`, todo `POST/PATCH /recetas*` y `GET /recetas*` → `recetas.gestionar`

Contrato Auth: `POST /login` y `GET /me` devuelven `permisos` como `[{id, codigo, nombre}]`. Producción normaliza `string | {codigo}` y no compara rol fijo, así un rol personalizado funciona sin tocar código.

Consideraciones

El rol Encargado de Logística queda definido desde el Sprint 1 para la estructura de autorización. Sus funcionalidades propias serán implementadas en sprints posteriores.

La matriz se basa en las historias de usuario del Sprint 1 relacionadas con control de acceso.
