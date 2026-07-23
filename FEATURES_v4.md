# mePOS Stock v4.0 — Inventory ERP Features

> **Version:** 4.0.0
> **Release date:** July 23, 2026

---

## 1. Procurement Module

### Purchase Orders

Full purchase order lifecycle with status tracking:

| Status | Description |
|--------|-------------|
| `draft` | Initial editable state |
| `pending_approval` | Submitted for manager/admin approval |
| `approved` | Approved and ready to order |
| `ordered` | Sent to supplier |
| `partially_received` | Some items received, others pending |
| `received` | All items received |
| `cancelled` | Cancelled before full receipt |
| `closed` | Fully processed |

**PO structure:**
- Header: supplier, warehouse, order date, expected delivery, currency, notes
- Lines: ingredient, ordered/received/rejected/damaged qty, purchase/inventory unit, conversion ratio, unit price, discount, tax, line total
- Auto-calculated totals: subtotal, discount, tax, grand total
- Auto-generated reference numbers (`PO-{tenant}-{YYYYMMDD}-{NNN}`)

**API endpoints:**

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/v1/purchases` | List POs (filtered, paginated) |
| `GET` | `/api/v1/purchases/:id` | Get PO with items |
| `POST` | `/api/v1/purchases` | Create PO |
| `PUT` | `/api/v1/purchases/:id` | Update PO (draft only) |
| `POST` | `/api/v1/purchases/:id/submit` | Submit for approval |
| `POST` | `/api/v1/purchases/:id/approve` | Approve PO |
| `POST` | `/api/v1/purchases/:id/reject` | Reject PO |
| `POST` | `/api/v1/purchases/:id/cancel` | Cancel PO |
| `POST` | `/api/v1/purchases/:id/close` | Close PO |
| `DELETE` | `/api/v1/purchases/:id` | Delete PO (draft, admin) |

### Goods Reception

- Receive goods against purchase orders
- Partial receptions supported (multiple receptions per PO)
- Rejected and damaged quantity tracking
- Automatic batch creation on reception
- Updates stock levels and PO status
- Auto-generates batch numbers (`BATCH-{tenant}-{ingredient}-{YYYYMMDD}-{NNN}`)

**API endpoints:**

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/v1/receptions` | List receptions |
| `GET` | `/api/v1/receptions/:id` | Get reception with items |
| `POST` | `/api/v1/receptions` | Create reception |

### Supplier Invoices

- Link invoices to POs and receptions
- Status tracking: pending, paid, overdue, cancelled
- Amount, tax, due date tracking

### Purchase Returns

- Return goods to supplier
- Links to original PO, reception, and specific batches
- Quantity, unit price, total amount tracking

---

## 2. Batch & Expiration Management

### Inventory Batches

- Each reception creates one or more batches
- Batch number, ingredient, supplier, PO, warehouse tracking
- Initial and remaining quantity tracking
- Unit price and total cost per batch
- Manufacturing date and expiration date
- Storage location
- Status: `active`, `partially_consumed`, `consumed`, `expired`, `discarded`, `transferred`, `adjusted`

### Batch Operations

| Operation | Description |
|-----------|-------------|
| **Consume** | Deduct quantity from batch (FEFO/FIFO) |
| **Transfer** | Move batch between warehouses |
| **Split** | Divide a batch into two |
| **Adjust** | Correct batch quantity |
| **Discard** | Remove batch (spoilage, damage) |
| **Expire** | Auto-mark past-expiration batches |

### FEFO / FIFO Consumption Strategy

- **FEFO** (default): Consume nearest-expiration batches first
- **FIFO**: Consume oldest batches first
- Configurable per tenant via `tenant_settings` → `inventory.consumption_strategy`

### Expiration Dashboard

- Expiring Today / This Week / Expired counts
- Inventory Value at Risk (TND)
- Automatic batch expiration
- `BATCH_EXPIRED` event + critical notifications

