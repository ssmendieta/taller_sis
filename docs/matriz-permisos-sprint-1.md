 Matriz de Permisos – Sprint 1
 Roles

- Administrador
- Encargado de Producción
- Encargado de Logística
- Supervisor

 Matriz de permisos

| Permiso                                | Administrador | Encargado de Producción | Encargado de Logística | Supervisor |
| -------------------------------------- | ------------- | ----------------------- | ---------------------- | ---------- |
| Iniciar sesión                         | ✓             | ✓                       | ✓                     | ✓          |
| Gestionar usuarios                     | ✓             | —                       | —                      | —          |
| Gestionar roles y permisos             | ✓             | —                       | —                      | —          |
| Gestionar recetas                      | —             | ✓                       | —                      | —          |
| Crear órdenes de producción            | —             | ✓                       | —                      | —          |
| Actualizar estado de órdenes           | —             | ✓                       | —                      | —          |
| Calcular materiales                    | —             | ✓                       | —                      | —          |
| Consultar disponibilidad de materiales | —             | ✓                       | —                      | —          |
| Iniciar orden de producción            | —             | ✓                       | —                      | —          |
| Finalizar/cancelar orden               | —             | ✓                       | —                      | —          |
| Registrar avance de producción         | —             | ✓                       | —                      | —          |
| Consultar órdenes de producción        | —             | —                       | —                      | ✓          |
| Consultar auditoría                    | ✓             | —                       | —                      | —          |

 Consideraciones

El rol Encargado de Logística queda definido desde el Sprint 1 para la estructura de autorización. Sus funcionalidades propias serán implementadas en sprints posteriores.

La matriz se basa en las historias de usuario del Sprint 1 relacionadas con control de acceso.
