# Informe de integración — Sprint 1

**Rama:** `integracion/sprint1` (creada desde `origin/develop`)
**Alcance:** integrar el trabajo pendiente de `RamaAndrea`, `ramagemina` y `RamaTats` sin implementar funcionalidad nueva.
**Estado:** integrado y verificado. Todo local: **sin `push`, sin `--force`, sin tocar `develop`/`main`, sin borrar ramas.**

---

## 1. Cómo revisar

```bash
git fetch origin
git log --oneline --graph origin/develop..integracion/sprint1   # 13 commits propios (6 de integración + 6 de corrección + 1 de documentación)
git diff --stat origin/develop...integracion/sprint1            # 92 archivos, +4259 / -753
git show 14635fb   # merge de RamaTats (el más conflictivo)
git show b802c32   # merge de ramagemina
git show 802e1f9   # merge de RamaAndrea
```

Commits de integración (en orden):

| Commit | Descripción |
|---|---|
| `802e1f9` | `merge(RamaAndrea)`: guard de permisos + migración inventario (ABC-188, ABC-172) |
| `30bbf30` | `fix(integracion)`: híbrido de avances (guard de Andrea + servicio de develop) y ajuste de tests obsoletos |
| `b802c32` | `merge(ramagemina)`: detalle de orden, avances híbrido y pantalla de órdenes (ABC-187, ABC-193, ABC-171, ABC-166) |
| `659de51` | `fix(bloqueante)`: auth-service no arrancaba (PermisosGuard sin `RolRepository`) |
| `14635fb` | `merge(RamaTats)`: cálculo de materiales, versiones de receta, doc ERP y pantalla de login (ABC-141, ABC-137, ABC-173, ABC-133) |
| `a76022f` | `docs(informe)`: este informe |

Commits de corrección (plan de bugs aprobado, §6):

| Commit | Descripción |
|---|---|
| `1de7185` | `fix(produccion)`: valida el DTO de materiales (ABC-139) |
| `d3afa1e` | `fix(produccion)`: materiales de la orden multiplicados por la cantidad solicitada |
| `2d0d690` | `fix(frontend)`: `OrdenesPage` lee los campos snake_case del API |
| `d53e364` | `feat(produccion)`: expone `POST /recetas/:id/versiones` (ABC-137) |
| `0f5b039` | `fix(produccion)`: protege recetas, materiales e inventario con sesión válida |
| `3992069` | `fix(produccion)`: `PUT /materiales` sin campos → 400 y código repetido → 409 (ABC-139) |

(El informe se actualiza a su vez en un commit final de documentación.)

Verificado: `RamaSergio`, `RamaAndric` y `main` **ya están contenidos en `origin/develop`**
(`git merge-base --is-ancestor` → exit 0 para los tres), por lo que no se integraron de nuevo.

---

## 2. Orden de integración

1. **`RamaAndrea`** (guard de permisos, migración `InventarioMaterial`, matriz de permisos, pruebas de sesión/auditoría).
2. **`ramagemina`** (detalle de orden, cierre/cancelación, cálculo de materiales por orden, pantalla de órdenes, control de roles).
3. **`RamaTats`** (cálculo de materiales, versiones de receta, login, inicio de producción, expiración de sesión, doc ERP).

---

## 3. Conflictos

### 3.1 Triviales (resueltos sin consultar)

| Archivo | Resolución |
|---|---|
| `api-gateway/src/proxy/proxy.module.ts` | versión de develop (proxy completo) |
| `services/auth-service/src/app.module.ts` | versión de develop (AuthModule/UsuariosModule ya registrados) |
| `services/auth-service/src/database/database.module.ts` | versión de develop |
| `services/auth-service/src/auth/auth.controller.ts` / `auth.service.ts` | versión de develop (add/add) |
| `services/auth-service/package.json` y `package-lock.json` | versión de develop + regeneración con `npm install` |
| `services/produccion-service/package-lock.json` | versión de develop |
| `frontend/src/App.jsx` | versión de develop (solo quitaba el salto final de línea) |
| `services/auth-service/src/database/data-source.ts` | versión de develop (`entities: []`) |
| `services/produccion-service/src/app.module.ts` | **combinado**: módulos de develop + `MaterialCalculationController/Service` + `RecetasVersionService` |

