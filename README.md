# Proyecto Taller - HU ABC-158 Fase 1 + Fase 2

## Arquitectura

```
React (Vite :5173)  -- VITE_API_URL=http://localhost:3000 -->
   ↓
API Gateway (NestJS :3000)
   ↓  /api/auth/* -> auth-service:3001
   ↓  /api/produccion/* -> produccion-service:3002
   ↓  /api/logistica/* -> logistica-service:3003
┌──────────────┬─────────────────────┬──────────────────┐
│ Auth Service │ Produccion Service  │ Logistica Service│
│   :3001      │      :3002          │     :3003        │
│  auth_db     │  produccion_db      │  logistica_db    │
└──────────────┴─────────────────────┴──────────────────┘
         ↓ una sola instancia PostgreSQL :5432 (taller_postgres)
```

- **Frontend**: React + Vite (solo conoce `VITE_API_URL`)
- **API Gateway**: NestJS + `http-proxy-middleware`
- **Microservicios**: NestJS + TypeORM + pg
- **Base de datos**: PostgreSQL 15 (3 DBs en 1 contenedor)

## Estructura del Repositorio

```
/
├── frontend/                 # React + Vite :5173
│   └── src/{components,pages,layouts,routes,services,hooks,assets,styles,App.jsx,main.jsx}
├── api-gateway/              # NestJS :3000 + proxy /api/*
│   └── src/proxy/proxy.module.ts
├── services/
│   ├── auth-service/         # :3001 -> auth_db (2 migraciones)
│   │   └── src/database/{data-source.ts,database.module.ts,migrations/}
│   ├── produccion-service/   # :3002 -> produccion_db (1 migración + 2 vistas)
│   └── logistica-service/    # :3003 -> logistica_db (vacía)
├── database/
│   ├── init/01-create-dbs.sql
│   ├── auth/.gitkeep
│   ├── produccion/.gitkeep
│   └── logistica/.gitkeep
├── docs/
├── scripts/install-all.ps1
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Requisitos

- Node.js >= 18, npm >= 9
- Docker + Docker Compose (para PostgreSQL y recreación desde cero)
- PostgreSQL no se instala local, se usa contenedor `taller_postgres`

## Instalación

```bash
cp .env.example .env
# instalar todo
.\scripts\install-all.ps1
# o manual
cd frontend && npm install
cd ../api-gateway && npm install
cd ../services/auth-service && npm install
cd ../services/produccion-service && npm install
cd ../services/logistica-service && npm install
```

## Cómo Arrancar Cada Componente

| Componente | Puerto | Comando | URL health |
|---|---|---|---|
| Frontend | 5173 | `cd frontend && npm run dev` | http://localhost:5173 |
| API Gateway | 3000 | `cd api-gateway && npm run start:dev` | http://localhost:3000/health y proxy /api/*/health |
| Auth | 3001 | `cd services/auth-service && npm run start:dev` | http://localhost:3001/health |
| Producción | 3002 | `cd services/produccion-service && npm run start:dev` | http://localhost:3002/health |
| Logística | 3003 | `cd services/logistica-service && npm run start:dev` | http://localhost:3003/health |

**Con Docker (recomendado Fase 2):**
```bash
docker compose --profile db up -d          # solo postgres
docker compose --profile full up -d        # todo (requiere Dockerfiles, opcional)
```

## Endpoints Disponibles

**Fase 1 directos:**
- `GET /health` en cada MS y gateway -> `{service, status:"ok"}`

**Fase 2 via Gateway (único punto de entrada):**
- `GET http://localhost:3000/api/auth/health` -> proxy a `auth-service:3001/health`
- `GET http://localhost:3000/api/produccion/health` -> `produccion-service:3002/health`
- `GET http://localhost:3000/api/logistica/health` -> `logistica-service:3003/health`
- `GET http://localhost:3000/health` -> gateway propio

Frontend rutas SPA: `/`, `/login`, `/produccion`, `/logistica` (placeholders)

## Base de Datos Fase 2

