# mePOS STOCK — Multi-Tenant SaaS Migration Plan

> **Version:** 4.0 (In Progress — Phases 5-9 Complete)  
> **Date:** July 20, 2026  
> **Current Version:** 2.9.0  
> **Target:** Enterprise Multi-Tenant SaaS Platform  
> **Strategy:** Incremental migration with zero-regression guarantee  
> **Commits:** Phases 2-4 (v2.4.x), Phase 5 (v2.5.0), Phase 6 (v2.6.0), Phase 7 (v2.7.0), Phase 8 (v2.8.0), Phase 9 (v2.9.0)

---

## 1. Current Architecture Analysis

### 1.1 Database Schema (schema.ts)

**11 Tables — ALL single-tenant, NO tenant isolation:**

| Table | Primary Key | Unique Constraints | Tenant ID? |
|-------|-------------|-------------------|------------|
| users | id (SERIAL) | username UNIQUE | ❌ |
| departments | id (SERIAL) | name UNIQUE | ❌ |
| ingredients | id (SERIAL) | name UNIQUE | ❌ |
| inventory_stocks | id (SERIAL) | (department_id, ingredient_id) UNIQUE | ❌ |
| recipes | id (SERIAL) | name UNIQUE | ❌ |
| recipe_ingredients | id (SERIAL) | (recipe_id, ingredient_id) UNIQUE | ❌ |
| sales_tickets | id (SERIAL) | (department_id, external_ticket_id) UNIQUE | ❌ |
| sales_ticket_items | id (SERIAL) | — | ❌ |
| stock_movements | id (SERIAL) | — | ❌ |
| ingredient_losses | id (SERIAL) | — | ❌ |
| transfer_requests | id (SERIAL) | — | ❌ |

**Critical Single-Tenant Assumptions Found:**
1. `username` is globally unique — in multi-tenant, `username` must be unique PER TENANT
2. `departments.name` is globally unique — must be unique PER TENANT
3. `ingredients.name` is globally unique — must be unique PER TENANT
4. `recipes.name` is globally unique — must be unique PER TENANT
5. `sales_tickets.external_ticket_id` uniqueness is scoped to `department_id` — in multi-tenant, must scope to `tenant_id + department_id`
6. Seed data is hardcoded for a single restaurant
7. No audit trail tables (who created/modified what)

### 1.2 Backend Architecture

**Entry Point (index.ts):**
- Single Express app, single PostgreSQL connection
- Middleware stack: helmet, CORS, body-parser, morgan, rate-limiting
- `authMiddleware` accepts JWT OR API key — no tenant context extracted
- Routes mounted globally: `/api/v1/auth`, `/api/v1/sales`, etc.

**Services Pattern:**
- Every service function takes explicit IDs (departmentId, ingredientId, etc.)
- No tenant scoping in any query
- `query()` helper has no tenant filter injection
- `demoDb` is a module-level global — completely shared
- Transactions use `getClient()` which also has no tenant context

**Authentication (auth.ts + auth.service.ts):**
- JWT payload: `{ id, username, role }` — NO tenantId
- `authenticateUser()` queries `users WHERE username = $1` — global lookup
- `getAllUsers()` returns ALL users — no tenant filter
- Password hashing with bcrypt (12 rounds)
- `apiKeyMiddleware` checks against single `API_KEY` env var

**Stock Service (stock.service.ts):**
- `getEffectiveDepartmentId()` — resolves inherited stock to central dept
- `processSaleDeduction()` — processes recipe-based deductions
- `calculateLossCosts()` — calculates dry loss + opportunity loss
- All operate on global IDs with no tenant scoping

**Sales Service (sales.service.ts):**
- `syncTickets()` — processes batch tickets with idempotency
- Uses `UNIQUE(department_id, external_ticket_id)` for dedup — global
- Transactional with BEGIN/COMMIT/ROLLBACK

**Loss Service (loss.service.ts):**
- `createLoss()` — creates loss with double-loss calculation
- `getLosses()` — returns ALL losses with JOINs — no tenant filter

**Transfer Service (transfer.service.ts):**
- Two-step workflow: request → approve/reject
- `executeTransfer()` — atomic source debit, dest credit
- All operations on global IDs

**Inventory Service (inventory.service.ts):**
- CRUD for departments, ingredients, recipes
- All unique name checks are global
- Auto-creates stocks for new departments/ingredients

**Forecast Service (forecast.service.ts):**
- 7-day moving average calculation
- Depletion analysis per ingredient
- Reorder suggestions
- All queries are unscoped

### 1.3 Frontend Architecture

**Auth Store (auth.js):**
- Pinia store with user/token/error state
- `login()` → API call → offline fallback with hardcoded users
- JWT stored in localStorage as `mepos_token`
- Offline users cached in localStorage with passwords
- **No tenant context anywhere**

**App Store (app.js):**
- Central data store: stocks, losses, departments, ingredients, recipes
- `fetchData()` — parallel API calls, offline cache, loss detection
- Offline queue with optimistic updates
- Loss alert system with auto-dismiss
- **All data fetched globally, no tenant filtering**

**API Layer (api/index.js):**
- Axios client with JWT interceptor
- Request interceptor adds `Authorization: Bearer <token>`
- Response interceptor handles 401 → redirect to login
- **No tenant header injection**

**Router (index.js):**
- Vue Router with auth guards
- `requiresAuth` and `requiresAdmin` meta
- **No tenant-aware routing**

### 1.4 Sync Agent

**Agent (sync_agent.js):**
- Node.js class-based architecture
- Reads from `local_sales_db.json` (JSON file)
- Sends to `POST /api/v1/sales/sync` with `X-API-KEY` header
- Features: circuit breaker, exponential backoff, dedup via SHA-256 hashes
- Metadata persisted in `sync_metadata.json`
- **No tenant awareness — sends to single API endpoint**
- **Credentials stored in plaintext config file**

**Config (sync_config.json.example):**
```json
{
  "api_url": "http://localhost:5000/api/v1/sales/sync",
  "api_key": "YOUR_API_KEY_HERE",
  "department_id": 2
}
```
- Single API key, single department ID
- No agent identity, no heartbeat, no health reporting

### 1.5 Docker/DevOps

**docker-compose.yml:**
- 3 services: PostgreSQL (15-alpine), Backend (node:20-alpine), Frontend (nginx:1.25-alpine)
- Single database, single backend instance
- Health checks for all services
- Persistent volume for PostgreSQL data
- **No multi-tenant infrastructure**

### 1.6 Security Assessment

| Concern | Current State | Risk |
|---------|--------------|------|
| JWT Secret | Env var, hardcoded default | Medium |
| API Key | Single global key | High |
| Passwords | bcrypt hashed | Low |
| CORS | Limited to specific origins | Low |
| Rate Limiting | Global + stricter auth | Low |
| SQL Injection | Parameterized queries | Low |
| Tenant Isolation | **NONE** | **CRITICAL** |
| Credential Storage | Agent stores API key in plaintext | High |
| Encryption at Rest | PostgreSQL data unencrypted | Medium |

---

## 2. Multi-Tenant Migration Plan

### 2.1 New Entities

#### Tenant Entity
```sql
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  country VARCHAR(100),
  timezone VARCHAR(50) DEFAULT 'UTC',
  language VARCHAR(10) DEFAULT 'fr',
  currency VARCHAR(10) DEFAULT 'TND',
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'trial', 'cancelled')),
  subscription_plan VARCHAR(50) DEFAULT 'starter'
    CHECK (subscription_plan IN ('starter', 'professional', 'enterprise')),
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Platform Admin Entity
```sql
CREATE TYPE platform_role AS ENUM ('super_admin', 'support', 'billing');

