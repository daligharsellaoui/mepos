/**
 * mePOS STOCK — Base Connector Interface
 * =========================================
 * Defines the contract for all POS data connectors.
 * Each connector type (database, API, CSV, webhook) implements this interface.
 *
 * The inventory engine never knows how sales were retrieved.
 * It only receives normalized NormalizedTicket objects.
 */

// ─── Connector Config Types ───

export interface DatabaseConnectorConfig {
  type: 'database';
  dbType: 'postgresql' | 'mysql' | 'sqlserver' | 'sqlite';
  host: string;
  port: number;
  database: string;
  username: string;       // Encrypted at rest
  password: string;       // Encrypted at rest
  ssl: boolean;
  readOnly: boolean;
  pollingInterval: number;
  retryPolicy: { maxRetries: number; baseBackoff: number };
}

export interface APIConnectorConfig {
  type: 'api';
  apiUrl: string;
  apiKey: string;         // Encrypted at rest
  authType: 'bearer' | 'api_key' | 'oauth2';
  headers: Record<string, string>;
  pollingInterval: number;
  webhookEnabled: boolean;
  retryPolicy: { maxRetries: number; baseBackoff: number };
  timeout: number;
}

export interface CSVConnectorConfig {
  type: 'csv';
  watchDirectory: string;
  filePattern: string;
  delimiter: string;
  encoding: string;
  pollingInterval: number;
}

export interface WebhookConnectorConfig {
  type: 'webhook';
  secret: string;         // Encrypted at rest
  allowedIPs: string[];
  path: string;
}

export type ConnectorConfig = DatabaseConnectorConfig | APIConnectorConfig | CSVConnectorConfig | WebhookConnectorConfig;

// ─── Normalized Ticket ───

/**
 * Common ticket format that ALL connectors produce.
 * The inventory engine consumes only this format.
 */
export interface NormalizedTicket {
  external_ticket_id: string;
  ticket_date: string;
  total_amount: number;
  department_id?: number;
  items: NormalizedTicketItem[];
}

export interface NormalizedTicketItem {
  recipe_id: number;
  quantity: number;
  unit_price: number;
  quantity_served?: number;
}

// ─── Connector Status ───

export type ConnectorHealth = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type ConnectorStatus = 'active' | 'inactive' | 'error' | 'connected' | 'disconnected';

export interface ConnectorResult {
  success: boolean;
  tickets: NormalizedTicket[];
  errors: string[];
  warnings: string[];
  metadata?: Record<string, any>;
}

// ─── Base Connector Abstract Class ───

export abstract class BaseConnector {
  protected config: ConnectorConfig;
  protected status: ConnectorStatus = 'inactive';
  protected health: ConnectorHealth = 'unknown';
  protected lastError: string | null = null;
  protected lastSyncAt: Date | null = null;

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  /** Establish connection to the POS data source */
  abstract connect(): Promise<void>;

  /** Disconnect from the POS data source */
  abstract disconnect(): Promise<void>;

  /** Check connection health */
  abstract healthCheck(): Promise<ConnectorHealth>;

  /**
   * Fetch new sales tickets from the POS data source.
   * @param lastSyncTimestamp - Only fetch tickets after this timestamp (for incremental sync)
   * @returns Normalized tickets ready for the inventory engine
   */
  abstract fetchSales(lastSyncTimestamp?: Date): Promise<ConnectorResult>;

  /**
   * Normalize raw POS data into common NormalizedTicket format.
   * Each connector implements this to map its POS-specific format.
   * @param rawData - Raw data from the POS source
   * @param departmentId - Target department ID for the tickets
   */
  abstract normalize(rawData: any[], departmentId?: number): NormalizedTicket[];

  /** Get current connector status */
  getStatus(): ConnectorStatus {
    return this.status;
  }

  /** Get current connector health */
  getHealth(): ConnectorHealth {
    return this.health;
  }

  /** Get last error message */
  getLastError(): string | null {
    return this.lastError;
  }

  /** Get last sync timestamp */
  getLastSyncAt(): Date | null {
    return this.lastSyncAt;
  }

  /** Get connector config (with sensitive fields masked) */
  getConfigSummary(): Record<string, any> {
    const summary: Record<string, any> = { type: this.config.type };
    if (this.config.type === 'database') {
      summary.dbType = this.config.dbType;
      summary.host = this.config.host;
      summary.port = this.config.port;
      summary.database = this.config.database;
      summary.ssl = this.config.ssl;
    } else if (this.config.type === 'api') {
      summary.apiUrl = this.config.apiUrl;
      summary.authType = this.config.authType;
    } else if (this.config.type === 'csv') {
      summary.watchDirectory = this.config.watchDirectory;
      summary.filePattern = this.config.filePattern;
    } else if (this.config.type === 'webhook') {
      summary.path = this.config.path;
    }
    return summary;
  }

  /** Factory method to create the appropriate connector */
  static create(type: string, config: ConnectorConfig): BaseConnector {
    switch (type) {
      case 'database': {
        // Lazy import to avoid circular dependencies
        const { DatabaseConnector } = require('./database.connector');
        return new DatabaseConnector(config as DatabaseConnectorConfig);
      }
      case 'api': {
        const { APIConnector } = require('./api.connector');
        return new APIConnector(config as APIConnectorConfig);
      }
      case 'csv': {
        const { CSVConnector } = require('./csv.connector');
        return new CSVConnector(config as CSVConnectorConfig);
      }
      case 'webhook': {
        const { WebhookConnector } = require('./webhook.connector');
        return new WebhookConnector(config as WebhookConnectorConfig);
      }
      default:
        throw new Error(`Unknown connector type: ${type}. Supported: database, api, csv, webhook`);
    }
  }
}
