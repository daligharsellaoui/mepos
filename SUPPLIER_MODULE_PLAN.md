# Supplier Management (Fournisseurs) Module — Implementation Plan

## Project Context

- **Backend**: Node.js 20 + Express 4.18 + TypeScript 5.3, raw PostgreSQL (`pg` driver) with in-memory demo fallback
- **Frontend**: Vue 3 + Pinia + Vue Router 4, no external UI library, custom CSS dark theme
- **Database**: All tables scoped by `tenant_id`, raw SQL queries (no ORM)
- **RBAC**: Roles `admin` / `manager` / `cook`. Admin = full access, Manager = operational (no delete), Cook = no access (hide menu entirely)
- **Multi-tenancy**: `tenantId` extracted from JWT, `WHERE tenant_id = $N` on all queries
- **Pattern**: Route (thin controller) -> Service (business logic + DB) -> Database. No repository layer. Dual implementation: PostgreSQL + demo in-memory (`demoDb`).
- **Events**: Global `EventEmitter` singleton (`eventBus`) with 38+ events in `event.service.ts`
- **Notifications**: `notification-dispatcher.ts` listens to events and creates notifications
- **Seed**: Data in `backend/src/seed.ts`

---

## File Inventory

### Files to CREATE:
1. `backend/src/services/supplier.service.ts`
2. `backend/src/routes/suppliers.ts`
3. `frontend/src/stores/suppliers.js`
4. `frontend/src/views/SuppliersView.vue`
5. `frontend/src/views/SupplierDetailsView.vue`
6. `frontend/src/components/suppliers/SupplierForm.vue`
7. `frontend/src/components/suppliers/SupplierCard.vue`

### Files to MODIFY:
1. `backend/src/schema.ts` — Add `suppliers` table + `preferred_supplier_id` on `ingredients`
2. `backend/src/index.ts` — Mount supplier routes
3. `backend/src/services/event.service.ts` — Add 5 new event constants
4. `backend/src/services/notification-dispatcher.ts` — Add 5 event listeners
5. `backend/src/services/inventory.service.ts` — Add `preferred_supplier_id` param to ingredient CRUD
6. `backend/src/seed.ts` — Add realistic supplier seed data, link to ingredients
7. `frontend/src/api/index.js` — Add all supplier endpoint methods
8. `frontend/src/router/index.js` — Add supplier routes
9. `frontend/src/components/layout/Sidebar.vue` — Add nav item
10. `frontend/src/components/layout/MobileNav.vue` — Add nav item
11. `frontend/src/views/SettingsView.vue` — Add supplier dropdown to ingredient forms

---

## STEP 1 — Database Schema (`backend/src/schema.ts`)

### 1a. Add new enum type (near existing enums):

```sql
DO $$ BEGIN
    CREATE TYPE supplier_status AS ENUM ('active', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
```

### 1b. Add `suppliers` table (after existing tables, before indexes):

```sql
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    reference VARCHAR(100),
    tax_number VARCHAR(100),
    registration_number VARCHAR(100),
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    website TEXT,
    address TEXT,
    city VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100),
    payment_terms VARCHAR(100),
    payment_method VARCHAR(100),
    currency VARCHAR(3) DEFAULT 'TND',
    delivery_delay INT DEFAULT 0,
    minimum_order_amount DECIMAL(12, 3) DEFAULT 0,
    notes TEXT,
    status supplier_status NOT NULL DEFAULT 'active',
    preferred BOOLEAN NOT NULL DEFAULT FALSE,
    rating INT DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE
);
```

### 1c. Add `preferred_supplier_id` to `ingredients` table:

Find the `CREATE TABLE IF NOT EXISTS ingredients` statement and add this column (after `conversion_factor`):

```sql
preferred_supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
```

