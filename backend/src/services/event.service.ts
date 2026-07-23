import { EventEmitter } from 'events';

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

export const Events = {
  INGREDIENT_CREATED: 'ingredient.created',
  INGREDIENT_UPDATED: 'ingredient.updated',
  INGREDIENT_DELETED: 'ingredient.deleted',
  RECIPE_CREATED: 'recipe.created',
  RECIPE_UPDATED: 'recipe.updated',
  RECIPE_DELETED: 'recipe.deleted',
  STOCK_ADJUSTED: 'stock.adjusted',
  STOCK_LOW: 'stock.low',
  STOCK_OUT: 'stock.out',
  STOCK_CRITICAL: 'stock.critical',
  STOCK_RECOVERED: 'stock.recovered',
  LOSS_DECLARED: 'loss.declared',
  LOSS_LARGE: 'loss.large',
  TRANSFER_REQUESTED: 'transfer.requested',
  TRANSFER_APPROVED: 'transfer.approved',
  TRANSFER_REJECTED: 'transfer.rejected',
  TRANSFER_COMPLETED: 'transfer.completed',
  SYNC_STARTED: 'sync.started',
  SYNC_COMPLETED: 'sync.completed',
  SYNC_FAILED: 'sync.failed',
  SYNC_RETRY_SUCCEEDED: 'sync.retry.succeeded',
  DUPLICATE_TICKET: 'sync.duplicate.ticket',
  AGENT_DISCONNECTED: 'agent.disconnected',
  AGENT_RECONNECTED: 'agent.reconnected',
  AGENT_HEARTBEAT_MISSING: 'agent.heartbeat.missing',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_LOGIN_FAILED: 'user.login.failed',
  USER_PASSWORD_CHANGED: 'user.password.changed',
  USER_CREATED: 'user.created',
  USER_DISABLED: 'user.disabled',
  TENANT_CREATED: 'tenant.created',
  SETTINGS_UPDATED: 'settings.updated',
  PURCHASE_CREATED: 'purchase.created',
  SUPPLIER_CREATED: 'supplier.created',
  SUPPLIER_UPDATED: 'supplier.updated',
  SUPPLIER_ARCHIVED: 'supplier.archived',
  SUPPLIER_RESTORED: 'supplier.restored',
  SUPPLIER_DELETED: 'supplier.deleted',
  PREFERRED_SUPPLIER_CHANGED: 'supplier.preferred.changed',
  // Import events
  IMPORT_STARTED: 'import.started',
  IMPORT_COMPLETED: 'import.completed',
  IMPORT_FAILED: 'import.failed',
  // Mapping events
  MAPPING_CREATED: 'mapping.created',
  MAPPING_UPDATED: 'mapping.updated',
  MAPPING_DELETED: 'mapping.deleted',
  MAPPING_AUTO_MATCHED: 'mapping.auto.matched',
  SYNC_BLOCKED_MISSING_MAPPING: 'sync.blocked.missing.mapping',

  // Activity Journal events
  SALE_IMPORTED: 'sale.imported',
  SALE_EXPANDED: 'sale.expanded',
  SALE_INVENTORY_DEDUCTED: 'sale.inventory.deducted',
  FORECAST_GENERATED: 'forecast.generated',
  FORECAST_ALERT: 'forecast.alert',
  FORECAST_RESOLVED: 'forecast.resolved',
  RECIPE_COST_CHANGED: 'recipe.cost_changed',
  USER_UPDATED: 'user.updated',
  USER_ROLE_CHANGED: 'user.role_changed',
  TENANT_UPDATED: 'tenant.updated',
  TENANT_SETTINGS_CHANGED: 'tenant.settings_changed',
  NOTIFICATION_GENERATED: 'notification.generated',
  NOTIFICATION_RESOLVED: 'notification.resolved',
  INVENTORY_COUNT: 'inventory.count',
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRODUCT_RECIPE_ATTACHED: 'product.recipe_attached',
  PRODUCT_RECIPE_MODIFIED: 'product.recipe_modified',
  AGENT_CONNECTED: 'agent.connected',
  PURCHASE_RECEIVED: 'purchase.received',
  PURCHASE_CANCELLED: 'purchase.cancelled',
  IMPORT_INGREDIENT_CREATED: 'import.ingredient.created',
  IMPORT_INGREDIENT_REUSED: 'import.ingredient.reused',

  // Purchase Order events
  PURCHASE_ORDER_CREATED: 'purchase.order.created',
  PURCHASE_ORDER_UPDATED: 'purchase.order.updated',
  PURCHASE_ORDER_SUBMITTED: 'purchase.order.submitted',
  PURCHASE_ORDER_APPROVED: 'purchase.order.approved',
  PURCHASE_ORDER_REJECTED: 'purchase.order.rejected',
  PURCHASE_ORDER_CANCELLED: 'purchase.order.cancelled',
  PURCHASE_ORDER_CLOSED: 'purchase.order.closed',

  // Goods Reception events
  GOODS_RECEIVED: 'goods.received',
  GOODS_PARTIALLY_RECEIVED: 'goods.partially.received',
  GOODS_REJECTED: 'goods.rejected',
  GOODS_DAMAGED: 'goods.damaged',

  // Batch events
  BATCH_CREATED: 'batch.created',
  BATCH_TRANSFERRED: 'batch.transferred',
  BATCH_CONSUMED: 'batch.consumed',
  BATCH_SPLIT: 'batch.split',
  BATCH_MERGED: 'batch.merged',
  BATCH_ADJUSTED: 'batch.adjusted',
  BATCH_EXPIRED: 'batch.expired',
  BATCH_DISCARDED: 'batch.discarded',

  // Inventory Count events
  INVENTORY_COUNT_CREATED: 'inventory.count.created',
  INVENTORY_COUNT_STARTED: 'inventory.count.started',
  INVENTORY_COUNT_COMPLETED: 'inventory.count.completed',
  INVENTORY_COUNT_APPROVED: 'inventory.count.approved',
  INVENTORY_COUNT_CANCELLED: 'inventory.count.cancelled',

  // Price History events
  PRICE_CHANGED: 'price.changed',
  PRICE_TREND_ALERT: 'price.trend.alert',

  // Purchase Recommendation events
  PURCHASE_RECOMMENDATION_GENERATED: 'purchase.recommendation.generated',

  // Purchase Return events
  PURCHASE_RETURN_CREATED: 'purchase.return.created',
  PURCHASE_RETURN_COMPLETED: 'purchase.return.completed',

  // Supplier Performance events
  SUPPLIER_PERFORMANCE_CHANGED: 'supplier.performance.changed',
};
