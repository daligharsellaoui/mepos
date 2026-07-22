/**
 * ============================================================
 * mePOS STOCK — Activity Journal / Audit Trail Service
 * ============================================================
 * Centralized Business Event Journal
 *
 * Every module emits events through the event bus.
 * This service listens to all business events and records
 * them permanently in the activity_journal table (or demoDb).
 *
 * Architecture:
 *   Business Module
 *        ↓
 *   Business Event (EventEmitter)
 *        ↓
 *   ActivityJournal Service (this file)
 *        ↓
 *   Database (activity_journal table)
 *
 * Nothing directly inserts rows into the journal.
 * ============================================================
 */

import { query, isDemoMode, demoDb } from '../database';
import { eventBus, Events } from './event.service';

// ============================================================
// TYPES
// ============================================================

export type JournalSeverity = 'info' | 'notice' | 'warning' | 'error' | 'critical';
export type JournalSource = 
  | 'web_application'
  | 'legacy_pos_agent'
  | 'api'
  | 'synchronization_service'
  | 'system'
  | 'scheduler'
  | 'forecast_engine';

export interface ActivityJournalEntry {
  id?: number;
  tenantId: number;
  eventId?: string;
  eventType: string;
  correlationId?: string;
  entityType?: string;
  entityId?: string;
  performedByUserId?: number | null;
  performedByRole?: string;
  performedBySource: JournalSource;
  occurredAt?: string;
  severity: JournalSeverity;
  title: string;
  description?: string;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  connectorId?: number | null;
  externalReference?: string;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  createdAt?: string;
}