### 1d. Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_id ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_email ON suppliers(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_tenant_name ON suppliers(tenant_id, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_ingredients_preferred_supplier ON ingredients(preferred_supplier_id);
```

---

## STEP 2 — Event Constants (`backend/src/services/event.service.ts`)

Add to the `Events` object:

```typescript
SUPPLIER_CREATED: 'supplier.created',
SUPPLIER_UPDATED: 'supplier.updated',
SUPPLIER_ARCHIVED: 'supplier.archived',
SUPPLIER_RESTORED: 'supplier.restored',
SUPPLIER_DELETED: 'supplier.deleted',
PREFERRED_SUPPLIER_CHANGED: 'supplier.preferred.changed',
```

---

## STEP 3 — Supplier Service (`backend/src/services/supplier.service.ts`)

**Full file to create.** Follow the exact patterns from `inventory.service.ts`:

### Imports:
```typescript
import { query, isDemoMode, demoDb, getClient } from '../database';
import { eventBus, Events } from './event.service';
```

### Pattern for every function:

```typescript
function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}
```

### Functions to implement:

#### `getAllSuppliers(tenantId?, search?, status?, preferred?, country?, sortBy?, sortDir?, page?, perPage?)`
- **Demo mode**: Filter `demoDb.suppliers` by `tenant_id`, then apply search/filter/sort/pagination in memory
- **PG mode**: Build dynamic SQL query with `WHERE tenant_id = $N` and optional filters, `ORDER BY`, `LIMIT/OFFSET`
- Search fields: name, company_name, email, phone, city, tax_number, contact_person
- Return `{ suppliers, total, page, perPage, totalPages }`

#### `getSupplierById(id, tenantId?)`
- **Demo**: Find in `demoDb.suppliers`
- **PG**: `SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2`
- Return supplier with joined stats (ingredients count, last purchase date)

#### `createSupplier(data, tenantId?)`
- Validate required fields: `name`, `email` format, `phone` format
- Check duplicate: same tenant + same name (case-insensitive)
- Check duplicate tax_number if provided
- **Demo**: Push to `demoDb.suppliers`, generate next ID
- **PG**: `INSERT INTO suppliers (...) VALUES (...) RETURNING *`
- Emit `Events.SUPPLIER_CREATED`

#### `updateSupplier(id, data, tenantId?)`
- Same validation as create
- **Demo**: Find index, merge data
- **PG**: Dynamic UPDATE with COALESCE pattern
- Emit `Events.SUPPLIER_UPDATED`
- If `preferred` changed to true, emit `Events.PREFERRED_SUPPLIER_CHANGED`

#### `archiveSupplier(id, tenantId?)`
- Set `status = 'archived'`, `archived_at = CURRENT_TIMESTAMP`
- Emit `Events.SUPPLIER_ARCHIVED`

#### `restoreSupplier(id, tenantId?)`
- Set `status = 'active'`, `archived_at = NULL`
- Emit `Events.SUPPLIER_RESTORED`

#### `deleteSupplier(id, tenantId?)`
- Check if supplier has linked ingredients or purchase history
- **Admin only** — throw error if caller is not admin (caller role passed as param)
- If dependencies exist, return `{ success: false, message, dependencies }`
- **Demo**: Splice from array
- **PG**: `DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2 RETURNING id`
- Emit `Events.SUPPLIER_DELETED`

#### `getSupplierIngredients(id, tenantId?)`
- Return ingredients where `preferred_supplier_id = id`

#### `getSupplierStats(id, tenantId?)`
- Return: total ingredients supplied, active ingredients count, last purchase date, preferred status, rating

---

## STEP 4 — Supplier Routes (`backend/src/routes/suppliers.ts`)

**Full file to create.** Follow exact pattern from `inventory.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware } from './auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import * as supplierService from '../services/supplier.service';