### 3.2 Consultados (5) y resolución

| # | Conflicto | Respuesta recibida | Resolución |
|---|---|---|---|
| 1 | **AVANCES**: `src/avances/` (ramagemina) vs guard `avances_produccion` (Andrea) | Módulo único híbrido | Se conserva la entidad/servicio/guard único y se exponen además `/avances/:ordenId`, `/avances/:ordenId/total` desde `avances-pantalla.controller.ts`. Se descarta `src/avances/`. |
| 2 | **ÓRDENES**: `PUT /:id/finalizar`, `PUT /:id/cancelar` vs guard/transiciones/PATCH `:id/estado` | develop+Andrea + detalle | Se conserva el guard y `PATCH /:id/estado`; se agrega solo `GET /ordenes/:id` (ABC-187). Se descartan los `PUT`. |
| 3 | **ROLES (ABC-166)**: `RolesGuard`/`RolesDecorator`/`users.controller.ts` de ramagemina | No registrar RolesGuard | Se descartan los tres archivos; ABC-166 queda cubierto por `PermisosGuard` (JWT + permisos en BD), verificado con 403 de Supervisor. |
| 4 | **LOGIN (ABC-133/176)**: pantalla de develop+Andrea vs pantalla de RamaTats | *"mantener la funcionalidad de la rama de Andrea pero con el diseño del front de RamaTats"* | `LoginPage.jsx` híbrido: markup/CSS de RamaTats (`LoginPage.css`, mostrar/ocultar contraseña, pie de página) + lógica de Andrea (`iniciarSesion` → `SesionContext`, token en `sessionStorage`, redirect con `location.state.from`). |
| 5 | **LOGIN EN EL GATEWAY**: `POST /api/auth/login` de RamaTats con `fetch` a `http://auth-service:3001/auth/login` | Conservar solo el proxy | Se descarta la ruta nueva (host solo resoluble en Docker y ruta inexistente en auth-service). El login sigue por el proxy `/api/auth` → `localhost:3001/login`. |

### 3.3 Otras decisiones tomadas (misma funcionalidad en dos lados)

| Conflicto | Resolución | Justificación |
|---|---|---|
| **Entidades duplicadas**: `users/user.entity.ts` (RamaTats, ABC-154) y `recetas/receta.entity.ts` + `receta-material.entity.ts` (RamaTats, ABC-135) vs `usuarios/entities/` y `recetas/entities/` de develop | Se conservan las de develop; se borran los duplicados y se revierte `data-source.ts`. `recetas-version.service.ts` re-apunta sus 2 imports a `./entities/` y sus tipos `string` → `number`. | Ambos mapean **las mismas tablas**; `autoLoadEntities` habría registrado 2 clases por tabla (metadata duplicada). |
| **INICIO DE PRODUCCIÓN (ABC-189)**: `OrdenPage.jsx` de RamaTats (lista mockeada, PATCH sin `Authorization`) vs `OrdenPage` real de develop | Se conserva `OrdenPage` de develop y se añade el botón **"Iniciar producción"** a `ConsultaOrdenesPage` reutilizando `cambiarEstadoOrdenProduccion(id, "EN_PRODUCCION")` (ya envía Bearer) y el modal de confirmación existente. | La pantalla de RamaTats recibiría 401 contra el backend integrado y pisaría el alta real de órdenes. |
| **EXPIRACIÓN DE SESIÓN (ABC-177)**: timer de `MainLayout.jsx` (RamaTats) vs `sesion.js` + `SesionContext` (develop+Andrea) | Se conserva `sesion.js`; se descarta el timer de `MainLayout`. | Mismo umbral de 15 min, pero además valida `exp` del JWT, dispara logout automático y tiene tests (4/4). |

---

## 4. Verificación (evidencia)

### 4.1 Builds — 5/5 ✅

