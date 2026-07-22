# Skill: Docker Deployment

## Purpose
Build, deploy, and troubleshoot the mePOS STOCK Docker stack.

## Quick Commands

```bash
# Full rebuild
docker compose build --no-cache
docker compose up -d

# View logs
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db

# Stop
docker compose down

# Stop and remove volumes (fresh start)
docker compose down -v
```

## Service Architecture

| Service | Container | Port | Image | Health Check |
|---------|-----------|------|-------|--------------|
| db | mepos_stock_db | 5432 | postgres:15-alpine | pg_isready |
| backend | mepos_stock_api | 5000 | node:20-alpine | wget /health |
| frontend | mepos_stock_frontend | 5173→80 | nginx:1.25-alpine | - |

## Environment Variables

```bash
# Optional overrides in .env or command line
DB_USER=mepos_user
DB_PASSWORD=mepos_password
DB_NAME=mepos_stock
DB_PORT=5432
API_PORT=5000
FRONTEND_PORT=5173
API_KEY=mepos_sec_key_prod_abc123
JWT_SECRET=change_me_in_production
```

## Troubleshooting

### "tsc: not found" in backend build
**Cause:** npm lockfile version mismatch between host and container.
**Fix:** Backend Dockerfile uses `npm install` without lockfile.

### Frontend shows ERR_EMPTY_RESPONSE
**Cause:** Port mapping mismatch (container listens on 80, not 5173).
**Fix:** docker-compose.yml maps `5173:80`.

### Database connection refused
**Cause:** Backend starts before PostgreSQL is ready.
**Fix:** `depends_on` with `condition: service_healthy`.

### 401 on all API calls
**Cause:** Frontend stores importing wrong export from api/index.js.
**Fix:** Use `import { api } from '../api'` (named export).

### Build cache issues
**Fix:** Always use `--no-cache` flag:
```bash
docker compose build --no-cache
```

## Health Checks

```bash
# Backend
curl http://localhost:5000/health

# Frontend
curl -I http://localhost:5173

# Database
docker compose exec db pg_isready -U mepos_user
```

## Volume Management

```bash
# List volumes
docker volume ls

# Inspect postgres data
docker volume inspect restaurant_postgres_data

# Backup database
docker compose exec db pg_dump -U mepos_user mepos_stock > backup.sql

# Restore database
docker compose exec -T db psql -U mepos_user mepos_stock < backup.sql
```

## Production Deployment

```bash
# With custom env file
docker compose --env-file .env.production up -d

# With specific profiles
docker compose --profile monitoring up -d
```

## Network Configuration

All services connect via `mepos_network` (bridge). Service discovery uses container names:
- Backend connects to `db:5432`
- Frontend proxies to `backend:5000` via nginx