const router = Router();
router.use(authMiddleware);
router.use(tenantContextMiddleware);
```

### Endpoints:

| Method | Path | Handler Logic |
|--------|------|---------------|
| `GET` | `/suppliers` | Extract query params (search, status, preferred, country, sortBy, sortDir, page, perPage). Call `getAllSuppliers` with `req.tenantId` + params. Return `{ status: 'success', ...result }`. |
| `GET` | `/suppliers/:id` | Parse `:id`. Call `getSupplierById`. If null, 404. Return `{ status: 'success', data }`. |
| `POST` | `/suppliers` | Extract body fields. Validate. Call `createSupplier`. Return `{ status: 'success', data }`. Catch errors: 400 for validation, 500 for others. |
| `PUT` | `/suppliers/:id` | Parse `:id`. Extract body. Call `updateSupplier`. 404 if not found. |
| `POST` | `/suppliers/:id/archive` | Parse `:id`. Call `archiveSupplier`. |
| `POST` | `/suppliers/:id/restore` | Parse `:id`. Call `restoreSupplier`. |
| `DELETE` | `/suppliers/:id` | Parse `:id`. Check `req.user.role === 'admin'` else 403. Call `deleteSupplier`. Handle dependency response (409). |
| `GET` | `/suppliers/:id/ingredients` | Parse `:id`. Call `getSupplierIngredients`. |

### Mount in `backend/src/index.ts`:

```typescript
import suppliersRouter from './routes/suppliers';
// ...after other route imports, add:
app.use('/api/v1/suppliers', authMiddleware, tenantContextMiddleware, suppliersRouter);
```

---

## STEP 5 — Notification Dispatcher (`backend/src/services/notification-dispatcher.ts`)

Add these listeners (follow exact style of existing listeners):

| Event | Type | Category | Priority | Title | Message pattern | MinRole |
|-------|------|----------|----------|-------|-----------------|---------|
| `SUPPLIER_CREATED` | success | inventory | low | "Nouveau fournisseur créé" | `{name} a été ajouté aux fournisseurs.` | — |
| `SUPPLIER_UPDATED` | information | inventory | low | "Fournisseur mis à jour" | `{name} a été modifié.` | — |
| `SUPPLIER_ARCHIVED` | warning | inventory | medium | "Fournisseur archivé" | `{name} a été archivé.` | manager |
| `SUPPLIER_RESTORED` | success | inventory | low | "Fournisseur restauré" | `{name} a été restauré.` | — |
| `PREFERRED_SUPPLIER_CHANGED` | information | inventory | medium | "Fournisseur préféré changé" | `{name} est désormais le fournisseur préféré.` | — |

Entity type: `'supplier'`, icon: `'truck'`, color: `'#06b6d4'`

---

## STEP 6 — Modify Ingredient Service (`backend/src/services/inventory.service.ts`)

### `createIngredient`:
- Accept new param `preferred_supplier_id` in data
- Add to INSERT query and demoDb entry

### `updateIngredient`:
- Accept new param `preferred_supplier_id` in data
- Add to UPDATE query
- If changed and new value is set, emit `Events.PREFERRED_SUPPLIER_CHANGED`

### `getAllIngredients`:
- Join with `suppliers` to return `preferred_supplier_name`, `preferred_supplier_company`
- In demo mode, look up supplier from `demoDb.suppliers`

---

## STEP 7 — Seed Data (`backend/src/seed.ts`)

Add realistic Tunisian restaurant suppliers to the seed function:

```typescript
const supplierSeed = [
  { name: 'Fresh Meat Tunisia', company_name: 'Fresh Meat Tunisia SARL', tax_number: '1234567X/A/M/000', city: 'Tunis', country: 'Tunisie', email: 'contact@freshmeat.tn', phone: '+216 71 123 456', contact_person: 'Mohamed Ali Ben Salem', preferred: true, payment_terms: '30 jours' },
  { name: 'SOTUB', company_name: 'Société Tunisienne des Boissons', tax_number: '2345678Y/B/M/001', city: 'Ben Arous', country: 'Tunisie', email: 'commandes@sotub.tn', phone: '+216 71 234 567', contact_person: 'Leila Trabelsi', preferred: true },
  { name: 'Délice Danone', company_name: 'Délice Danone Tunisie', tax_number: '3456789Z/C/M/002', city: 'Mégrine', country: 'Tunisie', email: 'pro@delice.tn', phone: '+216 70 123 456', contact_person: 'Karim Mansour' },
  { name: 'Société des Fromages', company_name: 'Société Tunisienne des Fromages', tax_number: '4567890A/D/M/003', city: 'Sfax', country: 'Tunisie', email: 'info@fromages.tn', phone: '+216 74 123 456', contact_person: 'Sami Ben Ahmed' },
  { name: 'Les Grands Moulins', company_name: 'Les Grands Moulins de Tunis', tax_number: '5678901B/E/M/004', city: 'Tunis', country: 'Tunisie', email: 'commercial@grands-moulins.tn', phone: '+216 71 345 678', contact_person: 'Fatma Belhaj', preferred: true },
  { name: 'Marché Central', company_name: 'Marché Central des Produits Frais', tax_number: '6789012C/F/M/005', city: 'Tunis', country: 'Tunisie', email: 'contact@marchecentral.tn', phone: '+216 71 456 789', contact_person: 'Hichem Garbouj' },
  { name: 'Tunisie Légumes', company_name: 'Tunisie Légumes SARL', tax_number: '7890123D/G/M/006', city: 'Nabeul', country: 'Tunisie', email: 'ventes@tunisie-legumes.tn', phone: '+216 72 123 456', contact_person: 'Nadia Mejri' },
  { name: 'Fresh Seafood Tunisia', company_name: 'Fresh Seafood Tunisia SARL', tax_number: '8901234E/H/M/007', city: 'La Goulette', country: 'Tunisie', email: 'order@freshseafood.tn', phone: '+216 71 567 890', contact_person: 'Amine Khelil' },
  { name: 'Coffee Solutions', company_name: 'Coffee Solutions Tunisie', tax_number: '9012345F/I/M/008', city: 'Tunis', country: 'Tunisie', email: 'pro@coffee-solutions.tn', phone: '+216 70 234 567', contact_person: 'Selma Ben Ali' },
  { name: 'Mediterranean Foods', company_name: 'Mediterranean Foods Group', tax_number: '0123456G/J/M/009', city: 'Sousse', country: 'Tunisie', email: 'info@med-foods.tn', phone: '+216 73 123 456', contact_person: 'Mehdi Youssef' },
];
```

Link some ingredients to preferred suppliers (e.g., "Fresh Meat Tunisia" -> meat ingredients, "Délice Danone" -> dairy, etc.).

Seed both PG and demo modes.

---

## STEP 8 — Frontend API (`frontend/src/api/index.js`)

Add to the `api` object:

```javascript
// Suppliers
getSuppliers: (params) => client.get('/suppliers', { params }),
getSupplier: (id) => client.get(`/suppliers/${id}`),
createSupplier: (data) => client.post('/suppliers', data),
updateSupplier: (id, data) => client.put(`/suppliers/${id}`, data),
archiveSupplier: (id) => client.post(`/suppliers/${id}/archive`),
restoreSupplier: (id) => client.post(`/suppliers/${id}/restore`),
deleteSupplier: (id) => client.delete(`/suppliers/${id}`),
getSupplierIngredients: (id) => client.get(`/suppliers/${id}/ingredients`),
```

---

## STEP 9 — Pinia Store (`frontend/src/stores/suppliers.js`)

```javascript
import { defineStore } from 'pinia'
import { api } from '../api'