CREATE TABLE platform_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role platform_role NOT NULL DEFAULT 'support',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE
);
```

#### Agent Entity
```sql
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_secret_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  machine_name VARCHAR(255),
  machine_id VARCHAR(255),
  operating_system VARCHAR(100),
  version VARCHAR(50),
  connector_type VARCHAR(50) NOT NULL DEFAULT 'database'
    CHECK (connector_type IN ('database', 'api', 'csv', 'webhook')),
  status VARCHAR(20) DEFAULT 'inactive'
    CHECK (status IN ('active', 'inactive', 'disabled', 'error')),
  last_seen TIMESTAMP WITH TIME ZONE,
  last_sync TIMESTAMP WITH TIME ZONE,
  health VARCHAR(20) DEFAULT 'unknown'
    CHECK (health IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, name)
);
```

#### Agent Heartbeat
```sql
CREATE TABLE agent_heartbeats (
  id SERIAL PRIMARY KEY,
  agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version VARCHAR(50),
  status VARCHAR(20),
  health VARCHAR(20),
  last_sync TIMESTAMP WITH TIME ZONE,
  connector_status VARCHAR(20),
  errors JSONB DEFAULT '[]',
  warnings JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Tenant Settings
```sql
CREATE TABLE tenant_settings (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL
    CHECK (category IN ('branding', 'notifications', 'sync', 'inventory', 'general')),
  key VARCHAR(100) NOT NULL,
  value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, category, key)
);
```

#### Audit Log
```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE SET NULL,
  user_id INT,
  platform_user_id INT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 Tenant-Scoped Tables

Every existing business table receives `tenant_id`:

| Table | New Column | Foreign Key | Index Changes |
|-------|-----------|-------------|---------------|
| users | tenant_id INT | → tenants(id) | DROP `username UNIQUE`, ADD `UNIQUE(tenant_id, username)` |
| departments | tenant_id INT | → tenants(id) | DROP `name UNIQUE`, ADD `UNIQUE(tenant_id, name)` |
| ingredients | tenant_id INT | → tenants(id) | DROP `name UNIQUE`, ADD `UNIQUE(tenant_id, name)` |
| inventory_stocks | tenant_id INT | → tenants(id) | ADD `UNIQUE(tenant_id, department_id, ingredient_id)` |
| recipes | tenant_id INT | → tenants(id) | DROP `name UNIQUE`, ADD `UNIQUE(tenant_id, name)` |
| recipe_ingredients | tenant_id INT | → tenants(id) | ADD `UNIQUE(tenant_id, recipe_id, ingredient_id)` |
| sales_tickets | tenant_id INT | → tenants(id) | ADD `UNIQUE(tenant_id, department_id, external_ticket_id)` |
| sales_ticket_items | — (inherits via parent join) | — | No tenant_id needed — scoped via sales_tickets.tenant_id JOIN |
| stock_movements | tenant_id INT | → tenants(id) | ADD `idx_stock_movements_tenant` |
| ingredient_losses | tenant_id INT | → tenants(id) | ADD `idx_losses_tenant_date` |
| transfer_requests | tenant_id INT | → tenants(id) | ADD `idx_transfers_tenant_status` |

### 2.3 Database Migration Strategy

**Approach: Additive-only, backward-compatible**

```
Phase 2a: Create new tables (tenants, platform_users, agents, etc.)
Phase 2b: Add tenant_id columns to existing tables (nullable initially)
Phase 2c: Create default tenant, migrate all existing data
Phase 2d: Set NOT NULL on tenant_id columns
Phase 2e: Create unique indexes (tenant-scoped)
Phase 2f: Add Row-Level Security (RLS) policies
Phase 2g: Update foreign keys to reference tenant_id
```

### 2.3a Explicit Rollback Scripts

**Phase 2a Rollback (New Tables):**
```sql
-- Rollback: Drop new tables
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS tenant_settings CASCADE;
DROP TABLE IF EXISTS agent_heartbeats CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS platform_users CASCADE;
DROP TYPE IF EXISTS platform_role CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
```

**Phase 2b Rollback (Remove tenant_id columns):**
```sql
-- Rollback: Remove tenant_id from all tables
ALTER TABLE transfer_requests DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE ingredient_losses DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE stock_movements DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE sales_tickets DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE recipe_ingredients DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE recipes DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE inventory_stocks DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE ingredients DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE departments DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;
```

**Phase 2e Rollback (Remove unique indexes):**
```sql
-- Rollback: Drop tenant-scoped unique indexes, restore global ones
DROP INDEX IF EXISTS idx_users_tenant_username;
DROP INDEX IF EXISTS idx_departments_tenant_name;
DROP INDEX IF EXISTS idx_ingredients_tenant_name;
DROP INDEX IF EXISTS idx_recipes_tenant_name;
DROP INDEX IF EXISTS idx_stocks_tenant_lookup;
DROP INDEX IF EXISTS idx_recipe_ings_tenant_lookup;
DROP INDEX IF EXISTS idx_sales_tickets_tenant_ext;

-- Restore original global unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
```

**Phase 2f Rollback (Remove RLS):**
```sql
-- Rollback: Disable RLS
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_ticket_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_losses DISABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON users;
DROP POLICY IF EXISTS tenant_isolation_policy ON departments;
-- ... (drop all policies)
```

**Migration Safety:**
- All migrations run in transactions
- Default tenant created first
- All existing data assigned to default tenant
- No data deletion at any step
- Rollback scripts for every migration

### 2.4 DemoDb Tenant Scoping Strategy

The current `demoDb` in `database.ts` uses global in-memory arrays. Every service has `if (isDemoMode)` branches. These must become tenant-aware.

**Current Pattern (single-tenant):**
```typescript
export const demoDb = {
  users: [...],        // Global array
  departments: [...],  // Global array
  // ...
}

// In services:
if (isDemoMode) {
  const user = demoDb.users.find(u => u.username === username)
}
```

**New Pattern (multi-tenant):**
```typescript
// backend/src/database.ts
export const demoDb: Record<number, TenantDemoDb> = {}

export interface TenantDemoDb {
  users: any[]
  departments: any[]
  ingredients: any[]
  inventory_stocks: any[]
  recipes: any[]
  recipe_ingredients: any[]
  sales_tickets: any[]
  sales_ticket_items: any[]
n  stock_movements: any[]
  ingredient_losses: any[]
  transfer_requests: any[]
}

// Create tenant-scoped demo DB
export function createTenantDemoDb(tenantId: number): TenantDemoDb {
  const db: TenantDemoDb = {
    users: [], departments: [], ingredients: [],
    inventory_stocks: [], recipes: [], recipe_ingredients: [],
    sales_tickets: [], sales_ticket_items: [],
    stock_movements: [], ingredient_losses: [], transfer_requests: []
  }
  demoDb[tenantId] = db
  return db
}

// Get tenant-scoped demo DB
export function getTenantDemoDb(tenantId: number): TenantDemoDb {
  if (!demoDb[tenantId]) {
    createTenantDemoDb(tenantId)
  }
  return demoDb[tenantId]
}
```

**Service Migration Pattern:**
```typescript
// Before:
if (isDemoMode) {
  const user = demoDb.users.find(u => u.username === username)
}

// After:
if (isDemoMode) {
  const db = getTenantDemoDb(tenantId)
  const user = db.users.find(u => u.username === username)
}
```

**Affected Services (all with `isDemoMode` branches):**
- `auth.service.ts` — users array
- `stock.service.ts` — inventory_stocks, ingredients
- `sales.service.ts` — sales_tickets, sales_ticket_items
- `loss.service.ts` — ingredient_losses
- `transfer.service.ts` — transfer_requests
- `inventory.service.ts` — departments, ingredients, recipes, recipe_ingredients
- `forecast.service.ts` — sales_tickets, recipe_ingredients, ingredients

**Migration Rule:** Every `if (isDemoMode)` block must receive `tenantId` parameter and use `getTenantDemoDb(tenantId)` instead of the global `demoDb`.

### 2.5 Seed Data Strategy

**Current Pattern:** `initializeDatabase()` seeds a single restaurant with hardcoded data.

**New Pattern:** `seedTenantData(tenantId)` creates default data for a new tenant.

```typescript
// backend/src/services/tenant.service.ts
export async function createTenantWithSeedData(data: CreateTenantInput): Promise<Tenant> {
  const { client, release } = await getClient()
  try {
    await client.query('BEGIN')
    
    // 1. Create tenant
    const tenant = await createTenant(client, data)
    
    // 2. Seed default departments
    const depts = await seedDefaultDepartments(client, tenant.id)
    
    // 3. Seed default admin user
    const admin = await seedDefaultAdmin(client, tenant.id)
    
    // 4. Optionally seed ingredients + recipes
    if (data.seedIngredients) {
      await seedDefaultIngredients(client, tenant.id, depts)
    }
    
    await client.query('COMMIT')
    return tenant
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    release()
  }
}

// Default seed data for new tenants
const DEFAULT_DEPARTMENTS = [
  { name: 'Dépôt Central', stock_type: 'isolated', description: 'Stockage principal' },
  { name: 'Cuisine', stock_type: 'isolated', description: 'Zone de préparation' },
  { name: 'Comptoir', stock_type: 'isolated', description: 'Service clients' }
]

const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'changeme123',  // Forces password change on first login
  role: 'admin',
  first_name: 'Admin',
  last_name: 'Initial'
}
```

**Backward Compatibility:** The existing `initializeDatabase()` function continues to work for single-tenant mode but calls `seedTenantData(1)` internally, seeding into the default tenant.

### 2.6 API_KEY Deprecation Path

**Current State:** Single global `API_KEY` env var used by all agents.

**Deprecation Timeline:**

| Phase | Action | Backward Compatible? |
|-------|--------|---------------------|
| Phase 4 | New agent auth flow added | ✅ Yes — old API key still works |
| Phase 5 | Agent registration available | ✅ Yes — old API key still works |
| Phase 6 | New agents use JWT auth | ✅ Yes — old API key still works |
| Phase 7 | Deprecation warning in logs | ✅ Yes — old API key still works |
| Phase 11 | Old API key returns 401 with migration message | ⚠️ Breaking — agents must upgrade |

**Implementation:**
```typescript
// backend/src/routes/auth.ts — Enhanced authMiddleware
export const authMiddleware = (req, res, next) => {
  // 1. Try JWT first (new flow)
  if (authHeader?.startsWith('Bearer ')) {
    // ... existing JWT logic
  }
  
  // 2. Try API key (legacy flow — deprecated)
  if (apiKey && apiKey === process.env.API_KEY) {
    // Log deprecation warning
    console.warn('[DEPRECATION] API_KEY auth is deprecated. Migrate to agent JWT auth.')
    // Attach default tenant for backward compatibility
    req.tenantId = 1  // Default tenant
    req.authMethod = 'api_key_deprecated'
    return next()
  }
  
  // 3. No auth
  return res.status(401).json({ status: 'error', message: 'Auth required' })
}
```

**Migration Helper:**
```bash
# CLI tool to help agents migrate
npx mepos-agent migrate-auth \
  --old-api-key YOUR_KEY \
  --backend-url https://api.mepos.example.com \
  --tenant-slug my-restaurant

