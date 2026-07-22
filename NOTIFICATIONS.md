# Notification System

> **Version:** 3.4.0  
> **Last Updated:** July 22, 2026  
> **Architecture:** Event-Driven · Deduplicated · Per-User Read State · Role-Based

---

## Architecture Overview

```
Business Action
     │
     ▼
eventBus.emit(Events.STOCK_LOW / LOSS_DECLARED / TRANSFER_REQUESTED / ...)
     │
     ▼
notification-dispatcher.ts ──── createNotification()
     │   (40+ event handlers)        │
     │                               ├── dedup_key check → skip if active notification exists
     │                               ├── INSERT INTO notifications (dedup_key, expires_at, ...)
     │                               └── eventBus.emit('notification:created')
     │                                         │
     │                                         ▼
     │                              ┌─────────────────────────────┐
     │                              │ notification:created handler│
     │                              │                             │
     │                              │ 1. Role-based distribution  │
     │                              │    (INSERT per-user copies  │
     │                              │     via SELECT FROM users   │
     │                              │     WHERE role = ANY(...))  │
     │                              │                             │
     │                              │ 2. SSE push to clients     │
     │                              │    (index.ts → sseClients)  │
     │                              │                             │
     │                              │ 3. Web Push send            │
     │                              │    (push.service.ts)        │
     │                              └─────────────────────────────┘
     │
     ▼
stock.service.ts (recovery check)
     │
     ├── stock >= threshold → STOCK_RECOVERED event
     │                        └── deactivates old low/critical/out notifications
     │
     └── stock < threshold → STOCK_LOW / STOCK_OUT / STOCK_CRITICAL
                              (dedup_key prevents duplicate creation)
```

### Deduplication Strategy

Each notification carries a `dedup_key` derived from the event source:

| Event | Dedup Key Pattern | Recovery Key Pattern |
|-------|-------------------|---------------------|
| STOCK_LOW | `stock_low:{tenant}:ingredient:{id}:department:{dept}` | `stock_recovered:{tenant}:ingredient:{id}` |
| STOCK_OUT | `stock_out:{tenant}:ingredient:{id}:department:{dept}` | `stock_recovered:{tenant}:ingredient:{id}` |
| STOCK_CRITICAL | `stock_critical:{tenant}:ingredient:{id}:department:{dept}` | `stock_recovered:{tenant}:ingredient:{id}` |
| AGENT_DISCONNECTED | `agent_disconnected:{tenant}:agent:{id}` | `agent_reconnected:{tenant}:agent:{id}` |
| AGENT_RECONNECTED | `agent_reconnected:{tenant}:agent:{id}` | `agent_disconnected:{tenant}:agent:{id}` |

**Key behaviors:**
- `createNotification()` checks for an active (non-archived) notification with the same `dedup_key` before inserting
- If found, returns the existing notification silently — no duplicate is created
- Recovery events (STOCK_RECOVERED, AGENT_RECONNECTED) deactivate old notifications via `deactivateNotificationsByDedupKey()`
- Expired notifications (`expires_at < now`) are automatically archived by `cleanupExpiredNotifications()`

### Per-User Read State

```
notifications                      notification_reads
┌────────────────────┐             ┌──────────────────────────┐
│ id: 42             │             │ id: 1                    │
│ tenant_id: 1       │◄────────────│ notification_id: 42      │
│ title: "Stock bas" │             │ user_id: 2 (admin)       │
│ read: FALSE        │             │ read_at: 2026-07-22...   │
│ ...                │             └──────────────────────────┘
└────────────────────┘
```

- The `read` column on `notifications` is a **legacy field** always set to `FALSE` in PG mode
- Real read state is tracked per-user in `notification_reads`
- Queries LEFT JOIN against `notification_reads` and use `nr.id IS NULL` to determine unread
- When a user marks a notification as read, only their `notification_reads` entry is created
- Other users still see the notification as unread → **true per-user read state**

### Notification Routing Rules

| Notification Type | Target | Mechanism |
|---|---|---|
| Transfer requested | All managers | `minRole: 'manager'` → per-user duplicates via `SELECT ... WHERE role = ANY(...)` |
| Transfer completed | Requester (cook) | `assignedTo: requestedBy` |
| Transfer rejected | Requester (cook) | `assignedTo: requestedBy` |
| Loss declared | All managers | `minRole: 'manager'` |
| Low stock | Managers | `minRole: 'manager'` + dedup |
| Stock out / critical | Admins | `minRole: 'admin'` + dedup |
| Stock recovered | — | Deactivates old low/out/critical notifications (ARCHIVED) |
| User login | The user themself | `assignedTo: userId` |
| Ingredient CRUD | All admins | `minRole: 'admin'` |
| Agent disconnected | Admins | `minRole: 'admin'` + dedup |
| Agent reconnected | Admins | Deactivates old disconnected notification |

---

## Events & Sources