| Proyecto | Comando | Resultado |
|---|---|---|
| api-gateway | `npm run build` | exit 0 |
| auth-service | `npm run build` | exit 0 |
| produccion-service | `npm run build` | exit 0 |
| logistica-service | `npm run build` | exit 0 |
| frontend | `npm run build` (vite) | exit 0 — 1936 módulos, `index.css` 25.58 kB (incluye `LoginPage.css`) |

### 4.2 Tests — 188/188 ✅

| Suite | Comando | Resultado |
|---|---|---|
| auth-service | `npx jest` | 10 suites / **56 tests** ✅ |
| produccion-service | `npx jest` | 12 suites / **125 tests** ✅ (incluye `sesion.guard.spec.ts` y `materiales.service.spec.ts`) |
| frontend sesión (ABC-177) | `npm run test:session` | **4/4** ✅ |
| frontend auditoría | `npm run test:audit` | **3/3** ✅ |

⚠️ Salvedad: en alguna corrida de `produccion-service` jest emite `A worker process has failed to exit gracefully` (proceso huérfano, probablemente el `AbortSignal.timeout` de `SesionGuard`); siempre termina con **exit 0** y todos los tests en verde.

### 4.3 Migraciones desde cero ✅

`auth_db` y `produccion_db` **dropeadas y recreadas** en `taller_postgres` (:5433) — dos veces: una para la primera pasada de verificación y otra (29/09, definitiva) para dejar la evidencia de los humos sobre BD limpias —, luego `npm run migration:run`. `logistica_db` no se tocó (sin migraciones pendientes):

- `auth_db` → `AuthSchema1710000000000`, `AuthSeed1710000000001`, `AlignPermisosMatriz1710000000003` (orden correcto, sin duplicados).
- `produccion_db` → `ProduccionSchema1710000000002`, `InventarioMaterial1710000000004`; 8 tablas + 2 vistas (`vw_orden_avance`, `vw_orden_materiales_requeridos`), incluida `inventario_material`.
- `logistica_db` → sin pendientes.
- Segunda corrida en ambos servicios: `No migrations are pending` (idempotentes).

### 4.4 Arranque de los 4 servicios ✅

`JWT_SECRET` definido en los 4 procesos; `/health` → **200** en `:3000` (gateway), `:3001` (auth), `:3002` (producción), `:3003` (logística). El log de producción confirma el registro de las rutas nuevas: `POST /material-calculation/calcular`, `POST|GET /avances/:ordenId`, `GET /avances/:ordenId/total`.

### 4.5 Humo por el gateway (http://localhost:3000) ✅

Ejecutados el **29/09/2026** sobre `auth_db` y `produccion_db` **recreadas y migradas desde cero** (registro completo en `%TEMP%\opencode\smokes-final.log`; `EXIT1 = EXIT2 = EXIT3 = 0`).

**Autenticación (`smoke1`)**

| Endpoint | Código |
|---|---|
| `POST /api/auth/login` (admin / supervisor) | 200 / 200 |
| `GET /api/auth/me` | 200 |
| `GET /api/auth/users` (admin) | 200 |
| `POST /api/auth/users` | **201** |
| `PUT /api/auth/users/:id` | **200** |
| `PATCH /api/auth/users/:id/status` | **200** |
| `DELETE /api/auth/users/:id` | **200** |
| `GET /api/auth/auditoria` (admin) | 200 |
| `GET /api/auth/users` y `/auditoria` (Supervisor) | **403 / 403** |
| `GET /me` sin token y con token basura · `/auditoria` con token basura | **401 / 401 / 401** |

**Producción (`smoke2`, con `produccion_db` recreada)**