# Output:
# Agent ID: abc-123-def
# Agent Secret: xyz-789-uvw  (save this!)
# Config written to: sync_config.json
```

---

## 3. Backend Changes

### 3.1 Tenant Context Middleware

```typescript
// backend/src/middleware/tenant.ts
export async function tenantMiddleware(req, res, next) {
  // Extract tenant from JWT (for user requests) or agent auth (for agent requests)
  const tenantId = req.user?.tenantId || req.agent?.tenantId
  
  if (!tenantId) {
    return res.status(403).json({ status: 'error', message: 'Tenant context required' })
  }
  
  req.tenantId = tenantId
  next()
}
```

### 3.2 Tenant-Scoped Query Helper

```typescript
// backend/src/database.ts — Enhanced query helper
export async function query(text: string, params?: any[], tenantId?: number) {
  if (isDemoMode) {
    // Tenant-scoped demo mode
    return demoQuery(text, params, tenantId)
  }
  
  // If tenantId provided, inject tenant filter
  if (tenantId) {
    // Set PostgreSQL session variable for RLS
    await pool.query(`SET app.current_tenant = $1`, [tenantId])
  }
  
  return pool.query(text, params)
}
```

### 3.3 Service Layer Changes

Every service function gains tenant awareness:

```typescript
// Example: auth.service.ts — Tenant-scoped login
export async function authenticateUser(
  username: string,
  password: string,
  tenantSlug?: string  // Optional: auto-detect tenant from subdomain
): Promise<SafeUser & { tenantId: number }> {
  
  // 1. Resolve tenant
  const tenant = await resolveTenant(tenantSlug)
  
  // 2. Find user within tenant
  const result = await query(
    'SELECT id, username, role, first_name, last_name, password_hash FROM users WHERE username = $1 AND tenant_id = $2',
    [username, tenant.id]
  )
  
  // 3. Verify password, return user with tenantId
  // ...
}
```

### 3.4 JWT Enhancement

```typescript
// Current JWT payload:
{ id: 1, username: 'admin', role: 'admin' }

// New JWT payload:
{
  id: 1,
  username: 'admin',
  role: 'admin',
  tenantId: 5,
  tenantSlug: 'restaurant-pizza-abc',
  tenantStatus: 'active'
}
```

### 3.5 API Key → Agent Auth Flow

```
Agent Startup
    ↓
POST /api/v1/agents/authenticate
  Body: { agentId, agentSecret }
    ↓
Backend validates agent credentials
    ↓
Returns JWT for agent (short-lived, 1h)
Returns encrypted sync config (DB credentials, API keys)
    ↓
Agent uses JWT for all subsequent requests
    ↓
Agent establishes connection to POS database/API
    ↓
Synchronization begins
```

### 3.6 New Backend Services

```
backend/src/services/
├── tenant.service.ts          # Tenant CRUD, settings, billing
├── platform.service.ts        # Platform admin operations
├── agent.service.ts           # Agent registration, auth, heartbeat
├── connector.service.ts       # Connector factory + registry
├── configuration.service.ts   # Secure config distribution
├── connection-tester.service.ts # Test DB/API connections
├── heartbeat.service.ts       # Process agent heartbeats
├── encryption.service.ts      # Encrypt/decrypt sensitive credentials
└── audit.service.ts           # Audit logging
```

### 3.7 New Backend Routes

```
backend/src/routes/
├── tenants.ts                 # /api/v1/tenants (Platform Admin)
├── platform.ts                # /api/v1/platform (Platform Admin)
├── agents.ts                  # /api/v1/agents (Agent management)
└── settings.ts                # /api/v1/settings (Tenant settings)
```

### 3.8 Existing Route Changes

Every existing route adds `tenantMiddleware`:

```typescript
// Before:
router.use(authMiddleware)

