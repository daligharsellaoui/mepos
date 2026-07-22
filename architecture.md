# mePOS STOCK — Architecture Document

> **Version:** 3.4.0  
> **Last Updated:** July 22, 2026  
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
│   │   │   ├── stock.service.ts    # Stock read/write, deductions, loss calc + STOCK_RECOVERED
│   │   │   ├── sales.service.ts    # Ticket sync, stats, history
│   │   │   ├── loss.service.ts     # Loss creation & querying
│   │   │   ├── transfer.service.ts # Transfer execution & approval
│   │   │   ├── inventory.service.ts# CRUD: depts, ingredients, recipes, movements, adjustments
│   │   │   ├── forecast.service.ts # 7-day moving average, depletion analysis
│   │   │   ├── event.service.ts    # EventEmitter with typed Events enum (48 events)
│   │   │   ├── notification.service.ts # CRUD, dedup, per-user reads, cleanup
│   │   │   ├── notification-dispatcher.ts # 40+ event → notification handlers
│   │   │   ├── push.service.ts     # Web Push subscription management & sending
│   │   │   └── __tests__/          # Vitest unit tests
│   │   │       ├── auth.service.test.ts
│   │   │       └── stock.service.test.ts
│   │   └── routes/                 # Controllers (thin)
│   │       ├── auth.ts             # + JWT middleware, combined auth middleware
│   │       ├── sales.ts
│   │       ├── losses.ts
│   │       ├── transfers.ts
│   │       ├── inventory.ts        # Depts, ingredients, recipes, stocks, movements, adjustments
│   │       ├── forecast.ts
│   │       ├── notifications.ts    # 8 notification endpoints + preferences
│   │       └── push.ts             # Web Push subscription management
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
│   │   │   ├── app.js              # Data, offline queue, alerts, polling (30s)
│   │   │   └── notifications.js    # SSE (with dedup), push sub, per-user reads
│   │   ├── composables/            # Vue composables (reusable logic)
│   │   │   ├── useOffline.js       # Online/offline detection
│   │   │   └── usePolling.js       # Generic API polling
│   │   ├── layouts/
│   │   │   └── AppShell.vue        # Sidebar + MobileNav + Content + Alerts
│   │   ├── components/
│   │   │   ├── base/               # Design system components
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.vue     # Desktop navigation
│   │   │   │   └── MobileNav.vue   # Mobile bottom navigation
│   │   │   ├── notifications/      # Notification UI components
│   │   │   │   ├── NotificationBell.vue
│   │   │   │   ├── NotificationCard.vue
│   │   │   │   ├── NotificationDrawer.vue
│   │   │   │   ├── NotificationDropdown.vue
│   │   │   │   ├── ToastItem.vue
│   │   │   │   └── ToastProvider.vue
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
│   ├── public/
│   │   ├── favicon.svg             # App icon
│   │   ├── manifest.json           # PWA manifest
│   │   └── sw.js                   # Service worker (push, notificationclick)
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

## Notification System (v3.2.0+)

### Architecture
Business events → `eventBus.emit()` → `notification-dispatcher.ts` → `createNotification()` with dedup_key → DB → SSE/Web Push → Frontend

### Key Features (v3.4.0)
- **Deduplication**: Notifications carry `dedup_key`; creation skips if active notification exists
- **Per-user read state**: `notification_reads` table tracks reads per-user, not globally
- **Recovery events**: Stock recovered → deactivates old low/critical/out notifications
- **Event-driven generation**: Notifications created from business events, NOT from page refreshes
- **Expiration**: `expires_at` column; auto-archived every 15min by `cleanupExpiredNotifications()`

### Database Tables

| Table | Purpose | Added |
|---|---|---|
| `notifications` | Notification records with dedup_key, expires_at | v1.0 |
| `notification_reads` | Per-user read state tracking | v3.2.0 |
| `notification_preferences` | Per-user notification category preferences | v1.0 |
| `push_subscriptions` | Web Push subscription endpoints | v3.0.0 |