**API endpoints:**

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/v1/batches` | List batches (filtered, paginated) |
| `GET` | `/api/v1/batches/expiring` | Expiration dashboard data |
| `GET` | `/api/v1/batches/:id` | Get batch details + movements |
| `GET` | `/api/v1/batches/:id/movements` | Batch movement history |
| `POST` | `/api/v1/batches/:id/consume` | Consume from batch |
| `POST` | `/api/v1/batches/:id/transfer` | Transfer batch |
| `POST` | `/api/v1/batches/:id/split` | Split batch |
| `POST` | `/api/v1/batches/:id/adjust` | Adjust batch quantity |
| `POST` | `/api/v1/batches/:id/discard` | Discard batch |
| `POST` | `/api/v1/batches/expire-now` | Trigger expiration check |

---

## 3. Physical Inventory Counts

### Count Sessions

- Track physical inventory counting cycles
- Auto-populate expected quantities from current stock
- Status: `draft` → `in_progress` → `completed` → `approved` → `cancelled`

### Count Items

- Ingredient, expected quantity, actual quantity
- Difference automatically computed (stored generated column)
- Reason codes for discrepancies
- Notes per item

### Approval & Adjustment

- Approval creates inventory adjustments for each discrepancy
- Automatically updates stock levels to actual quantities
- Logs stock movements (type: `reconciliation`)
- Generates Activity Journal entries for audit trail

### Discrepancies Report

- Filtered view of items with non-zero differences
- Sorted by absolute difference (largest first)

**API endpoints:**

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/v1/inventory-counts` | List sessions |
| `GET` | `/api/v1/inventory-counts/:id` | Get session with items |
| `GET` | `/api/v1/inventory-counts/:id/discrepancies` | Discrepancies report |
| `POST` | `/api/v1/inventory-counts` | Create session |
| `PUT` | `/api/v1/inventory-counts/items/:itemId` | Update count item |
| `POST` | `/api/v1/inventory-counts/:id/start` | Start counting |
| `POST` | `/api/v1/inventory-counts/:id/complete` | Complete counting |
| `POST` | `/api/v1/inventory-counts/:id/approve` | Approve + adjust stock |
| `POST` | `/api/v1/inventory-counts/:id/cancel` | Cancel session |

---

## 4. Price History & Cost Analytics

### Ingredient Price History

- Append-only price tracking — never overwrites historical data
- Records: unit price, supplier, PO reference, quantity, date, source
- Source types: `manual`, `purchase`, `import`, `adjustment`

### Cost Analytics per Ingredient

| Metric | Description |
|--------|-------------|
| Current Cost | Latest purchase price per unit |
| Average Cost | Mean of all historical prices |
| Last Purchase | Most recent purchase details |
| Previous Purchase | Second-most recent purchase |
| Min / Max Cost | Price range |
| Cost Evolution | Last 12 price points (for chart) |
| Supplier Comparison | Prices grouped by supplier |
| Purchase Timeline | Last 20 purchases with prices |

### Supplier-Ingredient Pricing

- Per-supplier pricing via `supplier_ingredients` junction table
- Supplier SKU, unit price, minimum order quantity, lead time
- Preferred supplier flagging

