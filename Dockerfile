# syntax=docker/dockerfile:1.7
# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar deps de build para módulos nativos (si los hay).
RUN apk add --no-cache libc6-compat

# Copiar solo manifests primero (mejor cache de capas).
COPY package.json package-lock.json* ./

# Instalar TODAS las deps (incluye prisma CLI para `prisma generate`).
RUN npm ci

# Copiar schema de Prisma y generar el cliente.
COPY prisma ./prisma
RUN npx prisma generate

# Copiar el resto del código.
COPY . .

# Quitar devDependencies para la imagen final.
RUN npm prune --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime

WORKDIR /app

# Dependencias mínimas para Prisma + Node en runtime.
RUN apk add --no-cache libc6-compat tini

# Crear usuario no-root.
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copiar artefactos del builder.
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/views ./views
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

USER nodejs

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=America/Lima

EXPOSE 3000

# tini maneja señales y reaping de zombies correctamente.
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "src/server.js"]
