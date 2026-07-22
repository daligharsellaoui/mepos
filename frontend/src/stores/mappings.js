import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

export const useMappingStore = defineStore('mappings', () => {
  const mappings = ref([])
  const unmappedCount = ref(0)
  const stats = ref(null)
  const isLoading = ref(false)
  const error = ref(null)
  const searchQuery = ref('')
  const statusFilter = ref('')
  const connectorFilter = ref('')
  const totalCount = ref(0)

  const filteredList = computed(() => {
    return mappings.value
  })

  const mappedCount = computed(() => stats.value?.mapped || 0)
  const unmappedStatsCount = computed(() => stats.value?.unmapped || 0)
  const completionPercentage = computed(() => stats.value?.completionPercentage || 0)

  async function fetchMappings(params = {}) {
    isLoading.value = true
    error.value = null
    try {
      const query = {
        ...params,
        ...(searchQuery.value && { search: searchQuery.value }),
        ...(statusFilter.value && { status: statusFilter.value }),
        ...(connectorFilter.value && { connector_type: connectorFilter.value })
      }
      const { data: res } = await api.getMappings(query)
      if (res.status === 'success') {
        mappings.value = res.data
        totalCount.value = res.total || res.data.length
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Erreur lors du chargement'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchStats() {
    try {
      const { data: res } = await api.getMappingStats()
      if (res.status === 'success') {
        stats.value = res.data
        unmappedCount.value = res.data.unmapped || 0
      }
    } catch (err) {
      console.error('Failed to fetch mapping stats:', err)
    }
  }

  async function createMapping(data) {
    try {
      const { data: res } = await api.createMapping(data)
      if (res.status === 'success') {
        await fetchMappings()
        await fetchStats()
        return res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Erreur de création'
      throw err
    }
  }

  async function updateMapping(id, data) {
    try {
      const { data: res } = await api.updateMapping(id, data)
      if (res.status === 'success') {
        await fetchMappings()
        await fetchStats()
        return res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Erreur de mise à jour'
      throw err
    }
  }

  async function deleteMapping(id) {
    try {
      const { data: res } = await api.deleteMapping(id)
      if (res.status === 'success') {
        await fetchMappings()
        await fetchStats()
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Erreur de suppression'
      throw err
    }
  }

  async function bulkMap(mappingData) {
    try {
      const { data: res } = await api.bulkMapMappings({ mappings: mappingData })
      if (res.status === 'success') {
        await fetchMappings()
        await fetchStats()
        return res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || 'Erreur de mapping groupé'
      throw err
    }
  }

  async function autoMatch(connectorType, threshold = 60) {
    isLoading.value = true
    try {
      const { data: res } = await api.autoMatchMappings({ connector_type: connectorType, threshold })
      if (res.status === 'success') {
        await fetchMappings()
        await fetchStats()
        return res.data
      }
    } catch (err) {
      error.value = err.response?.data?.message || "Erreur d'auto-mapping"
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUnmapped(limit = 100) {
    try {
      const { data: res } = await api.getUnmappedProducts({ limit })
      if (res.status === 'success') {
        return res.data
      }
      return []
    } catch (err) {
      console.error('Failed to fetch unmapped products:', err)
      return []
    }
  }

  function setSearch(query) {
    searchQuery.value = query
    fetchMappings()
  }

  function setStatusFilter(status) {
    statusFilter.value = status
    fetchMappings()
  }

  function setConnectorFilter(connector) {
    connectorFilter.value = connector
    fetchMappings()
  }

  return {
    mappings,
    unmappedCount,
    stats,
    isLoading,
    error,
    searchQuery,
    statusFilter,
    connectorFilter,
    totalCount,
    filteredList,
    mappedCount,
    unmappedStatsCount,
    completionPercentage,
    fetchMappings,
    fetchStats,
    createMapping,
    updateMapping,
    deleteMapping,
    bulkMap,
    autoMatch,
    fetchUnmapped,
    setSearch,
    setStatusFilter,
    setConnectorFilter
  }
})
