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
  STOCK_LOW: 'stock.low',
  STOCK_OUT: 'stock.out',
  STOCK_CRITICAL: 'stock.critical',
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
  USER_LOGIN_FAILED: 'user.login.failed',
  USER_PASSWORD_CHANGED: 'user.password.changed',
  USER_CREATED: 'user.created',
  USER_DISABLED: 'user.disabled',
  TENANT_CREATED: 'tenant.created',
  SETTINGS_UPDATED: 'settings.updated',
  PURCHASE_CREATED: 'purchase.created',
};
