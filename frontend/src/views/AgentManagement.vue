<template>
  <div class="agent-management">
    <div class="page-header">
      <h1>Gestion des Agents</h1>
      <button class="btn btn-primary" @click="showCreateModal = true">
        <span class="icon">+</span> Nouvel Agent
      </button>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card online">
        <div class="stat-value">{{ agentStore.onlineAgents.length }}</div>
        <div class="stat-label">En ligne</div>
      </div>
      <div class="stat-card offline">
        <div class="stat-value">{{ agentStore.offlineAgents.length }}</div>
        <div class="stat-label">Hors ligne</div>
      </div>
      <div class="stat-card total">
        <div class="stat-value">{{ agentStore.agents.length }}</div>
        <div class="stat-label">Total</div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="agentStore.isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>Chargement des agents...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="agentStore.agents.length === 0" class="empty-state">
      <div class="empty-icon">🤖</div>
      <h3>Aucun agent configuré</h3>
      <p>Créez votre premier agent de synchronisation pour connecter votre système POS.</p>
      <button class="btn btn-primary" @click="showCreateModal = true">Créer un agent</button>
    </div>

    <!-- Agent List -->
    <div v-else class="agent-grid">
      <div v-for="agent in agentStore.agents" :key="agent.id" class="agent-card" :class="agent.status">
        <div class="agent-header">
          <div class="agent-status" :class="agent.status"></div>
          <h3>{{ agent.name }}</h3>
          <span class="agent-type">{{ agent.connector_type }}</span>
        </div>

        <div class="agent-details">
          <div v-if="agent.machine_name" class="detail">
            <span class="label">Machine:</span>
            <span class="value">{{ agent.machine_name }}</span>
          </div>
          <div v-if="agent.version" class="detail">
            <span class="label">Version:</span>
            <span class="value">{{ agent.version }}</span>
          </div>
          <div class="detail">
            <span class="label">Statut:</span>
            <span class="value status-badge" :class="agent.status">{{ statusLabel(agent.status) }}</span>
          </div>
          <div class="detail">
            <span class="label">Santé:</span>
            <span class="value health-badge" :class="agent.health_status">{{ healthLabel(agent.health_status) }}</span>
          </div>
          <div v-if="agent.last_sync_at" class="detail">
            <span class="label">Dernière synchro:</span>
            <span class="value">{{ formatDate(agent.last_sync_at) }}</span>
          </div>
          <div v-if="agent.last_heartbeat_at" class="detail">
            <span class="label">Dernier heartbeat:</span>
            <span class="value">{{ formatDate(agent.last_heartbeat_at) }}</span>
          </div>
        </div>

        <div class="agent-actions">
          <button v-if="agent.status !== 'disabled'" class="btn btn-sm btn-warning" @click="handleDisable(agent)" title="Désactiver">
            ⏸
          </button>
          <button v-if="agent.status === 'disabled'" class="btn btn-sm btn-success" @click="handleEnable(agent)" title="Activer">
            ▶
          </button>
          <button class="btn btn-sm btn-info" @click="viewDetails(agent)" title="Détails">
            📋
          </button>
          <button class="btn btn-sm btn-warning" @click="handleRotateSecret(agent)" title="Rotation du secret">
            🔑
          </button>
          <button class="btn btn-sm btn-danger" @click="handleDelete(agent)" title="Supprimer">
            🗑
          </button>
        </div>
      </div>
    </div>

    <!-- Create Agent Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>Nouvel Agent</h2>
          <button class="close-btn" @click="showCreateModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Nom de l'agent *</label>
            <input v-model="newAgent.name" type="text" placeholder="Ex: Kitchen Terminal" />
          </div>
          <div class="form-group">
            <label>Nom de la machine</label>
            <input v-model="newAgent.machine_name" type="text" placeholder="Ex: kitchen-pc-01" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Type de connecteur</label>
              <select v-model="newAgent.connector_type">
                <option value="database">Base de données</option>
                <option value="api">API REST</option>
              </select>
            </div>
            <div class="form-group">
              <label>Système d'exploitation</label>
              <input v-model="newAgent.operating_system" type="text" placeholder="Ex: Windows 11" />
            </div>
          </div>
          <div class="form-group">
            <label>Version</label>
            <input v-model="newAgent.version" type="text" placeholder="Ex: 2.5.0" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showCreateModal = false">Annuler</button>
          <button class="btn btn-primary" @click="handleCreate" :disabled="!newAgent.name">
            Créer l'agent
          </button>
        </div>
      </div>
    </div>

    <!-- Secret Display Modal -->
    <div v-if="showSecretModal" class="modal-overlay" @click.self="showSecretModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>🔑 Secret de l'Agent</h2>
          <button class="close-btn" @click="showSecretModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="secret-warning">
            <p>⚠️ <strong>Important :</strong> Ce secret ne sera affiché qu'une seule fois. Copiez-le et stockez-le en lieu sûr.</p>
          </div>
          <div class="secret-display">
            <code>{{ createdSecret }}</code>
          </div>
          <div class="secret-info">
            <p><strong>ID de l'agent :</strong> {{ createdAgentId }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="copySecret">Copier le secret</button>
          <button class="btn btn-secondary" @click="showSecretModal = false">Fermer</button>
        </div>
      </div>
    </div>

    <!-- Details Modal -->
    <div v-if="showDetailsModal" class="modal-overlay" @click.self="showDetailsModal = false">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h2>Détails de l'Agent : {{ selectedAgent?.name }}</h2>
          <button class="close-btn" @click="showDetailsModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="details-tabs">
            <button :class="{ active: detailsTab === 'info' }" @click="detailsTab = 'info'">Informations</button>
            <button :class="{ active: detailsTab === 'heartbeats' }" @click="detailsTab = 'heartbeats'">Heartbeats</button>
            <button :class="{ active: detailsTab === 'config' }" @click="detailsTab = 'config'">Configuration</button>
          </div>

          <div v-if="detailsTab === 'info'" class="tab-content">
            <div class="detail-grid">
              <div class="detail-item">
                <span class="label">ID:</span>
                <span class="value">{{ selectedAgent?.id }}</span>
              </div>
              <div class="detail-item">
                <span class="label">UUID:</span>
                <span class="value mono">{{ selectedAgent?.uuid }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Nom:</span>
                <span class="value">{{ selectedAgent?.name }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Machine:</span>
                <span class="value">{{ selectedAgent?.machine_name || 'N/A' }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Connecteur:</span>
                <span class="value">{{ selectedAgent?.connector_type }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Version:</span>
                <span class="value">{{ selectedAgent?.version || 'N/A' }}</span>
              </div>
              <div class="detail-item">
                <span class="label">Créé le:</span>
                <span class="value">{{ formatDate(selectedAgent?.created_at) }}</span>
              </div>
            </div>
          </div>

          <div v-if="detailsTab === 'heartbeats'" class="tab-content">
            <div v-if="agentStore.heartbeats.length === 0" class="empty-state-sm">
              <p>Aucun heartbeat enregistré.</p>
            </div>
            <table v-else class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Version</th>
                  <th>Statut</th>
                  <th>Santé</th>
                  <th>Synchro</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="hb in agentStore.heartbeats" :key="hb.id">
                  <td>{{ formatDate(hb.created_at) }}</td>
                  <td>{{ hb.version || 'N/A' }}</td>
                  <td><span class="badge" :class="hb.status">{{ hb.status }}</span></td>
                  <td><span class="badge" :class="hb.health_status">{{ hb.health_status }}</span></td>
                  <td>{{ hb.connector_status || 'N/A' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="detailsTab === 'config'" class="tab-content">
            <div class="config-display">
              <pre>{{ JSON.stringify(selectedAgent?.config || {}, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAgentStore } from '../stores/agent'

const agentStore = useAgentStore()

const showCreateModal = ref(false)
const showSecretModal = ref(false)
const showDetailsModal = ref(false)
const createdSecret = ref('')
const createdAgentId = ref(null)
const selectedAgent = ref(null)
const detailsTab = ref('info')

const newAgent = ref({
  name: '',
  machine_name: '',
  connector_type: 'database',
  operating_system: '',
  version: '',
})

onMounted(() => {
  agentStore.fetchAgents()
})

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

async function handleCreate() {
  try {
    const result = await agentStore.createAgent(newAgent.value)
    createdSecret.value = result.secret
    createdAgentId.value = result.agent.id
    showCreateModal.value = false
    showSecretModal.value = true
    newAgent.value = { name: '', machine_name: '', connector_type: 'database', operating_system: '', version: '' }
  } catch (err) {
    console.error('Failed to create agent:', err)
  }
}

async function handleDelete(agent) {
  if (confirm(`Supprimer l'agent "${agent.name}" ? Cette action est irréversible.`)) {
    await agentStore.deleteAgent(agent.id)
  }
}

async function handleEnable(agent) {
  await agentStore.enableAgent(agent.id)
}

async function handleDisable(agent) {
  await agentStore.disableAgent(agent.id)
}

async function handleRotateSecret(agent) {
  if (confirm(`Rotir le secret de l'agent "${agent.name}" ? L'ancien secret sera immédiatement révoqué.`)) {
    const newSecret = await agentStore.rotateSecret(agent.id)
    createdSecret.value = newSecret
    createdAgentId.value = agent.id
    showSecretModal.value = true
  }
}

function viewDetails(agent) {
  selectedAgent.value = agent
  detailsTab.value = 'info'
  showDetailsModal.value = true
  agentStore.fetchHeartbeats(agent.id)
  agentStore.fetchSyncStatus(agent.id)
}

function copySecret() {
  navigator.clipboard.writeText(createdSecret.value)
  alert('Secret copié dans le presse-papier !')
}
</script>

<style scoped>
.agent-management {
  padding: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-header h1 {
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.stat-card.online { border-left: 4px solid #10b981; }
.stat-card.offline { border-left: 4px solid #f59e0b; }
.stat-card.total { border-left: 4px solid #6366f1; }

.stat-value { font-size: 32px; font-weight: 700; color: #1a1a2e; }
.stat-label { font-size: 14px; color: #64748b; margin-top: 4px; }

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.agent-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: transform 0.2s;
}
.agent-card:hover { transform: translateY(-2px); }
.agent-card.online { border-top: 3px solid #10b981; }
.agent-card.offline { border-top: 3px solid #f59e0b; }
.agent-card.disabled { border-top: 3px solid #94a3b8; opacity: 0.7; }

.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.agent-status {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #94a3b8;
}
.agent-status.online { background: #10b981; }
.agent-status.offline { background: #f59e0b; }

.agent-header h3 { margin: 0; font-size: 16px; flex: 1; }
.agent-type { font-size: 12px; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }

.agent-details { margin-bottom: 12px; }
.detail { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.detail .label { color: #64748b; }
.detail .value { color: #1a1a2e; font-weight: 500; }

.status-badge, .health-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}
.status-badge.online { background: #d1fae5; color: #065f46; }
.status-badge.offline { background: #fef3c7; color: #92400e; }
.status-badge.disabled { background: #e2e8f0; color: #475569; }
.health-badge.healthy { background: #d1fae5; color: #065f46; }
.health-badge.degraded { background: #fef3c7; color: #92400e; }
.health-badge.unhealthy { background: #fee2e2; color: #991b1b; }
.health-badge.unknown { background: #e2e8f0; color: #475569; }

.agent-actions {
  display: flex;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-sm { padding: 4px 8px; font-size: 12px; }
.btn-primary { background: #6366f1; color: white; }
.btn-primary:hover { background: #4f46e5; }
.btn-secondary { background: #e2e8f0; color: #475569; }
.btn-success { background: #10b981; color: white; }
.btn-warning { background: #f59e0b; color: white; }
.btn-danger { background: #ef4444; color: white; }
.btn-info { background: #3b82f6; color: white; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
}
.modal-lg { max-width: 700px; }
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e2e8f0;
}
.modal-header h2 { margin: 0; font-size: 18px; }
.close-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b; }
.modal-body { padding: 20px; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
}

.form-group { margin-bottom: 16px; }
.form-group label { display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; color: #374151; }
.form-group input, .form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
}
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.secret-warning {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}
.secret-warning p { margin: 0; font-size: 13px; color: #92400e; }

.secret-display {
  background: #1e293b;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}
.secret-display code {
  color: #10b981;
  font-family: monospace;
  font-size: 14px;
  word-break: break-all;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.detail-item { padding: 8px; background: #f8fafc; border-radius: 6px; }
.detail-item .label { display: block; font-size: 12px; color: #64748b; }
.detail-item .value { font-size: 14px; font-weight: 500; color: #1a1a2e; }
.detail-item .value.mono { font-family: monospace; font-size: 12px; }

.details-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: 2px solid #e2e8f0;
}
.details-tabs button {
  padding: 8px 16px;
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  color: #64748b;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}
.details-tabs button.active {
  color: #6366f1;
  border-bottom-color: #6366f1;
}

.config-display pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  font-size: 13px;
  overflow-x: auto;
}

.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
}
.data-table th { font-weight: 600; color: #64748b; }
.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}
.badge.online { background: #d1fae5; color: #065f46; }
.badge.healthy { background: #d1fae5; color: #065f46; }

.loading-state, .empty-state, .empty-state-sm {
  text-align: center;
  padding: 48px 24px;
  color: #64748b;
}
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-state h3 { color: #1a1a2e; margin: 8px 0; }

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
