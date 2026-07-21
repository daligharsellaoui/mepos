# Notification System

## Architecture

```
Backend Event → Dispatcher → Notification Service → DB → SSE stream → Frontend
```

All 37 events are emitted from their respective services, picked up by `notification-dispatcher.ts`, which creates a notification record and triggers real-time delivery via SSE.

## Events & Sources

| Event                        | Source Service       | Category        |
|------------------------------|----------------------|-----------------|
| RECIPE_CREATED               | inventory.service    | recipes         |
| RECIPE_UPDATED               | inventory.service    | recipes         |
| RECIPE_DELETED               | inventory.service    | recipes         |
| DUPLICATE_TICKET             | inventory.service    | recipes         |
| PURCHASE_CREATED             | inventory.service    | purchases       |
| TRANSFER_COMPLETED           | transfer.service     | transfers       |
| USER_PASSWORD_CHANGED        | auth.service         | account         |
| USER_DISABLED                | auth.service         | account         |
| TENANT_CREATED               | tenant.service       | admin           |
| SETTINGS_UPDATED             | tenant.service       | admin           |
| SYNC_COMPLETED               | agent.service        | sync            |
| SYNC_FAILED                  | agent.service        | sync            |
| SYNC_RETRY_SUCCEEDED         | agent.service        | sync            |
| AGENT_HEARTBEAT_MISSING      | agent.service        | sync            |
| AGENT_RECONNECTED            | agent.service        | sync            |
| (22 more in dispatcher)      | —                    | various         |

## Backend

### Dispatcher (`backend/src/services/notification-dispatcher.ts`)

Each event has a handler that:
1. Builds a notification payload (title, message, icon, color, priority, action_url, category)
2. Calls `notificationService.create()` which persists to DB
3. SSE-connected clients receive the notification in real time

### SSE Endpoint

`GET /api/v1/notifications/stream?token=<jwt>` — Server-Sent Events stream. The backend writes new notifications as `event: notification` messages.

### Routes

| Method | Path                                 | Description            |
|--------|--------------------------------------|------------------------|
| GET    | /api/v1/notifications                | List (paginated)       |
| GET    | /api/v1/notifications/unread-count   | Unread count           |
| PUT    | /api/v1/notifications/:id/read       | Mark one as read       |
| PUT    | /api/v1/notifications/read-all       | Mark all as read       |
| PUT    | /api/v1/notifications/:id/archive    | Archive one            |
| DELETE | /api/v1/notifications/:id            | Delete one             |
| GET    | /api/v1/notifications/preferences    | Get preferences        |
| PUT    | /api/v1/notifications/preferences    | Update preferences     |

## Frontend

### Store (`frontend/src/stores/notifications.js`)

Pinia store managing:
- `items` — notification list
- `unreadCount` — badge count
- `filters` — category/priority/read filters
- SSE connection lifecycle (`connectSSE` / `disconnectSSE`)
- Desktop notification + chime sound on new events (if permission granted)

### Components

- **NotificationBell.vue** — bell icon with unread badge, placed in the top navbar and mobile header
- **NotificationDropdown.vue** — popover listing recent notifications, gear icon links to preferences
- **NotificationCard.vue** — individual notification row with mark-read, archive, delete actions
- **NotificationCenter.vue** — full-page view at `/app/notifications` with detail modal, category grouping, filters, and date/category toggle
- **NotificationPreferences.vue** — per-category toggle UI at `/app/notifications/preferences`

### Notification Permission on Login

When a user logs in successfully, `Notification.requestPermission()` is called (in `auth.js` store). If the user accepts, new notifications will also appear as OS-level desktop notifications when the tab is not focused.

## User Flows

1. **Receiving** — SSE pushes notifications in real time; bell badge updates, dropdown shows latest 10
2. **Reading** — click a notification or the checkmark icon on hover
3. **Bulk actions** — "Tout marquer lu" in dropdown header; filters in NotificationCenter
4. **Preferences** — gear icon in dropdown → `/app/notifications/preferences` → disable categories you don't want
5. **Detail modal** — click the info icon on a notification card in NotificationCenter to see full metadata