| Endpoint | Código |
|---|---|
| `POST /recetas` (Encargado de Producción) | 201 |
| `POST /ordenes` (Encargado de Producción) | 201 |
| `GET /ordenes/buscar` | 200 |
| `GET /ordenes/:id` (detalle, ABC-187) | 200 |
| `GET /ordenes/:id/materiales` → `cantidad_requerida: "25.0000"` (2,5 × 10) | 200 ✅ |
| `GET /ordenes/:id/historial` · `/disponibilidad-materiales` | 200 / 200 |
| `GET /recetas` · `GET /materiales` · `GET /inventario/material/:id` (con token) | 200 / 200 / 200 |
| **`GET /recetas` · `/materiales` · `/inventario/material/:id` sin token** | **401 / 401 / 401** |
| `PATCH /ordenes/:id/estado` PLANIFICADA → EN_PRODUCCION → FINALIZADA | 200 / 200 / 200 |
| `POST /avances/:ordenId` (pantalla) · `GET .../total` · `GET` listado | 201 / 200 / 200 |
| `POST /avances-produccion` (guard) | 201 |
| `POST /avances` sin token → 401 · con Supervisor → 403 | 401 / 403 |
| `PATCH /ordenes/:id/estado` con Supervisor → 403 | 403 |
| Cancelar sin motivo → 400 · con motivo → 200 | 400 / 200 |

**Lo nuevo de `RamaTats` + plan de bugs (`smoke3`)**

| Endpoint | Código |
|---|---|
| `POST /material-calculation/calcular` (ABC-141) → `cantidadTotal: 25` | **201** |
| `POST /recetas` (v1) → `PATCH /:id/desactivar` → `POST /recetas` (v2) | 201 / **200** / 201 |
| `GET /recetas?activa=false` (historial de versiones) · `?activa=true` | 200 / 200 |
| `POST /recetas` duplicada activa | 409 |
| **`POST /recetas/:id/versiones` sin token (ABC-137)** | **401** |
| **`POST /recetas/:id/versiones` con Administrador** | **403** |
| **`POST /recetas/:id/versiones` con DTO inválido** | **400** |
| **`POST /recetas/:id/versiones` (Encargado de Producción)** | **201** |
| `GET /me` y `/auditoria` con token basura | 401 / 401 |
| Ciclo de orden + avances + historial + materiales + 403 Supervisor | 201/200/200/200/400/403 |

**Validación de `POST`/`PUT /materiales` (commits `1de7185` + `3992069`)**

| Caso | Código |
|---|---|
| `POST /materiales` con DTO válido | **201** |
| `POST /materiales` con DTO inválido (`{"nombre":123}`) | **400** |
| `POST /materiales` con código repetido | **409** |
| `POST /materiales` sin token | **401** |
| `PUT /materiales/:id` con cuerpo vacío `{}` | **400** (`Debe indicar al menos un campo a actualizar`) |
| `PUT /materiales/:id` con campo válido | **200** |
| `PUT /materiales/:id` sin token | **401** |

> Nota: en `smoke3` la transición inválida de orden está etiquetada "409" en el script, pero la API devuelve **400** (discrepancia de etiqueta en el script de humo, no en el servicio).

### 4.6 Frontend ✅ (con salvedad)

- `vite build` sin errores (imports y JSX válidos).
- **12 rutas** en `AppRoutes.jsx`, todas únicas; **13 entradas de menú** en `MainLayout.jsx`, sin duplicados ni enlaces rotos (`/produccion/ordenes` → detalle, `/ordenes` → nueva orden, `/produccion/avances` → avances).
- `LoginPage.jsx` importa `../styles/LoginPage.css`; ninguna página importa archivos inexistentes.
- ⚠️ **No se pudo hacer la prueba visual en navegador**: no hay navegador de escritorio conectado a esta sesión (`browser.disconnected`). La evidencia de UI se limita al build y a la inspección estática.

---

## 5. Tabla de tareas ABC