export const useSupplierStore = defineStore('suppliers', () => {
  const suppliers = ref([])
  const currentSupplier = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Search / filter / sort state
  const search = ref('')
  const statusFilter = ref('active')
  const preferredFilter = ref(null)
  const countryFilter = ref('')
  const sortBy = ref('name')
  const sortDir = ref('asc')
  const page = ref(1)
  const perPage = ref(10)
  const total = ref(0)

  // Computed: filtered + sorted + paginated (client-side, matching existing pattern)
  const filteredSuppliers = computed(() => { /* filter by search, status, preferred, country */ })
  const paginatedSuppliers = computed(() => { /* slice per page */ })
  const totalPages = computed(() => Math.ceil(total.value / perPage.value))

  async function fetchSuppliers() { /* api.getSuppliers(params) */ }
  async function fetchSupplier(id) { /* api.getSupplier(id) */ }
  async function createSupplier(data) { /* api.createSupplier(data) + fetchSuppliers */ }
  async function updateSupplier(id, data) { /* api.updateSupplier(id, data) */ }
  async function archiveSupplier(id) { /* api.archiveSupplier(id) + fetchSuppliers */ }
  async function restoreSupplier(id) { /* api.restoreSupplier(id) + fetchSuppliers */ }
  async function deleteSupplier(id) { /* api.deleteSupplier(id) + fetchSuppliers */ }
  async function fetchSupplierIngredients(id) { /* api.getSupplierIngredients(id) */ }

  return {
    suppliers, currentSupplier, loading, error,
    search, statusFilter, preferredFilter, countryFilter,
    sortBy, sortDir, page, perPage, total,
    filteredSuppliers, paginatedSuppliers, totalPages,
    fetchSuppliers, fetchSupplier, createSupplier, updateSupplier,
    archiveSupplier, restoreService, deleteSupplier, fetchSupplierIngredients
  }
})
```

---

## STEP 10 — Router (`frontend/src/router/index.js`)

Add under the `/app` children:

```javascript
{
  path: 'suppliers',
  name: 'Suppliers',
  component: () => import('../views/SuppliersView.vue'),
  meta: { requiresAuth: true }
},
{
  path: 'suppliers/:id',
  name: 'SupplierDetails',
  component: () => import('../views/SupplierDetailsView.vue'),
  meta: { requiresAuth: true }
},
```

No `requiresAdmin` — admin and manager can access. Cooks are blocked via menu hiding + route guard.

---

## STEP 11 — Sidebar & MobileNav

### `Sidebar.vue`:

Add nav item between `inventory` and `recipes`:

```javascript
{ path: '/app/suppliers', label: 'Fournisseurs', icon: 'suppliers' },
```

Add SVG icon for `suppliers` (truck or building icon). SVG path example for building:

```html
<svg ...><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11h16V10M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
```

The item should be visible to admin and manager only (not cook). Add in the `visibleItems` computed filter:

```javascript
if (item.label === 'Fournisseurs') return auth.user?.role !== 'cook'
```

### `MobileNav.vue`:
Same nav item addition following existing mobile nav patterns.

---

## STEP 12 — SuppliersView.vue (`frontend/src/views/SuppliersView.vue`)

Full Vue component. Follow the exact patterns from `SettingsView.vue` (ingredients table) and `InventoryView.vue`.

### Template structure:
```html
<PageContainer title="Fournisseurs" subtitle="Gérez vos fournisseurs">
  <template #actions>
    <button class="touch-btn" @click="openCreateModal">+ Nouveau Fournisseur</button>
  </template>
</PageContainer>

