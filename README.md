# Proyecto Taller

## 1. Requisitos
- Node.js >= 18, npm >= 9
- Docker + Docker Compose v2 (para PostgreSQL; sin Docker solo funciona `SKIP_DB=true` sin BD)
- Git
- Puertos libres: 3000, 3001, 3002, 3003, 5173, 5432
- SO: Windows / Linux / macOS

## 2. Arquitectura
```
React (Vite :5173, VITE_API_URL=http://localhost:3000)
  ↓  HTTP/REST
API Gateway (NestJS :3000)  -> ConfigModule + http-proxy-middleware
  ↓  /api/auth/*          -> auth-service:3001
  ↓  /api/produccion/*    -> produccion-service:3002
  ↓  /api/logistica/*     -> logistica-service:3003
┌──────────────┬─────────────────────┬──────────────────┐
│ Auth Service │ Produccion Service  │ Logistica Service│
│ :3001        │ :3002               │ :3003            │
│ auth_db      │ produccion_db       │ logistica_db     │
└──────────────┴─────────────────────┴──────────────────┘
         ↓ 1 instancia PostgreSQL 15 taller_postgres:5432 (pgdata)
```
Todo HTTP/REST. Cada MS solo ve su DB, sin FK entre DBs. `responsable_usuario_id` es BIGINT externo.

## 3. Estructura de Carpetas
```
/
├── frontend/  (Vite+React :5173)
│   └── src/{components/SystemStatus.jsx, pages/{Home,Login,Produccion,Logistica,SystemStatusPage}.jsx,
│            layouts/MainLayout.jsx, routes/AppRoutes.jsx, services/{api.js,system.service.js}, styles/}
├── api-gateway/ :3000
│   └── src/{main.ts, app.module.ts, proxy/proxy.module.ts, health/}
├── services/
│   ├── auth-service/ :3001 -> auth_db (migrations 1710000000000*, 1710000000001*)
│   │   └── src/database/{data-source.ts, database.module.ts, migrations/}
│   ├── produccion-service/ :3002 -> produccion_db (migration 1710000000002* + 2 vistas, health/database)
│   └── logistica-service/ :3003 -> logistica_db (vacía)
├── database/
│   ├── init/01-create-dbs.sql  (crea 3 DBs en 1 instancia)
│   ├── auth/.gitkeep, produccion/.gitkeep, logistica/.gitkeep
├── docs/GIT.md, docs/ARCHITECTURE.md
├── scripts/install-all.ps1, scripts/test-e2e.ps1
├── docker-compose.yml (postgres + 4 servicios + frontend, healthcheck)
├── .env.example (POSTGRES_* y VITE_API_URL sin secretos)
└── README.md
```

## 4. Instalación
```powershell
git clone <repo> && cd "proyecto taller"
Copy-Item .env.example .env  # o cp .env.example .env en bash
.\scripts\install-all.ps1
# equivale a: npm install --prefix frontend; --prefix api-gateway; --prefix services/auth-service etc.
# o manual:
# cd frontend && npm install
# cd ../api-gateway && npm install
# cd ../services/auth-service && npm install; cd ../produccion-service && npm install; cd ../logistica-service && npm install
```

## 5. Variables de Entorno
Ver `.env.example` (sin secretos reales). Requeridas para levantar sin Docker:
```
GATEWAY_PORT=3000
AUTH_SERVICE_PORT=3001
PRODUCCION_SERVICE_PORT=3002
LOGISTICA_SERVICE_PORT=3003
FRONTEND_PORT=5173
NODE_ENV=development
AUTH_SERVICE_URL=http://localhost:3001
PRODUCCION_SERVICE_URL=http://localhost:3002
LOGISTICA_SERVICE_URL=http://localhost:3003
VITE_API_URL=http://localhost:3000 # frontend SOLO conoce gateway
DB_HOST=localhost          # fuera de docker; dentro docker es "postgres"
DB_PORT=5432
DB_USERNAME=postgres_user
DB_PASSWORD=postgres_password_example
DB_AUTH_DATABASE=auth_db
DB_PRODUCCION_DATABASE=produccion_db
DB_LOGISTICA_DATABASE=logistica_db
POSTGRES_HOST=localhost    # alias compat Fase 3
POSTGRES_PORT=5432
POSTGRES_USER=postgres_user
POSTGRES_PASSWORD=postgres_password_example
POSTGRES_DB=auth_db
AUTH_DB=auth_db
PRODUCCION_DB=produccion_db
LOGISTICA_DB=logistica_db
SKIP_DB=false              # true solo para probar health sin PG
```
No versionar `.env`. Cambiar `DB_*` en `.env` si usas credenciales reales.