| Event | Source Service | Category | Has Dedup |
|-------|---------------|----------|-----------|
| STOCK_LOW | stock.service | inventory | ✅ |
| STOCK_OUT | stock.service | inventory | ✅ |
| STOCK_CRITICAL | stock.service | inventory | ✅ |
| STOCK_RECOVERED | stock.service | inventory | ✅ (deactivates) |
| LOSS_DECLARED | loss.service | warehouse | ❌ |
| LOSS_LARGE | loss.service | warehouse | ❌ |
| TRANSFER_REQUESTED | transfer.service | transfer | ❌ |
| TRANSFER_APPROVED | transfer.service | transfer | ❌ |
| TRANSFER_REJECTED | transfer.service | transfer | ❌ |
| TRANSFER_COMPLETED | transfer.service | transfer | ❌ |
| INGREDIENT_CREATED | inventory.service | inventory | ❌ |
| INGREDIENT_UPDATED | inventory.service | inventory | ❌ |
| INGREDIENT_DELETED | inventory.service | inventory | ❌ |
| RECIPE_CREATED | inventory.service | recipe | ❌ |
| RECIPE_UPDATED | inventory.service | recipe | ❌ |
| RECIPE_DELETED | inventory.service | recipe | ❌ |
| PURCHASE_CREATED | inventory.service | purchase | ❌ |
| AGENT_DISCONNECTED | agent.service | agent | ✅ |
| AGENT_RECONNECTED | agent.service | agent | ✅ (deactivates) |
| AGENT_HEARTBEAT_MISSING | agent.service | agent | ❌ |
| SYNC_STARTED | agent.service | sync | ❌ |
| SYNC_COMPLETED | agent.service | sync | ❌ |
| SYNC_FAILED | agent.service | sync | ❌ |
| SYNC_RETRY_SUCCEEDED | agent.service | sync | ❌ |
| DUPLICATE_TICKET | sales.service | sync | ❌ |
| USER_LOGIN | auth.service | auth | ❌ |
| USER_LOGIN_FAILED | auth.service | security | ❌ |
| USER_CREATED | auth.service | admin | ❌ |
| USER_PASSWORD_CHANGED | auth.service | auth | ❌ |
| USER_DISABLED | auth.service | admin | ❌ |
| TENANT_CREATED | tenant.service | admin | ❌ |
| SETTINGS_UPDATED | tenant.service | general | ❌ |
| SUPPLIER_CREATED | supplier.service | inventory | ❌ |
| SUPPLIER_UPDATED | supplier.service | inventory | ❌ |
| SUPPLIER_ARCHIVED | supplier.service | inventory | ❌ |
| SUPPLIER_RESTORED | supplier.service | inventory | ❌ |
| PREFERRED_SUPPLIER_CHANGED | supplier.service | inventory | ❌ |
| IMPORT_STARTED | import.service | inventory | ❌ |
| IMPORT_COMPLETED | import.service | inventory | ❌ |
| IMPORT_FAILED | import.service | inventory | ❌ |
| MAPPING_CREATED | mapping.service | sync | ❌ |
| MAPPING_UPDATED | mapping.service | sync | ❌ |
| MAPPING_DELETED | mapping.service | sync | ❌ |
| MAPPING_AUTO_MATCHED | mapping.service | sync | ❌ |
| SYNC_BLOCKED_MISSING_MAPPING | sales.service | sync | ❌ |

---

## Backend

### Service Architecture (`backend/src/services/`)

| File | Purpose |
|------|---------|
| `notification.service.ts` | CRUD, dedup, per-user read state, expiration cleanup, role distribution handler |
| `notification-dispatcher.ts` | 40+ event handlers that create notifications from business events |
| `event.service.ts` | Node.js EventEmitter with typed Events enum |
| `stock.service.ts` | Stock warning + recovery (emits STOCK_LOW/OUT/CRITICAL/RECOVERED) |
| `push.service.ts` | Web Push subscription management & sending |

### Key Functions (`notification.service.ts`)

| Function | Purpose |
|----------|---------|
| `createNotification()` | Creates notification with dedup check (returns existing if dedup match) |
| `getNotifications()` | Paginated list with per-user read state via LEFT JOIN |
| `getUnreadCount()` | Count excluding user's `notification_reads` entries |
| `markAsRead()` | Insert into `notification_reads` (per-user, no global contamination) |
| `markAllAsRead()` | Batch insert via `unnest` into `notification_reads` |
| `buildDedupKey()` | Generates deterministic dedup key from event type + entity |
| `findActiveNotificationByDedupKey()` | Checks for existing active notification with same dedup key |
| `deactivateNotificationsByDedupKey()` | Archives all notifications matching prefix pattern |
| `cleanupExpiredNotifications()` | Archives expired notifications (runs every 15 min) |
| `getUsersForRole()` | Returns users with role >= minRole (FIXED: now works in PG mode) |

### SSE Endpoint

`GET /api/v1/notifications/stream?token=<jwt>` — Server-Sent Events stream.

