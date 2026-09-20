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
Todo HTTP/REST. Cada MS solo ve su DB, sin FK entre DBs.

## 3. Estructura de Carpetas
```
/
├── frontend/  (Vite+React :5173)
├── api-gateway/ :3000 (proxy /api/*)
├── services/auth-service/ :3001 -> auth_db
├── services/produccion-service/ :3002 -> produccion_db (health/database)
├── services/logistica-service/ :3003 -> logistica_db (vacía)
├── database/init/01-create-dbs.sql
├── docker-compose.yml
├── .env.example
└── README.md
```

## 4. Inicio desde 0 con Docker (5 pasos - copiar y pegar)

**Paso 0 - Instalar Docker (solo si nunca usaste Docker):**
- Windows/macOS: instalar Docker Desktop desde https://www.docker.com/products/docker-desktop/ , abrirlo y esperar a que diga "Engine running".
- Linux: `sudo apt update && sudo apt install docker.io docker-compose-plugin && sudo systemctl enable --now docker`
- Verificar: `docker --version` y `docker compose version` deben mostrar versión sin error. `docker ps` debe mostrar tabla vacía (sin contenedores).

**Paso 1 - Clonar y preparar env:**
```powershell
git clone https://github.com/ssmendieta/taller_sis.git
cd taller_sis
Copy-Item .env.example .env   # en Git Bash/Linux: cp .env.example .env
```

**Paso 2 - Instalar dependencias:**
```powershell
.\scripts\install-all.ps1   # en Linux/macOS: bash scripts/install-all.ps1
# Si falla, instalar manual: cd frontend && npm install; cd ../api-gateway && npm install; cd ../services/auth-service && npm install; etc.
```

**Paso 3 - Levantar PostgreSQL (1 instancia con 3 DBs):**
```powershell
docker compose --profile db up -d
docker ps                 # debe aparecer taller_postgres Up (healthy) unos segundos después
docker logs taller_postgres --tail 20  # debe decir "database system is ready to accept connections"
docker exec taller_postgres psql -U postgres -c "\l"  # debe listar auth_db, produccion_db, logistica_db
# Si no aparecen, esperar 5s y repetir. Si persiste error, ver sección 14.
```

**Paso 4 - Crear tablas con migraciones:**
```powershell
cd services/auth-service; npm run migration:run; cd ../..
cd services/produccion-service; npm run migration:run; cd ../..
# Verificar:
docker exec taller_postgres psql -U postgres -d auth_db -c "\dt"              # debe mostrar roles, permisos, usuarios, etc.
docker exec taller_postgres psql -U postgres -d produccion_db -c "\dt; \dv"  # debe mostrar 6 tablas + 2 vistas
docker exec taller_postgres psql -U postgres -d logistica_db -c "\dt"         # debe estar vacío (correcto)
```

**Paso 5 - Levantar todo y probar:**
```powershell
# Opción A - local (4 terminales separadas, recomendado para ver logs):
# Terminal 1: cd services/auth-service; npm run start:dev       # :3001
# Terminal 2: cd services/produccion-service; npm run start:dev # :3002
# Terminal 3: cd services/logistica-service; npm run start:dev  # :3003
# Terminal 4: cd api-gateway; npm run start:dev                  # :3000
# Terminal 5: cd frontend; npm run dev                           # :5173

# Opción B - todo con Docker (1 comando):
docker compose --profile full up -d --build
docker ps  # deben aparecer 5 contenedores Up

# Probar (en cualquier opción):
curl http://localhost:3000/health
curl http://localhost:3000/api/auth/health
curl http://localhost:3000/api/produccion/health
curl http://localhost:3000/api/produccion/health/database  # debe dar database:connected
# Frontend: abrir http://localhost:5173/estado -> debe mostrar Gateway: OK, Producción: OK, Base de datos: OK
.\scripts\test-e2e.ps1  # prueba automatizada de todo el flujo
```

