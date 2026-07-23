import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/index.js'

export const usePriceHistoryStore = defineStore('priceHistory', () => {
  const history = ref([])
  const analytics = ref(null)
  const supplierIngredients = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function fetchHistory(ingredientId, params = {}) {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getPriceHistory(ingredientId, params)
      if (res.status === 'success') {
        history.value = res.data || []
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function fetchAnalytics(ingredientId) {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getPriceAnalytics(ingredientId)
      if (res.status === 'success') {
        analytics.value = res.data
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function recordPrice(ingredientId, data) {
    const { data: res } = await api.recordPrice(ingredientId, data)
    if (res.status === 'success') {
      await fetchHistory(ingredientId)
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de l\'enregistrement du prix.')
  }

  async function fetchSupplierIngredients(supplierId) {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getSupplierIngredients(supplierId)
      if (res.status === 'success') {
        supplierIngredients.value = res.data || []
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function linkSupplierIngredient(data) {
    const { data: res } = await api.linkSupplierIngredient(data)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la liaison fournisseur-ingrédient.')
  }

  async function unlinkSupplierIngredient(data) {
    const { data: res } = await api.unlinkSupplierIngredient(data)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors du déliage fournisseur-ingrédient.')
  }

  return {
    history, analytics, supplierIngredients, loading, error,
    fetchHistory, fetchAnalytics, recordPrice,
    fetchSupplierIngredients, linkSupplierIngredient, unlinkSupplierIngredient,
  }
})
