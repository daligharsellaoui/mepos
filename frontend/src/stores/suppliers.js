import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

export const useSupplierStore = defineStore('suppliers', () => {
  const suppliers = ref([])
  const currentSupplier = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const search = ref('')
  const statusFilter = ref('active')
  const preferredFilter = ref(null)
  const countryFilter = ref('')
  const sortBy = ref('name')
  const sortDir = ref('asc')
  const page = ref(1)
  const perPage = ref(10)
  const total = ref(0)

  const filteredSuppliers = computed(() => {
    let list = [...suppliers.value]
    const q = search.value.toLowerCase().trim()
    if (q) {
      list = list.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.company_name && s.company_name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q))
      )
    }
    if (statusFilter.value) {
      list = list.filter(s => s.status === statusFilter.value)
    }
    if (preferredFilter.value !== null && preferredFilter.value !== '') {
      const isPref = preferredFilter.value === 'true'
      list = list.filter(s => s.preferred === isPref)
    }
    if (countryFilter.value) {
      list = list.filter(s => s.country === countryFilter.value)
    }
    const validFields = ['name', 'company_name', 'city', 'email', 'created_at', 'rating', 'status']
    const field = validFields.includes(sortBy.value) ? sortBy.value : 'name'
    const dir = sortDir.value === 'desc' ? -1 : 1
    list.sort((a, b) => {
      const aVal = (a[field] || '').toString().toLowerCase()
      const bVal = (b[field] || '').toString().toLowerCase()
      return aVal < bVal ? -dir : aVal > bVal ? dir : 0
    })
    return list
  })

  const paginatedSuppliers = computed(() => {
    const start = (page.value - 1) * perPage.value
    return filteredSuppliers.value.slice(start, start + perPage.value)
  })

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value)))

  async function fetchSuppliers() {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getSuppliers({
        search: search.value || undefined,
        status: statusFilter.value || undefined,
        preferred: preferredFilter.value || undefined,
        country: countryFilter.value || undefined,
        sortBy: sortBy.value,
        sortDir: sortDir.value,
        page: page.value,
        perPage: perPage.value,
      })
      if (res.status === 'success') {
        if (res.suppliers) {
          suppliers.value = res.suppliers
          total.value = res.total
        } else {
          suppliers.value = res.data || []
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

  async function fetchSupplier(id) {
    loading.value = true
    error.value = null
    try {
      const { data: res } = await api.getSupplier(id)
      if (res.status === 'success') {
        currentSupplier.value = res.data
      } else {
        error.value = res.message
      }
    } catch (err) {
      error.value = "Impossible de contacter l'API."
    } finally {
      loading.value = false
    }
  }

  async function createSupplier(data) {
    const { data: res } = await api.createSupplier(data)
    if (res.status === 'success') {
      await fetchSuppliers()
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la création.')
  }

  async function updateSupplier(id, data) {
    const { data: res } = await api.updateSupplier(id, data)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la mise à jour.')
  }

  async function archiveSupplier(id) {
    const { data: res } = await api.archiveSupplier(id)
    if (res.status === 'success') {
      await fetchSuppliers()
      return res.data
    }
    throw new Error(res.message || "Erreur lors de l'archivage.")
  }

  async function restoreSupplier(id) {
    const { data: res } = await api.restoreSupplier(id)
    if (res.status === 'success') {
      await fetchSuppliers()
      return res.data
    }
    throw new Error(res.message || 'Erreur lors de la restauration.')
  }

  async function deleteSupplier(id) {
    const { data: res } = await api.deleteSupplier(id)
    if (res.status === 'success') {
      await fetchSuppliers()
      return res
    }
    throw new Error(res.message || 'Erreur lors de la suppression.')
  }

  async function fetchSupplierIngredients(id) {
    const { data: res } = await api.getSupplierIngredients(id)
    if (res.status === 'success') {
      return res.data
    }
    throw new Error(res.message || 'Erreur lors du chargement des ingrédients.')
  }

  return {
    suppliers, currentSupplier, loading, error,
    search, statusFilter, preferredFilter, countryFilter,
    sortBy, sortDir, page, perPage, total,
    filteredSuppliers, paginatedSuppliers, totalPages,
    fetchSuppliers, fetchSupplier, createSupplier, updateSupplier,
    archiveSupplier, restoreSupplier, deleteSupplier, fetchSupplierIngredients,
  }
})
