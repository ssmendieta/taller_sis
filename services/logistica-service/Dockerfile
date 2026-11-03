# syntax=docker/dockerfile:1
# Etapa de compilación: instala todo, compila y deja solo dependencias de producción.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Certificado raíz extra opcional, para redes o antivirus que inspeccionan HTTPS:
#   docker build --secret id=extra_ca,src=<ruta-al-certificado.pem> ...
# Sin el secreto la instalación es la habitual. El certificado no queda en la imagen.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci --no-audit --no-fund && test -x node_modules/.bin/nest
COPY . .
RUN npm run build && npm prune --omit=dev

# Imagen final: solo dist y dependencias de producción, sin privilegios de root.
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3003
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3003}/health" >/dev/null || exit 1
# Aplica las migraciones pendientes (idempotente) antes de arrancar el servicio.
CMD ["sh", "-c", "npm run migration:run:prod && node dist/main.js"]
