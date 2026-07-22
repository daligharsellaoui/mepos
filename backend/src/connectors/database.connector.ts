/**
 * mePOS STOCK — Database Connector
 * =================================
 * Reads sales data from external POS databases (PostgreSQL, MySQL, SQL Server, SQLite).
 * Normalizes tickets to the common NormalizedTicket format.
 */

import { BaseConnector, DatabaseConnectorConfig, ConnectorResult, NormalizedTicket, ConnectorHealth } from './base.connector';

export class DatabaseConnector extends BaseConnector {
  protected config: DatabaseConnectorConfig;
  private client: any = null;

  constructor(config: DatabaseConnectorConfig) {
    super(config);
    this.config = config;
  }

  async connect(): Promise<void> {
    this.status = 'inactive';
    this.lastError = null;

    try {
      switch (this.config.dbType) {
        case 'postgresql':
          await this.connectPostgreSQL();
          break;
        case 'mysql':
          await this.connectMySQL();
          break;
        case 'sqlserver':
          await this.connectSQLServer();
          break;
        case 'sqlite':
          await this.connectSQLite();
          break;
        default:
          throw new Error(`Unsupported database type: ${this.config.dbType}`);
      }

      this.status = 'connected';
      this.health = 'healthy';
    } catch (error: any) {
      this.status = 'error';
      this.health = 'unhealthy';
      this.lastError = error.message;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        if (this.config.dbType === 'postgresql' && typeof this.client.end === 'function') {
          await this.client.end();
        } else if (this.config.dbType === 'mysql' && typeof this.client.close === 'function') {
          await this.client.close();
        }
      } catch (err) {
        // Ignore close errors
      }
      this.client = null;
    }
    this.status = 'inactive';
    this.health = 'unknown';
  }

  async healthCheck(): Promise<ConnectorHealth> {
    if (!this.client) {
      this.health = 'unhealthy';
      return this.health;
    }

    try {
      // Simple ping query
      if (this.config.dbType === 'postgresql') {
        await this.client.query('SELECT 1');
      } else if (this.config.dbType === 'mysql') {
        await this.client.ping();
      }
      this.health = 'healthy';
    } catch (error: any) {
      this.health = 'unhealthy';
      this.lastError = error.message;
    }

    return this.health;
  }

  async fetchSales(lastSyncTimestamp?: Date): Promise<ConnectorResult> {
    const result: ConnectorResult = {
      success: false,
      tickets: [],
      errors: [],
      warnings: [],
    };

    if (!this.client) {
      result.errors.push('Not connected to database');
      return result;
    }

    try {
      let query: string;
      let params: any[] = [];

      // Build query based on database type
      // This is a generic query - in production, each POS system would have its own schema mapping
      switch (this.config.dbType) {
        case 'postgresql':
          query = `
            SELECT 
              t.id as ticket_id,
              t.ticket_number,
              t.sold_at,
              t.total_amount,
              t.department_id,
              json_agg(
                json_build_object(
                  'recipe_id', ti.recipe_id,
                  'quantity', ti.quantity,
                  'unit_price', ti.unit_price,
                  'quantity_served', ti.quantity_served
                )
              ) as items
            FROM tickets t
            LEFT JOIN ticket_items ti ON t.id = ti.ticket_id
            ${lastSyncTimestamp ? 'WHERE t.sold_at > $1' : ''}
            GROUP BY t.id
            ORDER BY t.sold_at ASC
            LIMIT $${lastSyncTimestamp ? 2 : 1}
          `;
          params = lastSyncTimestamp 
            ? [lastSyncTimestamp, this.config.pollingInterval * 100]
            : [this.config.pollingInterval * 100];
          break;

        case 'mysql':
          query = `
            SELECT 
              t.id as ticket_id,
              t.ticket_number,
              t.sold_at,
              t.total_amount,
              t.department_id,
              GROUP_CONCAT(
                CONCAT('{\"recipe_id\":', COALESCE(ti.recipe_id, 0),
                       ',\"quantity\":', COALESCE(ti.quantity, 0),
                       ',\"unit_price\":', COALESCE(ti.unit_price, 0),
                       ',\"quantity_served\":', COALESCE(ti.quantity_served, 0), '}')
                SEPARATOR ','
              ) as items_json
            FROM tickets t
            LEFT JOIN ticket_items ti ON t.id = ti.ticket_id
            ${lastSyncTimestamp ? 'WHERE t.sold_at > ?' : ''}
            GROUP BY t.id
            ORDER BY t.sold_at ASC
            LIMIT ?
          `;
          params = lastSyncTimestamp 
            ? [lastSyncTimestamp, this.config.pollingInterval * 100]
            : [this.config.pollingInterval * 100];
          break;

        default:
          throw new Error(`Query generation not implemented for ${this.config.dbType}`);
      }

      const rows = await this.executeQuery(query, params);

      // Normalize the raw rows to common format
      result.tickets = this.normalize(rows);
      result.success = true;
      result.metadata = { rowCount: rows.length };

      this.lastSyncAt = new Date();
    } catch (error: any) {
      result.errors.push(`Database query failed: ${error.message}`);
      this.lastError = error.message;
    }

    return result;
  }

  normalize(rawData: any[], departmentId?: number): NormalizedTicket[] {
    return rawData.map((row: any) => {
      // Parse items - handle both JSON string and already-parsed array
      let items: any[] = [];
      if (row.items) {
        items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
      } else if (row.items_json) {
        items = JSON.parse(`[${row.items_json}]`);
      }

      return {
        external_ticket_id: String(row.ticket_id || row.id),
        ticket_date: row.sold_at instanceof Date ? row.sold_at.toISOString() : String(row.sold_at),
        total_amount: parseFloat(row.total_amount) || 0,
        department_id: departmentId || row.department_id,
        items: items.map((item: any) => ({
          recipe_id: item.recipe_id,
          quantity: parseFloat(item.quantity) || 0,
          unit_price: parseFloat(item.unit_price) || 0,
          quantity_served: item.quantity_served ? parseFloat(item.quantity_served) : undefined,
        })),
      };
    });
  }

  // ─── Private Database Connection Methods ───

  private async connectPostgreSQL(): Promise<void> {
    // Dynamic import to avoid loading pg if not needed
    const pg = require('pg');
    this.client = new pg.Client({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    });
    await this.client.connect();
  }

  private async connectMySQL(): Promise<void> {
    const mysql = require('mysql2/promise');
    this.client = await mysql.createConnection({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? {} : undefined,
      connectTimeout: 10000,
    });
  }

  private async connectSQLServer(): Promise<void> {
    // SQL Server support via mssql package
    const sql = require('mssql');
    const config = {
      server: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      options: {
        encrypt: this.config.ssl,
        trustServerCertificate: true,
      },
      connectionTimeout: 10000,
    };
    this.client = await sql.connect(config);
  }

  private async connectSQLite(): Promise<void> {
    const Database = require('better-sqlite3');
    this.client = new Database(this.config.database, { readonly: this.config.readOnly });
  }

  private async executeQuery(query: string, params: any[]): Promise<any[]> {
    switch (this.config.dbType) {
      case 'postgresql': {
        const result = await this.client.query(query, params);
        return result.rows;
      }
      case 'mysql': {
        const [rows] = await this.client.execute(query, params);
        return Array.isArray(rows) ? rows : [];
      }
      case 'sqlserver': {
        const result = await this.client.request()
          .query(query);
        return result.recordset || [];
      }
      case 'sqlite': {
        const stmt = this.client.prepare(query);
        return stmt.all(...params);
      }
      default:
        throw new Error(`Query execution not implemented for ${this.config.dbType}`);
    }
  }

  /**
   * Test connection without keeping it open.
   * Returns connection info on success.
   */
  static async testConnection(config: DatabaseConnectorConfig): Promise<{
    connected: boolean;
    latency_ms: number;
    server_version?: string;
    error?: string;
  }> {
    const connector = new DatabaseConnector(config);
    const start = Date.now();

    try {
      await connector.connect();
      const latency = Date.now() - start;

      // Try to get server version
      let serverVersion: string | undefined;
      try {
        if (config.dbType === 'postgresql') {
          const result = await connector.client.query('SELECT version()');
          serverVersion = result.rows[0]?.version;
        }
      } catch {
        // Version query not critical
      }

      await connector.disconnect();

      return {
        connected: true,
        latency_ms: latency,
        server_version: serverVersion,
      };
    } catch (error: any) {
      return {
        connected: false,
        latency_ms: Date.now() - start,
        error: error.message,
      };
    }
  }
}
