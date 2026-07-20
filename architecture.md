# mePOS STOCK — Architecture Document

> **Version:** 2.4.0  
> **Last Updated:** July 20, 2026  
> **Stack:** Vue 3 + JavaScript (Frontend) · Express + TypeScript (Backend) · PostgreSQL · Docker

---

## Project Overview

mePOS STOCK is an inventory and recipe management system for restaurants, designed for tablet/kiosk use. It features real-time stock tracking, loss detection, multi-department transfers, and automatic POS synchronization.

### Key Features
- **Role-Based Access Control** (Admin, Manager, Cook) with financial data masking
- **Real-time loss detection** with dual-loss calculation (dry loss + opportunity loss)
- **Two-step transfer workflow** (request → validate/reject)
- **Automatic POS synchronization** via background sync agent
- **Offline-first architecture** with localStorage caching and queue
- **7-day moving average forecasting** with depletion analysis
- **Premium dark-mode UI** with HSL design system

---

## Project Structure

```
mePOS-STOCK/
├── backend/                        # Express REST API (TypeScript)
│   ├── src/
│   │   ├── index.ts                # Entry: middleware, routes, startup
│   │   ├── database.ts             # PG pool & demo in-memory DB
│   │   ├── schema.ts               # DDL, indexes, seed data
│   │   ├── simulator.ts            # Background sales simulator
│   │   ├── services/               # Business logic layer
│   │   │   ├── auth.service.ts     # User CRUD, login, bcrypt wrappers
│   │   │   ├── stock.service.ts    # Stock read/write, deductions, loss calc
│   │   │   ├── sales.service.ts    # Ticket sync, stats, history
│   │   │   ├── loss.service.ts     # Loss creation & querying
│   │   │   ├── transfer.service.ts # Transfer execution & approval
│   │   │   ├── inventory.service.ts# CRUD: depts, ingredients, recipes, movements, adjustments
│   │   │   ├── forecast.service.ts # 7-day moving average, depletion analysis
│   │   │   └── __tests__/          # Vitest unit tests
│   │   │       ├── auth.service.test.ts
│   │   │       └── stock.service.test.ts
│   │   └── routes/                 # Controllers (thin)
│   │       ├── auth.ts             # + JWT middleware, combined auth middleware
│   │       ├── sales.ts
│   │       ├── losses.ts
│   │       ├── transfers.ts
│   │       ├── inventory.ts        # Depts, ingredients, recipes, stocks, movements, adjustments
│   │       └── forecast.ts
│   ├── dist/                       # Compiled JS
│   ├── logs/                       # Morgan access logs
│   ├── Dockerfile                  # Multi-stage build (node:20-alpine)
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── frontend/                       # Vue 3 SPA (JavaScript + Vite)
│   ├── src/
│   │   ├── main.js                 # createApp, Pinia, Router
│   │   ├── App.vue                 # Root: ErrorBoundary + router-view
│   │   ├── api/
│   │   │   └── index.js            # Axios client + API methods (named export: api)
│   │   ├── router/
│   │   │   └── index.js            # Vue Router with auth guards
│   │   ├── stores/                 # Pinia stores
│   │   │   ├── auth.js             # Session, login, logout, offline fallback
│   │   │   └── app.js              # Data, offline queue, alerts, polling
│   │   ├── composables/            # Vue composables (reusable logic)
│   │   │   ├── useOffline.js       # Online/offline detection
│   │   │   └── usePolling.js       # Generic API polling
│   │   ├── layouts/
│   │   │   └── AppShell.vue        # Sidebar + MobileNav + Content + Alerts
│   │   ├── components/
│   │   │   ├── base/               # Design system components
│   │   │   │   ├── Badge.vue
│   │   │   │   ├── Card.vue
│   │   │   │   ├── EmptyState.vue
│   │   │   │   ├── ErrorBoundary.vue
│   │   │   │   ├── Modal.vue
│   │   │   │   ├── Skeleton.vue
│   │   │   │   └── Toast.vue
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.vue     # Desktop navigation
│   │   │   │   └── MobileNav.vue   # Mobile bottom navigation
│   │   │   └── forecast/
│   │   │       └── ForecastPanel.vue # Critical stocks, depletion timeline, reorder
│   │   ├── views/                  # Page components (lazy-loaded)
│   │   │   ├── DashboardView.vue   # Metrics, charts, alerts, forecast
│   │   │   ├── InventoryView.vue   # Stock table with department filtering
│   │   │   ├── LossTrackerView.vue # Loss declaration form + journal
│   │   │   ├── StockTransferView.vue # Transfer requests + approval workflow
│   │   │   ├── SettingsView.vue    # Admin: departments, ingredients, recipes
│   │   │   └── LoginPage.vue       # Authentication
│   │   └── styles/
│   │       └── index.css           # HSL design system (dark mode, tactile)
│   ├── nginx.conf                  # SPA proxy config for production
│   ├── Dockerfile                  # Multi-stage: node build → nginx serve
│   ├── eslint.config.js            # ESLint flat config (Vue plugin)
│   ├── vite.config.js              # Vite config
│   └── package.json
│
├── agent/                          # Legacy POS sync agents
│   ├── sync_agent.py               # Python agent (primary)
│   ├── sync_agent.js               # Node.js agent (alternative)
│   ├── setup_local_db.py           # Python mock DB setup
│   ├── local_sales_db.json         # JSON-based mock sales data (Node agent)
│   ├── sync_metadata.json          # Last synced offset
│   ├── sync_config.json.example    # Example config
│   └── sync_config.json            # Active config (gitignored)
│
├── docker-compose.yml              # Full stack: PostgreSQL + Backend + Frontend
├── architecture.md                 # This file
├── INSTRUCTIONS.md                 # Setup & usage guide
└── tasks/                          # Walkthrough docs
```