<!-- Search + Filters -->
<ActionToolbar v-model:search="store.search" placeholder="Rechercher un fournisseur...">
  <select v-model="store.statusFilter"><option value="">Tous</option><option value="active">Actif</option><option value="archived">Archivé</option></select>
  <select v-model="store.preferredFilter"><option value="">Tous</option><option value="true">Préféré</option><option value="false">Non préféré</option></select>
  <select v-model="store.countryFilter"><option value="">Tous pays</option><option value="Tunisie">Tunisie</option></select>
</ActionToolbar>

<!-- Table -->
<div class="table-wrapper" v-if="!store.loading && store.paginatedSuppliers.length">
  <table class="mepos-table">
    <thead>...</thead>
    <tbody>
      <tr v-for="s in store.paginatedSuppliers" :key="s.id" @click="viewDetails(s.id)" style="cursor:pointer">
        <td data-label="Fournisseur">{{ s.name }}<br><small>{{ s.company_name }}</small></td>
        <td data-label="Contact">{{ s.contact_person }}</td>
        <td data-label="Téléphone">{{ s.phone }}</td>
        <td data-label="Email">{{ s.email }}</td>
        <td data-label="Ville">{{ s.city }}</td>
        <td data-label="Préféré"><Badge v-if="s.preferred" variant="success" size="sm">Préféré</Badge></td>
        <td data-label="Statut"><Badge :variant="s.status === 'active' ? 'success' : 'neutral'" size="sm">{{ s.status === 'active' ? 'Actif' : 'Archivé' }}</Badge></td>
        <td data-label="Ingrédients">{{ s.ingredients_count || 0 }}</td>
        <td data-label="Dernier achat">{{ s.last_purchase_date || '—' }}</td>
        <td data-label="Actions" @click.stop>
          <RowActionMenu :items="rowActions(s)" />
        </td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Pagination -->
<div class="pagination-bar" v-if="store.totalPages > 1">...</div>

<!-- Empty state -->
<EmptyState v-else-if="!store.loading" title="Aucun fournisseur" description="..." />

<!-- Loading -->
<Skeleton v-if="store.loading" />

<!-- Create/Edit Modal -->
<SupplierForm :is-open="showForm" :supplier="editingSupplier" @close="closeForm" @saved="onSaved" />
```

### Script:
- Use `useSupplierStore()`, `useAuthStore()`, inject `addToast`
- `openCreateModal()`, `editSupplier(s)`, `archiveSupplier(s)`, `restoreSupplier(s)`, `deleteSupplier(s)`, `viewDetails(id)`
- `rowActions(s)` returns array of action objects:
  ```javascript
  [
    { label: 'Modifier', icon: 'edit', action: () => editSupplier(s) },
    { label: s.status === 'archived' ? 'Restaurer' : 'Archiver', icon: s.status === 'archived' ? 'refresh' : 'archive', action: () => s.status === 'archived' ? restoreSupplier(s) : archiveSupplier(s) },
    { label: 'Voir ingrédients', icon: 'list', action: () => viewIngredients(s) },
    { label: 'Détails', icon: 'eye', action: () => viewDetails(s.id) },
    { label: 'Supprimer', icon: 'trash', action: () => deleteSupplier(s), danger: true, hidden: !auth.isAdmin },
  ]
  ```

---

## STEP 13 — SupplierDetailsView.vue (`frontend/src/views/SupplierDetailsView.vue`)

### Template structure:
```html
<PageContainer>
  <template #title>
    <div style="display:flex;align-items:center;gap:0.75rem">
      <span>{{ supplier.name }}</span>
      <Badge v-if="supplier.preferred" variant="success" size="sm">Préféré</Badge>
      <Badge :variant="supplier.status === 'active' ? 'success' : 'neutral'" size="sm">{{ supplier.status === 'active' ? 'Actif' : 'Archivé' }}</Badge>
    </div>
  </template>
  <template #actions>
    <button class="touch-btn" @click="editSupplier">Modifier</button>
    <button class="touch-btn touch-btn-secondary" @click="archiveSupplier">{{ supplier.status === 'archived' ? 'Restaurer' : 'Archiver' }}</button>
    <button v-if="auth.isAdmin" class="touch-btn touch-btn-danger" @click="deleteSupplier">Supprimer</button>
  </template>
</PageContainer>