## 6. PostgreSQL
- 1 instancia `postgres:15-alpine` `taller_postgres` (`docker-compose.yml:3`) con `healthcheck pg_isready`.
- Volumen `pgdata:/var/lib/postgresql/data` persiste datos. `docker compose down -v` lo borra.
- Dentro de docker los MS usan `DB_HOST=postgres` (DNS docker), fuera usan `localhost`.

## 7. Creación de Bases
Automática al primer `up` via `database/init/01-create-dbs.sql` montado en `/docker-entrypoint-initdb.d:ro` (`docker-compose.yml:15`):
```sql
SELECT 'CREATE DATABASE produccion_db' WHERE NOT EXISTS ... \gexec
SELECT 'CREATE DATABASE logistica_db' WHERE NOT EXISTS ... \gexec
SELECT 'CREATE DATABASE auth_db' WHERE NOT EXISTS ... \gexec
```
Verificar tras `docker compose --profile db up -d`:
```powershell
docker exec taller_postgres psql -U postgres -c "\l" | findstr auth_db
```

## 8. Migraciones
TypeORM por MS, `synchronize:false`, `migrations:[migrations/*{.ts,.js}]` en `services/*/src/database/data-source.ts`.

- `auth-service`: `1710000000000-AuthSchema` (roles, permisos, rol_permiso, usuarios, auditoria + índices) y `1710000000001-AuthSeed` (4 roles, 13 permisos)
- `produccion-service`: `1710000000002-ProduccionSchema` (materiales, recetas, receta_material, ordenes_produccion, historial_estado_orden, avances_produccion + vistas `vw_orden_materiales_requeridos`, `vw_orden_avance`)
- `logistica-service`: sin migraciones (vacía).

Comandos:
```powershell
cd services/auth-service; npm run migration:run      # o npx typeorm migration:run -d src/database/data-source.ts
cd ../produccion-service; npm run migration:run
npm run migration:revert  # revertir última
docker exec taller_postgres psql -U postgres -d auth_db -c "\dt"
docker exec taller_postgres psql -U postgres -d produccion_db -c "\dt; \dv"
docker exec taller_postgres psql -U postgres -d logistica_db -c "\dt" # vacío
```

## 9. Ejecución de Servicios (MS)
```powershell
# Con PostgreSQL corriendo
cd services/auth-service; npm run start:dev       # :3001 -> auth_db
cd services/produccion-service; npm run start:dev # :3002 -> produccion_db (incluye GET /health/database)
cd services/logistica-service; npm run start:dev  # :3003 -> logistica_db
# build prod: npm run build && npm run start:prod
# sin PG para probar health sin DB: $env:SKIP_DB="true"; npm run start:dev
```

## 10. Ejecución del Gateway
```powershell
cd api-gateway; npm run start:dev # :3000
# env inyectados por docker-compose o .env: AUTH_SERVICE_URL etc.
# via Docker: docker compose --profile full up -d --build
```
Gateway expone `GET /health` y proxea:
- `GET /api/auth/* -> auth-service:3001/*`
- `GET /api/produccion/* -> produccion-service:3002/*`
- `GET /api/logistica/* -> logistica-service:3003/*`
Implementado en `api-gateway/src/proxy/proxy.module.ts` con `http-proxy-middleware` y `ConfigModule`.

