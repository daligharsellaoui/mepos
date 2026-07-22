import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

/**
 * Agent store: manages sync agent instances for the current tenant.
 */
export const useAgentStore = defineStore('agent', () => {
  const agents = ref([])
  const currentAgent = ref(null)
  const heartbeats = ref([])
  const syncStatus = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  const onlineAgents = computed(() => agents.value.filter(a => a.status === 'online'))
  const offlineAgents = computed(() => agents.value.filter(a => a.status === 'offline' || a.status === 'disabled'))

  async function fetchAgents() {
    isLoading.value = true
    error.value = null
    try {
      const { data: res } = await api.getAgents()
      if (res.status === 'success') {
        agents.value = res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to load agents'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchAgent(id) {
    isLoading.value = true
    error.value = null
    try {
      const { data: res } = await api.getAgent(id)
      if (res.status === 'success') {
        currentAgent.value = res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to load agent'
    } finally {
      isLoading.value = false
    }
  }

  async function createAgent(agentData) {
    isLoading.value = true
    error.value = null
    try {
      const { data: res } = await api.createAgent(agentData)
      if (res.status === 'success') {
        agents.value.unshift(res.data)
        return { agent: res.data, secret: res.secret }
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to create agent'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function updateAgent(id, agentData) {
    isLoading.value = true
    error.value = null
    try {
      const { data: res } = await api.updateAgent(id, agentData)
      if (res.status === 'success') {
        const idx = agents.value.findIndex(a => a.id === id)
        if (idx !== -1) agents.value[idx] = res.data
        if (currentAgent.value?.id === id) currentAgent.value = res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to update agent'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function deleteAgent(id) {
    isLoading.value = true
    error.value = null
    try {
      const { data: res } = await api.deleteAgent(id)
      if (res.status === 'success') {
        agents.value = agents.value.filter(a => a.id !== id)
        if (currentAgent.value?.id === id) currentAgent.value = null
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to delete agent'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function enableAgent(id) {
    try {
      const { data: res } = await api.enableAgent(id)
      if (res.status === 'success') {
        const idx = agents.value.findIndex(a => a.id === id)
        if (idx !== -1) agents.value[idx] = res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to enable agent'
      throw err
    }
  }

  async function disableAgent(id) {
    try {
      const { data: res } = await api.disableAgent(id)
      if (res.status === 'success') {
        const idx = agents.value.findIndex(a => a.id === id)
        if (idx !== -1) agents.value[idx] = res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to disable agent'
      throw err
    }
  }

  async function rotateSecret(id) {
    try {
      const { data: res } = await api.rotateAgentSecret(id)
      if (res.status === 'success') {
        const idx = agents.value.findIndex(a => a.id === id)
        if (idx !== -1) agents.value[idx] = res.data
        return res.secret
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to rotate secret'
      throw err
    }
  }

  async function fetchHeartbeats(id, limit = 50) {
    try {
      const { data: res } = await api.getAgentHeartbeats(id, limit)
      if (res.status === 'success') {
        heartbeats.value = res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to load heartbeats'
    }
  }

  async function fetchSyncStatus(id) {
    try {
      const { data: res } = await api.getAgentSyncStatus(id)
      if (res.status === 'success') {
        syncStatus.value = res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to load sync status'
    }
  }

  async function updateConfig(id, config) {
    try {
      const { data: res } = await api.updateAgentConfig(id, config)
      return res.status === 'success'
    } catch (err) {
      error.value = err.response?.data?.message || 'Failed to update config'
      throw err
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    agents, currentAgent, heartbeats, syncStatus, isLoading, error,
    onlineAgents, offlineAgents,
    fetchAgents, fetchAgent, createAgent, updateAgent, deleteAgent,
    enableAgent, disableAgent, rotateSecret,
    fetchHeartbeats, fetchSyncStatus, updateConfig, clearError
  }
})
