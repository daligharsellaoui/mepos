# ======================================================
# mePOS STOCK — Backend Dockerfile (Simple Multi-stage)
# ======================================================

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json only (lockfile excluded — host lockfile was generated with npm v11,
# incompatible with the npm v9 in node:20-alpine, causing devDeps like typescript to not install)
COPY package.json ./

# Fresh install — ensures devDependencies are properly resolved
RUN npm install

# Copy source and type config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to dist/
RUN npm run build

# Remove devDependencies — keep only production packages
# This reduces the production stage size significantly
RUN npm prune --omit=dev && \
    rm -rf src/ tsconfig.json node_modules/.cache

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Install wget for health checks
RUN apk add --no-cache wget

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