// After:
router.use(authMiddleware, tenantMiddleware)
```

Every existing service call passes `tenantId`:

```typescript
// Before:
const stocks = await getAllStocks()

// After:
const stocks = await getAllStocks(req.tenantId)
```

---

## 4. Connector Architecture

### 4.1 Connector Interface

```typescript
// backend/src/connectors/base.connector.ts

// ─── Typed Connector Configs ───

export interface DatabaseConnectorConfig {
  type: 'database'
  dbType: 'postgresql' | 'mysql' | 'sqlserver' | 'sqlite'
  host: string
  port: number
  database: string
  username: string       // Encrypted
  password: string       // Encrypted
  ssl: boolean
  readOnly: boolean
  pollingInterval: number
  retryPolicy: { maxRetries: number; baseBackoff: number }
}

export interface APIConnectorConfig {
  type: 'api'
  apiUrl: string
  apiKey: string         // Encrypted
  authType: 'bearer' | 'api_key' | 'oauth2'
  headers: Record<string, string>
  pollingInterval: number
  webhookEnabled: boolean
  retryPolicy: { maxRetries: number; baseBackoff: number }
  timeout: number
}

export interface CSVConnectorConfig {
  type: 'csv'
  watchDirectory: string
  filePattern: string
  delimiter: string
  encoding: string
  pollingInterval: number
}

export interface WebhookConnectorConfig {
  type: 'webhook'
  secret: string         // Encrypted
  allowedIPs: string[]
  path: string
}

export type ConnectorConfig = DatabaseConnectorConfig | APIConnectorConfig | CSVConnectorConfig | WebhookConnectorConfig

// ─── Normalized Ticket ───

export interface NormalizedTicket {
  external_ticket_id: string
  ticket_date: string
  total_amount: number
  department_id?: number
  items: Array<{
    recipe_id: number
    quantity: number
    unit_price: number
    quantity_served?: number
  }>
}

// ─── Base Connector ───

export abstract class BaseConnector {
  protected config: ConnectorConfig
  
  constructor(config: ConnectorConfig) {
    this.config = config
  }
  
  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract healthCheck(): Promise<'healthy' | 'degraded' | 'unhealthy'>
  abstract fetchSales(lastSyncId?: number): Promise<NormalizedTicket[]>
  abstract acknowledge(ticketIds: string[]): Promise<void>
  
  /**
   * Normalize raw POS data into common NormalizedTicket format.
   * Each connector implements this to map its POS-specific format.
   */
  abstract normalize(rawData: any[]): NormalizedTicket[]
  
  // Factory method
  static create(type: string, config: ConnectorConfig): BaseConnector {
    switch (type) {
      case 'database': return new DatabaseConnector(config as DatabaseConnectorConfig)
      case 'api': return new APIConnector(config as APIConnectorConfig)
      case 'csv': return new CSVConnector(config as CSVConnectorConfig)
      case 'webhook': return new WebhookConnector(config as WebhookConnectorConfig)
      default: throw new Error(`Unknown connector type: ${type}`)
    }
  }
}
```
```

### 4.2 Database Connector

```typescript
// backend/src/connectors/database.connector.ts
export class DatabaseConnector extends BaseConnector {
  // Supports: PostgreSQL, MySQL, SQL Server, SQLite
  // Reads from external POS database
  // Normalizes tickets to common format
  // Maps POS items to mePOS recipes via mapping table
}
```

### 4.3 API Connector

```typescript
// backend/src/connectors/api.connector.ts
export class APIConnector extends BaseConnector {
  // Connects to external POS REST API
  // Handles authentication (Bearer, API Key, OAuth2)
  // Polls for new tickets
  // Webhook support for real-time push
}
```

### 4.4 Connector Registry

```typescript
// backend/src/connectors/registry.ts
export class ConnectorRegistry {
  private connectors = new Map<number, BaseConnector>()
  
  async getConnector(agentId: number): Promise<BaseConnector> {
    if (this.connectors.has(agentId)) {
      return this.connectors.get(agentId)!
    }
    
    const agent = await agentService.getById(agentId)
    const config = await configurationService.getDecrypted(agentId)
    const connector = BaseConnector.create(agent.connector_type, config)
    
    this.connectors.set(agentId, connector)
    return connector
  }
}
```

---

## 5. Agent Changes

### 5.1 Agent Authentication Flow

```
1. Agent starts with agent_id + agent_secret (from config)
2. POST /api/v1/agents/authenticate
3. Backend validates, returns JWT + encrypted config
4. Agent decrypts config, establishes POS connection
5. Agent sends heartbeat every 30s with JWT
6. Backend validates JWT, processes heartbeat
7. Agent periodically refreshes config (every 5min)
8. If credentials rotated, agent re-authenticates
```

### 5.2 Agent Configuration (New)

```json
{
  "agent_id": "uuid-from-backend",
  "agent_secret": "encrypted-secret-from-backend",
  "backend_url": "https://api.mepos.example.com",
  "heartbeat_interval": 30,
  "config_refresh_interval": 300
}
```

**Credentials are NOT stored permanently** — they're fetched from backend on startup and refreshed periodically.

### 5.3 Heartbeat Payload

```json
{
  "agent_id": "uuid",
  "version": "2.4.0",
  "status": "active",
  "health": "healthy",
  "last_sync": "2026-07-20T12:00:00Z",
  "connector_status": "connected",
  "sync_stats": {
    "tickets_synced": 150,
    "duplicates_skipped": 12,
    "errors": 0,
    "avg_sync_duration_ms": 850
  },
  "machine_info": {
    "hostname": "kitchen-terminal-01",
    "os": "Linux 6.1",
    "uptime_seconds": 86400
  }
}
```

### 5.4 Agent Management Features

| Feature | Description |
|---------|-------------|
| Remote Disable | Backend can disable agent; agent stops sync |
| Remote Config Update | Backend pushes new config; agent reconfigures |
| Credential Rotation | Backend rotates secrets; agent re-authenticates |
| Force Sync | Backend requests immediate sync |
| Version Check | Agent reports version; backend flags upgrades |

---

## 6. Frontend Changes

### 6.1 New Stores

```
frontend/src/stores/
├── auth.js          # Enhanced: tenant context, platform admin
├── app.js           # Enhanced: tenant-scoped data
├── tenant.js        # NEW: tenant settings, branding
├── agent.js         # NEW: agent management
└── platform.js      # NEW: platform admin (super admin only)
```

### 6.2 New Pages

```
frontend/src/views/
├── DashboardView.vue           # Enhanced: tenant-scoped
├── InventoryView.vue           # Enhanced: tenant-scoped
├── LossTrackerView.vue         # Enhanced: tenant-scoped
├── StockTransferView.vue       # Enhanced: tenant-scoped
├── SettingsView.vue            # Enhanced: tenant settings
├── LoginPage.vue               # Enhanced: tenant detection
├── TenantSettings.vue          # NEW: tenant configuration
├── SyncSettings.vue            # NEW: synchronization config
├── AgentManagement.vue         # NEW: agent list + details
├── SyncDashboard.vue           # NEW: sync health overview
├── PlatformDashboard.vue       # NEW: platform admin
└── TenantManagement.vue        # NEW: platform admin
```

