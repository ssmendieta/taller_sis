# Proyecto Taller - HU ABC-158 Fase 1

## Arquitectura

```
React (Vite :5173)
   ↓
API Gateway (NestJS :3000)
   ↓
┌──────────────┬─────────────────────┬──────────────────┐
│ Auth Service │ Produccion Service  │ Logistica Service│
│   :3001      │      :3002          │     :3003        │
└──────────────┴─────────────────────┴──────────────────┘
         ↓ PostgreSQL (5432) - Fase 2
```

- **Frontend**: React + Vite
- **API Gateway**: NestJS
- **Microservicios**: NestJS (Auth, Producción, Logística)
- **Base de datos**: PostgreSQL (estructura preparada, sin tablas en Fase 1)

Comunicación final: `React → API Gateway → Microservicios`. En Fase 1 cada componente arranca independiente, sin lógica de negocio ni comunicación entre sí.

## Estructura del Repositorio

```
/
├── frontend/                 # React + Vite
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── layouts/
│       ├── routes/
│       ├── services/
│       ├── hooks/
│       ├── assets/
│       ├── styles/
│       ├── App.jsx
│       └── main.jsx
├── api-gateway/              # NestJS Gateway :3000
├── services/
│   ├── auth-service/         # NestJS :3001
│   ├── produccion-service/   # NestJS :3002
│   └── logistica-service/    # NestJS :3003
├── database/
│   ├── auth/
│   ├── produccion/
│   └── logistica/
├── docs/
├── scripts/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Requisitos

- Node.js >= 18
- npm >= 9
- (Opcional) Docker + Docker Compose para orquestación futura
- PostgreSQL solo requerido desde Fase 2

## Instalación

Clonar y copiar variables de entorno:

```bash
cp .env.example .env
```

Instalar dependencias por componente (ejecutar en cada carpeta):

```bash
# Frontend
cd frontend && npm install

# Gateway
cd ../api-gateway && npm install

# Microservicios
cd ../services/auth-service && npm install
cd ../produccion-service && npm install
cd ../logistica-service && npm install
```

O script conjunto desde raíz (Windows PowerShell):
```powershell
.\scripts\install-all.ps1
```

## Cómo Arrancar Cada Componente

Cada servicio usa puertos diferentes para evitar colisiones:

| Componente          | Puerto | Comando (desde su carpeta) | URL health |
|---------------------|--------|-----------------------------|------------|
| Frontend            | 5173   | `npm run dev`               | http://localhost:5173 |
| API Gateway         | 3000   | `npm run start:dev`         | http://localhost:3000/health |
| Auth Service        | 3001   | `npm run start:dev`         | http://localhost:3001/health |
| Producción Service  | 3002   | `npm run start:dev`         | http://localhost:3002/health |
| Logística Service   | 3003   | `npm run start:dev`         | http://localhost:3003/health |

Ejemplo:
```bash
cd frontend && npm run dev
cd api-gateway && npm run start:dev
cd services/auth-service && npm run start:dev
```

Build producción:
```bash
npm run build
npm run start:prod
```

## Endpoints Disponibles (Fase 1)

- `GET /health` en cada microservicio y gateway → `{ "service": "<nombre>", "status": "ok" }`
- Frontend rutas: `/`, `/login`, `/produccion`, `/logistica` (placeholders sin lógica)

## Variables de Entorno

Ver `.env.example`. No versionar `.env` real. Todas son placeholders sin secretos.

## Git

Ramas base:
- `main` – producción
- `develop` – integración

Ramas de trabajo: `feature/ABC-XXX-descripcion` (ej: `feature/ABC-158-estructura-base`, `feature/ABC-159-auth-login`).

Flujo:
```bash
git checkout develop
git pull
git checkout -b feature/ABC-XXX-descripcion
# ... commits ...
git push origin feature/ABC-XXX-descripcion
# PR hacia develop → luego merge a main
```

## Decisiones Técnicas Fase 1

- Vite + React (JSX) por rapidez y simplicidad, sin TypeScript en frontend para Fase 1.
- NestJS con TypeScript en gateway y microservicios, estructura modular, soporte dotenv implícito vía `process.env`.
- React Router DOM para rutas base.
- Sin integración DB real; carpetas `database/*` reservadas para scripts/migraciones Fase 2.
- Docker Compose con `profiles` para no levantar todo por defecto; puertos parametrizados vía `.env`.

## Criterios de Finalización Fase 1

- [x] Frontend, Gateway y 3 microservicios arrancan independientes
- [x] Cada uno responde a `GET /health`
- [x] Existe `.env.example` y `README.md`
- [x] Estructura organizada, sin secretos versionados
