# Product Import & POS Product Mapping — Implementation Plan

## Current Architecture Summary

- **Products are Recipes** (sellable items via `recipes` table) — no separate Product entity
- **No file upload/download, no wizard components, no import functionality exists**
- **Tech Stack**: Express.js + TypeScript + PostgreSQL (raw SQL) + Vue 3 + Pinia
- **Multi-tenancy**: `tenant_id` column on all business tables
- **RBAC**: `admin` (full), `manager` (limited), `cook` (no access to import/mapping)
- **Notifications**: Event-driven via `eventBus` → `notification.service.ts` → SSE + Push
- **Synchronization**: Currently uses `recipe_id` from external tickets; product-mapping will replace name-based matching

---

## Phase 1 — Backend: CSV Import

### 1.1 Database
- No new tables needed — imports create entries in `recipes`, `ingredients`, `recipe_ingredients`

### 1.2 Install Dependencies
- `multer` — file upload middleware
- `csv-parse` or `papaparse` — CSV parsing

### 1.3 New Route File — `src/routes/import.ts`

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/import/products/csv-template` | GET | Generate + download CSV template |
| `/api/v1/import/products/validate` | POST | Upload + validate CSV file |
| `/api/v1/import/products/execute` | POST | Execute validated import in a transaction |

### 1.4 CSV Template (`GET /import/products/csv-template`)
- Headers: `Product Name`, `Category`, `Selling Price`, `Preparation Time`, `Ingredient 1`, `Quantity 1`, `Unit 1`, `Ingredient 2`, `Quantity 2`, `Unit 2`, ...
- 2–3 sample rows referencing existing ingredients
- `Content-Type: text/csv; charset=utf-8`

### 1.5 Validation (`POST /import/products/validate`)
Checks:
- Missing columns
- Empty rows
- Encoding issues
- Duplicate product names (against existing `recipes`)
- Missing ingredient names
- Invalid/negative quantities
- Unknown units

Returns `{ status, valid, rows, errors, warnings }` with per-row detail. Detects existing vs new ingredients by name lookup.

### 1.6 Execution (`POST /import/products/execute`)
Runs inside a **database transaction**:
1. Upsert ingredients (new ones flagged)
2. Create recipe
3. Create recipe_ingredients
4. Rollback on any failure

Returns `{ productsCreated, recipesCreated, ingredientsReused, ingredientsCreated, warnings, errors }`.

### 1.7 New Events — `event.service.ts`
- `IMPORT_STARTED`, `IMPORT_COMPLETED`, `IMPORT_FAILED`

### 1.8 New Notifications — `notification-dispatcher.ts`
- Import completed / failed
- Reuse existing `INGREDIENT_CREATED` handler for new ingredients

---

## Phase 2 — Backend: POS Product Mapping

### 2.1 New Table — `product_mappings`

```sql
CREATE TABLE IF NOT EXISTS product_mappings (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL,
    external_product_id VARCHAR(100) NOT NULL,
    external_product_code VARCHAR(100),
    external_product_name VARCHAR(255),
    mepos_product_id INT REFERENCES recipes(id) ON DELETE SET NULL,
    mapping_status VARCHAR(20) DEFAULT 'unmapped',
    confidence DECIMAL(5,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, connector_type, external_product_id)
);
```

### 2.2 New Route File — `src/routes/mappings.ts`

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/mappings` | GET | List with filters |
| `/api/v1/mappings` | POST | Create mapping |
| `/api/v1/mappings/:id` | PUT | Update mapping |
| `/api/v1/mappings/:id` | DELETE | Delete mapping |
| `/api/v1/mappings/bulk` | POST | Bulk map |
| `/api/v1/mappings/auto-match` | POST | Auto-match for a connector |
| `/api/v1/mappings/unmapped` | GET | Unmapped products |
| `/api/v1/mappings/stats` | GET | Dashboard stats |
| `/api/v1/mappings/validate` | GET | Validation check |
| `/api/v1/mappings/import-pos` | POST | Import external POS products |

### 2.3 New Service — `src/services/mapping.service.ts`
- CRUD for mappings
- `autoMatch()` — fuzzy name matching using Levenshtein / similarity scoring
- `bulkMap()` — batch update
- `getMappingStats()` — dashboard counts
- `validateMappings()` — completion % check

### 2.4 Update Synchronization — `sales.service.ts`
- Lookup `external_product_id` → `product_mappings` → `mepos_product_id` (recipe_id)
- Never match by product name
- Skip unmapped products with warning; emit `sync.blocked` event

### 2.5 New Events
- `MAPPING_CREATED`, `MAPPING_UPDATED`, `MAPPING_DELETED`, `MAPPING_AUTO_MATCHED`, `SYNC_BLOCKED_MISSING_MAPPING`

