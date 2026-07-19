# ======================================================
# mePOS STOCK — Backend Dockerfile (Multi-stage)
# ======================================================

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ---- Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -S mepos && adduser -S mepos -G mepos

# Copy only production artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Create logs directory
RUN mkdir -p /app/logs && chown -R mepos:mepos /app/logs

# Switch to non-root user
USER mepos

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "dist/index.js"]