---

## Architecture Layers

### Backend (3-layer)

```
Route (Controller) → Service (Business Logic) → Database (PG pool / in-memory)
     │
     └── Middleware (auth, rate limit, CORS, helmet, logging)
```

- **Routes** are thin controllers: parse request, validate, call service, format response
- **Services** contain all business logic (demo + PG modes)
- **Database** exposes `query()` for PG and `demoDb` for in-memory mode

### Frontend (Vue 3 Composition API)

```
App.vue → ErrorBoundary → Router
  └── AppShell.vue (requiresAuth)
        ├── Sidebar.vue (desktop)
        ├── MobileNav.vue (mobile)
        ├── Main Content Area → <router-view />
        │     ├── DashboardView.vue
        │     ├── InventoryView.vue
        │     ├── LossTrackerView.vue
        │     ├── StockTransferView.vue
        │     └── SettingsView.vue
        └── Real-time Loss Alerts (toast notifications)
```

**State Management:** Pinia stores (auth + app)  
**API Layer:** Centralized Axios client with JWT interceptors  
**Routing:** Vue Router with auth guards and lazy-loaded routes  
**Composables:** Reusable logic (useOffline, usePolling)

### Sync Agent (Adapter Pattern)

```
Legacy POS DB → Sync Agent → mePOS STOCK API
                                 └── Process stock deductions
```

---

## Frontend Architecture (Vue 3)

### Component Pattern

All components use `<script setup>` with Composition API:

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { api } from '../api'

const auth = useAuthStore()
const data = ref(null)

onMounted(async () => {
  const res = await api.getStocks()
  data.value = res.data.data
})
</script>
```

### API Import Convention

```javascript
// ✅ Correct — named export gives access to API methods
import { api } from '../api'
api.getStocks()  // Works

