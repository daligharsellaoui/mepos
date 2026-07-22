/**
 * mePOS STOCK — Connectors Module
 * ==================================
 * Barrel export for the connector architecture.
 */

export { BaseConnector } from './base.connector';
export type {
  ConnectorConfig,
  DatabaseConnectorConfig,
  APIConnectorConfig,
  CSVConnectorConfig,
  WebhookConnectorConfig,
  NormalizedTicket,
  NormalizedTicketItem,
  ConnectorHealth,
  ConnectorStatus,
  ConnectorResult,
} from './base.connector';

export { DatabaseConnector } from './database.connector';
export { APIConnector } from './api.connector';

export { ConnectorRegistry, connectorRegistry } from './registry';
export type { ConnectorInfo } from './registry';
