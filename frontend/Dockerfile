# ======================================================
# mePOS STOCK — Frontend Dockerfile (Optimized Multi-stage)
# ======================================================
# Build with: DOCKER_BUILDKIT=1 docker build -t mepos-frontend .
# Features: cache mount for npm, VITE_API_URL build arg

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (better Docker layer caching)
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDeps for TypeScript types used by vite)
# Cache mount speeds up subsequent builds significantly
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Build-time arg for API base URL (use relative path for Nginx proxy)
# Placed AFTER npm install to avoid cache invalidation when arg changes
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

# Copy build configuration and source
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY src/ ./src/

# Build with Vite (handles transpilation via esbuild, no tsc needed)
RUN npx vite build

# ---- Production Stage ----
FROM nginx:1.25-alpine AS production

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