<div class="details-grid">
  <Card title="Informations société">
    <p><strong>Nom:</strong> {{ supplier.name }}</p>
    <p><strong>Société:</strong> {{ supplier.company_name }}</p>
    <p><strong>Référence:</strong> {{ supplier.reference }}</p>
    <p><strong>Matricule fiscal:</strong> {{ supplier.tax_number }}</p>
    <p><strong>Registre de commerce:</strong> {{ supplier.registration_number }}</p>
    <p><strong>Site web:</strong> {{ supplier.website }}</p>
  </Card>

  <Card title="Contact">
    <p><strong>Personne contact:</strong> {{ supplier.contact_person }}</p>
    <p><strong>Email:</strong> {{ supplier.email }}</p>
    <p><strong>Téléphone:</strong> {{ supplier.phone }}</p>
    <p><strong>Mobile:</strong> {{ supplier.mobile }}</p>
  </Card>

  <Card title="Adresse">
    <p>{{ supplier.address }}, {{ supplier.city }}, {{ supplier.postal_code }}, {{ supplier.country }}</p>
  </Card>

  <Card title="Statistiques">
    <div class="metric-card"><span class="metric-title">Ingrédients fournis</span><span class="metric-value">{{ stats.ingredients_count }}</span></div>
    <div class="metric-card"><span class="metric-title">Fréquence d'achat</span><span class="metric-value">{{ stats.purchase_frequency || '—' }}</span></div>
    <div class="metric-card"><span class="metric-title">Valeur moyenne</span><span class="metric-value">{{ stats.avg_purchase_value || '—' }}</span></div>
    <div class="metric-card"><span class="metric-title">Dernière livraison</span><span class="metric-value">{{ stats.last_delivery || '—' }}</span></div>
    <div class="metric-card"><span class="metric-title">Ingrédients actifs</span><span class="metric-value">{{ stats.active_ingredients }}</span></div>
    <div class="metric-card"><span class="metric-title">Évaluation</span><span class="metric-value">{{ supplier.rating || '—' }}/5</span></div>
  </Card>

  <Card title="Ingrédients fournis">
    <table class="mepos-table" v-if="ingredients.length">
      <thead><tr><th>Ingrédient</th><th>Unité</th><th>Statut</th></tr></thead>
      <tbody>
        <tr v-for="ing in ingredients" :key="ing.id">
          <td>{{ ing.name }}</td>
          <td>{{ ing.unit }}</td>
          <td><Badge :variant="ing.status === 'active' ? 'success' : 'neutral'">{{ ing.status }}</Badge></td>
        </tr>
      </tbody>
    </table>
  </Card>

  <Card title="Notes" v-if="supplier.notes">
    <p>{{ supplier.notes }}</p>
  </Card>

  <Card title="Historique des achats" class="placeholder-card">
    <p class="text-muted">Fonctionnalité à venir — Les achats seront associés aux fournisseurs dans une version future.</p>
  </Card>

  <Card title="Livraisons récentes" class="placeholder-card">
    <p class="text-muted">Fonctionnalité à venir — Suivi des livraisons à implémenter.</p>
  </Card>
</div>