## 5. Variables de Entorno
Ver `.env.example` (sin secretos). Principales:
```
GATEWAY_PORT=3000, AUTH_SERVICE_PORT=3001, PRODUCCION_SERVICE_PORT=3002, LOGISTICA_SERVICE_PORT=3003, FRONTEND_PORT=5173
AUTH_SERVICE_URL=http://localhost:3001, PRODUCCION_SERVICE_URL=http://localhost:3002, LOGISTICA_SERVICE_URL=http://localhost:3003
VITE_API_URL=http://localhost:3000  # frontend SOLO conoce gateway
DB_HOST=localhost (fuera de docker) / postgres (dentro de docker), DB_PORT=5432, DB_USERNAME, DB_PASSWORD
DB_AUTH_DATABASE=auth_db, DB_PRODUCCION_DATABASE=produccion_db, DB_LOGISTICA_DATABASE=logistica_db
SKIP_DB=false  # true solo para probar sin PG (database:skipped)
```
No versionar `.env`.

## 6. PostgreSQL
- 1 instancia `postgres:15-alpine` `taller_postgres` con `healthcheck pg_isready` (`docker-compose.yml:3`).
- Volumen `pgdata` persiste datos. `docker compose down -v` lo borra (obliga a rehacer Paso 3 y 4).
- Dentro de docker los MS usan `DB_HOST=postgres`, fuera usan `localhost` (configurado automáticamente).

## 7. Creación de Bases
Automática al primer `up` via `database/init/01-create-dbs.sql` (`/docker-entrypoint-initdb.d`). Solo corre si `pgdata` está vacío. No crear DBs manual con pgAdmin.

## 8. Migraciones
TypeORM `synchronize:false` en `services/*/src/database/data-source.ts`.
- `auth-service`: `1710000000000-AuthSchema` + `1710000000001-AuthSeed`
- `produccion-service`: `1710000000002-ProduccionSchema`
- `logistica-service`: sin migraciones.
```powershell
cd services/auth-service; npm run migration:run
cd ../produccion-service; npm run migration:run
npm run migration:revert  # revertir
```

## 9. Ejecución de Servicios (si no usas Docker full)
```powershell
cd services/auth-service; npm run start:dev       # :3001
cd services/produccion-service; npm run start:dev # :3002 incluye /health/database
cd services/logistica-service; npm run start:dev  # :3003
# sin PG: $env:SKIP_DB="true"; npm run start:dev
```

## 10. Ejecución del Gateway
```powershell
cd api-gateway; npm run start:dev # :3000 proxea /api/auth|produccion|logistica -> :3001|3002|3003
```

## 11. Ejecución de React
```powershell
cd frontend; npm run dev      # :5173
# o preview: npm run build; npm run preview -- --host 0.0.0.0 --port 5173
```
Rutas: `/`, `/login`, `/produccion`, `/logistica`, `/estado` (SystemStatus).

## 12. Puertos
| Componente | Puerto | URL |
|---|---|---|
| Frontend | 5173 | http://localhost:5173 |
| API Gateway | 3000 | http://localhost:3000/health |
| Auth | 3001 | http://localhost:3001/health |
| Producción | 3002 | http://localhost:3002/health/database |
| Logística | 3003 | http://localhost:3003/health |
| PostgreSQL | 5432 | postgres://localhost:5432 |

## 13. Health Checks
```powershell
curl http://localhost:3000/health
curl http://localhost:3000/api/auth/health
curl http://localhost:3000/api/produccion/health
curl http://localhost:3000/api/produccion/health/database # Gateway -> Producción -> PG
# http://localhost:5173/estado muestra estado completo
```

## 14. Solución de Problemas Frecuentes
- `docker: command not found` → Docker no instalado, ver Paso 0.
- `docker ps` no muestra `taller_postgres` → ejecutar `docker compose --profile db up -d` y esperar 10s.
- `ECONNREFUSED 5432` → `docker ps` debe mostrar Up; si no, `docker logs taller_postgres`. Fuera de docker `DB_HOST=localhost`, dentro `postgres`.
- `database does not exist` → esperar healthcheck, no usar pgAdmin.
- `relation does not exist` → falta `npm run migration:run`.
- `port already in use` → cambiar puerto en `.env` o `netstat -ano | findstr :3000`.
- `SKIP_DB` muestra `skipped` → normal sin PG, con PG debe ser `connected`.
- `docker compose down -v` borra todo → rehacer Paso 3 y 4.

---
HU ABC-158 completada Fase 1-3. Inicio desde 0 = 5 pasos arriba.