### 6.3 Tenant Detection Strategy

```
1. Subdomain: restaurant-pizza.mepos.com → tenant slug
2. Custom domain: pizza-inventory.com → CNAME lookup
3. Login page: user selects/enters tenant slug
4. JWT: tenant info embedded in token
```

### 6.4 API Client Enhancement

```javascript
// frontend/src/api/index.js — Enhanced with tenant context
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('mepos_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  
  // Tenant context from JWT or subdomain
  const tenantSlug = localStorage.getItem('mepos_tenant_slug')
  if (tenantSlug) config.headers['X-Tenant-Slug'] = tenantSlug
  
  return config
})
```

### 6.5 New Frontend Components

```
frontend/src/components/
├── base/
│   ├── TenantLogo.vue          # Tenant branding
│   ├── TenantBadge.vue         # Tenant indicator
│   └── PlatformNav.vue         # Platform admin nav
├── sync/
│   ├── AgentCard.vue           # Agent status card
│   ├── SyncStatus.vue          # Sync health indicator
│   ├── ConnectorConfig.vue     # Connector configuration form
│   └── HeartbeatTimeline.vue   # Heartbeat history chart
└── settings/
    ├── TenantGeneral.vue       # General settings
    ├── TenantBranding.vue      # Logo, colors
    ├── TenantSync.vue          # Sync settings
    └── TenantNotifications.vue # Notification prefs
```

---

## 7. Security Improvements

### 7.1 Encryption Service

```typescript
// backend/src/services/encryption.service.ts
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY  // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}
```

### 7.2 What Gets Encrypted

| Data | Where Stored | Encryption |
|------|-------------|------------|
| Database passwords | agents.config | AES-256-GCM |
| API keys | agents.config | AES-256-GCM |
| Agent secrets | agents.agent_secret_hash | bcrypt |
| JWT tokens | Client localStorage | Not encrypted (signed) |
| Sync credentials | Transmitted over TLS | TLS encryption |

### 7.3 Security Checklist

- [x] All DB/API credentials encrypted at rest (AES-256-GCM via encryption.service.ts)
- [x] Agent secrets hashed with bcrypt (bcryptjs via agent.service.ts)
- [ ] JWT secrets rotated periodically
- [ ] API keys regenerated on demand
- [x] Tenant isolation middleware on all routes + tenantContextMiddleware
- [ ] Row-Level Security (RLS) enabled on PostgreSQL
- [ ] Audit trail for all sensitive operations
- [ ] Rate limiting per tenant
- [ ] CORS configured per tenant domain
- [x] No secrets exposed through API responses (config endpoint uses decryptIfNeeded)

---

## 8. API Changes

### 8.1 New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/platform/login | None | Platform admin login |
| GET | /api/v1/platform/tenants | Platform JWT | List all tenants |
| POST | /api/v1/platform/tenants | Platform JWT | Create tenant |
| PUT | /api/v1/platform/tenants/:id | Platform JWT | Update tenant |
| DELETE | /api/v1/platform/tenants/:id | Platform JWT | Delete tenant |
| POST | /api/v1/platform/tenants/:id/suspend | Platform JWT | Suspend tenant |
| POST | /api/v1/platform/tenants/:id/activate | Platform JWT | Activate tenant |
| GET | /api/v1/platform/stats | Platform JWT | Platform statistics |
| POST | /api/v1/agents/authenticate | API Key | Agent → Backend auth |
| POST | /api/v1/agents/heartbeat | Agent JWT | Agent heartbeat |
| GET | /api/v1/agents | JWT | List tenant's agents |
| GET | /api/v1/agents/:id | JWT | Agent details |
| POST | /api/v1/agents/:id/disable | JWT | Disable agent |
| POST | /api/v1/agents/:id/enable | JWT | Enable agent |
| POST | /api/v1/agents/:id/rotate-secret | JWT | Rotate agent credentials |
| GET | /api/v1/agents/:id/config | Agent JWT | Get sync config |
| POST | /api/v1/sync/test-connection | JWT | Test DB/API connection |
| GET | /api/v1/sync/status | JWT | Sync health status |
| GET | /api/v1/sync/dashboard | JWT | Sync dashboard data |
| GET | /api/v1/settings | JWT | Get tenant settings |
| PUT | /api/v1/settings/:category | JWT | Update tenant settings |
| GET | /api/v1/audit | JWT | Audit log (admin only) |

### 8.2 Existing Endpoint Changes

All existing endpoints gain:
1. Tenant middleware (automatic tenant scoping)
2. `X-Tenant-Id` header validation (optional, for cross-origin)
3. Rate limiting per tenant (not just per IP)

### 8.3 Response Format Enhancement

```json
{
  "status": "success",
  "data": [...],
  "meta": {
    "tenant_id": 5,
    "page": 1,
    "per_page": 50,
    "total": 150
  }
}
```

---

## 9. Synchronization Workflow (New)

### 9.1 Current Workflow
```
Agent → reads JSON file → POST /api/v1/sales/sync → Backend processes
```

### 9.2 New Workflow
```
Agent Startup
    ↓
POST /api/v1/agents/authenticate (agent_id + secret)
    ↓
Backend validates → returns JWT + encrypted config
    ↓
Agent decrypts config → establishes POS connection (DB or API)
    ↓
POST /api/v1/agents/heartbeat (every 30s)
    ↓
Agent fetches new tickets from POS (via connector)
    ↓
Agent normalizes tickets to common format
    ↓
POST /api/v1/sales/sync (with tenant-scoped JWT)
    ↓
Backend processes with tenant isolation
    ↓
Backend updates agent.last_sync
    ↓
Agent acknowledges processed tickets
    ↓
Agent refreshes config periodically
```

### 9.3 Connection Testing

```
POST /api/v1/sync/test-connection
Body: {
  type: "database",
  config: {
    host: "...", port: 5432, database: "...",
    username: "...", password: "...", ssl: true
  }
}
Response: {
  status: "success",
  data: { connected: true, latency_ms: 45, server_version: "15.4" }
}
```

---

## 10. Implementation Phases

### Phase 2: Database Migration ✅ COMPLETE (v2.4.1 — commit `bb9182c`)
- Created new tables: `tenants`, `platform_users`, `agents`, `agent_heartbeats`, `tenant_settings`, `audit_logs`
- Added `tenant_id` columns (nullable) to all 11 business tables
- Created default tenant (id=1, slug='default') and migrated all existing data
- Set NOT NULL constraints, created tenant-scoped unique indexes
- Added `agents` and `agent_heartbeats` to demoDb type in database.ts
- **Files modified:** `backend/src/database.ts`, `backend/src/schema.ts`
- **Status:** ✅ All 25 tests pass, TS compiles

### Phase 3: Tenant Context Middleware ✅ COMPLETE (v2.4.2 — commit `b1e30ae`)
- Created `tenantContextMiddleware` — extracts `tenantId` from JWT and injects into `req.tenantId`
- Applied middleware to all existing routes (auth, sales, inventory, losses, transfers, forecast)
- JWT payload now includes `tenantId` field
- Middleware handles agent JWTs (type='agent') and user JWTs
- **Files created:** `backend/src/middleware/tenant.ts`
- **Files modified:** `backend/src/index.ts`, all route files
- **Status:** ✅ All 25 tests pass, TS compiles

