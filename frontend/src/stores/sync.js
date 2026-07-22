import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

/**
 * Sync store: manages synchronization dashboard data.
 */
export const useSyncStore = defineStore('sync', () => {
  const agents = ref([])
  const selectedAgent = ref(null)
  const heartbeats = ref([])
  const syncStatus = ref(null)
  const isLoading = ref(false)
  const error = ref(null)
  const lastRefresh = ref(null)

  const healthyAgents = computed(() => agents.value.filter(a => a.health_status === 'healthy'))
  const unhealthyAgents = computed(() => agents.value.filter(a => a.health_status === 'unhealthy' || a.health_status === 'degraded'))
  const onlineCount = computed(() => agents.value.filter(a => a.status === 'online').length)
  const totalCount = computed(() => agents.value.length)

  async function fetchDashboardData() {
    if (isLoading.value) return
    isLoading.value = true
    error.value = null
    try {
      const { data: res } = await api.getAgents()
      if (res.status === 'success') {
        agents.value = res.data
      }
      lastRefresh.value = new Date().toISOString()
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to load dashboard data'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchAgentDetails(agentId) {
    isLoading.value = true
    error.value = null
    try {
      const { data: res } = await api.getAgent(agentId)
      if (res.status === 'success') {
        selectedAgent.value = res.data
      }

      const { data: hbRes } = await api.getAgentHeartbeats(agentId, 100)
      if (hbRes.status === 'success') {
        heartbeats.value = hbRes.data
      }

      const { data: ssRes } = await api.getAgentSyncStatus(agentId)
      if (ssRes.status === 'success') {
        syncStatus.value = ssRes.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to load agent details'
    } finally {
      isLoading.value = false
    }
  }

  function clearSelection() {
    selectedAgent.value = null
    heartbeats.value = []
    syncStatus.value = null
  }

  function clearError() {
    error.value = null
  }

  return {
    agents, selectedAgent, heartbeats, syncStatus, isLoading, error, lastRefresh,
    healthyAgents, unhealthyAgents, onlineCount, totalCount,
    fetchDashboardData, fetchAgentDetails, clearSelection, clearError
  }
})
