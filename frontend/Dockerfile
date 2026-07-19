# ======================================================
# mePOS STOCK — Frontend Dockerfile (Multi-stage)
# ======================================================

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# Build-time arg for API base URL (use relative path for Nginx proxy)
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

# Copy source and build
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY src/ ./src/

RUN npm run build

# ---- Production Stage ----
FROM nginx:1.25-alpine AS production

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create non-root user for Nginx (already exists in nginx image)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