### Phase 4: Service Layer Tenant Scoping ✅ COMPLETE (v2.4.2 — commit `b1e30ae`)
- Updated ALL 7 services to accept and use `tenantId` parameter:
  - `auth.service.ts` — tenant-scoped user queries
  - `stock.service.ts` — tenant-scoped stock operations
  - `sales.service.ts` — tenant-scoped ticket sync and stats
  - `loss.service.ts` — tenant-scoped loss tracking
  - `transfer.service.ts` — tenant-scoped transfer requests
  - `inventory.service.ts` — tenant-scoped CRUD
  - `forecast.service.ts` — tenant-scoped forecast calculations
- Updated all route files to pass `req.tenantId` to service functions
- Removed `?? undefined` fallbacks — middleware guarantees tenantId exists
- **Files modified:** All 7 service files, all 6 route files
- **Status:** ✅ All 25 tests pass, TS compiles

### Phase 5: Connector Architecture ✅ COMPLETE (v2.5.0 — commit `88f781f`)
- Created connector interface with typed configs:
  - `DatabaseConnectorConfig` — PostgreSQL, MySQL, SQL Server, SQLite
  - `APIConnectorConfig` — REST API with Bearer/API Key auth
  - `CSVConnectorConfig` — Future file-based connector
  - `WebhookConnectorConfig` — Future push-based connector
- Implemented `BaseConnector` abstract class with:
  - `connect()`, `disconnect()`, `healthCheck()`, `fetchSales()`, `normalize()`
  - `NormalizedTicket` interface — common format for inventory engine
  - Factory method `BaseConnector.create()` for lazy instantiation
- Implemented `DatabaseConnector` — supports 4 DB types with dynamic imports
- Implemented `APIConnector` — fetch-based HTTP client with auth headers
- Created `ConnectorRegistry` — per-agent caching, 60s health checks, singleton
- **Files created:**
  - `backend/src/connectors/base.connector.ts` (150 lines)
  - `backend/src/connectors/database.connector.ts` (280 lines)
  - `backend/src/connectors/api.connector.ts` (200 lines)
  - `backend/src/connectors/registry.ts` (120 lines)
  - `backend/src/connectors/index.ts` (barrel export)
- **Status:** ✅ All 25 tests pass, TS compiles, code reviewed

### Phase 6: Agent Registration & Auth ✅ COMPLETE (v2.6.0 — commit `7d3fac7`)
- Created `encryption.service.ts` — AES-256-GCM encryption for credentials at rest:
  - `encrypt()` / `decrypt()` with iv:tag:ciphertext format
  - `isEncrypted()` to detect encrypted values
  - `encryptIfNeeded()` / `decryptIfNeeded()` helpers
  - Dev fallback via `ENCRYPTION_KEY` env var
- Created `agent.service.ts` — full agent lifecycle:
  - CRUD: `getAgentsByTenant`, `getAgentById`, `createAgent`, `updateAgent`, `deleteAgent`
  - Actions: `enableAgent`, `disableAgent`, `rotateAgentSecret`
  - Auth: `authenticateAgent` (bcryptjs verify, JWT with type:'agent')
  - Heartbeat: `processHeartbeat` (updates status, logs to agent_heartbeats)
  - Config: `getAgentConfig` / `updateAgentConfig` (encrypts/decrypts sensitive fields)
  - Monitoring: `getAgentHeartbeats`, `getAgentSyncStatus`
- Created `agents.ts` routes — 13 endpoints:
  - `POST /authenticate` (public — agent auth)
  - `POST /heartbeat` (public — agent JWT)
  - `GET /:id/config` (public — agent JWT)
  - All other routes behind `authMiddleware` + `tenantContextMiddleware`
- Updated `index.ts` — registered agents router at `/api/v1/agents`
- Updated `database.ts` — added agents/agent_heartbeats to demoDb type
- **Files created:**
  - `backend/src/services/encryption.service.ts` (80 lines)
  - `backend/src/services/agent.service.ts` (350 lines)
  - `backend/src/routes/agents.ts` (280 lines)
- **Files modified:** `backend/src/index.ts`, `backend/src/database.ts`
- **Status:** ✅ All 25 tests pass, TS compiles, code reviewed

### Phase 7: Tenant Settings Service ✅ COMPLETE (v2.7.0 — commit `c10b50e`)
- Created `tenant.service.ts` — tenant CRUD + settings management:
  - Tenant CRUD: `getAllTenants`, `getTenantById`, `getTenantBySlug`, `createTenant`, `updateTenant`, `deleteTenant`
  - Tenant actions: `suspendTenant`, `activateTenant`
  - Settings: `getTenantSettings` (grouped by category), `getTenantSettingsByCategory`, `getTenantSetting`, `setTenantSetting` (with encryption support), `setTenantSettingsBulk`, `deleteTenantSetting`
  - Stats: `getTenantStats` (users, departments, ingredients, stocks count)
  - Demo mode support throughout
- Created `settings.ts` routes — settings endpoints:
  - `GET /` — all settings grouped by category
  - `GET /:category` — settings for a category
  - `GET /:category/:key` — single setting
  - `PUT /:category` — bulk upsert with optional encrypted keys
  - `PUT /:category/:key` — single set
  - `DELETE /:category/:key` — delete setting
- Created `tenants.ts` routes — tenant management:
  - Full CRUD + suspend/activate + stats
- Updated `index.ts` — registered settings and tenants routers
- Updated `database.ts` — added tenant_settings to demoDb type
- **Files created:**
  - `backend/src/services/tenant.service.ts` (300 lines)
  - `backend/src/routes/settings.ts` (120 lines)
  - `backend/src/routes/tenants.ts` (150 lines)
- **Files modified:** `backend/src/index.ts`, `backend/src/database.ts`
- **Status:** ✅ All 25 tests pass, TS compiles, code reviewed

### Phase 8: Frontend Tenant Pages ✅ COMPLETE (v2.8.0 — commit `9b199a4`)
- Updated `api/index.js` — added 18 new API endpoints:
  - Agent endpoints (CRUD, enable/disable, rotate secret, heartbeats, sync status, config)
  - Tenant endpoints (CRUD, suspend/activate, stats)
  - Settings endpoints (get/set/delete by category/key)
- Created `agent.js` Pinia store — agent management state:
  - CRUD operations, enable/disable, rotate secret
  - Heartbeats, sync status, config management
  - Computed properties for online/offline counts
- Created `AgentManagement.vue` — full agent management UI:
  - Stats cards (total, online, offline, unhealthy)
  - Agent cards with status indicators, metrics, health badges
  - Create agent modal with connector type selection
  - Secret display modal (copy to clipboard)
  - Agent details modal with config management
  - Heartbeat history table with status badges
  - Enable/disable toggle, rotate secret action
- Created `TenantSettings.vue` — tenant configuration page:
  - Restaurant info (name, email, phone, address, country, timezone, language, currency)
  - Notification preferences (email, low stock, sync errors, daily summary)
  - Inventory settings (auto-reorder, default supplier)
  - Sync settings (strategy selection, polling interval)
  - Save all settings with loading states
- Updated `router/index.js` — added `/tenant-settings` and `/agents` routes (requiresAdmin)
- Updated `Sidebar.vue` — added Agents Sync and Tenant Settings nav items with SVG icons
- **Files created:**
  - `frontend/src/stores/agent.js` (180 lines)
  - `frontend/src/views/AgentManagement.vue` (450 lines)
  - `frontend/src/views/TenantSettings.vue` (350 lines)
