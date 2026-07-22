/**
 * mePOS STOCK — API Connector
 * =============================
 * Connects to external POS REST APIs to fetch sales data.
 * Handles authentication, polling, and webhook support.
 */

import { BaseConnector, APIConnectorConfig, ConnectorResult, NormalizedTicket, ConnectorHealth } from './base.connector';

export class APIConnector extends BaseConnector {
  protected config: APIConnectorConfig;
  private abortController: AbortController | null = null;

  constructor(config: APIConnectorConfig) {
    super(config);
    this.config = config;
  }

  async connect(): Promise<void> {
    this.status = 'inactive';
    this.lastError = null;

    try {
      // Test the API connection
      const healthResult = await this.healthCheck();
      if (healthResult === 'unhealthy') {
        throw new Error(this.lastError || 'API health check failed');
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
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.status = 'inactive';
    this.health = 'unknown';
  }

  async healthCheck(): Promise<ConnectorHealth> {
    try {
      // Try a simple GET request to the API
      const response = await this.makeRequest('GET', '/health', undefined, 5000);
      if (response.ok) {
        this.health = 'healthy';
      } else {
        this.health = 'degraded';
        this.lastError = `Health check returned status ${response.status}`;
      }
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

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (lastSyncTimestamp) {
        params.set('since', lastSyncTimestamp.toISOString());
      }
      params.set('limit', String(this.config.timeout || 100));

      const queryString = params.toString();
      const endpoint = `/sales/tickets${queryString ? '?' + queryString : ''}`;

      const response = await this.makeRequest('GET', endpoint);

      if (!response.ok) {
        result.errors.push(`API returned status ${response.status}: ${response.statusText}`);
        return result;
      }

      const data: any = await response.json();

      // Normalize the API response to common format
      result.tickets = this.normalize(Array.isArray(data) ? data : data.data || data.tickets || []);
      result.success = true;
      result.metadata = { endpoint, statusCode: response.status };

      this.lastSyncAt = new Date();
    } catch (error: any) {
      result.errors.push(`API request failed: ${error.message}`);
      this.lastError = error.message;
    }

    return result;
  }

  normalize(rawData: any[], departmentId?: number): NormalizedTicket[] {
    return rawData.map((ticket: any) => ({
      external_ticket_id: String(ticket.id || ticket.ticket_id || ticket.external_ticket_id),
      ticket_date: ticket.date || ticket.ticket_date || ticket.created_at || ticket.sold_at,
      total_amount: parseFloat(ticket.total || ticket.total_amount || ticket.amount) || 0,
      department_id: departmentId || ticket.department_id,
      items: (ticket.items || ticket.line_items || []).map((item: any) => ({
        recipe_id: item.recipe_id || item.product_id || item.item_id,
        quantity: parseFloat(item.quantity || item.qty) || 0,
        unit_price: parseFloat(item.price || item.unit_price || item.amount) || 0,
        quantity_served: item.quantity_served ? parseFloat(item.quantity_served) : undefined,
      })),
    }));
  }

  // ─── Private HTTP Methods ───

  private async makeRequest(
    method: string,
    endpoint: string,
    body?: any,
    timeoutMs?: number
  ): Promise<Response> {
    const url = new URL(endpoint, this.config.apiUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // Add authentication
    switch (this.config.authType) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
        break;
      case 'api_key':
        headers['X-API-KEY'] = this.config.apiKey;
        break;
      // OAuth2 would need token refresh logic
    }

    this.abortController = new AbortController();
    const timeout = timeoutMs || this.config.timeout || 30000;

    const timeoutId = setTimeout(() => this.abortController?.abort(), timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: this.abortController.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Test API connection without keeping it open.
   */
  static async testConnection(config: APIConnectorConfig): Promise<{
    connected: boolean;
    latency_ms: number;
    api_version?: string;
    error?: string;
  }> {
    const connector = new APIConnector(config);
    const start = Date.now();

    try {
      await connector.connect();
      const latency = Date.now() - start;

      // Try to get API version
      let apiVersion: string | undefined;
      try {
        const response = await connector.makeRequest('GET', '/version', undefined, 5000);
        if (response.ok) {
        const versionData: any = await response.json();
        apiVersion = versionData.version;
        }
      } catch {
        // Version endpoint not critical
      }

      await connector.disconnect();

      return {
        connected: true,
        latency_ms: latency,
        api_version: apiVersion,
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
