/**
 * ============================================================
 * mePOS STOCK — Activity Journal API Routes
 * ============================================================
 */

import { Router, Request, Response } from 'express';
import { queryJournal, getJournalEntryById, getCorrelatedEntries, getSaleExpansion, exportJournal } from '../services/activityJournal.service';

const router = Router();

// ======================================================
// GET /api/v1/journal
// Query activity journal entries with filters
// ======================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;

    if (!tenantId && user?.role !== 'platform_admin') {
      return res.status(400).json({ status: 'error', message: 'Tenant context required' });
    }

    const {
      event_types, entity_type, entity_id,
      performed_by_user_id, performed_by_source, severity,
      connector_id, correlation_id, search,
      start_date, end_date,
      limit, offset, sort_by, sort_order,
    } = req.query;

    // RBAC filtering
    // - Administrator: see everything in their tenant
    // - Manager: see operational events (non-critical, non-system)
    // - Kitchen Staff (cook): see only kitchen-related operational events
    // - Platform Admin: view all tenants across all environments
    const role = user?.role;
    let roleFilter: string[] | undefined;
    if (role === 'cook') {
      roleFilter = [
        'inventory.stock.low', 'inventory.stock.critical',
        'loss.declared',
        'recipe.created', 'recipe.updated', 'recipe.cost_changed',
        'sale.imported',
        'transfer.requested',
      ];
    } else if (role === 'manager') {
      // Managers see everything except auth and configuration events
      const allTypes = [
        'inventory.ingredient.created', 'inventory.ingredient.updated', 'inventory.ingredient.deleted',
        'inventory.stock.low', 'inventory.stock.critical',
        'purchase.created',
        'recipe.created', 'recipe.updated', 'recipe.deleted', 'recipe.cost_changed',
        'supplier.created', 'supplier.updated', 'supplier.archived', 'supplier.deleted',
        'transfer.requested', 'transfer.approved', 'transfer.rejected', 'transfer.completed',
        'loss.declared',
        'sync.started', 'sync.completed', 'sync.failed',
        'mapping.created', 'mapping.updated', 'mapping.deleted',
        'sale.imported',
        'import.started', 'import.completed', 'import.failed',
        'forecast.generated',
        'user.created', 'user.updated', 'user.disabled',
      ];
      // Use the event_types query param if provided, but only within the allowed set
      if (event_types) {
        const requested = (event_types as string).split(',');
        roleFilter = requested.filter((et: string) => allTypes.includes(et));
      } else {
        roleFilter = allTypes;
      }
    }

    // Platform admin: tenantId will be null/undefined, meaning they can query all tenants
    // Regular users: tenantId is their own tenant
    const effectiveTenantId = user?.role === 'platform_admin' && !tenantId ? undefined : (tenantId || 1);

    const result = await queryJournal({
      tenantId: effectiveTenantId || 1,
      eventTypes: roleFilter || (event_types ? (event_types as string).split(',') : undefined),
      entityType: entity_type as string,
      entityId: entity_id as string,
      performedByUserId: performed_by_user_id ? parseInt(performed_by_user_id as string, 10) : undefined,
      performedBySource: performed_by_source as any,
      severity: severity as any,
      connectorId: connector_id ? parseInt(connector_id as string, 10) : undefined,
      correlationId: correlation_id as string,
      search: search as string,
      startDate: start_date as string,
      endDate: end_date as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
      sortBy: sort_by as string || 'occurred_at',
      sortOrder: (sort_order as 'asc' | 'desc') || 'desc',
    });

    return res.json({
      status: 'success',
      data: result.entries,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (err: any) {
    console.error('[Journal] Error querying journal:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======================================================
// GET /api/v1/journal/event-types
// Get all available event types
// ======================================================
router.get('/event-types', async (_req: Request, res: Response) => {
  const eventTypes = [
    { value: 'auth.login', label: 'Connexion', category: 'authentication' },
    { value: 'auth.logout', label: 'Déconnexion', category: 'authentication' },
    { value: 'auth.login_failed', label: 'Échec de connexion', category: 'authentication' },
    { value: 'auth.password_changed', label: 'Mot de passe modifié', category: 'authentication' },
    { value: 'inventory.ingredient.created', label: 'Ingrédient créé', category: 'inventory' },
    { value: 'inventory.ingredient.updated', label: 'Ingrédient mis à jour', category: 'inventory' },
    { value: 'inventory.ingredient.deleted', label: 'Ingrédient supprimé', category: 'inventory' },
    { value: 'inventory.stock.adjusted', label: 'Stock ajusté', category: 'inventory' },
    { value: 'inventory.stock.low', label: 'Stock bas', category: 'inventory' },
    { value: 'inventory.stock.critical', label: 'Stock critique', category: 'inventory' },
    { value: 'purchase.created', label: 'Achat enregistré', category: 'purchases' },
    { value: 'recipe.created', label: 'Recette créée', category: 'recipes' },
    { value: 'recipe.updated', label: 'Recette mise à jour', category: 'recipes' },
    { value: 'recipe.deleted', label: 'Recette supprimée', category: 'recipes' },
    { value: 'recipe.cost_changed', label: 'Coût recette modifié', category: 'recipes' },
    { value: 'supplier.created', label: 'Fournisseur créé', category: 'suppliers' },
    { value: 'supplier.updated', label: 'Fournisseur mis à jour', category: 'suppliers' },
    { value: 'supplier.archived', label: 'Fournisseur archivé', category: 'suppliers' },
    { value: 'supplier.deleted', label: 'Fournisseur supprimé', category: 'suppliers' },
    { value: 'transfer.requested', label: 'Transfert demandé', category: 'transfers' },
    { value: 'transfer.approved', label: 'Transfert approuvé', category: 'transfers' },
    { value: 'transfer.rejected', label: 'Transfert rejeté', category: 'transfers' },
    { value: 'transfer.completed', label: 'Transfert terminé', category: 'transfers' },
    { value: 'loss.declared', label: 'Perte déclarée', category: 'losses' },
    { value: 'sync.started', label: 'Sync démarrée', category: 'synchronization' },
    { value: 'sync.completed', label: 'Sync terminée', category: 'synchronization' },
    { value: 'sync.failed', label: 'Sync échouée', category: 'synchronization' },
    { value: 'sync.heartbeat_lost', label: 'Signal perdu', category: 'synchronization' },
    { value: 'sync.heartbeat_restored', label: 'Signal rétabli', category: 'synchronization' },
    { value: 'agent.connected', label: 'Agent connecté', category: 'synchronization' },
    { value: 'agent.disconnected', label: 'Agent déconnecté', category: 'synchronization' },
    { value: 'mapping.created', label: 'Mapping créé', category: 'mappings' },
    { value: 'mapping.updated', label: 'Mapping mis à jour', category: 'mappings' },
    { value: 'mapping.deleted', label: 'Mapping supprimé', category: 'mappings' },
    { value: 'user.created', label: 'Utilisateur créé', category: 'users' },
    { value: 'user.updated', label: 'Utilisateur modifié', category: 'users' },
    { value: 'user.disabled', label: 'Utilisateur désactivé', category: 'users' },
    { value: 'tenant.created', label: 'Restaurant créé', category: 'tenants' },
    { value: 'tenant.updated', label: 'Restaurant modifié', category: 'tenants' },
    { value: 'settings.updated', label: 'Configuration modifiée', category: 'settings' },
    { value: 'forecast.generated', label: 'Prévisions générées', category: 'forecast' },
    { value: 'import.started', label: 'Import démarré', category: 'imports' },
    { value: 'import.completed', label: 'Import terminé', category: 'imports' },
    { value: 'import.failed', label: 'Import échoué', category: 'imports' },
    { value: 'sale.imported', label: 'Vente importée', category: 'sales' },
  ];
  return res.json({ status: 'success', data: eventTypes });
});

// ======================================================
// GET /api/v1/journal/:id
// Get a single journal entry
// ======================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || 1;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid ID' });
    }

    const entry = await getJournalEntryById(id, tenantId);
    if (!entry) {
      return res.status(404).json({ status: 'error', message: 'Journal entry not found' });
    }

    let correlatedEntries: any[] = [];
    if ((entry as any).correlation_id) {
      correlatedEntries = await getCorrelatedEntries((entry as any).correlation_id, tenantId);
    }

    return res.json({
      status: 'success',
      data: {
        entry,
        correlatedEntries,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======================================================
// GET /api/v1/journal/sale/:ticketId/expansion
// Get full sale expansion data
// ======================================================
router.get('/sale/:ticketId/expansion', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || 1;
    const ticketId = parseInt(req.params.ticketId, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid ticket ID' });
    }

    const expansion = await getSaleExpansion(ticketId, tenantId);
    if (!expansion) {
      return res.status(404).json({ status: 'error', message: 'Sale not found' });
    }

    return res.json({
      status: 'success',
      data: expansion,
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ======================================================
// GET /api/v1/journal/export
// Export journal entries (CSV / Excel / PDF)
// ======================================================
router.get('/export', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || 1;
    const user = (req as any).user;

    const { format = 'csv', event_types, entity_type, severity, search, start_date, end_date } = req.query as any;

    if (!['csv', 'excel', 'pdf'].includes(format)) {
      return res.status(400).json({ status: 'error', message: 'Invalid format. Supported: csv, excel, pdf' });
    }

    const data = await exportJournal(
      {
        tenantId,
        eventTypes: event_types ? event_types.split(',') : undefined,
        entityType: entity_type,
        severity,
        search,
        startDate: start_date,
        endDate: end_date,
        limit: 10000,
        offset: 0,
      },
      format
    );

    const mimeTypes: Record<string, string> = {
      csv: 'text/csv',
      excel: 'text/tab-separated-values',
      pdf: 'text/plain',
    };

    const extensions: Record<string, string> = {
      csv: '.csv',
      excel: '.xls',
      pdf: '.txt',
    };

    res.setHeader('Content-Type', mimeTypes[format]);
    res.setHeader('Content-Disposition', `attachment; filename="activity-journal-${Date.now()}${extensions[format]}"`);
    return res.send(data);
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
