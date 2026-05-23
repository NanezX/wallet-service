# syntax=docker/dockerfile:1.7

# Instala todas las dependencias (dev incluidas) para compilar
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Compila TypeScript a dist/
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Solo dependencias de producción
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Imagen final mínima
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# Usuario no-root
RUN addgroup -S app && adduser -S app -G app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# El script de migrate.ts resuelve las migraciones relativas al cwd (/app)
# por eso se copia la carpeta manteniendo el path src/db/migrations
COPY src/db/migrations ./src/db/migrations

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER app
EXPOSE 3000

# # Health check usando fetch nativo de Node 18+ (sin instalar curl/wget)
# HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
#   CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# El entrypoint corre las migraciones y luego arranca el servidor
ENTRYPOINT ["./docker-entrypoint.sh"]