- **Files modified:** `frontend/src/api/index.js`, `frontend/src/router/index.js`, `frontend/src/components/layout/Sidebar.vue`
- **Status:** ✅ Vite build succeeds, all 56 frontend tests pass, code reviewed

### Phase 9: Synchronization Dashboard ✅ COMPLETE (v2.9.0 — commit `c9526df`)
- Created `sync.js` Pinia store — sync dashboard state:
  - Agents list, selected agent, heartbeats, sync status
  - Computed: `healthyAgents`, `unhealthyAgents`, `onlineCount`, `totalCount`
  - Actions: `fetchDashboardData`, `fetchAgentDetails`, `clearSelection`
  - Double-fetch guard (`if isLoading.value return`)
  - Auto-refresh support with `lastRefresh` timestamp
- Created `SyncDashboard.vue` — full sync dashboard UI:
  - Overview cards (online, healthy, unhealthy, total agents)
  - Agent status grid with status indicators, version, last sync, heartbeat times
  - Health badges (healthy/degraded/unhealthy/unknown)
  - Detail panel with 3 tabs:
    - Status tab — agent info, sync info, health details
    - Heartbeats tab — heartbeat history with status/health badges
    - Timeline tab — chronological view with ticket counts, errors, durations
  - Auto-refresh every 30 seconds
  - Loading, error, and empty states
  - Responsive grid layout (minmax 280px)
  - Scoped CSS with proper styling for all states
- Updated `router/index.js` — added `/sync` route (requiresAdmin)
- Updated `Sidebar.vue` — added Sync Dashboard nav item with refresh icon
- **Files created:**
  - `frontend/src/stores/sync.js` (90 lines)
  - `frontend/src/views/SyncDashboard.vue` (400 lines)
- **Files modified:** `frontend/src/router/index.js`, `frontend/src/components/layout/Sidebar.vue`
- **Status:** ✅ Vite build succeeds, all tests pass, code reviewed

### Phase 10: Testing
- Unit tests for new services (encryption, agent, tenant)
- Integration tests for tenant isolation
- E2E tests for agent flow
- Security audit
- **Estimated: 3-4 days**

### Phase 11: Data Migration & Validation
- Migrate existing data to default tenant
- Validate all queries return correct tenant data
- Cross-tenant isolation tests
- Performance benchmarks
- **Estimated: 2 days**

### Phase 12: Final Validation
- Full regression test suite
- Docker build verification
- Documentation update
- Deployment dry-run
- **Estimated: 1-2 days**

### Phase 13: Sync Agent Rewrite
- Rewrite sync_agent.js for secure auth + connector architecture
- Agent authentication flow (agent_id + secret → JWT)
- Encrypted config distribution
- Heartbeat system
- Connector-based POS integration
- **Estimated: 3-4 days**

**Completed: 9/13 phases (Phases 2-9)**  
**Remaining: 4 phases (10-13)**  
**Estimated Remaining: 9-12 working days**

---

## 11. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data leakage across tenants | CRITICAL | RLS policies + middleware + comprehensive tests |
| Performance degradation from tenant filtering | HIGH | Composite indexes on (tenant_id, ...) columns |
| Migration breaks existing single-tenant data | HIGH | Default tenant migration + rollback scripts |
| Agent compatibility with new auth flow | MEDIUM | Backward-compatible API key fallback (6-month deprecation) |
| Frontend offline cache tenant contamination | MEDIUM | Prefix cache keys with tenant slug |
| Demo mode complexity increase | MEDIUM | Tenant-aware demo mode with isolated data per tenant |
| `isDemoMode` branches create code duplication | MEDIUM | Extract into tenant-aware query helper, reduce branches |
| Heartbeat table unbounded growth | MEDIUM | 7-day retention + daily aggregation |
| Connector config type safety | LOW | Strict typed interfaces per connector type |

---

## 12. Rollback Plan

Each phase has a rollback script:

```bash
# Phase 2 rollback: Remove tenant_id columns
# Phase 3 rollback: Remove tenantMiddleware from routes
# Phase 4 rollback: Revert JWT payload
# ... etc
```

**Critical:** All migrations are additive-only. No destructive operations until Phase 11 validation passes.

---

## 13. Testing Strategy

### Unit Tests
- Tenant-scoped service functions
- Connector implementations
- Encryption/decryption
- Tenant resolution logic

### Integration Tests
- Full tenant isolation (Tenant A cannot see Tenant B data)
- Agent authentication flow
- Connector + sync pipeline
- Cross-tenant API access denial

### E2E Tests
- Login → Tenant detection → Data loading
- Agent registration → Auth → Sync → Heartbeat
- Platform admin → Create tenant → Configure sync → Verify

### Security Tests
- Tenant ID tampering in JWT
- Cross-tenant API access attempts
- Credential exposure in logs
- SQL injection with tenant context

---

### 2.7 Agent Heartbeat Retention Policy

The `agent_heartbeats` table grows unboundedly. Implement retention + aggregation.

```sql
-- Retention: Keep raw heartbeats for 7 days
-- Aggregate into daily summaries older than 7 days

CREATE TABLE agent_heartbeat_daily (
  id SERIAL PRIMARY KEY,
  agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  avg_latency_ms FLOAT,
  max_latency_ms FLOAT,
  total_heartbeats INT DEFAULT 0,
  failed_heartbeats INT DEFAULT 0,
  avg_tickets_synced FLOAT,
  avg_sync_duration_ms FLOAT,
  UNIQUE(agent_id, date)
);
```

**Retention Job (runs daily via pg_cron or cron service):**
```sql
-- 1. Aggregate heartbeats older than 7 days into daily summaries
INSERT INTO agent_heartbeat_daily (agent_id, date, avg_latency_ms, total_heartbeats, ...)
SELECT 
  agent_id,
  DATE(created_at) as date,
  AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY agent_id ORDER BY created_at))) * 1000),
  COUNT(*),
  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END),
  AVG((sync_stats->>'tickets_synced')::int),
  AVG((sync_stats->>'avg_sync_duration_ms')::float)
FROM agent_heartbeats
WHERE created_at < NOW() - INTERVAL '7 days'
GROUP BY agent_id, DATE(created_at)
ON CONFLICT (agent_id, date) DO UPDATE SET
  avg_latency_ms = EXCLUDED.avg_latency_ms,
  total_heartbeats = EXCLUDED.total_heartbeats;

-- 2. Delete raw heartbeats older than 7 days
DELETE FROM agent_heartbeats WHERE created_at < NOW() - INTERVAL '7 days';
```

**Benefits:**
- Raw heartbeats only kept for 7 days (debugging window)
- Daily summaries retained indefinitely (analytics)
- Table size stays bounded (~50KB/day per agent)

### 2.8 Forecast Service Tenant Scoping

The forecast service queries sales data globally. It must be tenant-scoped.