## 11. Ejecución de React
```powershell
cd frontend; npm run dev      # :5173, VITE_API_URL=http://localhost:3000
# build: npm run build; npm run preview -- --host 0.0.0.0 --port 5173
# Docker: docker compose --profile full up -d (frontend Dockerfile hace npm run preview)
```
Rutas: `/`, `/login`, `/produccion`, `/logistica`, `/estado` (SystemStatus). `MainLayout.jsx` navbar con `isActive`.

## 12. Puertos
| Componente | Puerto | URL |
|---|---|---|
| Frontend | 5173 | http://localhost:5173 |
| API Gateway | 3000 | http://localhost:3000/health, /api/*/health |
| Auth Service | 3001 | http://localhost:3001/health |
| Producción Service | 3002 | http://localhost:3002/health, /health/database |
| Logística Service | 3003 | http://localhost:3003/health |
| PostgreSQL | 5432 | postgres://localhost:5432 (taller_postgres) |

Todos configurables via `.env.example`.

## 13. Health Checks
```powershell
# directos
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3002/health/database # consulta real SELECT 1 a produccion_db -> {service:"produccion-service", database:"connected", status:"ok"}
curl http://localhost:3003/health
# via gateway (Fase 2+3)
curl http://localhost:3000/api/auth/health
curl http://localhost:3000/api/produccion/health
curl http://localhost:3000/api/logistica/health
curl http://localhost:3000/api/produccion/health/database # Gateway -> Producción -> PostgreSQL
# frontend
# http://localhost:5173/estado muestra Gateway: OK, Producción: OK, Base de datos: OK (SystemStatus.jsx)
```
Flujo verificado: `Frontend (SystemStatus.jsx) → Gateway (proxy) → Producción (DataSource.query SELECT 1) → PostgreSQL produccion_db → ... → Frontend`.

## 14. Solución de Problemas Frecuentes
- `ECONNREFUSED 5432` o `getaddrinfo ENOTFOUND postgres`: fuera de docker usar `DB_HOST=localhost` en `.env`, dentro usar `postgres`. Verificar `docker ps` y `docker logs taller_postgres`.
- `database "auth_db" does not exist`: ejecutar `docker compose --profile db up -d` y esperar healthcheck `pg_isready` (10s). No crear DBs manual con pgAdmin, usar `01-create-dbs.sql`.
- `relation does not exist` tras migrar: ejecutar `npm run migration:run` en cada servicio. Verificar `\dt` en cada DB. `logistica_db` debe quedar vacía intencionalmente.
- `port already in use` 3000-3003/5173/5432: cambiar `GATEWAY_PORT` etc. en `.env` o `netstat -ano | findstr :3000` y matar proceso.
- `SKIP_DB=true` muestra `database:"skipped"` en `/health/database` — es para probar sin PG. Con PG debe ser `connected`; si sale `disconnected` revisar credenciales `DB_USERNAME/PASSWORD`.
- `http-proxy 504` en `/api/*`: verificar `AUTH_SERVICE_URL` etc. apunten a `http://auth-service:3001` dentro de docker o `http://localhost:3001` fuera. Revisar `api-gateway/src/proxy/proxy.module.ts` logs `proxy -> auth: ...`.
- `vite: VITE_API_URL not defined`: definir `VITE_API_URL=http://localhost:3000` en `.env` y reiniciar `npm run dev` (Vite solo lee env al iniciar).
- `docker compose down -v` borra `pgdata` — migraciones se deben re-ejecutar.
- `npm run build` falla con `TS2345 createProxyMiddleware`: ya fixeado con `as any` en `proxy.module.ts`.
- `frontend build` 166kB OK, `api-gateway` y `services` builds OK con `nest build`.

---
HU ABC-158 completada: Fase 1 (estructura), Fase 2 (PG + migraciones + gateway), Fase 3 (env consolidado, docker healthcheck, README 14 puntos, /health/database real, gateway proxy, frontend SystemStatus, pruebas e2e).