| ABC | Tarea | Origen | Estado | Evidencia |
|---|---|---|---|---|
| ABC-188 | Guard de permisos | RamaAndrea | **integrada y verificada** | 403 Supervisor en `/users`, `/auditoria`, `/ordenes/:id/estado`, `/avances` |
| ABC-172 | Migración de inventario de materiales | RamaAndrea | **integrada y verificada** | `InventarioMaterial1710000000004` desde cero; `GET /inventario/material/1` → 200 |
| ABC-190 | Pruebas del sprint | RamaAndrea | **integrada y verificada** | `test:session` 4/4 y `test:audit` 3/3 |
| ABC-187 | Vista de detalle de orden y consulta de materiales | ramagemina | **integrada y verificada** | `GET /ordenes/:id` → 200 (objeto completo) |
| ABC-193 | Cierre y cancelación de órdenes | ramagemina | **integrada y verificada** | FINALIZADA 200, cancelar 400 (sin motivo) / 200 (con motivo) |
| ABC-171 | Cálculo de materiales requeridos por orden | ramagemina | **integrada y verificada** | `GET /ordenes/:id/disponibilidad-materiales` → 200, `cantidad_requerida: 25` |
| ABC-196 | Avances de producción | ramagemina | **integrada y verificada** | `POST /avances/:ordenId` 201, total/listado 200, 401/403 |
| ABC-166 | Control de roles en usuarios | ramagemina | **integrada y verificada** (cobertura alternativa) | `RolesGuard` descartado por decisión; cubierto por `PermisosGuard` (403 verificados) |
| ABC-141 | Cálculo de materiales requeridos (servicio) | RamaTats | **integrada y verificada** | `POST /material-calculation/calcular` → 201 con `cantidadTotal: 25` |
| ABC-137 | Control de versiones de recetas | RamaTats | **integrada y verificada** | `POST /recetas/:id/versiones` expuesto en `d53e364`: 401 sin sesión, 403 sin `recetas.gestionar`, 400 con DTO inválido, **201** con Encargado de Producción. El versionado "clásico" (`desactivar` + `POST`) sigue funcionando (201/200/201 y `?activa=false` → historial). |
| ABC-139 | Alta/edición de materiales con validación | RamaTats / develop | **corregida y verificada** | `UpdateMaterialDto` escrito a mano en `1de7185`: POST inválido → 400, PUT vacío → 400, código repetido → 409 (`3992069`); sin token → 401 (§4.5). |
| ABC-173 | Documentación de integración con ERP de inventarios | RamaTats | **integrada y verificada** | `docs/integracion-erp-inventarios.md` en el commit `14635fb` |
| ABC-133 | Interfaz de inicio de sesión | RamaTats | **integrada y verificada** (diseño) | Markup + `LoginPage.css` integrados; ⚠️ sin prueba visual en navegador |
| ABC-176 | Login con backend (token) | develop+Andrea | **integrada y verificada** | `POST /api/auth/login` → 200 con token; `GET /me` → 200 |
| ABC-177 | Cierre y expiración de sesión | RamaTats / develop | **integrada y verificada** | `sesion.js` (15 min + `exp` del JWT) con 4/4 tests; token basura → 401 |
| ABC-189 | Inicio de producción en órdenes | RamaTats | **integrada y verificada** | Botón "Iniciar producción" en `ConsultaOrdenesPage` + `PATCH /ordenes/:id/estado` → 200 (`EN_PRODUCCION`) |
| ABC-154 | Entidad ORM de usuarios | RamaTats | **integrada y verificada** (por equivalente) | Su archivo se descartó por duplicar `usuarios/entities/`; funciona con la entidad de develop (CRUD 201/200) |
| ABC-135 | Entidad ORM de recetas | RamaTats | **integrada y verificada** (por equivalente) | Su archivo se descartó por duplicar `recetas/entities/`; `recetas-version.service.ts` re-apuntado a esas entidades |
| ABC-159 / ABC-160 | auth-login / produccion-crud | — | **no encontrada en ninguna rama** | Solo aparecen en `docs/GIT.md` como ejemplos de convención de nombres de rama; no hay commits ni diferenciación en `RamaAndrea`, `ramagemina` ni `RamaTats` (si son tareas del sprint, su implementación ya está en `develop`) |

Resto de referencias ABC encontradas en comentarios (`ABC-119/148/151/164/167/180/165/184/186/192/197`, `ABC-158`) pertenecen a `develop`, ya incluida en la base.

---

## 6. Bugs pendientes

### 6.1 Corregido por ser bloqueante (avisado)