```typescript
// Before (single-tenant):
export async function getForecast(): Promise<ForecastResponse> {
  // Queries ALL sales_tickets, ALL recipe_ingredients, ALL ingredients
}

// After (multi-tenant):
export async function getForecast(tenantId: number): Promise<ForecastResponse> {
  // 1. Get tenant's recipes and ingredients
  const recipes = await query(
    'SELECT * FROM recipes WHERE tenant_id = $1 AND is_active = TRUE',
    [tenantId]
  )
  
  // 2. Get tenant's sales from last 7 days
  const sales = await query(
    `SELECT sti.recipe_id, SUM(sti.quantity) as total_quantity, SUM(sti.quantity * sti.unit_price) as total_revenue
     FROM sales_tickets st
     JOIN sales_ticket_items sti ON st.id = sti.sales_ticket_id
     WHERE st.tenant_id = $1 AND st.ticket_date >= NOW() - INTERVAL '7 days'
     GROUP BY sti.recipe_id`,
    [tenantId]
  )
  
  // 3. Get tenant's ingredient usage (via recipe_ingredients)
  // 4. Get tenant's current stocks
  // 5. Calculate moving averages, depletion, reorder
  // ... same logic, but all queries scoped to tenantId
}
```

**Affected forecast queries:**
- Sales history: `WHERE tenant_id = $1`
- Recipe ingredients: `WHERE tenant_id = $1`
- Ingredients: `WHERE tenant_id = $1`
- Inventory stocks: `WHERE tenant_id = $1`

### 2.9 Complete Service Migration Checklist

Every service with `isDemoMode` branches must be updated:

| Service | Functions Affected | DemoDb Tables Used |
|---------|-------------------|--------------------|
| auth.service.ts | authenticateUser, getAllUsers, createUser, updateUser, deleteUser | users |
| stock.service.ts | getEffectiveDepartmentId, ensureStockRow, getStockQuantity, updateStockQuantity, logMovement, getStockWarning, processSaleDeduction, calculateLossCosts | departments, ingredients, inventory_stocks, recipe_ingredients, recipes, ingredient_losses, stock_movements |
| sales.service.ts | syncTickets, getSalesStats, getSalesHistory | departments, sales_tickets, sales_ticket_items, recipes, recipe_ingredients |
| loss.service.ts | createLoss, getLosses | departments, ingredients, users, ingredient_losses, inventory_stocks, stock_movements |
| transfer.service.ts | executeTransfer, createTransferRequest, approveTransferRequest, rejectTransferRequest, getTransferRequests | departments, ingredients, users, inventory_stocks, transfer_requests, stock_movements |
| inventory.service.ts | getAllDepartments, createDepartment, updateDepartment, deleteDepartment, getAllIngredients, createIngredient, updateIngredient, getAllRecipes, createRecipe, saveRecipeIngredients, getAllStocks, getAllMovements, adjustStock | departments, ingredients, recipes, recipe_ingredients, inventory_stocks, stock_movements |
| forecast.service.ts | getForecast | sales_tickets, sales_ticket_items, recipes, recipe_ingredients, ingredients, inventory_stocks |

**Total: 7 services, ~40 functions, ~200 `isDemoMode` branches**

---

## 15. Recommended Future Improvements

1. **Webhook Sync** — Real-time POS event push
2. **CSV/XML Connectors** — Import from file-based POS
3. **POS SDK Plugins** — Native POS integrations
4. **Message Queue Sync** — Kafka/RabbitMQ for high-volume
5. **Tenant Onboarding Wizard** — Self-service setup
6. **Subscription Billing** — Stripe integration
7. **White-Label Branding** — Full UI customization per tenant
8. **Mobile Agent** — Agent for mobile POS devices
9. **Analytics Dashboard** — Cross-tenant platform analytics
10. **API Versioning** — v2 API with tenant scoping built-in

---

## 16. Summary

### What Changes
- **Database:** 7 new tables, 11 tables gain tenant_id
- **Backend:** 9 new services, 4 new route files, all existing services updated
- **Frontend:** 3 new stores, 6 new views, 8+ new components
- **Agent:** Complete rewrite for secure auth + connector architecture
- **Security:** Encryption service, audit trail, RLS policies

### What Stays the Same
- All existing business logic (inventory, losses, transfers, forecast)
- All existing API contracts (with tenant middleware added)
- All existing UI/UX (with tenant branding added)
- All existing Docker configuration (with new env vars)
- All existing test infrastructure

### Progress Report

| Phase | Status | Commit | Version | Tests |
|-------|--------|--------|---------|-------|
| Phase 2: Database Migration | ✅ Complete | `bb9182c` | v2.4.1 | 25/25 |
| Phase 3: Tenant Middleware | ✅ Complete | `b1e30ae` | v2.4.2 | 25/25 |
| Phase 4: Service Scoping | ✅ Complete | `b1e30ae` | v2.4.2 | 25/25 |
| Phase 5: Connector Architecture | ✅ Complete | `88f781f` | v2.5.0 | 25/25 |
| Phase 6: Agent Auth & Registration | ✅ Complete | `7d3fac7` | v2.6.0 | 25/25 |
| Phase 7: Tenant Settings Service | ✅ Complete | `c10b50e` | v2.7.0 | 25/25 |
| Phase 8: Frontend Tenant Pages | ✅ Complete | `9b199a4` | v2.8.0 | 56/56 |
| Phase 9: Sync Dashboard | ✅ Complete | `c9526df` | v2.9.0 | 56/56 |
| Phase 10: Testing | 🔲 Pending | — | — | — |
| Phase 11: Data Migration | 🔲 Pending | — | — | — |
| Phase 12: Final Validation | 🔲 Pending | — | — | — |
| Phase 13: Agent Rewrite | 🔲 Pending | — | — | — |

### Files Created (Phases 5-9)

**Backend (Phase 5-7):**
- `backend/src/connectors/base.connector.ts` — Connector interface + NormalizedTicket
- `backend/src/connectors/database.connector.ts` — PostgreSQL/MySQL/SQL Server/SQLite
- `backend/src/connectors/api.connector.ts` — REST API connector
- `backend/src/connectors/registry.ts` — Connector caching + health checks
- `backend/src/connectors/index.ts` — Barrel export
- `backend/src/services/encryption.service.ts` — AES-256-GCM encryption
- `backend/src/services/agent.service.ts` — Agent lifecycle management
- `backend/src/services/tenant.service.ts` — Tenant CRUD + settings
- `backend/src/routes/agents.ts` — 13 agent endpoints
- `backend/src/routes/settings.ts` — Settings endpoints
- `backend/src/routes/tenants.ts` — Tenant management endpoints

**Frontend (Phase 8-9):**
- `frontend/src/stores/agent.js` — Agent Pinia store
- `frontend/src/stores/sync.js` — Sync dashboard Pinia store
- `frontend/src/views/AgentManagement.vue` — Agent management UI
- `frontend/src/views/TenantSettings.vue` — Tenant settings page
- `frontend/src/views/SyncDashboard.vue` — Sync dashboard UI

### Security Improvements (Phases 5-9)
- ✅ AES-256-GCM encryption for database/API credentials at rest
- ✅ bcryptjs hashing for agent secrets
- ✅ Agent JWT authentication (type='agent')
- ✅ Secure config distribution (encrypted credentials)
- ✅ Tenant isolation middleware on all routes
- ✅ No secrets exposed through API responses
- ✅ Agent config encrypted/decrypted transparently

### Remaining Work
1. **Phase 10:** Unit tests for encryption, agent, tenant services
2. **Phase 11:** Data migration validation, cross-tenant isolation tests
3. **Phase 12:** Full regression test suite, Docker build verification
4. **Phase 13:** Rewrite sync_agent.js for secure auth + connector architecture

### Next Steps
1. Continue with Phase 10: Testing
2. Rewrite sync agent for secure authentication
3. Run full regression test suite
4. Docker build verification
5. Deploy to staging environment