<SupplierForm :is-open="showForm" :supplier="editingSupplier" @close="closeForm" @saved="refresh" />
```

### Data flow:
- `onMounted` -> `fetchSupplier(route.params.id)` + `fetchSupplierIngredients(route.params.id)`
- Watch route param for navigation between suppliers

---

## STEP 14 — SupplierForm.vue (`frontend/src/components/suppliers/SupplierForm.vue`)

Use `<Modal>` component. Follow the exact modal pattern from the codebase.

### Props:
- `isOpen` (Boolean)
- `supplier` (Object, null for create mode)

### Emits:
- `close`
- `saved`

### Template sections inside modal:

```html
<Modal :is-open="isOpen" :title="supplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'" max-width="640px" @close="$emit('close')">
  <div class="form-grid">
    <!-- Company Info Section -->
    <h3 class="form-section-title">Informations société</h3>
    <div class="form-group"><label class="form-label">Nom *</label><input class="form-input" v-model="form.name" /></div>
    <div class="form-group"><label class="form-label">Société</label><input class="form-input" v-model="form.company_name" /></div>
    <div class="form-group"><label class="form-label">Référence</label><input class="form-input" v-model="form.reference" /></div>
    <div class="form-group"><label class="form-label">Matricule fiscal</label><input class="form-input" v-model="form.tax_number" /></div>
    <div class="form-group"><label class="form-label">Registre de commerce</label><input class="form-input" v-model="form.registration_number" /></div>
    <div class="form-group"><label class="form-label">Site web</label><input class="form-input" v-model="form.website" /></div>

    <!-- Contact Section -->
    <h3 class="form-section-title">Contact</h3>
    <div class="form-group"><label class="form-label">Personne contact</label><input class="form-input" v-model="form.contact_person" /></div>
    <div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" v-model="form.email" /></div>
    <div class="form-group"><label class="form-label">Téléphone</label><input class="form-input" v-model="form.phone" /></div>
    <div class="form-group"><label class="form-label">Mobile</label><input class="form-input" v-model="form.mobile" /></div>

    <!-- Address Section -->
    <h3 class="form-section-title">Adresse</h3>
    <div class="form-group"><label class="form-label">Adresse</label><textarea class="form-input" v-model="form.address"></textarea></div>
    <div class="form-group"><label class="form-label">Ville</label><input class="form-input" v-model="form.city" /></div>
    <div class="form-group"><label class="form-label">Code postal</label><input class="form-input" v-model="form.postal_code" /></div>
    <div class="form-group"><label class="form-label">Pays</label><input class="form-input" v-model="form.country" /></div>

    <!-- Payment Section -->
    <h3 class="form-section-title">Paiement</h3>
    <div class="form-group"><label class="form-label">Conditions de paiement</label><input class="form-input" v-model="form.payment_terms" /></div>
    <div class="form-group"><label class="form-label">Méthode de paiement</label><input class="form-input" v-model="form.payment_method" /></div>
    <div class="form-group"><label class="form-label">Devise</label>
      <select class="form-select" v-model="form.currency">
        <option value="TND">TND</option><option value="EUR">EUR</option><option value="USD">USD</option>
      </select>
    </div>

    <!-- Logistics Section -->
    <h3 class="form-section-title">Logistique</h3>
    <div class="form-group"><label class="form-label">Délai de livraison (jours)</label><input class="form-input" type="number" v-model.number="form.delivery_delay" /></div>
    <div class="form-group"><label class="form-label">Montant minimum de commande</label><input class="form-input" type="number" step="0.001" v-model.number="form.minimum_order_amount" /></div>

    <!-- Notes & Preferences -->
    <h3 class="form-section-title">Notes</h3>
    <div class="form-group"><label class="form-label">Notes</label><textarea class="form-input" rows="3" v-model="form.notes"></textarea></div>
    <div class="form-group" style="flex-direction:row;align-items:center;gap:0.75rem">
      <input type="checkbox" v-model="form.preferred" id="preferred" />
      <label for="preferred">Fournisseur préféré</label>
    </div>
    <div class="form-group"><label class="form-label">Évaluation (1-5)</label>
      <select class="form-select" v-model.number="form.rating"><option :value="0">—</option><option v-for="n in 5" :key="n" :value="n">{{ n }}</option></select>
    </div>
  </div>

  <div v-if="formError" class="alert-banner alert-banner-danger">{{ formError }}</div>

  <template #footer>
    <button class="touch-btn touch-btn-secondary" @click="$emit('close')">Annuler</button>
    <button class="touch-btn" :disabled="saving" @click="submit">{{ supplier ? 'Enregistrer' : 'Créer' }}</button>
  </template>
</Modal>
```

### Validation:
- `name`: required
- `email`: optional, regex validation if provided
- `phone`: optional, regex validation if provided
- Duplicate name check: on submit, API returns error -> display in `formError`

### Submit:
- Calls `store.createSupplier(form)` or `store.updateSupplier(supplier.id, form)`
- On success: emit 'saved', show toast
- On error: show `formError` in alert banner

---

## STEP 15 — SupplierCard.vue (`frontend/src/components/suppliers/SupplierCard.vue`)

Reusable card for displaying supplier summary. Props: `supplier`, `compact` (boolean).

```html
<div class="glass-panel supplier-card" :class="{ compact }">
  <div class="supplier-card-header">
    <div>
      <span class="supplier-name">{{ supplier.name }}</span>
      <span v-if="supplier.company_name" class="supplier-company">{{ supplier.company_name }}</span>
    </div>
    <Badge v-if="supplier.preferred" variant="success" size="sm">Préféré</Badge>
    <Badge :variant="supplier.status === 'active' ? 'success' : 'neutral'" size="sm">{{ supplier.status === 'active' ? 'Actif' : 'Archivé' }}</Badge>
  </div>
  <div class="supplier-card-body" v-if="!compact">
    <p v-if="supplier.contact_person"><strong>Contact:</strong> {{ supplier.contact_person }}</p>
    <p v-if="supplier.email"><strong>Email:</strong> {{ supplier.email }}</p>
    <p v-if="supplier.phone"><strong>Tél:</strong> {{ supplier.phone }}</p>
    <p v-if="supplier.city"><strong>Ville:</strong> {{ supplier.city }}</p>
  </div>
</div>
```

---

## STEP 16 — Ingredient Integration (`frontend/src/views/SettingsView.vue`)

### 16a. In the ingredients tab, modify the create/edit form:

Add a searchable supplier dropdown after existing fields:

```html
<div class="form-group">
  <label class="form-label">Fournisseur préféré</label>
  <div class="supplier-select-wrapper">
    <input
      class="form-input"
      placeholder="Rechercher un fournisseur..."
      v-model="supplierSearch"
      @input="filterSuppliers"
      @focus="showSupplierDropdown = true"
    />
    <div v-if="showSupplierDropdown && filteredSuppliers.length" class="supplier-dropdown">
      <div
        v-for="s in filteredSuppliers"
        :key="s.id"
        class="supplier-dropdown-item"
        :class="{ selected: form.preferred_supplier_id === s.id }"
        @click="selectSupplier(s)"
      >
        <span>{{ s.name }}</span>
        <small>{{ s.company_name }}</small>
        <Badge v-if="s.status === 'archived'" variant="warning" size="sm">Archivé</Badge>
      </div>
    </div>
    <div v-if="form.preferred_supplier_id" class="supplier-selected">
      <span>{{ selectedSupplierName }}</span>
      <button @click="clearSupplier">✕</button>
    </div>
  </div>