| Bug | Detalle |
|---|---|
| **auth-service no arrancaba** | `Nest can't resolve dependencies of the PermisosGuard ... "RolRepository"`. Se añadió `TypeOrmModule.forFeature([Rol])` a `auditoria.module.ts` y `permisos.module.ts` (`659de51`, `fix(bloqueante)`). **Bug preexistente**: reproducido igual en `origin/develop` puro con un worktree temporal, no introducido por la integración. |

### 6.2 Corregidos en esta rama (plan aprobado)

| # | Bug | Commit | Evidencia |
|---|---|---|---|
| 1 | `POST /materiales` no validaba el DTO (ABC-139) | `1de7185` | POST inválido → **400**; POST válido → 201 |
| 2 | `GET /ordenes/:id/materiales` no multiplicaba por la cantidad solicitada | `d3afa1e` | Orden de 10 × 2,5 → `cantidad_requerida: "25.0000"` (+ test unitario) |
| 3 | `OrdenesPage.jsx` leía `cantidadSolicitada`/`fechaProgramada` (el API devuelve snake_case) | `2d0d690` | `??` en `OrdenesPage.jsx:332,338`; `vite build` OK |
| 4 | `RecetasVersionService` sin endpoint (ABC-137) | `d53e364` | `POST /recetas/:id/versiones` → 401 / 403 / 400 / **201** |
| 5 | Recetas, materiales e inventario abiertos sin sesión | `0f5b039` | `SesionGuard`: sin token → **401** en `GET/POST /recetas`, `GET/POST /materiales`, `GET /inventario`; con token → 200 |
| 6 | `PUT /materiales` con cuerpo vacío → 500 (TypeORM sin valores) y `POST` con código repetido → 500 (violación de única) | `3992069` | PUT `{}` → **400**; código repetido → **409**; ambos casos con test unitario |

### 6.3 Preexistentes — documentados, **no** corregidos

| Bug | Detalle |
|---|---|
| `frontend/src/styles/login.css` sin uso | `LoginPage.jsx` ahora importa `LoginPage.css` (diseño de RamaTats); el CSS antiguo queda huérfano (**no se borra**: es un archivo de develop y así quedó acordado). |

---

## 7. Cómo repetir la verificación

```powershell
# 1. Base de datos desde cero
docker compose --profile db up -d
docker exec taller_postgres psql -U postgres_user -d postgres -c "DROP DATABASE IF EXISTS produccion_db WITH (FORCE);"
docker exec taller_postgres psql -U postgres_user -d postgres -c "CREATE DATABASE produccion_db;"
# (repetir para auth_db y logistica_db si se quiere todo desde cero)
cd services\auth-service;     npm run migration:run
cd ..  \produccion-service;   npm run migration:run
cd ..  \logistica-service;    npm run migration:run

# 2. Builds y tests
cd api-gateway;           npm run build
cd ..\services\auth-service;      npm run build;  npx jest
cd ..\produccion-service;         npm run build;  npx jest
cd ..\logistica-service;          npm run build
cd ..\..\frontend;                npm run build;  npm run test:session;  npm run test:audit

# 3. Servicios (una terminal por servicio, con JWT_SECRET)
$env:JWT_SECRET='change_this_secret_example'
npm start        # en api-gateway, auth-service, produccion-service, logistica-service

# 4. Humo (scripts locales, fuera del repo)
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\opencode\smoke1.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\opencode\smoke2.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\opencode\smoke3.ps1"
```

**Nota:** `smoke1` y `smoke2` comparten `body.json`; ejecutarlos **en paralelo** pisa los bodies y produce falsos negativos (400/404 fantasma). Correrlos en secuencia.

**Datos de prueba sembrados:** `admin@taller.com`/`Admin@123` (rol 1), `encargado@taller.com`/`Prod@123` (rol 2), `supervisor@taller.com`/`Sup@123` (rol 4); material `MAT-01` con `inventario_material = 1000`.

⚠️ **Las migraciones de `auth` siembran los 4 roles y los 13 permisos, pero no crean usuarios** (comportamiento preexistente). Para la verificación se insertaron a mano con hashes bcrypt (`$2b$10$...`) en `auth_db`; si se recrea esa BD hay que volver a sembrarlos (o crearlos con `POST /api/auth/users` y luego darles el rol).