### Real-time (SSE)
- **Endpoint:** `GET /api/v1/notifications/stream?token=<jwt>`
- Each authenticated client connects to an SSE stream scoped to their tenant
- Broadcast filtering: `assigned_to` (user-specific), `minRole` (role-based), or tenant-wide
- Fallback polling for unread count every 30s

### Background Push (Web Push API)
- **PWA manifest** at `/manifest.json` enables "Add to Home Screen"
- **Service worker** at `/sw.js` handles `push` events (shows system notification) and `notificationclick` (opens app)
- **Subscription flow:** App registers SW → gets VAPID public key → calls `PushManager.subscribe()` → sends subscription to `POST /api/v1/push/subscribe`
- **Sending:** On `notification:created`, the backend calls `sendPushForNotification()` which targets `assigned_to` user or all users matching `minRole`

### Notification Routing Rules

| Notification Type | Target | Mechanism |
|---|---|---|
| Transfer requested | All managers | `minRole: 'manager'` → per-user copies via `SELECT ... WHERE role = ANY(...)` |
| Transfer completed | Requester (cook) | `assignedTo: requestedBy` |
| Loss declared | All managers | `minRole: 'manager'` |
| Low stock / stock out / critical | Managers / Admins | `minRole` + dedup_key |
| Stock recovered | — | Deactivates old low/critical/out notifications |
| User login | The user themself | `assignedTo: userId` |
| Agent disconnect/reconnect | Admins | `minRole: 'admin'` + dedup |

### Notification Service Functions (`notification.service.ts`)

| Function | Purpose |
|----------|---------|
| `createNotification()` | Creates notification with dedup check (returns existing if match) |
| `getNotifications()` | Paginated with per-user read state via LEFT JOIN |
| `getUnreadCount()` | Per-user count excluding `notification_reads` |
| `markAsRead()` | Insert into `notification_reads` (per-user, no global contamination) |
| `markAllAsRead()` | Batch insert via `unnest` |
| `buildDedupKey()` | Deterministic dedup key from event type + entity |
| `findActiveNotificationByDedupKey()` | Check for existing active notification |
| `deactivateNotificationsByDedupKey()` | Archive all matching a prefix pattern |
| `cleanupExpiredNotifications()` | Archive expired (runs every 15 min) |
| `getUsersForRole()` | Get users with role >= minRole (PG mode FIXED) |

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
| GET | /api/v1/notifications | JWT | List notifications (paginated) |
| GET | /api/v1/notifications/unread-count | JWT | Unread count |
| PUT | /api/v1/notifications/:id/read | JWT | Mark as read |
| PUT | /api/v1/notifications/read-all | JWT | Mark all as read |
| PUT | /api/v1/notifications/:id/archive | JWT | Archive notification |
| DELETE | /api/v1/notifications/:id | JWT | Delete notification |
| GET | /api/v1/notifications/preferences | JWT | Get preferences |
| PUT | /api/v1/notifications/preferences/:category | JWT | Update preferences |
| GET | /api/v1/notifications/stream | JWT | SSE real-time stream |
| GET | /api/v1/push/vapid-public-key | JWT | Get VAPID public key |
| POST | /api/v1/push/subscribe | JWT | Subscribe to Web Push |
| DELETE | /api/v1/push/unsubscribe | JWT | Unsubscribe from Web Push |
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
| VAPID_PUBLIC_KEY | (none) | Web Push public key (generate with `npx web-push generate-vapid-keys`) |
| VAPID_PRIVATE_KEY | (none) | Web Push private key |
| VAPID_SUBJECT | mailto:admin@mepos.app | Contact email for push service |
| NODE_ENV | production | Environment mode |

### Frontend (Vite env)

| Variable | Default | Description |
|----------|---------|-------------|
| VITE_API_URL | /api/v1 | API base URL (proxied by Nginx in production) |
