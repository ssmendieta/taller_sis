# Informe de cierre Sprint 1

Rama: `feature/cierre-sprint1` (local, sin push). Todo el trabajo es local.
Revisar con: `git diff origin/develop..feature/cierre-sprint1 --stat`.

## Paquetes y commits

| Paquete | Commit | Claves ABC |
| --- | --- | --- |
| WP1 autorización por permisos | `feat(WP1): autorizacion por permisos y contrato login/me con codigo` | ABC-151, 153, 166, 134 |
| WP2 roles y permisos reales | `feat(WP2): CRUD real de roles y permisos con auditoria y UI conectada` | ABC-87, 150, 152, 151 |
| WP3 seeds | `feat(WP3): seed idempotente de admin y demo sin endpoints de inventario` | ABC-182, 179, 139, 143 |
| WP4 sesión en servidor | `feat(WP4): sesion en servidor con jti, logout y expiracion deslizante` | ABC-177, 176 |
| WP5 usuarios | `feat(WP5): protege ultimo admin y alinea filtro de bajas` | ABC-88, 156, 157, 180, 181 |
| WP6 auditoría | `feat(WP6): auditoria con nombres, filtros, trigger inmutable y sin demos` | ABC-90, 164, 183, 184, 185, 186 |
| WP7 órdenes backend | `feat(WP7): ordenes con codigo secuencial, validaciones, snapshots y busqueda por rangos` | ABC-116, 117, 118, 119, 147, 148, 149, 141 |
| WP9 recetas y materiales | `feat(WP9): recetas completas con versiones, materiales con disponibilidad y bloqueo 409` | ABC-135, 136, 137, 138, 139 |
| WP10 e2e + trazabilidad | `feat(WP10): e2e sprint1, trazabilidad y arranque real` | ABC-165–171, 186, 190, 193, 197 |
| WP11 docs e infra | `feat(WP11): readme ejecutable, compose estricto, higiene de build` | ABC-159–163, 198, 173 |

Además: `fix(WP3): seed:admin transaccional` (el primer intento dejaba el
usuario sin auditoría si fallaba el insert) y `fix(WP10): permiso
ordenes.consultar para Encargado` — ver "Bloqueante" abajo.

## Verificaciones (evidencia resumida)

- Build limpio con `dist` borrado: gateway, auth, producción, logística
  (`dist/main.js` generado) y frontend (`dist/index.html`). El bug del
  `tsbuildinfo` fuera de `dist` se corrigió con `tsBuildInfoFile: dist/.tsbuildinfo`
  en los 4 tsconfig. 5/5 OK.
- `npx jest` auth: 69 pass, 1 skip (arranque real, solo con ARRANQUE_REAL=1).
  Producción: 133 pass, 1 skip. Nada que pasaba antes falla.
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