// ❌ Wrong — default export is the raw axios client
import api from '../api'
api.getStocks()  // undefined → TypeError
```

### Store Pattern (Pinia)

```javascript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const isLoggedIn = computed(() => !!user.value)

  async function login(username, password) {
    const { data } = await api.login(username, password)
    // ...
  }

  return { user, isLoggedIn, login }
})
```

### Router Guards

```javascript
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('mepos_token')
  if (to.meta.requiresAuth && !token) next('/login')
  else if (to.path === '/login' && token) next('/')
  else if (to.meta.requiresAdmin && user?.role !== 'admin') next('/')
  else next()
})
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/auth/login | None | Login → JWT |
| GET | /api/v1/auth/users | JWT | List users |
| POST | /api/v1/auth/users | JWT | Create user |
| PUT | /api/v1/auth/users/:id | JWT | Update user |
| DELETE | /api/v1/auth/users/:id | JWT | Delete user |
| GET | /api/v1/departments | JWT | List departments |
| POST | /api/v1/departments | JWT | Create department |
| PUT | /api/v1/departments/:id | JWT | Update department |
| DELETE | /api/v1/departments/:id | JWT | Delete department |
| GET | /api/v1/ingredients | JWT | List ingredients |
| POST | /api/v1/ingredients | JWT | Create ingredient |
| GET | /api/v1/recipes | JWT | List recipes |
| POST | /api/v1/recipes | JWT | Create recipe |
| POST | /api/v1/recipes/:id/ingredients | JWT | Set recipe ingredients |
| GET | /api/v1/stocks | JWT | List inventory stocks |
| POST | /api/v1/inventory/adjust | JWT | Adjust stock |
| GET | /api/v1/movements | JWT | List stock movements |
| POST | /api/v1/sales/sync | API Key | Sync sales tickets |
| GET | /api/v1/sales/stats | JWT | Sales statistics |
| GET | /api/v1/sales/history | JWT | 7-day sales history |
| POST | /api/v1/losses | JWT | Create loss |
| GET | /api/v1/losses | JWT | List losses |
| POST | /api/v1/transfers | JWT | Execute transfer |
| GET | /api/v1/transfers/requests | JWT | List transfer requests |
| POST | /api/v1/transfers/requests | JWT | Create transfer request |
| POST | /api/v1/transfers/requests/:id/validate | JWT | Approve transfer |
| POST | /api/v1/transfers/requests/:id/reject | JWT | Reject transfer |
| GET | /api/v1/forecast | JWT | 7-day moving average forecast |
| GET | /health | None | Health check |

---

## Deployment Architecture

```
                    ┌─────────────────┐
                    │  Browser         │
                    │  (Vue 3 SPA)     │
                    │  :5173 (Nginx)   │
                    └────────┬────────┘
                             │ JWT Bearer
                    ┌────────▼────────┐
                    │  Express API    │
                    │  :5000          │
                    └──┬──────────┬───┘
                       │          │
              ┌────────▼┐    ┌───▼──────────────┐
              │PostgreSQL│    │ Legacy POS DB     │
              │ :5432     │    │ (SQLite/JSON)     │
              └──────────┘    └───────┬──────────┘
                                      │ Sync Agent
                                      │ (Python/Node)
                                      └─── Polling Interval
```

### Docker Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| db | postgres:15-alpine | 5432 | PostgreSQL database |
| backend | node:20-alpine (multi-stage) | 5000 | Express API server |
| frontend | nginx:1.25-alpine (multi-stage) | 5173→80 | Vue SPA + API proxy |

---

## POS System Plugin Architecture

The sync agent supports multiple POS systems via a plugin architecture:

```
agent/
├── sync_agent.py          # Main orchestrator (common logic)
├── pos_adapters/          # POS-specific adapters (future)
│   ├── base.py            # Abstract base adapter
│   ├── mepos_legacy.py    # Built-in legacy adapter
│   └── pos_lightning.py   # Example: POS Lightning adapter
└── sync_config.json       # Select active adapter
```

### Adding a New POS System

1. Create a new file in `agent/pos_adapters/`
2. Implement `BasePOSAdapter` (get_unsynced_tickets, mark_as_synced, get_adapter_name)
3. Set `adapter: "your_adapter_name"` in `sync_config.json`
4. The main orchestrator handles: retry, backoff, circuit breaker, logging, dedup

---

## Environment Variables

### Backend (.env or docker-compose.yml)

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 5000 | API server port |
| DATABASE_URL | postgres://mepos_user:mepos_password@localhost:5432/mepos_stock | PostgreSQL connection string |
| API_KEY | mepos_sec_key_prod_abc123 | API key for POS sync agent |
| JWT_SECRET | change_me_in_production | JWT signing secret |
| FRONTEND_URL | http://localhost | CORS allowed origin |
| NODE_ENV | production | Environment mode |

### Frontend (Vite env)

| Variable | Default | Description |
|----------|---------|-------------|
| VITE_API_URL | /api/v1 | API base URL (proxied by Nginx in production) |