</div>
```

### 16b. Load suppliers on mount:
```javascript
import { useSupplierStore } from '../../stores/suppliers'
const supplierStore = useSupplierStore()
onMounted(() => { supplierStore.fetchSuppliers() })
```

### 16c. In the ingredient table columns, add a "Fournisseur" column:

```html
<th class="sortable-th" @click="toggleIngSort('supplier')">
  Fournisseur {{ sortIcon('supplier') }}
</th>
<td data-label="Fournisseur">{{ ingredient.preferred_supplier_name || '—' }}</td>
```

### 16d. Pass `preferred_supplier_id` in create/update API calls:

```javascript
api.createIngredient({
  ...form,
  preferred_supplier_id: form.preferred_supplier_id || null
})
```

---

## STEP 17 — Styles

Add to `frontend/src/styles/index.css`:

```css
/* Supplier card */
.supplier-card { padding: 1.25rem; }
.supplier-card.compact { padding: 0.75rem; }
.supplier-card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.supplier-name { font-weight: 600; color: var(--text-primary); }
.supplier-company { display: block; font-size: 0.8rem; color: var(--text-secondary); }

/* Supplier select dropdown */
.supplier-select-wrapper { position: relative; }
.supplier-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 100;
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: var(--radius-md); max-height: 200px; overflow-y: auto;
  margin-top: 4px;
}
.supplier-dropdown-item {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.625rem 0.75rem; cursor: pointer;
}
.supplier-dropdown-item:hover, .supplier-dropdown-item.selected { background: rgba(99,102,241,0.1); }
.supplier-dropdown-item small { color: var(--text-muted); font-size: 0.75rem; }
.supplier-selected {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.375rem 0.75rem; background: rgba(99,102,241,0.1);
  border-radius: var(--radius-sm); margin-top: 4px;
}
.supplier-selected button { background: none; border: none; color: var(--text-muted); cursor: pointer; }

/* Detail grid */
.details-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1rem; padding: 1.25rem;
}
.details-grid .card, .details-grid .glass-panel {
  padding: 1.25rem;
}
.details-grid .metric-card { margin-bottom: 0.75rem; }
.details-grid .placeholder-card { opacity: 0.6; }
.form-section-title {
  grid-column: 1 / -1; font-size: 0.85rem; font-weight: 600;
  color: var(--text-secondary); text-transform: uppercase;
  letter-spacing: 0.05em; margin: 0.5rem 0;
}
.form-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;
}
.form-grid .form-group:has(textarea),
.form-grid .form-section-title { grid-column: 1 / -1; }
```

---

## STEP 18 — Validation Summary

| Field | Rule | Error Message |
|-------|------|--------------|
| name | Required | "Le nom du fournisseur est requis." |
| email | Optional, valid format | "L'email n'est pas valide." |
| phone | Optional, valid format | "Le numéro de téléphone n'est pas valide." |
| name + tenant | Unique (case-insensitive) | "Un fournisseur avec ce nom existe déjà." |
| tax_number + tenant | Unique if provided | "Ce matricule fiscal est déjà utilisé." |
| rating | 0-5 integer | — |
| minimum_order_amount | Positive number | — |
| delivery_delay | Non-negative integer | — |

---

## Execution Order

1. Backend schema (`schema.ts`) — add enum, table, column, indexes
2. Backend events (`event.service.ts`) — add constants
3. Backend service (`supplier.service.ts`) — full CRUD
4. Backend routes (`suppliers.ts`) — HTTP endpoints
5. Backend index (`index.ts`) — mount routes
6. Backend notification dispatcher — add listeners
7. Backend inventory service — add `preferred_supplier_id`
8. Backend seed — add supplier data
9. Frontend API (`api/index.js`) — add methods
10. Frontend store (`stores/suppliers.js`)
11. Frontend router — add routes
12. Frontend sidebar + mobile nav — add nav items
13. Frontend `SupplierForm.vue` component
14. Frontend `SupplierCard.vue` component
15. Frontend `SuppliersView.vue` page
16. Frontend `SupplierDetailsView.vue` page
17. Frontend `SettingsView.vue` — ingredient supplier dropdown
18. Frontend styles — add CSS classes
