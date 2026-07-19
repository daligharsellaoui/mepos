# mePOS STOCK — Architecture Document

## Project Structure

```
mePOS-STOCK/
├── backend/                    # Express REST API (TypeScript)
│   ├── src/
│   │   ├── index.ts            # Entry: middleware, routes, startup
│   │   ├── database.ts         # PG pool & demo in-memory DB
│   │   ├── schema.ts           # DDL, indexes, seed data
│   │   ├── simulator.ts        # Background sales simulator
│   │   ├── services/           # Business logic layer
│   │   │   ├── stock.service.ts    # Stock read/write, deductions, loss calc
│   │   │   ├── sales.service.ts    # Ticket sync, stats, history
│   │   │   ├── loss.service.ts     # Loss creation & querying
│   │   │   ├── transfer.service.ts # Transfer execution & approval
│   │   │   ├── inventory.service.ts# CRUD: depts, ingredients, recipes, movements, adjustments
│   │   │   └── auth.service.ts     # User CRUD, login, bcrypt wrappers
│   │   └── routes/             # Controllers (thin)
│   │       ├── auth.ts         # + JWT middleware, combined auth middleware
│   │       ├── sales.ts
│   │       ├── losses.ts
│   │       ├── transfers.ts
│   │       └── inventory.ts    # Depts, ingredients, recipes, stocks, movements, adjustments
│   ├── dist/                   # Compiled JS
│   ├── logs/                   # Morgan access logs
│   └── .env.example
├── frontend/                   # React SPA (TypeScript + Vite)
│   ├── src/
│   │   ├── App.tsx             # Slim shell with lazy-loaded views
│   │   ├── main.tsx            # React Router entry
│   │   ├── context/
│   │   │   └── AuthContext.tsx # JWT auth context
│   │   ├── components/
│   │   │   ├── layout/         # AppShell, Sidebar, MobileNav
│   │   │   └── ui/             # ErrorBoundary
│   │   ├── views/              # Dashboard, Inventory, LossTracker, StockTransfer, Settings
│   │   ├── pages/              # LoginPage
│   │   ├── hooks/              # useApi, usePolling, useStocks, etc.
│   │   ├── services/           # api.ts (centralized fetch wrapper)
│   │   └── types/              # api.ts (TypeScript interfaces)
│   └── dist/
├── agent/                      # Legacy POS sync agents
│   ├── sync_agent.py           # Python agent (primary)
│   ├── sync_agent.js           # Node.js agent (alternative)
│   ├── setup_local_db.py       # Python mock DB setup
│   ├── local_sales_db.json     # JSON-based mock sales data (Node agent)
│   ├── sync_metadata.json      # Last synced offset
│   ├── sync_config.json.example # Example config (copy, fill, rename)
│   └── sync_config.json        # Active config (gitignored)
├── docker-compose.yml          # Postgres + backend
└── .gitignore
```

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

### Frontend (Component-based)

```
AppShell → Sidebar / MobileNav / Content Area
             └── Views (lazy-loaded via Suspense)
                    └── API calls via services/api.ts (JWT auth)
```

### Sync Agent (Adapter Pattern)

```
Legacy POS DB → Sync Agent → mePOS STOCK API
                                 └── Process stock deductions
```

## POS System Plugin Architecture

The sync agent is designed to support multiple POS systems via a plugin architecture:

```
agent/
├── sync_agent.py          # Main orchestrator (common logic)
├── pos_adapters/          # POS-specific adapters (future)
│   ├── __init__.py
│   ├── base.py            # Abstract base adapter
│   ├── mepos_legacy.py    # Built-in legacy adapter
│   ├── pos_lightning.py   # Example: POS Lightning adapter
│   └── pos_cloud_api.py   # Example: Cloud-based POS adapter
└── sync_config.json       # Select active adapter
```

### Adapter Interface

```python
class BasePOSAdapter(ABC):
    @abstractmethod
    def get_unsynced_tickets(self, last_synced_id: int, max_batch: int) -> list:
        """Fetch unsynced tickets from the POS system."""
        pass

    @abstractmethod
    def mark_as_synced(self, ticket_ids: list):
        """Mark tickets as synced in the POS system."""
        pass

    @abstractmethod
    def get_adapter_name(self) -> str:
        """Return a unique identifier for this POS adapter."""
        pass
```

### Adding a New POS System

1. Create a new file in `agent/pos_adapters/`
2. Implement `BasePOSAdapter` (get_unsynced_tickets, mark_as_synced, get_adapter_name)
3. Set `adapter: "your_adapter_name"` in `sync_config.json`
4. The main orchestrator handles: retry, backoff, circuit breaker, logging, dedup

## Deployment Architecture

```
                    ┌─────────────┐
                    │  Browser     │
                    │  (React SPA) │
                    └──────┬──────┘
                           │ JWT Bearer
                    ┌──────▼──────┐
                    │  Express    │
                    │  API Server │
                    │  :5000      │
                    └──┬──────┬───┘
                       │      │
              ┌────────▼┐  ┌──▼──────────┐
              │PostgreSQL│  │ Legacy POS  │
              │ :5432    │  │ DB (SQLite) │
              └──────────┘  └──────┬──────┘
                                   │ Sync Agent
                                   │ (Python/Node)
                                   │
                                   └─── Polling Interval
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/auth/login | None | Login → JWT |
| GET | /api/v1/auth/users | JWT | List users |
| POST | /api/v1/auth/users | JWT | Create user |
| PUT | /api/v1/auth/users/:id | JWT | Update user |
| DELETE | /api/v1/auth/users/:id | JWT | Delete user |
| GET | /api/v1/departments | JWT+API | List departments |
| POST | /api/v1/departments | JWT+API | Create department |
| PUT | /api/v1/departments/:id | JWT+API | Update department |
| DELETE | /api/v1/departments/:id | JWT+API | Delete department |
| GET | /api/v1/ingredients | JWT+API | List ingredients |
| POST | /api/v1/ingredients | JWT+API | Create ingredient |
| PUT | /api/v1/ingredients/:id | JWT+API | Update ingredient |
| GET | /api/v1/recipes | JWT+API | List recipes |
| POST | /api/v1/recipes | JWT+API | Create recipe |
| POST | /api/v1/recipes/:id/ingredients | JWT+API | Set recipe ingredients |
| GET | /api/v1/stocks | JWT+API | List inventory stocks |
| POST | /api/v1/inventory/adjust | JWT+API | Adjust stock |
| GET | /api/v1/movements | JWT+API | List stock movements |
| POST | /api/v1/sales/sync | JWT+API | Sync sales tickets |
| GET | /api/v1/sales/stats | JWT+API | Sales statistics |
| GET | /api/v1/sales/history | JWT+API | 7-day sales history |
| POST | /api/v1/losses | JWT+API | Create loss |
| GET | /api/v1/losses | JWT+API | List losses |
| POST | /api/v1/transfers | JWT+API | Execute transfer |
| GET | /api/v1/transfers/requests | JWT+API | List transfer requests |
| POST | /api/v1/transfers/requests | JWT+API | Create transfer request |
| POST | /api/v1/transfers/requests/:id/validate | JWT+API | Approve transfer |
| POST | /api/v1/transfers/requests/:id/reject | JWT+API | Reject transfer |
| GET | /health | None | Health check |
| GET | /api/config | None | Client-side config |