**API endpoints:**

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/api/v1/price-history/ingredients/:id/history` | Price history |
| `GET` | `/api/v1/price-history/ingredients/:id/analytics` | Cost analytics |
| `POST` | `/api/v1/price-history/ingredients/:id/record` | Record price |
| `GET` | `/api/v1/price-history/suppliers/:id/comparison` | Supplier comparison |
| `GET` | `/api/v1/price-history/suppliers/:id/ingredients` | Supplier-ingredient links |
| `POST` | `/api/v1/price-history/supplier-ingredients` | Link ingredient to supplier |
| `DELETE` | `/api/v1/price-history/supplier-ingredients` | Unlink ingredient |

---

## 5. Event System — New Events

### Purchase Order Events
| Event | Trigger |
|-------|---------|
| `purchase.order.created` | PO created |
| `purchase.order.updated` | PO updated (draft) |
| `purchase.order.submitted` | PO submitted for approval |
| `purchase.order.approved` | PO approved |
| `purchase.order.rejected` | PO rejected |
| `purchase.order.cancelled` | PO cancelled |
| `purchase.order.closed` | PO closed |

### Goods Reception Events
| Event | Trigger |
|-------|---------|
| `goods.received` | Full goods reception completed |
| `goods.partially.received` | Partial reception |
| `goods.rejected` | Quantities rejected during reception |
| `goods.damaged` | Damaged quantities reported |

### Batch Events
| Event | Trigger |
|-------|---------|
| `batch.created` | Batch created (via reception) |
| `batch.transferred` | Batch transferred between warehouses |
| `batch.consumed` | Batch quantity consumed |
| `batch.split` | Batch split into two |
| `batch.merged` | Batches merged |
| `batch.adjusted` | Batch quantity adjusted |
| `batch.expired` | Batch passed expiration |
| `batch.discarded` | Batch discarded |

### Inventory Count Events
| Event | Trigger |
|-------|---------|
| `inventory.count.created` | Count session created |
| `inventory.count.started` | Counting started |
| `inventory.count.completed` | Counting completed |
| `inventory.count.approved` | Count approved, adjustments applied |
| `inventory.count.cancelled` | Count cancelled |

### Price & Analytics Events
| Event | Trigger |
|-------|---------|
| `price.changed` | Ingredient price recorded |
| `price.trend.alert` | Significant price trend detected |
| `purchase.recommendation.generated` | Auto-generated purchase suggestion |
| `supplier.performance.changed` | Supplier performance score updated |

### Purchase Return Events
| Event | Trigger |
|-------|---------|
| `purchase.return.created` | Return initiated |
| `purchase.return.completed` | Return finalized |

---

## 6. Notification System — New Notifications

| Event | Notification | Priority | Recipients |
|-------|-------------|----------|------------|
| `purchase.order.submitted` | Purchase awaiting approval | high | admin, manager |
| `purchase.order.approved` | Purchase approved | medium | requester |
| `purchase.order.rejected` | Purchase rejected | medium | requester |
| `goods.received` | Goods received | medium | admin, manager |
| `goods.partially.received` | Partial reception | medium | admin, manager |
| `batch.expired` | Batch expired | critical | admin |
| `batch.created` | New batch created | low | all |
| `inventory.count.completed` | Count ready for approval | medium | admin, manager |
| `inventory.count.approved` | Count approved, stock adjusted | medium | admin, manager |
| `price.changed` | Ingredient price updated | low | all |
| `purchase.recommendation` | Reorder suggested | low | manager, admin |

---

## 7. Frontend — New Views

### Purchase Orders (`/app/purchases`)

- Table with reference, supplier, warehouse, date, status, total
- Status badges with color coding (draft → pending → approved → received → closed)
- Full lifecycle actions (submit, approve, reject, cancel, close, delete)
- Create/edit modal with line item management
- Automatic total calculation (subtotal, discount, tax, grand total)
- Pagination and filtering

### Batch Management (`/app/batches`)

- Expiration dashboard widget (4 metric cards)
- Filterable batch table (ingredient, warehouse, status, expiry window)
- Detail drawer with batch info and movement timeline
- Modal operations: consume, transfer, split, adjust, discard
- Confirm dialogs for destructive actions

### Inventory Counts (`/app/inventory-counts`)

- Count session list with status, warehouse, date
- Inline editing of count items (actual quantity, reason)
- Lifecycle flow: create → start → complete → approve
- Approval creates automatic stock adjustments
- Discrepancies report modal
- Create session auto-populates from current stock

---

## 8. Technical Architecture

### Database (10 new tables)

All tables follow multi-tenancy pattern with `tenant_id`, RLS policies, and optimized indexes.

| Table | Records | Key Indexes |
|-------|---------|-------------|
| `purchase_orders` | PO headers | tenant + status, tenant + supplier, tenant + date |
| `purchase_order_items` | PO line items | PO ID, ingredient ID |
| `goods_receptions` | Reception headers | tenant, PO ID, date |
| `goods_reception_items` | Reception lines | reception ID, PO item ID |
| `supplier_invoices` | Invoices | tenant, supplier |
| `inventory_batches` | Stock batches | tenant + ingredient, batch number (unique), expiry |
| `batch_movements` | Batch transactions | batch ID, ingredient, type |
| `inventory_counts` | Count sessions | tenant + warehouse, status, date |
| `inventory_count_items` | Count lines | session ID, ingredient |
| `inventory_adjustments` | Stock corrections | session ID, ingredient |
| `ingredient_price_history` | Cost history | tenant + ingredient, date, supplier |
| `supplier_ingredients` | Supplier pricing | tenant + supplier + ingredient (unique) |
| `purchase_returns` | Return headers | tenant, supplier, PO |
| `purchase_return_items` | Return lines | return ID, batch |

### Backend Services

| Service | Lines | Key Pattern |
|---------|-------|-------------|
| `purchase.service.ts` | ~750 | Transactional PO CRUD with status workflow |
| `reception.service.ts` | ~500 | Stock updates + batch creation in one transaction |
| `batch.service.ts` | ~1000 | FEFO/FIFO algorithm, batch lifecycle |
| `inventory-count.service.ts` | ~600 | Session management with approval adjustments |
| `price-history.service.ts` | ~500 | Append-only price tracking, analytics queries |

### RBAC

| Role | Purchase Orders | Receptions | Batches | Counts | Prices |
|------|----------------|------------|---------|--------|--------|
| **admin** | Full CRUD + approve | Full | Full | Full | Full |
| **manager** | CRUD + approve | Create | View + consume/transfer | Create + approve | Record |
| **cook** | View only | None | View | None | View |

### Multi-tenancy

All new entities inherit the existing `tenant_id` column isolation pattern. Every query is scoped by tenant. RLS policies are enforced on all new tables via `current_setting('app.current_tenant')`.
