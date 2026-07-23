import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/index.js'

export const usePurchaseStore = defineStore('purchases', () => {
  const orders = ref([])
  const currentOrder = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const search = ref('')
  const statusFilter = ref('')
  const supplierFilter = ref('')
  const dateFrom = ref('')
  const dateTo = ref('')
  const page = ref(1)
  const perPage = ref(10)
  const total = ref(0)

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

  async function fetchOrders(reset = false) {
    loading.value = true
    error.value = null
    try {
      if (reset) page.value = 1
      const { data: res } = await api.getPurchaseOrders({
        search: search.value || undefined,
        status: statusFilter.value || undefined,
        supplier_id: supplierFilter.value || undefined,
        date_from: dateFrom.value || undefined,
        date_to: dateTo.value || undefined,
        page: page.value,
        perPage: perPage.value,
      })
      if (res.status === 'success') {
        if (reset) {
          orders.value = res.data || []
        } else {
          orders.value = [...orders.value, ...(res.data || [])]
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

  async function fetchOrder(id) {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getPurchaseOrder(id)
      if (res.status === 'success') {
        currentOrder.value = res.data
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function createOrder(data) {
    const { data: res } = await api.createPurchaseOrder(data)
    if (res.status === 'success') {
      await fetchOrders(true)
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la création de la commande.')
  }

  async function updateOrder(id, data) {
    const { data: res } = await api.updatePurchaseOrder(id, data)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la mise à jour de la commande.')
  }

  async function submitOrder(id) {
    const { data: res } = await api.submitPurchaseOrder(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la soumission de la commande.')
  }

  async function approveOrder(id) {
    const { data: res } = await api.approvePurchaseOrder(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || "Erreur lors de l'approbation de la commande.")
  }

  async function rejectOrder(id) {
    const { data: res } = await api.rejectPurchaseOrder(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors du rejet de la commande.')
  }

  async function cancelOrder(id) {
    const { data: res } = await api.cancelPurchaseOrder(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de l\'annulation de la commande.')
  }

  async function closeOrder(id) {
    const { data: res } = await api.closePurchaseOrder(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la clôture de la commande.')
  }

  async function deleteOrder(id) {
    const { data: res } = await api.deletePurchaseOrder(id)
    if (res.status === 'success') {
      await fetchOrders(true)
      return res
    }
    throw new Error(res.message || 'Erreur lors de la suppression de la commande.')
  }

  return {
    orders, currentOrder, loading, error,
    search, statusFilter, supplierFilter, dateFrom, dateTo, page, perPage, total,
    totalPages,
    fetchOrders, fetchOrder, createOrder, updateOrder,
    submitOrder, approveOrder, rejectOrder, cancelOrder, closeOrder, deleteOrder,
  }
})
