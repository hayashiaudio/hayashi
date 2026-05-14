# syntax=docker/dockerfile:1

# ─── Stage 1: Install all dependencies ─────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

# Install curl + ca-certificates for any HTTP fetches during build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY apps/client/package*.json ./apps/client/
COPY apps/server/package*.json ./apps/server/

RUN npm ci

# ─── Stage 2: Build client + server ──────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package*.json ./
COPY apps/client ./apps/client
COPY apps/server ./apps/server

# Vite env vars must be present at build time to bake into the client bundle.
# Pass these with: fly deploy --build-arg VITE_DISCORD_CLIENT_ID=xxx ...
ARG VITE_DISCORD_CLIENT_ID
ARG VITE_DISCORD_UNLIMITED_SKU_ID
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
ENV VITE_DISCORD_UNLIMITED_SKU_ID=$VITE_DISCORD_UNLIMITED_SKU_ID

# Build both workspaces
RUN npm run build -w apps/client && npm run build -w apps/server

# Verify client build exists
RUN test -f apps/client/dist/index.html || (echo "Client build failed: index.html not found" && exit 1)

# ─── Stage 3: Production runtime ─────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SERVER_PORT=8080

# Only runtime deps
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
RUN npm ci -w apps/server --omit=dev && npm cache clean --force

# Built artifacts
COPY --from=builder /app/apps/client/dist ./apps/client/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist

EXPOSE 8080

# Use tini for proper signal handling (Fly sends SIGINT on shutdown)
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/server/dist/server.js"]