export interface JournalFilter {
  tenantId: number;
  eventTypes?: string[];
  entityType?: string;
  entityId?: string;
  performedByUserId?: number;
  performedBySource?: JournalSource;
  severity?: JournalSeverity;
  connectorId?: number;
  correlationId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface JournalSearchResult {
  entries: ActivityJournalEntry[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================================
// EVENT TYPE CATEGORIES
// Each event type maps to a human-readable category
// ============================================================

export const EVENT_CATEGORIES: Record<string, string> = {
  // Authentication
  'auth.login': 'authentication',
  'auth.logout': 'authentication',
  'auth.login_failed': 'authentication',
  'auth.password_changed': 'authentication',

  // Inventory
  'inventory.ingredient.created': 'inventory',
  'inventory.ingredient.updated': 'inventory',
  'inventory.ingredient.deleted': 'inventory',
  'inventory.stock.adjusted': 'inventory',
  'inventory.stock.low': 'inventory',
  'inventory.stock.critical': 'inventory',
  'inventory.count': 'inventory',

  // Products
  'product.created': 'products',
  'product.updated': 'products',
  'product.deleted': 'products',
  'product.recipe_attached': 'products',
  'product.recipe_modified': 'products',

  // Recipes
  'recipe.created': 'recipes',
  'recipe.updated': 'recipes',
  'recipe.deleted': 'recipes',
  'recipe.cost_changed': 'recipes',

  // Suppliers
  'supplier.created': 'suppliers',
  'supplier.updated': 'suppliers',
  'supplier.archived': 'suppliers',
  'supplier.deleted': 'suppliers',
  'supplier.preferred_changed': 'suppliers',

  // Purchases
  'purchase.created': 'purchases',
  'purchase.received': 'purchases',
  'purchase.cancelled': 'purchases',

  // Transfers
  'transfer.requested': 'transfers',
  'transfer.approved': 'transfers',
  'transfer.rejected': 'transfers',
  'transfer.completed': 'transfers',

  // Losses
  'loss.declared': 'losses',
  'loss.spoilage': 'losses',
  'loss.adjustment': 'losses',
  'loss.waste': 'losses',

  // Synchronization
  'sync.started': 'synchronization',
  'sync.completed': 'synchronization',
  'sync.failed': 'synchronization',
  'sync.heartbeat_lost': 'synchronization',
  'sync.heartbeat_restored': 'synchronization',
  'agent.connected': 'synchronization',
  'agent.disconnected': 'synchronization',

  // POS Mapping
  'mapping.created': 'mappings',
  'mapping.updated': 'mappings',
  'mapping.deleted': 'mappings',

  // Users
  'user.created': 'users',
  'user.updated': 'users',
  'user.role_changed': 'users',
  'user.permissions_changed': 'users',
  'user.disabled': 'users',

  // Tenant
  'tenant.created': 'tenants',
  'tenant.updated': 'tenants',
  'tenant.settings_changed': 'tenants',

  // Notifications
  'notification.generated': 'notifications',
  'notification.resolved': 'notifications',

  // Settings
  'settings.updated': 'settings',

  // Forecast
  'forecast.generated': 'forecast',
  'forecast.alert': 'forecast',
  'forecast.resolved': 'forecast',

  // CSV Import
  'import.started': 'imports',
  'import.completed': 'imports',
  'import.failed': 'imports',
  'import.ingredient_created': 'imports',
  'import.ingredient_reused': 'imports',

  // Sales
  'sale.imported': 'sales',
  'sale.expanded': 'sales',
  'sale.inventory_deducted': 'sales',
};

// ============================================================
// SEVERITY MAPPING
// ============================================================

export function eventSeverity(eventType: string): JournalSeverity {
  if (eventType.includes('critical') || eventType.includes('failed') || eventType.includes('error')) return 'error';
  if (eventType.includes('warning') || eventType.includes('low') || eventType.includes('rejected')) return 'warning';
  if (eventType.includes('completed') || eventType.includes('approved') || eventType.includes('created')) return 'notice';
  return 'info';
}

// ============================================================
// WRITE JOURNAL ENTRY
// ============================================================

export async function writeJournalEntry(entry: ActivityJournalEntry): Promise<ActivityJournalEntry | null> {
  if (!entry.tenantId || !entry.eventType || !entry.performedBySource) {
    console.error('[ActivityJournal] Missing required fields:', { tenantId: entry.tenantId, eventType: entry.eventType, source: entry.performedBySource });
    return null;
  }

  const eventId = entry.eventId || generateUUID();
  const occurredAt = entry.occurredAt || new Date().toISOString();

  const fullEntry: ActivityJournalEntry = {
    ...entry,
    eventId,
    occurredAt,
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode) {
    if (!(demoDb as any).activity_journal) {
      (demoDb as any).activity_journal = [];
    }
    const record: any = {
      id: (demoDb as any).activity_journal.length + 1,
      tenant_id: fullEntry.tenantId,
      event_id: fullEntry.eventId,
      event_type: fullEntry.eventType,
      correlation_id: fullEntry.correlationId || null,
      entity_type: fullEntry.entityType || null,
      entity_id: fullEntry.entityId ? String(fullEntry.entityId) : null,
      performed_by_user_id: fullEntry.performedByUserId || null,
      performed_by_role: fullEntry.performedByRole || null,
      performed_by_source: fullEntry.performedBySource,
      occurred_at: fullEntry.occurredAt,
      severity: fullEntry.severity,
      title: fullEntry.title,
      description: fullEntry.description || null,
      metadata: fullEntry.metadata || {},
      ip_address: fullEntry.ipAddress || null,
      user_agent: fullEntry.userAgent || null,
      session_id: fullEntry.sessionId || null,
      connector_id: fullEntry.connectorId || null,
      external_reference: fullEntry.externalReference || null,
      previous_values: fullEntry.previousValues || null,
      new_values: fullEntry.newValues || null,
      created_at: fullEntry.createdAt,
    };
    (demoDb as any).activity_journal.push(record);
    return record;
  }

  try {
    const result = await query(
      `INSERT INTO activity_journal (
        tenant_id, event_id, event_type, correlation_id,
        entity_type, entity_id,
        performed_by_user_id, performed_by_role, performed_by_source,
        occurred_at, severity, title, description, metadata,
        ip_address, user_agent, session_id,
        connector_id, external_reference,
        previous_values, new_values
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17,
        $18, $19,
        $20, $21
      ) RETURNING *`,
      [
        fullEntry.tenantId,
        fullEntry.eventId,
        fullEntry.eventType,
        fullEntry.correlationId || null,
        fullEntry.entityType || null,
        fullEntry.entityId ? String(fullEntry.entityId) : null,
        fullEntry.performedByUserId || null,
        fullEntry.performedByRole || null,
        fullEntry.performedBySource,
        fullEntry.occurredAt,
        fullEntry.severity,
        fullEntry.title,
        fullEntry.description || null,
        JSON.stringify(fullEntry.metadata || {}),
        fullEntry.ipAddress || null,
        fullEntry.userAgent || null,
        fullEntry.sessionId || null,
        fullEntry.connectorId || null,
        fullEntry.externalReference || null,
        fullEntry.previousValues ? JSON.stringify(fullEntry.previousValues) : null,
        fullEntry.newValues ? JSON.stringify(fullEntry.newValues) : null,
      ]
    );
    return result.rows[0] || null;
  } catch (err: any) {
    console.error('[ActivityJournal] Error writing entry:', err.message);
    return null;
  }
}

// ============================================================
// QUERY JOURNAL
// ============================================================

export async function queryJournal(filter: JournalFilter): Promise<JournalSearchResult> {
  const {
    tenantId, eventTypes, entityType, entityId,
    performedByUserId, performedBySource, severity,
    connectorId, correlationId, search,
    startDate, endDate,
    limit = 50, offset = 0,
    sortBy = 'occurred_at', sortOrder = 'desc',
  } = filter;

  if (isDemoMode) {
    let entries = ((demoDb as any).activity_journal || []).filter((e: any) => {
      if (e.tenant_id !== tenantId) return false;
      if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(e.event_type)) return false;
      if (entityType && e.entity_type !== entityType) return false;
      if (entityId && e.entity_id !== String(entityId)) return false;
      if (performedByUserId && e.performed_by_user_id !== performedByUserId) return false;
      if (performedBySource && e.performed_by_source !== performedBySource) return false;
      if (severity && e.severity !== severity) return false;
      if (connectorId && e.connector_id !== connectorId) return false;
      if (correlationId && e.correlation_id !== correlationId) return false;
      if (startDate && new Date(e.occurred_at) < new Date(startDate)) return false;
      if (endDate && new Date(e.occurred_at) > new Date(endDate)) return false;
      if (search) {
        const q = search.toLowerCase();
        const title = (e.title || '').toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const meta = JSON.stringify(e.metadata || {}).toLowerCase();
        if (!title.includes(q) && !desc.includes(q) && !meta.includes(q)) return false;
      }
      return true;
    });

    entries.sort((a: any, b: any) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : new Date(aVal).getTime() - new Date(bVal).getTime();
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    const total = entries.length;
    const sliced = entries.slice(offset, offset + limit);
    return { entries: sliced, total, limit, offset };
  }

  // PostgreSQL mode
  const params: any[] = [tenantId];
  let paramIdx = 2;
  const conditions: string[] = ['tenant_id = $1'];

  if (eventTypes && eventTypes.length > 0) {
    conditions.push(`event_type = ANY($${paramIdx}::text[])`);
    params.push(eventTypes);
    paramIdx++;
  }
  if (entityType) {
    conditions.push(`entity_type = $${paramIdx}`);
    params.push(entityType);
    paramIdx++;
  }
  if (entityId) {
    conditions.push(`entity_id = $${paramIdx}`);
    params.push(String(entityId));
    paramIdx++;
  }
  if (performedByUserId) {
    conditions.push(`performed_by_user_id = $${paramIdx}`);
    params.push(performedByUserId);
    paramIdx++;
  }
  if (performedBySource) {
    conditions.push(`performed_by_source = $${paramIdx}::journal_source`);
    params.push(performedBySource);
    paramIdx++;
  }
  if (severity) {
    conditions.push(`severity = $${paramIdx}::journal_severity`);
    params.push(severity);
    paramIdx++;
  }
  if (connectorId) {
    conditions.push(`connector_id = $${paramIdx}`);
    params.push(connectorId);
    paramIdx++;
  }
  if (correlationId) {
    conditions.push(`correlation_id = $${paramIdx}`);
    params.push(correlationId);
    paramIdx++;
  }
  if (startDate) {
    conditions.push(`occurred_at >= $${paramIdx}::timestamptz`);
    params.push(startDate);
    paramIdx++;
  }
  if (endDate) {
    conditions.push(`occurred_at <= $${paramIdx}::timestamptz`);
    params.push(endDate);
    paramIdx++;
  }
  if (search) {
    conditions.push(`to_tsvector('french', COALESCE(title, '') || ' ' || COALESCE(description, '')) @@ plainto_tsquery('french', $${paramIdx})`);
    params.push(search);
    paramIdx++;
  }

  const whereClause = 'WHERE ' + conditions.join(' AND ');

  const allowedSorts = ['occurred_at', 'severity', 'event_type', 'title', 'created_at'];
  const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'occurred_at';
  const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countResult = await query(`SELECT COUNT(*) FROM activity_journal ${whereClause}`, params);
  const total = parseInt(countResult.rows[0]?.count || '0', 10);

  params.push(limit, offset);
  const result = await query(
    `SELECT * FROM activity_journal ${whereClause}
     ORDER BY ${safeSort} ${safeOrder}
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    params
  );

  return {
    entries: result.rows,
    total,
    limit,
    offset,
  };
}

// ============================================================
// GET ENTRY BY ID
// ============================================================

export async function getJournalEntryById(id: number, tenantId: number): Promise<ActivityJournalEntry | null> {
  if (isDemoMode) {
    const entry = ((demoDb as any).activity_journal || []).find(
      (e: any) => e.id === id && e.tenant_id === tenantId
    );
    return entry || null;
  }
  const result = await query(
    'SELECT * FROM activity_journal WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return result.rows[0] || null;
}

// ============================================================
// GET CORRELATED ENTRIES (event chain)
// ============================================================

export async function getCorrelatedEntries(correlationId: string, tenantId: number): Promise<ActivityJournalEntry[]> {
  if (isDemoMode) {
    return ((demoDb as any).activity_journal || [])
      .filter((e: any) => e.correlation_id === correlationId && e.tenant_id === tenantId)
      .sort((a: any, b: any) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  }
  const result = await query(
    `SELECT * FROM activity_journal
     WHERE correlation_id = $1 AND tenant_id = $2
     ORDER BY occurred_at ASC`,
    [correlationId, tenantId]
  );
  return result.rows;
}

// ============================================================
// GET SALE EXPANSION DATA
// ============================================================

export async function getSaleExpansion(ticketId: number, tenantId: number): Promise<any> {
  if (isDemoMode) {
    const ticket = demoDb.sales_tickets.find((t: any) => t.id === ticketId && t.tenant_id === tenantId);
    if (!ticket) return null;

    const items = demoDb.sales_ticket_items
      .filter((i: any) => i.sales_ticket_id === ticketId)
      .map((item: any) => {
        const recipe = demoDb.recipes.find((r: any) => r.id === item.recipe_id);
        const recipeIngs = demoDb.recipe_ingredients
          .filter((ri: any) => ri.recipe_id === item.recipe_id)
          .map((ri: any) => {
            const ing = demoDb.ingredients.find((i: any) => i.id === ri.ingredient_id);
            const stockBefore = demoDb.inventory_stocks.find(
              (s: any) => s.ingredient_id === ri.ingredient_id && s.department_id === ticket.department_id
            );
            return {
              ingredient_id: ri.ingredient_id,
              ingredient_name: ing?.name || 'Unknown',
              unit: ing?.unit || '',
              quantity_needed: ri.quantity_needed,
              total_consumed: ri.quantity_needed * item.quantity,
              inventory_before: stockBefore ? (parseFloat(stockBefore.quantity) + (ri.quantity_needed * item.quantity)) : 0,
              inventory_after: stockBefore ? parseFloat(stockBefore.quantity) : 0,
            };
          });
        return {
          recipe_id: item.recipe_id,
          recipe_name: recipe?.name || 'Unknown',
          quantity: item.quantity,
          unit_price: item.unit_price,
          ingredients: recipeIngs,
        };
      });

    // Get correlated journal entries
    const journalEntries = ((demoDb as any).activity_journal || [])
      .filter((e: any) => e.entity_type === 'sale' && String(e.entity_id) === String(ticketId) && e.tenant_id === tenantId);

    // Get notifications related to this sale
    const relatedNotifs = (demoDb as any).notifications
      ? ((demoDb as any).notifications as any[]).filter(
          (n: any) => n.entity_type === 'sale' && n.entity_id === ticketId && n.tenant_id === tenantId
        )
      : [];

    return {
      ticket,
      items,
      journal: journalEntries,
      notifications: relatedNotifs,
    };
  }

  // PostgreSQL mode
  const ticketResult = await query(
    'SELECT * FROM sales_tickets WHERE id = $1 AND tenant_id = $2',
    [ticketId, tenantId]
  );
  if (ticketResult.rows.length === 0) return null;
    const ticket = ticketResult.rows[0];

    const itemsResult = await query(
      `SELECT sti.*, r.name as recipe_name
       FROM sales_ticket_items sti
       JOIN recipes r ON sti.recipe_id = r.id
       WHERE sti.sales_ticket_id = $1 AND sti.tenant_id = $2`,
      [ticketId, tenantId]
    );

  const items = [];
  for (const item of itemsResult.rows) {
    const ingsResult = await query(
      `SELECT ri.ingredient_id, ri.quantity_needed, i.name as ingredient_name, i.unit,
              COALESCE(is_t.quantity, 0) as current_stock
       FROM recipe_ingredients ri
       JOIN ingredients i ON ri.ingredient_id = i.id
       LEFT JOIN inventory_stocks is_t ON is_t.ingredient_id = ri.ingredient_id AND is_t.department_id = $3
       WHERE ri.recipe_id = $1 AND ri.tenant_id = $2`,
      [item.recipe_id, tenantId, ticket.department_id]
    );

    const ingredients = ingsResult.rows.map((ri: any) => ({
      ingredient_id: ri.ingredient_id,
      ingredient_name: ri.ingredient_name,
      unit: ri.unit,
      quantity_needed: ri.quantity_needed,
      total_consumed: parseFloat(ri.quantity_needed) * parseFloat(item.quantity),
      inventory_after: parseFloat(ri.current_stock || 0),
      inventory_before: parseFloat(ri.current_stock || 0) + (parseFloat(ri.quantity_needed) * parseFloat(item.quantity)),
    }));

    items.push({
      recipe_id: item.recipe_id,
      recipe_name: item.recipe_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      ingredients,
    });
  }

  const journalResult = await query(
    `SELECT * FROM activity_journal
     WHERE entity_type = 'sale' AND entity_id = $1 AND tenant_id = $2
     ORDER BY occurred_at ASC`,
    [String(ticketId), tenantId]
  );

  const notifsResult = await query(
    `SELECT * FROM notifications
     WHERE entity_type = 'sale' AND entity_id = $1 AND tenant_id = $2`,
    [ticketId, tenantId]
  );

  return {
    ticket,
    items,
    journal: journalResult.rows,
    notifications: notifsResult.rows,
  };
}

// ============================================================
// EXPORT JOURNAL ENTRIES
// ============================================================

export async function exportJournal(
  filter: JournalFilter,
  format: 'csv' | 'excel' | 'pdf'
): Promise<string | Buffer> {
  const result = await queryJournal({ ...filter, limit: 10000, offset: 0 });

  switch (format) {
    case 'csv':
      return exportCsv(result.entries);
    case 'excel':
      return exportExcel(result.entries);
    case 'pdf':
      return exportPdf(result.entries);
    default:
      throw new Error('Unsupported export format');
  }
}

function exportCsv(entries: ActivityJournalEntry[]): string {
  const headers = [
    'ID', 'Date', 'Event Type', 'Title', 'Description',
    'User ID', 'Role', 'Source', 'Severity',
    'Entity Type', 'Entity ID', 'Correlation ID',
    'Connector ID', 'External Reference',
  ];

  const rows = entries.map(e => [
    e.id, e.occurredAt, e.eventType, `"${(e.title || '').replace(/"/g, '""')}"`,
    `"${(e.description || '').replace(/"/g, '""')}"`,
    e.performedByUserId || '', e.performedByRole || '', e.performedBySource, e.severity,
    e.entityType || '', e.entityId || '', e.correlationId || '',
    e.connectorId || '', e.externalReference || '',
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function exportExcel(_entries: ActivityJournalEntry[]): Buffer {
  try {
    const XLSX = require('xlsx');
    const data = _entries.map(e => ({
      'ID': e.id,
      'Date': e.occurredAt,
      'Event Type': e.eventType,
      'Title': e.title,
      'Description': e.description || '',
      'User ID': e.performedByUserId || '',
      'Role': e.performedByRole || '',
      'Source': e.performedBySource,
      'Severity': e.severity,
      'Entity Type': e.entityType || '',
      'Entity ID': e.entityId || '',
      'Correlation ID': e.correlationId || '',
      'Connector ID': e.connectorId || '',
      'External Ref': e.externalReference || '',
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Activity Journal');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(buffer);
  } catch (err) {
    // Fallback to TSV if xlsx library is not available
    console.warn('[ActivityJournal] xlsx library not available, falling back to TSV');
    const headers = 'ID\tDate\tEvent Type\tTitle\tDescription\tUser ID\tRole\tSource\tSeverity';
    const rows = _entries.map(e =>
      `${e.id}\t${e.occurredAt}\t${e.eventType}\t${e.title}\t${(e.description || '').replace(/\t/g, ' ')}\t${e.performedByUserId || ''}\t${e.performedByRole || ''}\t${e.performedBySource}\t${e.severity}`
    );
    const tsv = [headers, ...rows].join('\n');
    return Buffer.from(tsv, 'utf-8');
  }
}

function exportPdf(_entries: ActivityJournalEntry[]): Buffer {
  // Simple text-based fallback for PDF
  // In production, use a library like pdfkit
  const lines = _entries.map(e =>
    `[${e.occurredAt}] ${e.eventType} | ${e.title} | ${e.description || ''} | By: ${e.performedByRole || '?'} (${e.performedBySource})`
  );
  return Buffer.from(lines.join('\n'), 'utf-8');
}

// ============================================================
// GENERATE UUID (for demo mode)
// ============================================================

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================
// REGISTER EVENT HANDLERS
// ============================================================

/**
 * Register all event bus handlers for activity journal logging.
 * This function MUST be called during server startup.
 */
export function setupActivityJournal() {
  // ── Authentication Events ──
  eventBus.on(Events.USER_LOGIN, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'auth.login',
      correlationId: data.correlationId,
      entityType: 'user',
      entityId: String(data.userId),
      performedByUserId: data.userId,
      performedByRole: data.role || 'user',
      performedBySource: 'web_application',
      severity: 'info',
      title: 'Connexion utilisateur',
      description: `${data.username} s'est connecté depuis ${data.ip || 'adresse inconnue'}.`,
      metadata: { username: data.username, ip: data.ip },
      ipAddress: data.ip,
    });
  });

  eventBus.on(Events.USER_LOGIN_FAILED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'auth.login_failed',
      entityType: 'user',
      performedBySource: 'web_application',
      severity: 'warning',
      title: 'Tentative de connexion échouée',
      description: `Tentative échouée pour "${data.username}" depuis ${data.ip || 'adresse inconnue'}.`,
      metadata: { username: data.username, ip: data.ip },
      ipAddress: data.ip,
    });
  });

