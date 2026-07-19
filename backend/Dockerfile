# ======================================================
# mePOS STOCK — Backend Dockerfile (Optimized Multi-stage)
# ======================================================
# Build with: DOCKER_BUILDKIT=1 docker build -t mepos-backend .
# Features: cache mount for npm, full deps for build, pruned for production

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (better Docker layer caching)
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDeps needed for TypeScript compilation)
# Cache mount speeds up subsequent builds significantly
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source and type config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to dist/
# Use npm run build (which runs tsc) instead of npx tsc for proper PATH resolution
RUN npm run build

# Remove devDependencies from node_modules (keep only production deps)
# This reduces the production image size significantly
RUN npm prune --omit=dev && \
    rm -rf src/ tsconfig.json

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -S mepos && adduser -S mepos -G mepos

# Copy only production artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && chown -R mepos:mepos /app

# Switch to non-root user
USER mepos

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "dist/index.js"]
