import { eventBus, Events } from './event.service';
import { createNotification, getUsersForRole, CATEGORIES, PRIORITIES } from './notification.service';

export function setupNotificationDispatcher() {
  eventBus.on(Events.INGREDIENT_CREATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.inventory,
      priority: data.alertThreshold > 0 ? PRIORITIES.medium : PRIORITIES.low,
      title: 'Nouvel ingrédient créé',
      message: `${data.name} a été ajouté à l\'inventaire.`,
      entityType: 'ingredient',
      entityId: data.id,
      createdBy: data.createdBy,
      icon: 'package',
      color: '#06b6d4',
    });
  });

  eventBus.on(Events.INGREDIENT_UPDATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'information',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.low,
      title: 'Ingrédient mis à jour',
      message: `${data.name} a été modifié.`,
      entityType: 'ingredient',
      entityId: data.id,
      createdBy: data.updatedBy,
      icon: 'package',
      color: '#06b6d4',
    });
  });

  eventBus.on(Events.INGREDIENT_DELETED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'warning',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.medium,
      title: 'Ingrédient supprimé',
      message: `${data.name} a été supprimé de l\'inventaire.`,
      entityType: 'ingredient',
      entityId: data.id,
      createdBy: data.deletedBy,
      icon: 'package',
      color: '#f59e0b',
    });
  });

  eventBus.on(Events.STOCK_LOW, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'warning',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.high,
      title: 'Stock bas',
      message: `Le stock de "${data.ingredientName}" est bas (${data.remainingQty} ${data.unit}) dans "${data.departmentName}".`,
      entityType: 'ingredient',
      entityId: data.ingredientId,
      actionUrl: `/app/inventory`,
      icon: 'alert-triangle',
      color: '#f59e0b',
      minRole: 'manager',
    });
  });

  eventBus.on(Events.STOCK_OUT, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'error',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.critical,
      title: 'Rupture de stock',
      message: `"${data.ingredientName}" est en rupture de stock dans "${data.departmentName}".`,
      entityType: 'ingredient',
      entityId: data.ingredientId,
      actionUrl: `/app/inventory`,
      icon: 'x-circle',
      color: '#dc2626',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.STOCK_CRITICAL, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'critical',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.critical,
      title: 'Stock critique',
      message: `Le niveau de stock de "${data.ingredientName}" est critique (${data.remainingQty} ${data.unit}). Action requise.`,
      entityType: 'ingredient',
      entityId: data.ingredientId,
      actionUrl: `/app/inventory`,
      icon: 'alert-octagon',
      color: '#dc2626',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.LOSS_DECLARED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'loss',
      category: CATEGORIES.warehouse,
      priority: PRIORITIES.medium,
      title: 'Perte déclarée',
      message: `Perte de ${data.quantity} ${data.unit} de "${data.ingredientName}" - Motif: ${data.reason}`,
      entityType: 'loss',
      entityId: data.lossId,
      actionUrl: `/app/losses`,
      icon: 'trash-2',
      color: '#ef4444',
      minRole: 'manager',
    });
  });

  eventBus.on(Events.LOSS_LARGE, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'critical',
      category: CATEGORIES.warehouse,
      priority: PRIORITIES.critical,
      title: 'Perte importante détectée',
      message: `Perte significative de ${data.quantity} ${data.unit} de "${data.ingredientName}" (Coût: ${data.costLoss} TND)`,
      entityType: 'loss',
      entityId: data.lossId,
      actionUrl: `/app/losses`,
      icon: 'alert-octagon',
      color: '#dc2626',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.TRANSFER_REQUESTED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'transfer',
      category: CATEGORIES.transfer,
      priority: PRIORITIES.medium,
      title: 'Demande de transfert',
      message: `${data.quantity} ${data.unit} de "${data.ingredientName}" de "${data.sourceDept}" vers "${data.destDept}".`,
      entityType: 'transfer',
      entityId: data.requestId,
      actionUrl: `/app/transfers`,
      icon: 'arrow-left-right',
      color: '#f97316',
      minRole: 'manager',
    });
    if (data.requestedBy) {
      await createNotification({
        tenantId: data.tenantId,
        type: 'transfer',
        category: CATEGORIES.transfer,
        priority: PRIORITIES.low,
        title: 'Demande envoyée',
        message: `Votre demande de transfert de ${data.quantity} ${data.unit} de "${data.ingredientName}" a été soumise.`,
        entityType: 'transfer',
        entityId: data.requestId,
        actionUrl: `/app/transfers`,
        icon: 'arrow-left-right',
        color: '#f97316',
        assignedTo: data.requestedBy,
      });
    }
  });

  eventBus.on(Events.TRANSFER_APPROVED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.transfer,
      priority: PRIORITIES.medium,
      title: 'Transfert approuvé',
      message: `Transfert de ${data.quantity} ${data.unit} de "${data.ingredientName}" approuvé.`,
      entityType: 'transfer',
      entityId: data.requestId,
      actionUrl: `/app/transfers`,
      icon: 'check-circle',
      color: '#10b981',
      assignedTo: data.requestedBy,
    });
  });

  eventBus.on(Events.TRANSFER_REJECTED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'warning',
      category: CATEGORIES.transfer,
      priority: PRIORITIES.medium,
      title: 'Transfert rejeté',
      message: `Demande de transfert de ${data.quantity} ${data.unit} de "${data.ingredientName}" rejetée.`,
      entityType: 'transfer',
      entityId: data.requestId,
      actionUrl: `/app/transfers`,
      icon: 'x-circle',
      color: '#ef4444',
      assignedTo: data.requestedBy,
    });
  });

  eventBus.on(Events.TRANSFER_COMPLETED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.transfer,
      priority: PRIORITIES.low,
      title: 'Transfert terminé',
      message: `Transfert de ${data.quantity} ${data.unit} de "${data.ingredientName}" terminé avec succès.`,
      entityType: 'transfer',
      entityId: data.requestId,
      icon: 'check-circle',
      color: '#10b981',
      assignedTo: data.requestedBy,
    });
  });

  eventBus.on(Events.SYNC_STARTED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'synchronization',
      category: CATEGORIES.synchronization,
      priority: PRIORITIES.low,
      title: 'Synchronisation démarrée',
      message: `Agent "${data.agentName}" a commencé la synchronisation.`,
      entityType: 'agent',
      entityId: data.agentId,
      icon: 'refresh-cw',
      color: '#8b5cf6',
    });
  });

  eventBus.on(Events.SYNC_COMPLETED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.synchronization,
      priority: PRIORITIES.low,
      title: 'Synchronisation terminée',
      message: `${data.ticketsImported} tickets importés via "${data.agentName}".`,
      entityType: 'agent',
      entityId: data.agentId,
      icon: 'check-circle',
      color: '#10b981',
    });
  });

  eventBus.on(Events.SYNC_FAILED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'error',
      category: CATEGORIES.synchronization,
      priority: PRIORITIES.high,
      title: 'Échec de synchronisation',
      message: `Erreur: ${data.error}. Agent: ${data.agentName}`,
      entityType: 'agent',
      entityId: data.agentId,
      actionUrl: `/app/sync`,
      icon: 'alert-triangle',
      color: '#ef4444',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.AGENT_DISCONNECTED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'error',
      category: CATEGORIES.agent,
      priority: PRIORITIES.high,
      title: 'Agent déconnecté',
      message: `Agent "${data.agentName}" est déconnecté.`,
      entityType: 'agent',
      entityId: data.agentId,
      actionUrl: `/app/agents`,
      icon: 'alert-triangle',
      color: '#ef4444',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.AGENT_RECONNECTED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.agent,
      priority: PRIORITIES.medium,
      title: 'Agent reconnecté',
      message: `Agent "${data.agentName}" est de nouveau en ligne.`,
      entityType: 'agent',
      entityId: data.agentId,
      icon: 'check-circle',
      color: '#10b981',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.USER_LOGIN, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'user',
      category: CATEGORIES.authentication,
      priority: PRIORITIES.low,
      title: 'Connexion détectée',
      message: `Nouvelle connexion de "${data.username}" depuis ${data.ip || 'adresse inconnue'}.`,
      entityType: 'user',
      entityId: data.userId,
      icon: 'user',
      color: '#6366f1',
      assignedTo: data.userId,
    });
  });

  eventBus.on(Events.USER_LOGIN_FAILED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'security',
      category: CATEGORIES.security,
      priority: PRIORITIES.high,
      title: 'Tentative de connexion échouée',
      message: `Tentative échouée pour "${data.username}" depuis ${data.ip || 'adresse inconnue'}.`,
      icon: 'shield',
      color: '#e11d48',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.USER_CREATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'user',
      category: CATEGORIES.administration,
      priority: PRIORITIES.medium,
      title: 'Nouvel utilisateur',
      message: `Utilisateur "${data.username}" (${data.role}) a été créé.`,
      entityType: 'user',
      entityId: data.userId,
      createdBy: data.createdBy,
      icon: 'user',
      color: '#6366f1',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.USER_PASSWORD_CHANGED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'information',
      category: CATEGORIES.authentication,
      priority: PRIORITIES.low,
      title: 'Mot de passe modifié',
      message: `Le mot de passe de "${data.username}" a été modifié.`,
      entityType: 'user',
      entityId: data.userId,
      icon: 'user',
      color: '#6366f1',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.USER_DISABLED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'warning',
      category: CATEGORIES.administration,
      priority: PRIORITIES.medium,
      title: 'Utilisateur supprimé',
      message: `L'utilisateur "${data.username}" a été supprimé.`,
      entityType: 'user',
      entityId: data.userId,
      icon: 'user',
      color: '#e11d48',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.RECIPE_CREATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'recipe',
      category: CATEGORIES.recipe,
      priority: PRIORITIES.low,
      title: 'Nouvelle recette créée',
      message: `La recette "${data.name}" a été ajoutée.`,
      entityType: 'recipe',
      entityId: data.recipeId,
      icon: 'book-open',
      color: '#a855f7',
    });
  });

  eventBus.on(Events.RECIPE_UPDATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'information',
      category: CATEGORIES.recipe,
      priority: PRIORITIES.low,
      title: 'Recette mise à jour',
      message: `La recette "${data.name}" a été modifiée.`,
      entityType: 'recipe',
      entityId: data.recipeId,
      icon: 'book-open',
      color: '#a855f7',
    });
  });

  eventBus.on(Events.AGENT_HEARTBEAT_MISSING, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'critical',
      category: CATEGORIES.agent,
      priority: PRIORITIES.critical,
      title: 'Agent injoignable',
      message: `L'agent "${data.agentName}" n'a pas envoyé de signal depuis longtemps.`,
      entityType: 'agent',
      entityId: data.agentId,
      actionUrl: `/app/agents`,
      icon: 'alert-octagon',
      color: '#dc2626',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.SYNC_RETRY_SUCCEEDED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.synchronization,
      priority: PRIORITIES.medium,
      title: 'Nouvelle tentative réussie',
      message: `La synchronisation via "${data.agentName}" a réussi après une nouvelle tentative.`,
      entityType: 'agent',
      entityId: data.agentId,
      icon: 'check-circle',
      color: '#10b981',
    });
  });

  eventBus.on(Events.DUPLICATE_TICKET, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'warning',
      category: CATEGORIES.synchronization,
      priority: PRIORITIES.medium,
      title: 'Ticket en double détecté',
      message: `Un ticket en double a été détecté lors de la synchronisation via "${data.agentName}".`,
      entityType: 'agent',
      entityId: data.agentId,
      actionUrl: `/app/sync`,
      icon: 'alert-triangle',
      color: '#f59e0b',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.RECIPE_DELETED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'warning',
      category: CATEGORIES.recipe,
      priority: PRIORITIES.medium,
      title: 'Recette supprimée',
      message: `La recette "${data.name}" a été supprimée.`,
      icon: 'book-open',
      color: '#ef4444',
    });
  });

  eventBus.on(Events.TENANT_CREATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'system',
      category: CATEGORIES.administration,
      priority: PRIORITIES.medium,
      title: 'Nouveau restaurant créé',
      message: `Le restaurant "${data.name}" a été créé.`,
      icon: 'settings',
      color: '#6366f1',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.SETTINGS_UPDATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'settings',
      category: CATEGORIES.general,
      priority: PRIORITIES.low,
      title: 'Paramètres modifiés',
      message: `Les paramètres "${data.key}" (${data.category}) ont été mis à jour.`,
      icon: 'sliders',
      color: '#64748b',
    });
  });

  eventBus.on(Events.SUPPLIER_CREATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.low,
      title: 'Nouveau fournisseur créé',
      message: `${data.name} a été ajouté aux fournisseurs.`,
      entityType: 'supplier',
      entityId: data.id,
      icon: 'truck',
      color: '#06b6d4',
    });
  });

  eventBus.on(Events.SUPPLIER_UPDATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'information',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.low,
      title: 'Fournisseur mis à jour',
      message: `${data.name} a été modifié.`,
      entityType: 'supplier',
      entityId: data.id,
      icon: 'truck',
      color: '#06b6d4',
    });
  });

  eventBus.on(Events.SUPPLIER_ARCHIVED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'warning',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.medium,
      title: 'Fournisseur archivé',
      message: `${data.name} a été archivé.`,
      entityType: 'supplier',
      entityId: data.id,
      icon: 'truck',
      color: '#06b6d4',
      minRole: 'manager',
    });
  });

  eventBus.on(Events.SUPPLIER_RESTORED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.low,
      title: 'Fournisseur restauré',
      message: `${data.name} a été restauré.`,
      entityType: 'supplier',
      entityId: data.id,
      icon: 'truck',
      color: '#06b6d4',
    });
  });

  eventBus.on(Events.PREFERRED_SUPPLIER_CHANGED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'information',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.medium,
      title: 'Fournisseur préféré changé',
      message: `${data.name} est désormais le fournisseur préféré.`,
      entityType: 'supplier',
      entityId: data.id,
      icon: 'truck',
      color: '#06b6d4',
    });
  });

  eventBus.on(Events.PURCHASE_CREATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'purchase',
      category: CATEGORIES.purchase,
      priority: PRIORITIES.low,
      title: 'Achat enregistré',
      message: `${data.quantity} ${data.unit} de "${data.ingredientName}" ajouté à l'inventaire.`,
      entityType: 'ingredient',
      entityId: data.ingredientId,
      icon: 'shopping-cart',
      color: '#22c55e',
    });
  });

  // ============================================================
  // IMPORT EVENTS
  // ============================================================

  eventBus.on(Events.IMPORT_STARTED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'synchronization',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.medium,
      title: 'Import démarré',
      message: `Import de ${data.rowCount} produits lancé.`,
      icon: 'upload',
      color: '#8b5cf6',
      createdBy: data.userId,
    });
  });

  eventBus.on(Events.IMPORT_COMPLETED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.medium,
      title: 'Import terminé',
      message: `${data.productsCreated} produits, ${data.ingredientsCreated} ingrédients créés.`,
      entityType: 'recipe',
      icon: 'check-circle',
      color: '#10b981',
      actionUrl: '/app/products',
      createdBy: data.userId,
    });
  });

  eventBus.on(Events.IMPORT_FAILED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'error',
      category: CATEGORIES.inventory,
      priority: PRIORITIES.high,
      title: 'Échec de l\'import',
      message: `Erreur: ${data.error}`,
      icon: 'x-circle',
      color: '#ef4444',
      actionUrl: '/app/products',
      createdBy: data.userId,
      minRole: 'admin',
    });
  });

  // ============================================================
  // MAPPING EVENTS
  // ============================================================

  eventBus.on(Events.MAPPING_CREATED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.synchronization,
      priority: PRIORITIES.low,
      title: 'Mapping créé',
      message: `Nouveau mapping pour "${data.mapping?.external_product_name || 'produit'}".`,
      entityType: 'mapping',
      entityId: data.mapping?.id,
      icon: 'link',
      color: '#8b5cf6',
    });
  });

  eventBus.on(Events.MAPPING_AUTO_MATCHED, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'success',
      category: CATEGORIES.synchronization,
      priority: PRIORITIES.medium,
      title: 'Auto-mapping terminé',
      message: `${data.matched} produits mappés sur ${data.total} pour "${data.connectorType}".`,
      icon: 'zap',
      color: '#10b981',
      actionUrl: '/app/mappings',
      minRole: 'admin',
    });
  });

  eventBus.on(Events.SYNC_BLOCKED_MISSING_MAPPING, async (data: any) => {
    await createNotification({
      tenantId: data.tenantId,
      type: 'warning',
      category: CATEGORIES.synchronization,
      priority: PRIORITIES.high,
      title: 'Synchronisation bloquée',
      message: `Produit POS "${data.externalProductName}" non mappé.`,
      entityType: 'mapping',
      actionUrl: '/app/mappings',
      icon: 'alert-triangle',
      color: '#f59e0b',
      minRole: 'admin',
    });
  });

  console.log('[NotificationDispatcher] Handlers registered for all events.');
}
