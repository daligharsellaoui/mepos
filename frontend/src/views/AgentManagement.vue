<template>
  <PageContainer
    title="🤖 Gestion des Agents"
    subtitle="Configurez et surveillez les agents de synchronisation POS."
  >
    <template #actions>
      <button
        class="touch-btn"
        style="padding: 0.5rem 1.2rem; min-height: 40px;"
        @click="showCreateModal = true"
      >
        + Nouvel Agent
      </button>
    </template>

    <!-- Stats Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
      <div class="glass-panel" style="padding: 1.25rem; text-align: center; border-left: 4px solid #10b981;">
        <div style="font-size: 2rem; font-weight: 800; color: var(--text-primary);">{{ agentStore.onlineAgents.length }}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">En ligne</div>
      </div>
      <div class="glass-panel" style="padding: 1.25rem; text-align: center; border-left: 4px solid #f59e0b;">
        <div style="font-size: 2rem; font-weight: 800; color: var(--text-primary);">{{ agentStore.offlineAgents.length }}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">Hors ligne</div>
      </div>
      <div class="glass-panel" style="padding: 1.25rem; text-align: center; border-left: 4px solid #6366f1;">
        <div style="font-size: 2rem; font-weight: 800; color: var(--text-primary);">{{ agentStore.agents.length }}</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">Total</div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="agentStore.isLoading" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
      <div class="spinner" style="margin: 0 auto 1rem;" />
      <p>Chargement des agents...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="agentStore.agents.length === 0" style="text-align: center; padding: 4rem 2rem;">
      <EmptyState
        title="Aucun agent configuré"
        description="Créez votre premier agent de synchronisation pour connecter votre système POS."
        action-label="Créer un agent"
        @action="showCreateModal = true"
      />
    </div>

    <!-- Agent List -->
    <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem;">
      <div
        v-for="agent in agentStore.agents"
        :key="agent.id"
        class="glass-panel"
        :style="{ padding: '1.25rem', borderTop: `3px solid ${agent.status === 'online' ? '#10b981' : agent.status === 'offline' ? '#f59e0b' : '#94a3b8'}`, opacity: agent.status === 'disabled' ? 0.7 : 1 }"
      >
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
          <span
            :style="{ width: '10px', height: '10px', borderRadius: '50%', background: agent.status === 'online' ? '#10b981' : agent.status === 'offline' ? '#f59e0b' : '#94a3b8', flexShrink: 0 }"
          />
          <h3 style="font-size: 1rem; font-weight: 700; margin: 0; flex: 1; color: var(--text-primary);">{{ agent.name }}</h3>
          <span class="badge badge-info" style="font-size: 0.7rem;">{{ agent.connector_type }}</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; margin-bottom: 0.75rem;">
          <div v-if="agent.machine_name" style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Machine:</span>
            <span style="color: var(--text-primary); font-weight: 500;">{{ agent.machine_name }}</span>
          </div>
          <div v-if="agent.version" style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Version:</span>
            <span style="color: var(--text-primary); font-weight: 500;">{{ agent.version }}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Statut:</span>
            <span :class="['badge', agent.status === 'online' ? 'badge-success' : agent.status === 'offline' ? 'badge-warn' : agent.status === 'disabled' ? '' : 'badge-danger']" style="font-size: 0.7rem;">
              {{ statusLabel(agent.status) }}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Santé:</span>
            <span :class="['badge', agent.health_status === 'healthy' ? 'badge-success' : agent.health_status === 'degraded' ? 'badge-warn' : agent.health_status === 'unhealthy' ? 'badge-danger' : '']" style="font-size: 0.7rem;">
              {{ healthLabel(agent.health_status) }}
            </span>
          </div>
          <div v-if="agent.last_sync_at" style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Dernière synchro:</span>
            <span style="color: var(--text-primary); font-weight: 500;">{{ formatDate(agent.last_sync_at) }}</span>
          </div>
          <div v-if="agent.last_heartbeat_at" style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-secondary);">Dernier heartbeat:</span>
            <span style="color: var(--text-primary); font-weight: 500;">{{ formatDate(agent.last_heartbeat_at) }}</span>
          </div>
        </div>

        <div style="display: flex; gap: 0.4rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
          <button
            v-if="agent.status !== 'disabled'"
            class="touch-btn touch-btn-secondary"
            style="padding: 0.3rem 0.7rem; min-height: 32px; font-size: 0.8rem;"
            title="Désactiver"
            @click="handleDisable(agent)"
          >
            ⏸ Désactiver
          </button>
          <button
            v-if="agent.status === 'disabled'"
            class="touch-btn touch-btn-secondary"
            style="padding: 0.3rem 0.7rem; min-height: 32px; font-size: 0.8rem;"
            title="Activer"
            @click="handleEnable(agent)"
          >
            ▶ Activer
          </button>
          <button
            class="touch-btn touch-btn-secondary"
            style="padding: 0.3rem 0.7rem; min-height: 32px; font-size: 0.8rem;"
            title="Détails"
            @click="viewDetails(agent)"
          >
            ℹ️ Détails
          </button>
          <button
            class="touch-btn touch-btn-secondary"
            style="padding: 0.3rem 0.7rem; min-height: 32px; font-size: 0.8rem;"
            title="Rotation du secret"
            @click="handleRotateSecret(agent)"
          >
            🔑 Secret
          </button>
          <button
            class="touch-btn touch-btn-danger"
            style="padding: 0.3rem 0.7rem; min-height: 32px; font-size: 0.8rem;"
            title="Supprimer"
            @click="handleDeleteClick(agent)"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>

    <!-- Create Agent Modal -->
    <Modal
      :is-open="showCreateModal"
      title="Nouvel Agent"
      max-width="520px"
      @close="showCreateModal = false"
    >
      <div class="form-group">
        <label class="form-label">Nom de l'agent *</label>
        <input v-model="newAgent.name" class="form-input" type="text" placeholder="Ex: Kitchen Terminal" />
      </div>
      <div class="form-group">
        <label class="form-label">Nom de la machine</label>
        <input v-model="newAgent.machine_name" class="form-input" type="text" placeholder="Ex: kitchen-pc-01" />
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; overflow-x: auto;">
        <div class="form-group" style="min-width: 0;">
          <label class="form-label">Type de connecteur</label>
          <select v-model="newAgent.connector_type" class="form-select">
            <option value="database">Base de données</option>
            <option value="api">API REST</option>
          </select>
        </div>
        <div class="form-group" style="min-width: 0;">
          <label class="form-label">Système d'exploitation</label>
          <input v-model="newAgent.operating_system" class="form-input" type="text" placeholder="Ex: Windows 11" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Version</label>
        <input v-model="newAgent.version" class="form-input" type="text" placeholder="Ex: 2.5.0" />
      </div>
      <template #footer>
        <button class="touch-btn touch-btn-secondary" @click="showCreateModal = false">Annuler</button>
        <button class="touch-btn" :disabled="!newAgent.name" @click="handleCreate">Créer l'agent</button>
      </template>
    </Modal>

    <!-- Secret Display Modal -->
    <Modal
      :is-open="showSecretModal"
      title="Secret de l'Agent"
      max-width="480px"
      @close="showSecretModal = false"
    >
      <div style="padding: 1rem; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); border-radius: var(--radius-md); margin-bottom: 1rem;">
        <p style="margin: 0; font-size: 0.85rem; color: var(--amber);">
          <strong>Important :</strong> Ce secret ne sera affiché qu'une seule fois. Copiez-le et stockez-le en lieu sûr.
        </p>
      </div>
      <div style="background: #1e293b; border-radius: var(--radius-md); padding: 1rem; margin-bottom: 0.75rem;">
        <code style="color: #10b981; font-family: monospace; font-size: 0.9rem; word-break: break-all;">{{ createdSecret }}</code>
      </div>
      <div style="font-size: 0.85rem; color: var(--text-secondary);">
        <strong>ID de l'agent :</strong> {{ createdAgentId }}
      </div>
      <template #footer>
        <button class="touch-btn" @click="copySecret">Copier le secret</button>
        <button class="touch-btn touch-btn-secondary" @click="showSecretModal = false">Fermer</button>
      </template>
    </Modal>

    <!-- Details Modal -->
    <Modal
      :is-open="showDetailsModal"
      :title="`Détails de l'Agent : ${selectedAgent?.name}`"
      max-width="680px"
      @close="showDetailsModal = false"
    >
      <div style="display: flex; gap: 0.25rem; border-bottom: 2px solid var(--border-color); margin-bottom: 1rem;">
        <button
          v-for="tab in ['info', 'heartbeats', 'config']"
          :key="tab"
          :style="{ padding: '0.5rem 1rem', background: 'none', border: 'none', borderBottom: `2px solid ${detailsTab === tab ? 'var(--indigo)' : 'transparent'}`, color: detailsTab === tab ? 'var(--indigo-light)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: detailsTab === tab ? 700 : 500, fontSize: '0.9rem', marginBottom: '-2px' }"
          @click="detailsTab = tab"
        >
          {{ tab === 'info' ? 'Informations' : tab === 'heartbeats' ? 'Heartbeats' : 'Configuration' }}
        </button>
      </div>

      <div v-if="detailsTab === 'info'">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div style="padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
            <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">ID:</span>
            <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ selectedAgent?.id }}</span>
          </div>
          <div style="padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
            <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">UUID:</span>
            <span style="font-size: 0.8rem; font-weight: 500; font-family: monospace; color: var(--text-primary);">{{ selectedAgent?.uuid }}</span>
          </div>
          <div style="padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
            <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Nom:</span>
            <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ selectedAgent?.name }}</span>
          </div>
          <div style="padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
            <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Machine:</span>
            <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ selectedAgent?.machine_name || 'N/A' }}</span>
          </div>
          <div style="padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
            <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Connecteur:</span>
            <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ selectedAgent?.connector_type }}</span>
          </div>
          <div style="padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
            <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Version:</span>
            <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ selectedAgent?.version || 'N/A' }}</span>
          </div>
          <div style="padding: 0.5rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
            <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Créé le:</span>
            <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ formatDate(selectedAgent?.created_at) }}</span>
          </div>
        </div>
      </div>

      <div v-if="detailsTab === 'heartbeats'">
        <div v-if="agentStore.heartbeats.length === 0" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          Aucun heartbeat enregistré.
        </div>
        <div v-else style="max-height: 350px; overflow-y: auto;">
          <table class="mepos-table">
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
                <td><span :class="['badge', hb.status === 'online' ? 'badge-success' : 'badge-warn']" style="font-size: 0.7rem;">{{ hb.status }}</span></td>
                <td><span :class="['badge', hb.health_status === 'healthy' ? 'badge-success' : hb.health_status === 'degraded' ? 'badge-warn' : 'badge-danger']" style="font-size: 0.7rem;">{{ hb.health_status }}</span></td>
                <td>{{ hb.connector_status || 'N/A' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="detailsTab === 'config'">
        <pre style="background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: var(--radius-md); font-size: 0.85rem; overflow-x: auto;">{{ JSON.stringify(selectedAgent?.config || {}, null, 2) }}</pre>
      </div>
    </Modal>

    <!-- Delete Confirmation -->
    <ConfirmDialog
      :is-open="showDeleteConfirm"
      title="Supprimer l'agent"
      :message="deletingAgent ? `Êtes-vous sûr de vouloir supprimer l'agent « ${deletingAgent.name} » ? Cette action est irréversible.` : ''"
      confirm-label="Supprimer"
      variant="danger"
      @confirm="handleDeleteConfirm"
      @cancel="showDeleteConfirm = false"
      @close="showDeleteConfirm = false"
    />
  </PageContainer>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAgentStore } from '../stores/agent'
import PageContainer from '../components/base/PageContainer.vue'
import Modal from '../components/base/Modal.vue'
import EmptyState from '../components/base/EmptyState.vue'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'

const agentStore = useAgentStore()

const showCreateModal = ref(false)
const showSecretModal = ref(false)
const showDetailsModal = ref(false)
const showDeleteConfirm = ref(false)
const createdSecret = ref('')
const createdAgentId = ref(null)
const selectedAgent = ref(null)
const detailsTab = ref('info')
const deletingAgent = ref(null)

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
  return new Date(dateStr).toLocaleString('fr-TN')
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

function handleDeleteClick(agent) {
  deletingAgent.value = agent
  showDeleteConfirm.value = true
}

async function handleDeleteConfirm() {
  await agentStore.deleteAgent(deletingAgent.value.id)
  showDeleteConfirm.value = false
  deletingAgent.value = null
}

async function handleEnable(agent) {
  await agentStore.enableAgent(agent.id)
}

async function handleDisable(agent) {
  await agentStore.disableAgent(agent.id)
}

async function handleRotateSecret(agent) {
  const newSecret = await agentStore.rotateSecret(agent.id)
  createdSecret.value = newSecret
  createdAgentId.value = agent.id
  showSecretModal.value = true
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
}
</script>
