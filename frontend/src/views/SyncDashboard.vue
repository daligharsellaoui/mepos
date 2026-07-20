<template>
  <div class="sync-dashboard">
    <div class="page-header">
      <h1>Tableau de Bord de Synchronisation</h1>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="syncStore.fetchDashboardData" :disabled="syncStore.isLoading">
          🔄 Actualiser
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="syncStore.isLoading && !syncStore.agents.length" class="loading-state">
      <div class="spinner"></div>
      <p>Chargement du tableau de bord...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="syncStore.error" class="error-state">
      <div class="error-icon">⚠️</div>
      <p>{{ syncStore.error }}</p>
      <button class="btn btn-primary" @click="syncStore.fetchDashboardData">Réessayer</button>
    </div>

    <template v-else>
      <!-- Overview Cards -->
      <div class="overview-grid">
        <div class="overview-card">
          <div class="card-icon online">🟢</div>
          <div class="card-content">
            <div class="card-value">{{ syncStore.onlineCount }}</div>
            <div class="card-label">Agents en ligne</div>
          </div>
        </div>
        <div class="overview-card">
          <div class="card-icon healthy">💚</div>
          <div class="card-content">
            <div class="card-value">{{ syncStore.healthyAgents.length }}</div>
            <div class="card-label">Sains</div>
          </div>
        </div>
        <div class="overview-card">
          <div class="card-icon unhealthy">🔴</div>
          <div class="card-content">
            <div class="card-value">{{ syncStore.unhealthyAgents.length }}</div>
            <div class="card-label">Problèmes</div>
          </div>
        </div>
        <div class="overview-card">
          <div class="card-icon total">📊</div>
          <div class="card-content">
            <div class="card-value">{{ syncStore.totalCount }}</div>
            <div class="card-label">Total agents</div>
          </div>
        </div>
      </div>

      <!-- Agent Status Grid -->
      <div v-if="syncStore.agents.length === 0" class="empty-state">
        <div class="empty-icon">🤖</div>
        <h3>Aucun agent configuré</h3>
        <p>Créez des agents de synchronisation pour connecter vos systèmes POS.</p>
      </div>

      <div v-else class="agent-grid">
        <div
          v-for="agent in syncStore.agents"
          :key="agent.id"
          class="agent-status-card"
          :class="[agent.status, agent.health_status]"
          @click="selectAgent(agent)"
        >
          <div class="agent-status-header">
            <div class="status-indicator" :class="agent.status"></div>
            <h3>{{ agent.name }}</h3>
            <span class="connector-badge">{{ agent.connector_type }}</span>
          </div>

          <div class="agent-metrics">
            <div class="metric">
              <span class="metric-label">Version</span>
              <span class="metric-value">{{ agent.version || 'N/A' }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Dernière synchro</span>
              <span class="metric-value">{{ formatRelativeTime(agent.last_sync_at) }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Heartbeat</span>
              <span class="metric-value">{{ formatRelativeTime(agent.last_heartbeat_at) }}</span>
            </div>
          </div>

          <div class="agent-health">
            <span class="health-badge" :class="agent.health_status">
              {{ healthLabel(agent.health_status) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Agent Detail Panel -->
      <div v-if="syncStore.selectedAgent" class="detail-panel">
        <div class="detail-header">
          <h2>{{ syncStore.selectedAgent.name }}</h2>
          <button class="btn btn-sm btn-secondary" @click="syncStore.clearSelection">✕ Fermer</button>
        </div>

        <div class="detail-tabs">
          <button :class="{ active: detailTab === 'status' }" @click="detailTab = 'status'">Statut</button>
          <button :class="{ active: detailTab === 'heartbeats' }" @click="detailTab = 'heartbeats'">Heartbeats</button>
          <button :class="{ active: detailTab === 'timeline' }" @click="detailTab = 'timeline'">Chronologie</button>
        </div>

        <div v-if="detailTab === 'status'" class="tab-content">
          <div class="status-grid">
            <div class="status-item">
              <span class="label">Statut</span>
              <span class="value" :class="syncStore.selectedAgent.status">{{ statusLabel(syncStore.selectedAgent.status) }}</span>
            </div>
            <div class="status-item">
              <span class="label">Santé</span>
              <span class="value" :class="syncStore.selectedAgent.health_status">{{ healthLabel(syncStore.selectedAgent.health_status) }}</span>
            </div>
            <div class="status-item">
              <span class="label">Connecteur</span>
              <span class="value">{{ syncStore.selectedAgent.connector_type }}</span>
            </div>
            <div class="status-item">
              <span class="label">Machine</span>
              <span class="value">{{ syncStore.selectedAgent.machine_name || 'N/A' }}</span>
            </div>
            <div class="status-item">
              <span class="label">OS</span>
              <span class="value">{{ syncStore.selectedAgent.operating_system || 'N/A' }}</span>
            </div>
            <div class="status-item">
              <span class="label">Dernière synchro</span>
              <span class="value">{{ formatDate(syncStore.selectedAgent.last_sync_at) }}</span>
            </div>
          </div>

          <div v-if="syncStore.syncStatus" class="sync-info">
            <h3>Informations de synchronisation</h3>
            <div class="status-grid">
              <div class="status-item">
                <span class="label">Statut synchro</span>
                <span class="value">{{ syncStore.syncStatus.status || 'N/A' }}</span>
              </div>
              <div class="status-item">
                <span class="label">Dernier heartbeat</span>
                <span class="value">{{ formatDate(syncStore.syncStatus.last_heartbeat) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="detailTab === 'heartbeats'" class="tab-content">
          <div v-if="syncStore.heartbeats.length === 0" class="empty-state-sm">
            <p>Aucun heartbeat enregistré.</p>
          </div>
          <div v-else class="heartbeat-list">
            <div v-for="hb in syncStore.heartbeats.slice(0, 50)" :key="hb.id" class="heartbeat-item" :class="hb.health_status">
              <div class="hb-time">{{ formatDate(hb.created_at) }}</div>
              <div class="hb-info">
                <span class="badge" :class="hb.status">{{ hb.status }}</span>
                <span class="badge" :class="hb.health_status">{{ hb.health_status }}</span>
                <span v-if="hb.version" class="hb-version">v{{ hb.version }}</span>
                <span v-if="hb.connector_status" class="hb-connector">{{ hb.connector_status }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="detailTab === 'timeline'" class="tab-content">
          <div class="timeline">
            <div v-for="hb in syncStore.heartbeats.slice(0, 20)" :key="hb.id" class="timeline-item">
              <div class="timeline-dot" :class="hb.health_status"></div>
              <div class="timeline-content">
                <div class="timeline-time">{{ formatDate(hb.created_at) }}</div>
                <div class="timeline-details">
                  <span v-if="hb.tickets_imported">{{ hb.tickets_imported }} tickets importés</span>
                  <span v-if="hb.errors_count > 0" class="error-count">{{ hb.errors_count }} erreurs</span>
                  <span v-if="hb.sync_duration_ms">{{ hb.sync_duration_ms }}ms</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Auto-refresh indicator -->
      <div v-if="syncStore.lastRefresh" class="last-refresh">
        Dernière actualisation : {{ formatRelativeTime(syncStore.lastRefresh) }}
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSyncStore } from '../stores/sync'

const syncStore = useSyncStore()
const detailTab = ref('status')
let refreshInterval = null

onMounted(() => {
  syncStore.fetchDashboardData()
  // Auto-refresh every 30 seconds
  refreshInterval = setInterval(() => {
    syncStore.fetchDashboardData()
  }, 30000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})

function selectAgent(agent) {
  syncStore.fetchAgentDetails(agent.id)
  detailTab.value = 'status'
}

function statusLabel(status) {
  const labels = { online: 'En ligne', offline: 'Hors ligne', disabled: 'Désactivé', error: 'Erreur' }
  return labels[status] || status
}

function healthLabel(health) {
  const labels = { healthy: 'Sain', degraded: 'Dégradé', unhealthy: 'Malsain', unknown: 'Inconnu' }
  return labels[health] || health
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleString('fr-FR')
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Jamais'
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `il y a ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}
</script>

<style scoped>
.sync-dashboard { padding: 24px; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-header h1 { font-size: 24px; font-weight: 700; color: #1a1a2e; }

/* Overview Cards */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.overview-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.card-icon { font-size: 28px; }
.card-value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
.card-label { font-size: 13px; color: #64748b; }

/* Agent Grid */
.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.agent-status-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.agent-status-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.agent-status-card.online { border-left: 4px solid #10b981; }
.agent-status-card.offline { border-left: 4px solid #f59e0b; }
.agent-status-card.disabled { border-left: 4px solid #94a3b8; opacity: 0.7; }

.agent-status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.status-indicator {
  width: 10px; height: 10px; border-radius: 50%; background: #94a3b8;
}
.status-indicator.online { background: #10b981; }
.status-indicator.offline { background: #f59e0b; }
.agent-status-header h3 { margin: 0; font-size: 16px; flex: 1; }
.connector-badge {
  font-size: 11px; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; color: #64748b;
}

.agent-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
}
.metric { text-align: center; }
.metric-label { display: block; font-size: 11px; color: #64748b; }
.metric-value { font-size: 13px; font-weight: 500; color: #1a1a2e; }

.health-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}
.health-badge.healthy { background: #d1fae5; color: #065f46; }
.health-badge.degraded { background: #fef3c7; color: #92400e; }
.health-badge.unhealthy { background: #fee2e2; color: #991b1b; }
.health-badge.unknown { background: #e2e8f0; color: #475569; }

/* Detail Panel */
.detail-panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.detail-header h2 { margin: 0; font-size: 18px; }

.detail-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 2px solid #e2e8f0;
}
.detail-tabs button {
  padding: 8px 16px; background: none; border: none;
  font-size: 14px; cursor: pointer; color: #64748b;
  border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.detail-tabs button.active { color: #6366f1; border-bottom-color: #6366f1; }

.status-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.status-item {
  padding: 12px; background: #f8fafc; border-radius: 8px;
}
.status-item .label { display: block; font-size: 12px; color: #64748b; margin-bottom: 2px; }
.status-item .value { font-size: 14px; font-weight: 500; color: #1a1a2e; }
.status-item .value.online { color: #10b981; }
.status-item .value.healthy { color: #10b981; }
.status-item .value.unhealthy { color: #ef4444; }

/* Heartbeats */
.heartbeat-list { max-height: 400px; overflow-y: auto; }
.heartbeat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.heartbeat-item.healthy { border-left: 3px solid #10b981; }
.heartbeat-item.unhealthy { border-left: 3px solid #ef4444; }
.hb-time { font-size: 13px; color: #64748b; }
.hb-info { display: flex; gap: 6px; align-items: center; }
.hb-version { font-size: 12px; color: #64748b; }
.hb-connector { font-size: 12px; color: #6366f1; }

.badge {
  padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;
}
.badge.online { background: #d1fae5; color: #065f46; }
.badge.healthy { background: #d1fae5; color: #065f46; }
.badge.offline { background: #fef3c7; color: #92400e; }
.badge.unhealthy { background: #fee2e2; color: #991b1b; }

/* Timeline */
.timeline { position: relative; padding-left: 24px; }
.timeline::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e2e8f0;
}
.timeline-item {
  position: relative;
  padding: 8px 0;
}
.timeline-dot {
  position: absolute;
  left: -20px;
  top: 12px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #94a3b8;
}
.timeline-dot.healthy { background: #10b981; }
.timeline-dot.unhealthy { background: #ef4444; }
.timeline-dot.degraded { background: #f59e0b; }
.timeline-time { font-size: 12px; color: #64748b; margin-bottom: 4px; }
.timeline-details { font-size: 13px; color: #1a1a2e; display: flex; gap: 12px; }
.error-count { color: #ef4444; }

.last-refresh {
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 24px;
}

/* Sync Info */
.sync-info {
  margin-top: 16px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
}
.sync-info h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #475569;
}

/* States */
.loading-state, .empty-state, .error-state {
  text-align: center; padding: 48px 24px; color: #64748b;
}
.empty-icon, .error-icon { font-size: 48px; margin-bottom: 12px; }
.empty-state h3 { color: #1a1a2e; margin: 8px 0; }

.spinner {
  width: 32px; height: 32px;
  border: 3px solid #e2e8f0; border-top-color: #6366f1;
  border-radius: 50%; animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn {
  padding: 8px 16px; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 500; cursor: pointer;
}
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-primary { background: #6366f1; color: white; }
.btn-secondary { background: #e2e8f0; color: #475569; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.empty-state-sm { text-align: center; padding: 24px; color: #64748b; }
</style>
