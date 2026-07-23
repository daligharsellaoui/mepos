import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/index.js'

export const useBatchStore = defineStore('batches', () => {
  const batches = ref([])
  const currentBatch = ref(null)
  const batchMovements = ref([])
  const expiringData = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const ingredientFilter = ref('')
  const warehouseFilter = ref('')
  const statusFilter = ref('')
  const expiringWithin = ref('')
  const page = ref(1)
  const perPage = ref(10)
  const total = ref(0)

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

  async function fetchBatches(reset = false) {
    loading.value = true
    error.value = null
    try {
      if (reset) page.value = 1
      const { data: res } = await api.getBatches({
        ingredient_id: ingredientFilter.value || undefined,
        warehouse_id: warehouseFilter.value || undefined,
        status: statusFilter.value || undefined,
        expiring_within: expiringWithin.value || undefined,
        page: page.value,
        perPage: perPage.value,
      })
      if (res.status === 'success') {
        if (reset) {
          batches.value = res.data || []
        } else {
          batches.value = [...batches.value, ...(res.data || [])]
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

  async function fetchBatch(id) {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getBatch(id)
      if (res.status === 'success') {
        currentBatch.value = res.data
        if (res.movements) {
          batchMovements.value = res.movements
        }
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function fetchExpiring() {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getExpiringBatches()
      if (res.status === 'success') {
        expiringData.value = res.data
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function consumeBatch(id, quantity) {
    const { data: res } = await api.consumeBatch(id, quantity)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la consommation du lot.')
  }

  async function transferBatch(id, data) {
    const { data: res } = await api.transferBatch(id, data)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors du transfert du lot.')
  }

  async function splitBatch(id, quantity) {
    const { data: res } = await api.splitBatch(id, quantity)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la division du lot.')
  }

  async function adjustBatch(id, data) {
    const { data: res } = await api.adjustBatch(id, data)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de l\'ajustement du lot.')
  }

  async function discardBatch(id, reason) {
    const { data: res } = await api.discardBatch(id, reason)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la mise au rebut du lot.')
  }

  return {
    batches, currentBatch, batchMovements, expiringData, loading, error,
    ingredientFilter, warehouseFilter, statusFilter, expiringWithin, page, perPage, total,
    totalPages,
    fetchBatches, fetchBatch, fetchExpiring,
    consumeBatch, transferBatch, splitBatch, adjustBatch, discardBatch,
  }
})