**PostgreSQL 1 instancia `taller_postgres:5432` con 3 DBs:**
- `auth_db` — 5 tablas: `roles`, `permisos`, `rol_permiso`, `usuarios` (unique LOWER correo), `auditoria` (JSONB) + índices. Seed: 4 roles, 13 permisos.
- `produccion_db` — 6 tablas: `materiales`, `recetas` (unique producto activa), `receta_material` (CHECK >0), `ordenes_produccion` (estado CHECK, FK receta), `historial_estado_orden`, `avances_produccion` + 2 vistas `vw_orden_materiales_requeridos`, `vw_orden_avance`.
- `logistica_db` — vacía (sin tablas).

**Migraciones TypeORM:**
- `services/auth-service/src/database/migrations/1710000000000-AuthSchema.ts` (schema)
- `services/auth-service/src/database/migrations/1710000000001-AuthSeed.ts` (datos)
- `services/produccion-service/src/database/migrations/1710000000002-ProduccionSchema.ts` (schema + vistas)
- Cada MS gestiona solo sus migraciones, sin FK entre DBs. `responsable_usuario_id` es BIGINT externo, no FK a auth_db.

**Conexiones:** cada MS solo ve su DB via `DB_HOST/PORT/USERNAME/PASSWORD/DB_DATABASE` (docker-compose inyecta `postgres` como host).

## Variables de Entorno

Ver `.env.example`:

```
GATEWAY_PORT=3000 ... FRONTEND_PORT=5173
AUTH_SERVICE_URL=http://localhost:3001
PRODUCCION_SERVICE_URL=http://localhost:3002
LOGISTICA_SERVICE_URL=http://localhost:3003
VITE_API_URL=http://localhost:3000   # frontend solo conoce gateway
DB_HOST=localhost (postgres en docker)
DB_AUTH_DATABASE=auth_db etc.
```

No versionar `.env` real.

## Comandos para Recrear Todo Desde Cero

```bash
# 1. limpiar
docker compose down -v

# 2. levantar postgres y crear 3 DBs (via database/init/01-create-dbs.sql)
docker compose --profile db up -d
# esperar 5s y verificar
docker exec taller_postgres psql -U postgres -c "\l" | grep -E "auth_db|produccion_db|logistica_db"

# 3. instalar deps si es primera vez
.\scripts\install-all.ps1

# 4. migraciones (requiere DB_HOST=localhost si corres fuera de docker, o postgres dentro)
cd services/auth-service && npm run migration:run
cd ../produccion-service && npm run migration:run
# logistica no tiene migraciones -> queda vacía
# verificar
docker exec taller_postgres psql -U postgres -d auth_db -c "\dt"
docker exec taller_postgres psql -U postgres -d produccion_db -c "\dt; \dv"

# 5. levantar servicios
cd ../../api-gateway && npm run start:dev &
cd ../services/auth-service && npm run start:dev &
cd ../services/produccion-service && npm run start:dev &
cd ../services/logistica-service && npm run start:dev &
cd ../../frontend && npm run dev &

# 6. pruebas gateway
curl http://localhost:3000/health
curl http://localhost:3000/api/auth/health
curl http://localhost:3000/api/produccion/health
curl http://localhost:3000/api/logistica/health
# deben retornar {service:"*-service",status:"ok"}

# revert si hace falta
npm run migration:revert
```

## Git

- `main` y `develop` existen. Trabajo en `feature/ABC-XXX-descripcion`.
- Fase 1 commit: `feat(ABC-158): Fase 1 ...` + `chore: package-lock`
- Fase 2 se commiteará como `feat(ABC-158): Fase 2 ...`

## Decisiones Técnicas

- **Fase 1:** Vite+React JSX, NestJS modular, `process.env.PORT`, React Router, `database/*` reservado.
- **Fase 2:** TypeORM 0.3 + pg, `DataSource` por servicio con `synchronize:false`, `http-proxy-middleware` con `pathRewrite` y `as any` para compatibilidad Nest, `ConfigModule` global, `VITE_API_URL` único en frontend, `database/init/01-create-dbs.sql` con `\gexec` para idempotencia, sin FK entre DBs, vistas materializadas como `OR REPLACE VIEW`.

## Criterios Fase 2 Cumplidos

- [x] PostgreSQL 1 instancia con 3 DBs
- [x] Cada MS conecta solo a su DB
- [x] Migraciones TypeORM independientes y reejecutables
- [x] auth_db schema + seed, produccion_db schema + vistas, logistica_db vacía
- [x] Gateway enruta /api/*
- [x] Frontend solo VITE_API_URL
