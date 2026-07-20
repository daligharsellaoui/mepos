<template>
  <PageContainer
    title="Tableau de Bord de Synchronisation"
    subtitle="Surveillez l'état et la santé de vos agents de synchronisation POS."
  >
    <template #actions>
      <button class="touch-btn touch-btn-secondary" @click="syncStore.fetchDashboardData" :disabled="syncStore.isLoading" style="min-height: 40px;">
        🔄 Actualiser
      </button>
    </template>

    <!-- Loading State -->
    <div v-if="syncStore.isLoading && !syncStore.agents.length" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
      <div class="spinner" style="margin: 0 auto 1rem;" />
      <p>Chargement du tableau de bord...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="syncStore.error" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
      <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚠️</div>
      <p>{{ syncStore.error }}</p>
      <button class="touch-btn" @click="syncStore.fetchDashboardData" style="margin-top: 0.5rem;">Réessayer</button>
    </div>

    <template v-else>
      <!-- Overview Stats -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="glass-panel" style="padding: 1.25rem; display: flex; align-items: center; gap: 1rem; border-left: 4px solid #10b981;">
          <span style="font-size: 1.75rem;">🟢</span>
          <div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-primary);">{{ syncStore.onlineCount }}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Agents en ligne</div>
          </div>
        </div>
        <div class="glass-panel" style="padding: 1.25rem; display: flex; align-items: center; gap: 1rem; border-left: 4px solid #10b981;">
          <span style="font-size: 1.75rem;">💚</span>
          <div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-primary);">{{ syncStore.healthyAgents.length }}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Sains</div>
          </div>
        </div>
        <div class="glass-panel" style="padding: 1.25rem; display: flex; align-items: center; gap: 1rem; border-left: 4px solid #ef4444;">
          <span style="font-size: 1.75rem;">🔴</span>
          <div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-primary);">{{ syncStore.unhealthyAgents.length }}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Problèmes</div>
          </div>
        </div>
        <div class="glass-panel" style="padding: 1.25rem; display: flex; align-items: center; gap: 1rem; border-left: 4px solid #6366f1;">
          <span style="font-size: 1.75rem;">📊</span>
          <div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--text-primary);">{{ syncStore.totalCount }}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">Total agents</div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="syncStore.agents.length === 0" style="text-align: center; padding: 4rem 2rem;">
        <div style="font-size: 3rem; margin-bottom: 0.75rem;">🤖</div>
        <h3 style="margin: 0 0 0.5rem; color: var(--text-primary);">Aucun agent configuré</h3>
        <p style="color: var(--text-secondary);">Créez des agents de synchronisation pour connecter vos systèmes POS.</p>
      </div>

      <!-- Agent Grid -->
      <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div
          v-for="agent in syncStore.agents"
          :key="agent.id"
          class="glass-panel"
          :style="{ padding: '1.25rem', cursor: 'pointer', borderTop: `3px solid ${agent.status === 'online' ? '#10b981' : agent.status === 'offline' ? '#f59e0b' : '#94a3b8'}`, opacity: agent.status === 'disabled' ? 0.7 : 1 }"
          @click="selectAgent(agent)"
        >
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
            <span :style="{ width: '10px', height: '10px', borderRadius: '50%', background: agent.status === 'online' ? '#10b981' : agent.status === 'offline' ? '#f59e0b' : '#94a3b8', flexShrink: 0 }" />
            <h3 style="font-size: 1rem; font-weight: 700; margin: 0; flex: 1; color: var(--text-primary);">{{ agent.name }}</h3>
            <span class="badge badge-info" style="font-size: 0.7rem;">{{ agent.connector_type }}</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;">
            <div style="text-align: center;">
              <div style="font-size: 0.7rem; color: var(--text-secondary);">Version</div>
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">{{ agent.version || 'N/A' }}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 0.7rem; color: var(--text-secondary);">Synchro</div>
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">{{ formatRelativeTime(agent.last_sync_at) }}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 0.7rem; color: var(--text-secondary);">Heartbeat</div>
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">{{ formatRelativeTime(agent.last_heartbeat_at) }}</div>
            </div>
          </div>

          <div style="text-align: center;">
            <span :class="['badge', agent.health_status === 'healthy' ? 'badge-success' : agent.health_status === 'degraded' ? 'badge-warn' : agent.health_status === 'unhealthy' ? 'badge-danger' : '']" style="font-size: 0.7rem;">
              {{ healthLabel(agent.health_status) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Agent Detail Panel -->
      <div v-if="syncStore.selectedAgent" class="glass-panel" style="padding: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin: 0;">{{ syncStore.selectedAgent.name }}</h2>
          <button class="touch-btn touch-btn-secondary" style="min-height: 32px; font-size: 0.85rem;" @click="syncStore.clearSelection">✕ Fermer</button>
        </div>

        <div style="display: flex; gap: 0.25rem; border-bottom: 2px solid var(--border-color); margin-bottom: 1rem;">
          <button
            v-for="tab in ['status', 'heartbeats', 'timeline']"
            :key="tab"
            :style="{ padding: '0.5rem 1rem', background: 'none', border: 'none', borderBottom: `2px solid ${detailTab === tab ? 'var(--indigo)' : 'transparent'}`, color: detailTab === tab ? 'var(--indigo-light)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: detailTab === tab ? 700 : 500, fontSize: '0.9rem', marginBottom: '-2px' }"
            @click="detailTab = tab"
          >
            {{ tab === 'status' ? 'Statut' : tab === 'heartbeats' ? 'Heartbeats' : 'Chronologie' }}
          </button>
        </div>

        <div v-if="detailTab === 'status'">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div style="padding: 0.75rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
              <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Statut</span>
              <span :class="['badge', syncStore.selectedAgent.status === 'online' ? 'badge-success' : syncStore.selectedAgent.status === 'offline' ? 'badge-warn' : '']" style="font-size: 0.75rem;">{{ statusLabel(syncStore.selectedAgent.status) }}</span>
            </div>
            <div style="padding: 0.75rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
              <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Santé</span>
              <span :class="['badge', syncStore.selectedAgent.health_status === 'healthy' ? 'badge-success' : syncStore.selectedAgent.health_status === 'degraded' ? 'badge-warn' : syncStore.selectedAgent.health_status === 'unhealthy' ? 'badge-danger' : '']" style="font-size: 0.75rem;">{{ healthLabel(syncStore.selectedAgent.health_status) }}</span>
            </div>
            <div style="padding: 0.75rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
              <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Connecteur</span>
              <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ syncStore.selectedAgent.connector_type }}</span>
            </div>
            <div style="padding: 0.75rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
              <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Machine</span>
              <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ syncStore.selectedAgent.machine_name || 'N/A' }}</span>
            </div>
            <div style="padding: 0.75rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
              <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">OS</span>
              <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ syncStore.selectedAgent.operating_system || 'N/A' }}</span>
            </div>
            <div style="padding: 0.75rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm);">
              <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Dernière synchro</span>
              <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ formatDate(syncStore.selectedAgent.last_sync_at) }}</span>
            </div>
          </div>

          <div v-if="syncStore.syncStatus" style="margin-top: 1rem; padding: 1rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-md);">
            <h3 style="font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); margin: 0 0 0.75rem 0;">Informations de synchronisation</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <div>
                <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Statut synchro</span>
                <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ syncStore.syncStatus.status || 'N/A' }}</span>
              </div>
              <div>
                <span style="display: block; font-size: 0.75rem; color: var(--text-secondary);">Dernier heartbeat</span>
                <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-primary);">{{ formatDate(syncStore.syncStatus.last_heartbeat) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="detailTab === 'heartbeats'">
          <div v-if="syncStore.heartbeats.length === 0" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            Aucun heartbeat enregistré.
          </div>
          <div v-else style="max-height: 400px; overflow-y: auto;">
            <div v-for="hb in syncStore.heartbeats.slice(0, 50)" :key="hb.id" :style="{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--border-color)', borderLeft: `3px solid ${hb.health_status === 'healthy' ? '#10b981' : hb.health_status === 'unhealthy' ? '#ef4444' : '#f59e0b'}` }">
              <div style="font-size: 0.85rem; color: var(--text-secondary);">{{ formatDate(hb.created_at) }}</div>
              <div style="display: flex; gap: 0.4rem; align-items: center;">
                <span :class="['badge', hb.status === 'online' ? 'badge-success' : 'badge-warn']" style="font-size: 0.65rem;">{{ hb.status }}</span>
                <span :class="['badge', hb.health_status === 'healthy' ? 'badge-success' : hb.health_status === 'degraded' ? 'badge-warn' : 'badge-danger']" style="font-size: 0.65rem;">{{ hb.health_status }}</span>
                <span v-if="hb.version" style="font-size: 0.75rem; color: var(--text-secondary);">v{{ hb.version }}</span>
                <span v-if="hb.connector_status" style="font-size: 0.75rem; color: var(--indigo-light);">{{ hb.connector_status }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="detailTab === 'timeline'" style="position: relative; padding-left: 1.5rem;">
          <div style="position: absolute; left: 0.5rem; top: 0; bottom: 0; width: 2px; background: var(--border-color);" />
          <div v-for="hb in syncStore.heartbeats.slice(0, 20)" :key="hb.id" style="position: relative; padding: 0.5rem 0;">
            <div :style="{ position: 'absolute', left: '-1.25rem', top: '0.75rem', width: '12px', height: '12px', borderRadius: '50%', background: hb.health_status === 'healthy' ? '#10b981' : hb.health_status === 'unhealthy' ? '#ef4444' : '#f59e0b' }" />
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">{{ formatDate(hb.created_at) }}</div>
            <div style="font-size: 0.85rem; color: var(--text-primary); display: flex; gap: 0.75rem;">
              <span v-if="hb.tickets_imported">{{ hb.tickets_imported }} tickets importés</span>
              <span v-if="hb.errors_count > 0" style="color: #ef4444;">{{ hb.errors_count }} erreurs</span>
              <span v-if="hb.sync_duration_ms">{{ hb.sync_duration_ms }}ms</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Auto-refresh indicator -->
      <div v-if="syncStore.lastRefresh" style="text-align: center; font-size: 0.75rem; color: var(--text-tertiary); margin-top: 1.5rem;">
        Dernière actualisation : {{ formatRelativeTime(syncStore.lastRefresh) }}
      </div>
    </template>
  </PageContainer>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSyncStore } from '../stores/sync'
import PageContainer from '../components/base/PageContainer.vue'

const syncStore = useSyncStore()
const detailTab = ref('status')
let refreshInterval = null

onMounted(() => {
  syncStore.fetchDashboardData()
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
