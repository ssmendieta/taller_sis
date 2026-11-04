# Informe de cierre Sprint 1

Rama: `feature/cierre-sprint1` (local, sin push). Todo el trabajo es local.
Revisar con: `git diff origin/develop..feature/cierre-sprint1 --stat`.

## Paquetes y commits

| Paquete | Commit |
| --- | --- |
| WP1 autorización por permisos | `autorizacion por permisos` |
| WP2 roles y permisos reales | `roles y permisos reales` |
| WP3 seeds | `seed de admin y datos demo` |
| WP4 sesión en servidor | `sesion en servidor con logout` |
| WP5 usuarios | `proteccion de usuarios administradores` |
| WP6 auditoría | `auditoria con filtros e inmutable` |
| WP7 órdenes backend | `ordenes con validaciones y codigos secuenciales` |
| WP9 recetas y materiales | `recetas con versiones y materiales` |
| WP10 e2e + trazabilidad y WP11 docs e infra (mismo commit) | `pruebas e2e, trazabilidad y documentacion` |
| Integración con develop local | `usuarios: valida nombre` |

Además, dentro de ese commit van dos fixes: `seed:admin` transaccional (el
primer intento dejaba el usuario sin auditoría si fallaba el insert) y el
permiso `ordenes.consultar` para Encargado — ver "Bloqueante" abajo.

## Verificaciones (evidencia resumida)

- Build limpio con `dist` borrado: gateway, auth, producción, logística
  (`dist/main.js` generado) y frontend (`dist/index.html`). El bug del
  `tsbuildinfo` fuera de `dist` se corrigió con `tsBuildInfoFile: dist/.tsbuildinfo`
  en los 4 tsconfig. 5/5 OK.
- `npx jest` auth: 71 pass, 1 skip (arranque real, solo con ARRANQUE_REAL=1).
  Producción: 133 pass, 1 skip. Nada que pasaba antes falla.
  Última corrida local 30-sep: auth 14/14 suites, prod 15/15 suites.
- Migraciones desde cero (`auth_db`, `produccion_db` recreadas): auth 6/6,
  producción 3/3. Segunda ejecución: "No migrations are pending" en ambas.
- `seed:admin` dos veces: crea 1 usuario + 1 auditoría, la segunda no duplica.
  `seed:demo` dos veces: 3 materiales, 3 inventarios, receta PAN-001 + 3 líneas.
- Servicios levantados con JWT_SECRET y AUTH_SERVICE_URL (auth :3001,
  producción :3002, logística :3003, gateway :3000). `npm run e2e`: **87/87 OK**.
- Arranque real (`ARRANQUE_REAL=1`): AppModule de auth y producción compilan e
  inician contra PostgreSQL real. 2/2 OK.
- Trigger en vivo: `UPDATE auditoria ...` → error "La tabla auditoria es
  inmutable". Inactividad en vivo: sesión envejecida 20 min → `/me` 401
  "La sesión expiró por inactividad".
- Compose sin JWT_SECRET → error claro con mensaje (verificado con env vacío).
- Frontend: `test:session` 4/4, `test:audit` 3/3, `vite build` OK.
- Visual por rol: **no verificada** — no hay navegador ni Playwright en este
  entorno. Las rutas/menús por permiso están implementadas y cubiertas por e2e
  a nivel backend (401/403), pero la comprobación visual queda pendiente.

## Trazabilidad

`docs/trazabilidad-sprint1.md`: una fila por subtarea (endpoints, archivos,
pantallas, pruebas). Los títulos exactos de historias/subtareas son los de
Jira; si alguno difiere, vale la clave ABC.

## Integración

- Se portó la validación de nombre completo (rechaza vacío/solo espacios,
  recorta bordes) sobre la protección de administrador existente (no
  autodesactivación, no dejar sin administrador). Se conserva el código
  secuencial `ORD-AAAA-NNNNN` con reintento ante colisión, que cubre el caso
  de colisiones y mantiene el e2e en verde.

## Bloqueante arreglado al paso (avisado)

`fix(WP10): ordenes.consultar para Encargado de Producción`
(migración `1710000000008-EncargadoConsultaOrdenes`, doc actualizada).
Al proteger las lecturas con `ordenes.consultar`, el Encargado quedaba sin
poder listar ni ver sus propias órdenes (la siembra original solo daba ese
permiso al Supervisor) y el e2e fallaba en 7 checks. Sin lectura no puede
operar. El Supervisor sigue sin permisos de mutación.

## Parcial o pendiente

- Visual frontend por rol (Administrador, Encargado, Supervisor): pendiente por
  falta de navegador/Playwright en este entorno.
- Expiración deslizante de 15 min en vivo con espera real: no se esperaron 15
  min; cubierta por test unitario parametrizable + verificación viva con
  envejecimiento por SQL.
- `?demo=1` eliminado de auditoría y órdenes; si otra pantalla tuviera datos
  ficticios, reportarlo.

## Jira sugerido

- A Listo: ABC-151 (autorización backend por permiso, sin rol fijo),
  ABC-87 (roles/permisos reales), ABC-88, ABC-90, ABC-116–119, ABC-135–139,
  ABC-165–171, ABC-176, ABC-177, ABC-182–186, ABC-190, ABC-193, ABC-197.
- Reabrir si aplica: cualquiera cuya prueba e2e/unitario falle en la máquina
  del revisor (indicar el check exacto del script).