  eventBus.on(Events.USER_PASSWORD_CHANGED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'auth.password_changed',
      entityType: 'user',
      entityId: String(data.userId),
      performedByUserId: data.changedBy || data.userId,
      performedBySource: 'web_application',
      severity: 'notice',
      title: 'Mot de passe modifié',
      description: `Le mot de passe de "${data.username}" a été modifié.`,
      metadata: { username: data.username },
    });
  });

  // ── Inventory Events ──
  eventBus.on(Events.INGREDIENT_CREATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'inventory.ingredient.created',
      correlationId: data.correlationId,
      entityType: 'ingredient',
      entityId: String(data.id),
      performedByUserId: data.createdBy,
      performedBySource: data.source || 'web_application',
      severity: 'notice',
      title: 'Ingrédient créé',
      description: `${data.name} a été ajouté à l'inventaire.`,
      metadata: { name: data.name, alertThreshold: data.alertThreshold },
    });
  });

  eventBus.on(Events.INGREDIENT_UPDATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'inventory.ingredient.updated',
      correlationId: data.correlationId,
      entityType: 'ingredient',
      entityId: String(data.id),
      performedByUserId: data.updatedBy,
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Ingrédient mis à jour',
      description: `${data.name} a été modifié.`,
      metadata: { name: data.name, changes: data.changes },
      previousValues: data.previousValues,
      newValues: data.newValues,
    });
  });

  eventBus.on(Events.INGREDIENT_DELETED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'inventory.ingredient.deleted',
      correlationId: data.correlationId,
      entityType: 'ingredient',
      entityId: String(data.id),
      performedByUserId: data.deletedBy,
      performedBySource: data.source || 'web_application',
      severity: 'warning',
      title: 'Ingrédient supprimé',
      description: `${data.name} a été supprimé de l'inventaire.`,
      metadata: { name: data.name },
    });
  });

  eventBus.on(Events.STOCK_LOW, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'inventory.stock.low',
      correlationId: data.correlationId,
      entityType: 'ingredient',
      entityId: String(data.ingredientId),
      performedBySource: 'system',
      severity: 'warning',
      title: 'Stock bas',
      description: `Le stock de "${data.ingredientName}" est bas (${data.remainingQty} ${data.unit}) dans "${data.departmentName}".`,
      metadata: {
        ingredientName: data.ingredientName,
        remainingQty: data.remainingQty,
        unit: data.unit,
        departmentName: data.departmentName,
        departmentId: data.departmentId,
      },
    });
  });

  eventBus.on(Events.STOCK_CRITICAL, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'inventory.stock.critical',
      correlationId: data.correlationId,
      entityType: 'ingredient',
      entityId: String(data.ingredientId),
      performedBySource: 'system',
      severity: 'error',
      title: 'Stock critique',
      description: `Le stock de "${data.ingredientName}" est critique (${data.remainingQty} ${data.unit}). Action requise.`,
      metadata: {
        ingredientName: data.ingredientName,
        remainingQty: data.remainingQty,
        unit: data.unit,
        departmentName: data.departmentName,
        departmentId: data.departmentId,
      },
    });
  });

  eventBus.on(Events.STOCK_OUT, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'inventory.stock.critical',
      correlationId: data.correlationId,
      entityType: 'ingredient',
      entityId: String(data.ingredientId),
      performedBySource: 'system',
      severity: 'critical',
      title: 'Rupture de stock',
      description: `"${data.ingredientName}" est en rupture de stock dans "${data.departmentName}".`,
      metadata: {
        ingredientName: data.ingredientName,
        departmentName: data.departmentName,
        departmentId: data.departmentId,
      },
    });
  });

  // ── Purchase Events ──
  eventBus.on(Events.PURCHASE_CREATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'purchase.created',
      correlationId: data.correlationId,
      entityType: 'ingredient',
      entityId: String(data.ingredientId),
      performedByUserId: data.createdBy,
      performedBySource: data.source || 'web_application',
      severity: 'notice',
      title: 'Achat enregistré',
      description: `${data.quantity} ${data.unit} de "${data.ingredientName}" ajouté à l'inventaire.`,
      metadata: {
        ingredientName: data.ingredientName,
        quantity: data.quantity,
        unit: data.unit,
        ingredientId: data.ingredientId,
      },
    });
  });

  // ── Recipe Events ──
  eventBus.on(Events.RECIPE_CREATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'recipe.created',
      correlationId: data.correlationId,
      entityType: 'recipe',
      entityId: String(data.recipeId),
      performedByUserId: data.createdBy,
      performedBySource: data.source || 'web_application',
      severity: 'notice',
      title: 'Recette créée',
      description: `La recette "${data.name}" a été créée.`,
      metadata: { name: data.name, salePrice: data.salePrice },
    });
  });

  eventBus.on(Events.RECIPE_UPDATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'recipe.updated',
      correlationId: data.correlationId,
      entityType: 'recipe',
      entityId: String(data.recipeId),
      performedByUserId: data.updatedBy,
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Recette mise à jour',
      description: `La recette "${data.name}" a été modifiée.`,
      metadata: { name: data.name, salePrice: data.salePrice, changes: data.changes },
      previousValues: data.previousValues,
      newValues: data.newValues,
    });
  });

  eventBus.on(Events.RECIPE_DELETED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'recipe.deleted',
      correlationId: data.correlationId,
      entityType: 'recipe',
      entityId: String(data.recipeId),
      performedByUserId: data.deletedBy,
      performedBySource: data.source || 'web_application',
      severity: 'warning',
      title: 'Recette supprimée',
      description: `La recette "${data.name}" a été supprimée.`,
      metadata: { name: data.name },
    });
  });

  eventBus.on(Events.RECIPE_COST_CHANGED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'recipe.cost_changed',
      correlationId: data.correlationId,
      entityType: 'recipe',
      entityId: String(data.recipeId),
      performedByUserId: data.updatedBy,
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Coût de recette modifié',
      description: `Le coût de "${data.name}" est passé de ${data.oldCost} à ${data.newCost}.`,
      metadata: { name: data.name, oldCost: data.oldCost, newCost: data.newCost },
    });
  });

  // ── Loss Events ──
  eventBus.on(Events.LOSS_DECLARED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'loss.declared',
      correlationId: data.correlationId,
      entityType: 'loss',
      entityId: String(data.lossId),
      performedByUserId: data.reportedBy,
      performedBySource: data.source || 'web_application',
      severity: 'warning',
      title: 'Perte déclarée',
      description: `Perte de ${data.quantity} ${data.unit} de "${data.ingredientName}" - Motif: ${data.reason}`,
      metadata: {
        ingredientName: data.ingredientName,
        quantity: data.quantity,
        unit: data.unit,
        reason: data.reason,
        costLoss: data.costLoss,
        departmentName: data.departmentName,
        lossReason: data.reason,
      },
    });
  });

  eventBus.on(Events.LOSS_LARGE, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'loss.declared',
      correlationId: data.correlationId,
      entityType: 'loss',
      entityId: String(data.lossId),
      performedByUserId: data.reportedBy,
      performedBySource: data.source || 'web_application',
      severity: 'error',
      title: 'Perte importante détectée',
      description: `Perte significative de ${data.quantity} ${data.unit} de "${data.ingredientName}" (Coût: ${data.costLoss} TND)`,
      metadata: {
        ingredientName: data.ingredientName,
        quantity: data.quantity,
        unit: data.unit,
        costLoss: data.costLoss,
        reason: data.reason,
      },
    });
  });

  // ── Transfer Events ──
  eventBus.on(Events.TRANSFER_REQUESTED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'transfer.requested',
      correlationId: data.correlationId,
      entityType: 'transfer',
      entityId: String(data.requestId),
      performedByUserId: data.requestedBy,
      performedByRole: data.requestedByRole,
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Demande de transfert',
      description: `${data.quantity} ${data.unit} de "${data.ingredientName}" de "${data.sourceDept}" vers "${data.destDept}".`,
      metadata: {
        ingredientName: data.ingredientName,
        quantity: data.quantity,
        unit: data.unit,
        sourceDept: data.sourceDept,
        destDept: data.destDept,
      },
    });
  });

  eventBus.on(Events.TRANSFER_APPROVED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'transfer.approved',
      correlationId: data.correlationId,
      entityType: 'transfer',
      entityId: String(data.requestId),
      performedByUserId: data.validatedBy,
      performedBySource: data.source || 'web_application',
      severity: 'notice',
      title: 'Transfert approuvé',
      description: `Transfert de ${data.quantity} ${data.unit} de "${data.ingredientName}" approuvé.`,
      metadata: {
        ingredientName: data.ingredientName,
        quantity: data.quantity,
        unit: data.unit,
      },
    });
  });

  eventBus.on(Events.TRANSFER_REJECTED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'transfer.rejected',
      correlationId: data.correlationId,
      entityType: 'transfer',
      entityId: String(data.requestId),
      performedByUserId: data.validatedBy,
      performedBySource: data.source || 'web_application',
      severity: 'warning',
      title: 'Transfert rejeté',
      description: `Demande de transfert de ${data.quantity} ${data.unit} de "${data.ingredientName}" rejetée.`,
      metadata: {
        ingredientName: data.ingredientName,
        quantity: data.quantity,
        unit: data.unit,
      },
    });
  });

  eventBus.on(Events.TRANSFER_COMPLETED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'transfer.completed',
      correlationId: data.correlationId,
      entityType: 'transfer',
      entityId: String(data.requestId),
      performedBySource: 'system',
      severity: 'notice',
      title: 'Transfert terminé',
      description: `Transfert de ${data.quantity} ${data.unit} de "${data.ingredientName}" terminé.`,
      metadata: {
        ingredientName: data.ingredientName,
        quantity: data.quantity,
        unit: data.unit,
      },
    });
  });

  // ── Supplier Events ──
  eventBus.on(Events.SUPPLIER_CREATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'supplier.created',
      correlationId: data.correlationId,
      entityType: 'supplier',
      entityId: String(data.id),
      performedByUserId: data.createdBy,
      performedBySource: data.source || 'web_application',
      severity: 'notice',
      title: 'Fournisseur créé',
      description: `${data.name} a été ajouté aux fournisseurs.`,
      metadata: { name: data.name },
    });
  });

  eventBus.on(Events.SUPPLIER_UPDATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'supplier.updated',
      correlationId: data.correlationId,
      entityType: 'supplier',
      entityId: String(data.id),
      performedByUserId: data.updatedBy,
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Fournisseur mis à jour',
      description: `${data.name} a été modifié.`,
      metadata: { name: data.name, changes: data.changes },
    });
  });

  eventBus.on(Events.SUPPLIER_ARCHIVED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'supplier.archived',
      correlationId: data.correlationId,
      entityType: 'supplier',
      entityId: String(data.id),
      performedByUserId: data.archivedBy,
      performedBySource: data.source || 'web_application',
      severity: 'warning',
      title: 'Fournisseur archivé',
      description: `${data.name} a été archivé.`,
      metadata: { name: data.name },
    });
  });

  eventBus.on(Events.SUPPLIER_DELETED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'supplier.deleted',
      correlationId: data.correlationId,
      entityType: 'supplier',
      entityId: String(data.id),
      performedByUserId: data.deletedBy,
      performedBySource: data.source || 'web_application',
      severity: 'warning',
      title: 'Fournisseur supprimé',
      description: `${data.name} a été supprimé.`,
      metadata: { name: data.name },
    });
  });

  eventBus.on(Events.PREFERRED_SUPPLIER_CHANGED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'supplier.preferred_changed',
      correlationId: data.correlationId,
      entityType: 'supplier',
      entityId: String(data.id),
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Fournisseur préféré changé',
      description: `${data.name} est désormais le fournisseur préféré.`,
      metadata: { name: data.name },
    });
  });

  // ── Sync Events ──
  eventBus.on(Events.SYNC_STARTED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'sync.started',
      correlationId: data.correlationId,
      entityType: 'agent',
      entityId: String(data.agentId),
      performedBySource: 'legacy_pos_agent',
      severity: 'info',
      title: 'Synchronisation démarrée',
      description: `Agent "${data.agentName}" a commencé la synchronisation.`,
      metadata: {
        agentName: data.agentName,
        agentId: data.agentId,
      },
      connectorId: data.agentId,
    });
  });

  eventBus.on(Events.SYNC_COMPLETED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'sync.completed',
      correlationId: data.correlationId,
      entityType: 'agent',
      entityId: String(data.agentId),
      performedBySource: 'legacy_pos_agent',
      severity: 'notice',
      title: 'Synchronisation terminée',
      description: `${data.ticketsImported} tickets importés via "${data.agentName}".`,
      metadata: {
        agentName: data.agentName,
        agentId: data.agentId,
        ticketsImported: data.ticketsImported,
        duration: data.duration,
      },
      connectorId: data.agentId,
    });
  });

  eventBus.on(Events.SYNC_FAILED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'sync.failed',
      correlationId: data.correlationId,
      entityType: 'agent',
      entityId: String(data.agentId),
      performedBySource: 'legacy_pos_agent',
      severity: 'error',
      title: 'Échec de synchronisation',
      description: `Erreur: ${data.error}. Agent: ${data.agentName}`,
      metadata: {
        agentName: data.agentName,
        agentId: data.agentId,
        error: data.error,
      },
      connectorId: data.agentId,
    });
  });

  eventBus.on(Events.AGENT_DISCONNECTED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'agent.disconnected',
      correlationId: data.correlationId,
      entityType: 'agent',
      entityId: String(data.agentId),
      performedBySource: 'system',
      severity: 'error',
      title: 'Agent déconnecté',
      description: `Agent "${data.agentName}" est déconnecté.`,
      metadata: { agentName: data.agentName, agentId: data.agentId },
      connectorId: data.agentId,
    });
  });

  eventBus.on(Events.AGENT_RECONNECTED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'sync.heartbeat_restored',
      correlationId: data.correlationId,
      entityType: 'agent',
      entityId: String(data.agentId),
      performedBySource: 'system',
      severity: 'notice',
      title: 'Agent reconnecté',
      description: `Agent "${data.agentName}" est de nouveau en ligne.`,
      metadata: { agentName: data.agentName, agentId: data.agentId },
      connectorId: data.agentId,
    });
  });

  eventBus.on(Events.AGENT_HEARTBEAT_MISSING, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'sync.heartbeat_lost',
      correlationId: data.correlationId,
      entityType: 'agent',
      entityId: String(data.agentId),
      performedBySource: 'system',
      severity: 'error',
      title: 'Agent injoignable',
      description: `L'agent "${data.agentName}" n'a pas envoyé de signal depuis longtemps.`,
      metadata: { agentName: data.agentName, agentId: data.agentId },
      connectorId: data.agentId,
    });
  });

  // ── User Management Events ──
  eventBus.on(Events.USER_CREATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'user.created',
      correlationId: data.correlationId,
      entityType: 'user',
      entityId: String(data.userId),
      performedByUserId: data.createdBy,
      performedBySource: data.source || 'web_application',
      severity: 'notice',
      title: 'Utilisateur créé',
      description: `Utilisateur "${data.username}" (${data.role}) a été créé.`,
      metadata: { username: data.username, role: data.role },
    });
  });

  eventBus.on(Events.USER_DISABLED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'user.disabled',
      correlationId: data.correlationId,
      entityType: 'user',
      entityId: String(data.userId),
      performedByUserId: data.disabledBy,
      performedBySource: data.source || 'web_application',
      severity: 'warning',
      title: 'Utilisateur désactivé',
      description: `L'utilisateur "${data.username}" a été désactivé.`,
      metadata: { username: data.username },
    });
  });

  // ── Tenant Events ──
  eventBus.on(Events.TENANT_CREATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'tenant.created',
      correlationId: data.correlationId,
      entityType: 'tenant',
      entityId: String(data.tenantId),
      performedBySource: 'web_application',
      severity: 'notice',
      title: 'Restaurant créé',
      description: `Le restaurant "${data.name}" a été créé.`,
      metadata: { name: data.name, slug: data.slug },
    });
  });

  // ── Settings Events ──
  eventBus.on(Events.SETTINGS_UPDATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'settings.updated',
      correlationId: data.correlationId,
      entityType: 'settings',
      performedByUserId: data.updatedBy,
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Configuration modifiée',
      description: `Les paramètres "${data.key}" (${data.category}) ont été mis à jour.`,
      metadata: { key: data.key, category: data.category, previousValue: data.previousValue, newValue: data.newValue },
      previousValues: data.previousValue ? { [data.key]: data.previousValue } : undefined,
      newValues: data.newValue ? { [data.key]: data.newValue } : undefined,
    });
  });

  // ── Mapping Events ──
  eventBus.on(Events.MAPPING_CREATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'mapping.created',
      correlationId: data.correlationId,
      entityType: 'mapping',
      entityId: String(data.mapping?.id),
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Mapping créé',
      description: `Nouveau mapping pour "${data.mapping?.external_product_name || 'produit'}" (${data.mapping?.connector_type}).`,
      metadata: {
        externalProductName: data.mapping?.external_product_name,
        externalProductId: data.mapping?.external_product_id,
        connectorType: data.mapping?.connector_type,
      },
    });
  });

  eventBus.on(Events.MAPPING_UPDATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'mapping.updated',
      correlationId: data.correlationId,
      entityType: 'mapping',
      entityId: String(data.mapping?.id),
      performedBySource: data.source || 'web_application',
      severity: 'info',
      title: 'Mapping mis à jour',
      description: `Mapping pour "${data.mapping?.external_product_name || 'produit'}" mis à jour.`,
      metadata: {
        externalProductName: data.mapping?.external_product_name,
        mappingStatus: data.mapping?.mapping_status,
      },
    });
  });

  eventBus.on(Events.MAPPING_DELETED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'mapping.deleted',
      correlationId: data.correlationId,
      entityType: 'mapping',
      entityId: String(data.mappingId),
      performedBySource: data.source || 'web_application',
      severity: 'warning',
      title: 'Mapping supprimé',
      description: `Mapping supprimé pour le connecteur ${data.connectorType}.`,
      metadata: { connectorType: data.connectorType },
    });
  });

  // ── Import Events ──
  eventBus.on(Events.IMPORT_STARTED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'import.started',
      correlationId: data.correlationId,
      performedByUserId: data.userId,
      performedBySource: 'web_application',
      severity: 'info',
      title: 'Import démarré',
      description: `Import de ${data.rowCount} produits lancé.`,
      metadata: { rowCount: data.rowCount, fileName: data.fileName },
    });
  });

  eventBus.on(Events.IMPORT_COMPLETED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'import.completed',
      correlationId: data.correlationId,
      performedByUserId: data.userId,
      performedBySource: 'web_application',
      severity: 'notice',
      title: 'Import terminé',
      description: `${data.productsCreated} produits, ${data.ingredientsCreated} ingrédients créés.`,
      metadata: {
        productsCreated: data.productsCreated,
        ingredientsCreated: data.ingredientsCreated,
        ingredientsReused: data.ingredientsReused,
      },
    });
  });

  eventBus.on(Events.IMPORT_FAILED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'import.failed',
      correlationId: data.correlationId,
      performedByUserId: data.userId,
      performedBySource: 'web_application',
      severity: 'error',
      title: 'Échec de l\'import',
      description: `Erreur: ${data.error}`,
      metadata: { error: data.error },
    });
  });

  // ── Sale Import (from sync) ──
  eventBus.on(Events.SALE_IMPORTED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'sale.imported',
      correlationId: data.correlationId,
      entityType: 'sale',
      entityId: String(data.ticketId),
      performedBySource: 'synchronization_service',
      severity: 'info',
      title: `Vente #${data.externalTicketId}`,
      description: `Ticket de vente importé depuis ${data.connectorType || 'POS'}: ${data.totalAmount} TND (${data.itemsCount} articles)`,
      metadata: {
        externalTicketId: data.externalTicketId,
        totalAmount: data.totalAmount,
        itemsCount: data.itemsCount,
        departmentName: data.departmentName,
        ticketDate: data.ticketDate,
        connectorType: data.connectorType,
      },
      connectorId: data.agentId,
      externalReference: data.externalTicketId,
    });
  });

  // ── Forecast Events ──
  eventBus.on(Events.FORECAST_GENERATED, async (data: any) => {
    await writeJournalEntry({
      tenantId: data.tenantId,
      eventType: 'forecast.generated',
      correlationId: data.correlationId,
      performedBySource: 'forecast_engine',
      severity: 'info',
      title: 'Prévisions générées',
      description: `Prévisions pour ${data.recipesCount} recettes générées (basées sur ${data.daysAnalyzed} jours d'historique).`,
      metadata: {
        recipesCount: data.recipesCount,
        daysAnalyzed: data.daysAnalyzed,
        generatedAt: data.generatedAt,
      },
    });
  });

  // ── Notification Created Bridge (from notification system's custom event) ──
  eventBus.on('notification:created', async ({ notification }: { notification: any }) => {
    if (!notification || !notification.tenant_id) return;

    await writeJournalEntry({
      tenantId: notification.tenant_id,
      eventType: 'notification.generated',
      entityType: 'notification',
      entityId: String(notification.id),
      performedByUserId: notification.created_by,
      performedBySource: 'system',
      severity: notification.priority === 'critical' ? 'critical' :
               notification.priority === 'high' ? 'error' :
               notification.priority === 'medium' ? 'warning' : 'info',
      title: notification.title || 'Notification générée',
      description: notification.message || '',
      metadata: {
        type: notification.type,
        category: notification.category,
        priority: notification.priority,
        entityType: notification.entity_type,
        entityId: notification.entity_id,
      },
    });

    // When notification is resolved (read/archived), emit resolved event
    if (notification.archived) {
      await writeJournalEntry({
        tenantId: notification.tenant_id,
        eventType: 'notification.resolved',
        entityType: 'notification',
        entityId: String(notification.id),
        performedBySource: 'system',
        severity: 'info',
        title: 'Notification résolue',
        description: `${notification.title} a été résolue.`,
        metadata: {
          notificationId: notification.id,
          title: notification.title,
        },
      });
    }
  });

  console.log('[ActivityJournal] Event handlers registered successfully.');
}

// Export for compatibility
export { eventBus, Events } from './event.service';
