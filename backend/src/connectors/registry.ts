/**
 * mePOS STOCK — Connector Registry
 * ===================================
 * Manages connector instances per agent.
 * Caches active connectors and handles lifecycle.
 */

import { BaseConnector, ConnectorConfig, ConnectorHealth } from './base.connector';
import { query } from '../database';

export interface ConnectorInfo {
  agentId: number;
  connectorType: string;
  status: string;
  health: ConnectorHealth;
  lastSyncAt: Date | null;
  lastError: string | null;
}

export class ConnectorRegistry {
  private connectors: Map<number, BaseConnector> = new Map();
  private healthCheckIntervals: Map<number, NodeJS.Timeout> = new Map();

  /**
   * Get or create a connector for an agent.
   * If the connector already exists and is healthy, return it.
   * Otherwise, create a new one from the agent's stored config.
   */
  async getConnector(agentId: number): Promise<BaseConnector> {
    // Check cache first
    if (this.connectors.has(agentId)) {
      const connector = this.connectors.get(agentId)!;
      if (connector.getStatus() === 'connected') {
        return connector;
      }
      // If not connected, try to reconnect
      await this.destroyConnector(agentId);
    }

    // Load agent config from database
    const agentResult = await query(
      'SELECT id, connector_type, config FROM agents WHERE id = $1 AND status != $2',
      [agentId, 'disabled']
    );

    if (agentResult.rows.length === 0) {
      throw new Error(`Agent ${agentId} not found or disabled`);
    }

    const agent = agentResult.rows[0];
    const config: ConnectorConfig = typeof agent.config === 'string' 
      ? JSON.parse(agent.config) 
      : agent.config;

    // Create connector
    const connector = BaseConnector.create(agent.connector_type, config);

    // Connect
    await connector.connect();

    // Cache it
    this.connectors.set(agentId, connector);

    // Start periodic health checks
    this.startHealthCheck(agentId, connector);

    return connector;
  }

  /**
   * Destroy a connector and clean up resources.
   */
  async destroyConnector(agentId: number): Promise<void> {
    // Stop health check
    const interval = this.healthCheckIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(agentId);
    }

    // Disconnect
    const connector = this.connectors.get(agentId);
    if (connector) {
      try {
        await connector.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.connectors.delete(agentId);
    }
  }

  /**
   * Destroy all connectors (for graceful shutdown).
   */
  async destroyAll(): Promise<void> {
    const agentIds = Array.from(this.connectors.keys());
    for (const agentId of agentIds) {
      await this.destroyConnector(agentId);
    }
  }

  /**
   * Get status info for a connector.
   */
  getConnectorInfo(agentId: number): ConnectorInfo | null {
    const connector = this.connectors.get(agentId);
    if (!connector) return null;

    return {
      agentId,
      connectorType: connector.getConfigSummary().type,
      status: connector.getStatus(),
      health: connector.getHealth(),
      lastSyncAt: connector.getLastSyncAt(),
      lastError: connector.getLastError(),
    };
  }

  /**
   * Get status info for all active connectors.
   */
  getAllConnectorInfo(): ConnectorInfo[] {
    const infos: ConnectorInfo[] = [];
    for (const [agentId] of this.connectors) {
      const info = this.getConnectorInfo(agentId);
      if (info) infos.push(info);
    }
    return infos;
  }

  /**
   * Test a connector configuration without caching it.
   */
  static async testConnection(agentId: number): Promise<{
    success: boolean;
    latency_ms: number;
    error?: string;
    details?: Record<string, any>;
  }> {
    const agentResult = await query(
      'SELECT id, connector_type, config FROM agents WHERE id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      return { success: false, latency_ms: 0, error: 'Agent not found' };
    }

    const agent = agentResult.rows[0];
    const config: ConnectorConfig = typeof agent.config === 'string'
      ? JSON.parse(agent.config)
      : agent.config;

    const start = Date.now();

    try {
      const connector = BaseConnector.create(agent.connector_type, config);
      await connector.connect();
      const health = await connector.healthCheck();
      await connector.disconnect();

      return {
        success: health !== 'unhealthy',
        latency_ms: Date.now() - start,
        details: { health, ...connector.getConfigSummary() },
      };
    } catch (error: any) {
      return {
        success: false,
        latency_ms: Date.now() - start,
        error: error.message,
      };
    }
  }

  // ─── Private Methods ───

  private startHealthCheck(agentId: number, connector: BaseConnector): void {
    // Check health every 60 seconds
    const interval = setInterval(async () => {
      try {
        await connector.healthCheck();
      } catch {
        // Health check errors are logged but don't crash
      }
    }, 60000);

    this.healthCheckIntervals.set(agentId, interval);
  }
}

// Singleton instance
export const connectorRegistry = new ConnectorRegistry();