### 2.6 New Notifications
- Mapping completed, auto-match results, sync blocked due to missing mappings

### 2.7 Seed Data — `seed.ts`
- 30+ realistic mappings
- Mix of mapped, unmapped, ignored, and conflicts
- External POS product catalog partially overlapping with mePOS recipes

---

## Phase 3 — Frontend: CSV Import Wizard

### 3.1 New View — `ProductsView.vue` at `/app/products`
- List of recipes with search/filter/pagination
- Two action buttons: **Download CSV Template** + **Import CSV**

### 3.2 API Methods — `api/index.js`
```js
downloadCsvTemplate: () => client.get('/import/products/csv-template', { responseType: 'blob' }),
validateCsv: (file) => { const fd = new FormData(); fd.append('file', file); return client.post('/import/products/validate', fd); },
executeImport: (data) => client.post('/import/products/execute', data),
```

### 3.3 CSV Template Download
- Fetch blob → `URL.createObjectURL()` → trigger download

### 3.4 Import Wizard — `ImportWizard.vue` (6-step stepper)
| Step | Content |
|---|---|
| 1. Upload | Drag-and-drop or file picker |
| 2. Validating | Spinner + progress |
| 3. Preview | Table with validation status, existing ✅ / new 🟢 ingredient badges |
| 4. Resolve Issues | Inline editing for errors, color-coded cells |
| 5. Confirmation | Summary cards (counts, warnings, errors) |
| 6. Importing | Progress bar → success/failure summary |

### 3.5 Router
```js
{ path: 'products', name: 'Products', component: () => import('../views/ProductsView.vue') }
```

### 3.6 Store — `import.js` (Pinia)
- `uploadedFile`, `validationResult`, `importResult`, `currentStep`, `isLoading`

---

## Phase 4 — Frontend: POS Product Mapping

### 4.1 New View — `ProductMappingView.vue` at `/app/mappings`

**Two-column layout:**
- **Left**: External POS products (unmapped)
- **Right**: mePOS products (recipes) with search

**Features:**
- Search/filter both columns
- Auto-match button with confidence badges (95% green, 82% amber, 61% red)
- Manual mapping: click product → select recipe dropdown
- Bulk mapping: select multiple → assign to one recipe
- Visual indicators: mapped ✅, unmapped ⚠️, new 🆕

**Dashboard sub-tabs:**
- Overview — stat cards
- Mappings — full table
- Unmapped — actions per product (create, ignore, map)
- Validation — completion % + missing list

### 4.2 API Methods — `api/index.js`
```js
getMappings, createMapping, updateMapping, deleteMapping, bulkMap,
autoMatch, getUnmappedProducts, getMappingStats, validateMappings, importPosProducts
```

### 4.3 Router
```js
{ path: 'mappings', name: 'Mappings', component: () => import('../views/ProductMappingView.vue'), meta: { requiresAdmin: true } }
```

### 4.4 Store — `mappings.js` (Pinia)
- `mappings`, `unmappedCount`, `stats`, `filteredList`

---

## Phase 5 — Seed Data

### product_mappings (30+ entries)
- 20 mapped (confidence: 95%, 82%, 61%)
- 10 unmapped
- 5 ignored
- 2 conflicts

### Categories used
- Burgers, Pizzas, Salads, Drinks, Desserts, Fries/Sides

---

## Phase 6 — RBAC & Multi-Tenancy

| Role | Import | Mapping |
|---|---|---|
| admin | Full access | Full access (create, edit, delete, auto-match) |
| manager | View + suggest | View mappings, suggest mappings, cannot delete |
| cook | No access | No access |

- All routes use existing `authMiddleware` + `tenantContextMiddleware`
- All queries scoped by `tenant_id`

---

## Phase 7 — Validation Checklist

- [ ] CSV template downloads as valid UTF-8 Excel-compatible CSV
- [ ] Import validates: missing columns, empty rows, encoding, duplicates, invalid quantities, unknown units
- [ ] Preview shows existing ✅ vs new 🟢 ingredients
- [ ] Transaction rollback on failure
- [ ] Auto-matching uses configurable confidence threshold (default 60%)
- [ ] Sync uses mapped IDs only — never product names
- [ ] Unmapped products block sync with warning
- [ ] Multi-tenancy respected (no data leaks across tenants)
- [ ] RBAC enforced on all import and mapping routes

---

## Dependencies

| Layer | Package |
|---|---|
| Backend | `multer`, `papaparse` |
| Frontend | None (native APIs) |

---

## Estimated Effort

~7–10 days for a single full-stack developer.