- Groups clients by `tenantId`
- Filters by `assigned_to` and `minRole`
- Caches `unreadCount` per user per event batch
- Sends heartbeat every 30s to keep connection alive

### Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/notifications | List (paginated, with user_read field) |
| GET | /api/v1/notifications/unread-count | Unread count (per-user) |
| PUT | /api/v1/notifications/:id/read | Mark one as read (per-user via notification_reads) |
| PUT | /api/v1/notifications/read-all | Mark all as read (batch insert via unnest) |
| PUT | /api/v1/notifications/:id/archive | Archive one |
| DELETE | /api/v1/notifications/:id | Delete one |
| GET | /api/v1/notifications/preferences | Get preferences |
| PUT | /api/v1/notifications/preferences/:category | Update preferences |

### Scheduled Jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| `cleanupExpiredNotifications()` | 15 min | Archives notifications with past `expires_at` |

---

## Frontend

### Store (`frontend/src/stores/notifications.js`)

Pinia store managing:
- `items` — notification list
- `unreadCount` — badge count (updated via SSE push)
- `filters` — category/priority/read filters
- `isUnread(notification)` — uses `user_read` (per-user) with `read` fallback
- SSE connection lifecycle with **dedup** (`some()` check before prepending)
- Desktop notification + chime sound on new events

### Components

| Component | Purpose |
|-----------|---------|
| **NotificationBell.vue** | Bell icon + unread badge (top navbar) |
| **NotificationDropdown.vue** | Popover with 10 recent notifications |
| **NotificationCard.vue** | Single notification row (`isUnread` computed for per-user state) |
| **NotificationCenter.vue** | Full page at `/app/notifications` with filters, grouping, pagination, detail modal |
| **NotificationPreferences.vue** | Per-category toggle UI at `/app/notifications/preferences` |
| **ToastProvider.vue** | Toast notification display with auto-dismiss |
| **ToastItem.vue** | Individual toast with progress bar |

### Polling vs Real-Time

| Mechanism | Interval | Data |
|-----------|----------|------|
| SSE (EventSource) | Real-time | New notifications |
| Background poll | 30s | `fetchData()` — stocks, losses, depts, ingredients, recipes, forecast |
| Unread count poll | 30s | `fetchUnreadCount()` — fallback if SSE fails |

---

## Database Schema

### `notifications` Table

```sql
id              SERIAL PRIMARY KEY
tenant_id       INT NOT NULL → tenants(id)
type            notification_type (ENUM: information, success, warning, error, critical, ...)
category        VARCHAR(50) NOT NULL
priority        notification_priority (ENUM: low, medium, high, critical)
title           VARCHAR(255) NOT NULL
message         TEXT
icon            VARCHAR(50)
color           VARCHAR(20)
entity_type     VARCHAR(50)      -- e.g. 'ingredient', 'transfer', 'agent'
entity_id       INT              -- FK to the entity
created_by      INT → users(id)
assigned_to     INT → users(id)  -- NULL = tenant-wide
read            BOOLEAN DEFAULT FALSE  -- LEGACY: use notification_reads for per-user
read_at         TIMESTAMPTZ
archived        BOOLEAN DEFAULT FALSE
action_url      TEXT
metadata        JSONB
dedup_key       VARCHAR(255)     -- NEW: deduplication key
expires_at      TIMESTAMPTZ      -- NEW: auto-expiration
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

### `notification_reads` Table (NEW v3.2.0)

```sql
id              SERIAL PRIMARY KEY
tenant_id       INT NOT NULL → tenants(id)
user_id         INT NOT NULL → users(id)
notification_id INT NOT NULL → notifications(id)
read_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
UNIQUE(tenant_id, user_id, notification_id)
```

### `notification_preferences` Table

```sql
id              SERIAL PRIMARY KEY
tenant_id       INT NOT NULL → tenants(id)
user_id         INT NOT NULL → users(id)
category        VARCHAR(50) NOT NULL
enabled         BOOLEAN DEFAULT TRUE
muted           BOOLEAN DEFAULT FALSE
critical_only   BOOLEAN DEFAULT FALSE
desktop         BOOLEAN DEFAULT TRUE
sound           BOOLEAN DEFAULT FALSE
UNIQUE(tenant_id, user_id, category)
```

---

## Low Stock Thresholds

- Uses `ingredient.alert_threshold` if defined (> 0)
- Falls back to tenant setting `stock_alert_threshold` (category `notifications`)
- Default: 10 units

---

## Migration History

| Version | Date | Description |
|---------|------|-------------|
| v3.2.0 | 2026-07-22 | Added `dedup_key`, `expires_at`, `notification_reads` table |
| v3.3.0 | 2026-07-22 | Fixed `getUsersForRole()` for PG mode, added dedup + recovery + per-user reads |
| v3.4.0 | 2026-07-22 | Frontend SSE dedup, polling reduction, per-user read state display |
