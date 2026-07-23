import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/index.js'

export const useInventoryCountStore = defineStore('inventoryCounts', () => {
  const sessions = ref([])
  const currentSession = ref(null)
  const discrepancies = ref([])
  const loading = ref(false)
  const error = ref(null)

  const statusFilter = ref('')
  const warehouseFilter = ref('')
  const dateFrom = ref('')
  const dateTo = ref('')
  const page = ref(1)
  const perPage = ref(10)
  const total = ref(0)

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

  async function fetchSessions(reset = false) {
    loading.value = true
    error.value = null
    try {
      if (reset) page.value = 1
      const { data: res } = await api.getInventoryCounts({
        status: statusFilter.value || undefined,
        warehouse_id: warehouseFilter.value || undefined,
        date_from: dateFrom.value || undefined,
        date_to: dateTo.value || undefined,
        page: page.value,
        perPage: perPage.value,
      })
      if (res.status === 'success') {
        if (reset) {
          sessions.value = res.data || []
        } else {
          sessions.value = [...sessions.value, ...(res.data || [])]
        }
        total.value = res.total
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function fetchSession(id) {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getInventoryCount(id)
      if (res.status === 'success') {
        currentSession.value = res.data
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function fetchDiscrepancies(id) {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getCountDiscrepancies(id)
      if (res.status === 'success') {
        discrepancies.value = res.data || []
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function createSession(data) {
    const { data: res } = await api.createInventoryCount(data)
    if (res.status === 'success') {
      await fetchSessions(true)
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la création de la session.')
  }

  async function updateItem(itemId, data) {
    const { data: res } = await api.updateCountItem(itemId, data)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la mise à jour de l\'article.')
  }

  async function startSession(id) {
    const { data: res } = await api.startInventoryCount(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors du début de la session.')
  }

  async function completeSession(id) {
    const { data: res } = await api.completeInventoryCount(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la clôture de la session.')
  }

  async function approveSession(id) {
    const { data: res } = await api.approveInventoryCount(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || "Erreur lors de l'approbation de la session.")
  }

  async function cancelSession(id) {
    const { data: res } = await api.cancelInventoryCount(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de l\'annulation de la session.')
  }

  return {
    sessions, currentSession, discrepancies, loading, error,
    statusFilter, warehouseFilter, dateFrom, dateTo, page, perPage, total,
    totalPages,
    fetchSessions, fetchSession, fetchDiscrepancies, createSession,
    updateItem, startSession, completeSession, approveSession, cancelSession,
  }
})
