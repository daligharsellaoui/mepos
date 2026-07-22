import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

export const useJournalStore = defineStore('journal', () => {
  // ── State ──
  const entries = ref([])
  const total = ref(0)
  const isLoading = ref(false)
  const error = ref(null)

  // ── Filters ──
  const filters = ref({
    eventTypes: [],
    entityType: '',
    entityId: '',
    performedByUserId: '',
    performedBySource: '',
    severity: '',
    connectorId: '',
    correlationId: '',
    search: '',
    startDate: '',
    endDate: '',
    sortBy: 'occurred_at',
    sortOrder: 'desc',
  })

  // ── Pagination ──
  const limit = ref(50)
  const offset = ref(0)

  // ── Detail Panel ──
  const selectedEntry = ref(null)
  const correlatedEntries = ref([])
  const showDetail = ref(false)
  const isLoadingDetail = ref(false)

  // ── Sale Expansion ──
  const saleExpansion = ref(null)
  const showSaleExpansion = ref(false)
  const isLoadingExpansion = ref(false)

  // ── Event Types (cached) ──
  const eventTypes = ref([])

  // ── Computed ──
  const hasMore = computed(() => offset.value + limit.value < total.value)
  const currentPage = computed(() => Math.floor(offset.value / limit.value) + 1)
  const totalPages = computed(() => Math.ceil(total.value / limit.value))

  // ── Actions ──
  async function fetchEntries(reset = false) {
    if (isLoading.value) return
    isLoading.value = true
    error.value = null

    try {
      if (reset) {
        offset.value = 0
      }

      const params = {
        limit: limit.value,
        offset: offset.value,
        sort_by: filters.value.sortBy,
        sort_order: filters.value.sortOrder,
      }

      if (filters.value.eventTypes.length > 0) params.event_types = filters.value.eventTypes.join(',')
      if (filters.value.entityType) params.entity_type = filters.value.entityType
      if (filters.value.entityId) params.entity_id = filters.value.entityId
      if (filters.value.performedByUserId) params.performed_by_user_id = filters.value.performedByUserId
      if (filters.value.performedBySource) params.performed_by_source = filters.value.performedBySource
      if (filters.value.severity) params.severity = filters.value.severity
      if (filters.value.connectorId) params.connector_id = filters.value.connectorId
      if (filters.value.correlationId) params.correlation_id = filters.value.correlationId
      if (filters.value.search) params.search = filters.value.search
      if (filters.value.startDate) params.start_date = filters.value.startDate
      if (filters.value.endDate) params.end_date = filters.value.endDate

      const { data: res } = await api.getJournalEntries(params)

      if (res.status === 'success') {
        if (reset) {
          entries.value = res.data
        } else {
          entries.value = [...entries.value, ...res.data]
        }
        total.value = res.total
        offset.value += limit.value
      }
    } catch (err) {
      error.value = err.message
      console.error('[Journal] fetch error:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchEventTypes() {
    if (eventTypes.value.length > 0) return
    try {
      const { data: res } = await api.getJournalEventTypes()
      if (res.status === 'success') {
        eventTypes.value = res.data
      }
    } catch (_) { /* noop */ }
  }

  async function fetchEntryDetail(id) {
    isLoadingDetail.value = true
    try {
      const { data: res } = await api.getJournalEntry(id)
      if (res.status === 'success') {
        selectedEntry.value = res.data.entry
        correlatedEntries.value = res.data.correlatedEntries || []
        showDetail.value = true
      }
    } catch (err) {
      console.error('[Journal] detail fetch error:', err)
    } finally {
      isLoadingDetail.value = false
    }
  }

  async function fetchSaleExpansion(ticketId) {
    isLoadingExpansion.value = true
    try {
      const { data: res } = await api.getSaleExpansion(ticketId)
      if (res.status === 'success') {
        saleExpansion.value = res.data
        showSaleExpansion.value = true
      }
    } catch (err) {
      console.error('[Journal] sale expansion error:', err)
    } finally {
      isLoadingExpansion.value = false
    }
  }

  function setFilters(newFilters) {
    Object.assign(filters.value, newFilters)
    return fetchEntries(true)
  }

  function clearFilters() {
    filters.value = {
      eventTypes: [],
      entityType: '',
      entityId: '',
      performedByUserId: '',
      performedBySource: '',
      severity: '',
      connectorId: '',
      correlationId: '',
      search: '',
      startDate: '',
      endDate: '',
      sortBy: 'occurred_at',
      sortOrder: 'desc',
    }
    return fetchEntries(true)
  }

  function closeDetail() {
    showDetail.value = false
    selectedEntry.value = null
    correlatedEntries.value = []
    saleExpansion.value = null
    showSaleExpansion.value = false
  }

  function goToPage(page) {
    offset.value = (page - 1) * limit.value
    return fetchEntries(true)
  }

  function goToPrevPage() {
    if (currentPage.value > 1) goToPage(currentPage.value - 1)
  }

  function goToNextPage() {
    if (currentPage.value < totalPages.value) goToPage(currentPage.value + 1)
  }

  async function exportEntries(format = 'csv') {
    try {
      const params = { format }

      if (filters.value.eventTypes.length > 0) params.event_types = filters.value.eventTypes.join(',')
      if (filters.value.entityType) params.entity_type = filters.value.entityType
      if (filters.value.severity) params.severity = filters.value.severity
      if (filters.value.search) params.search = filters.value.search
      if (filters.value.startDate) params.start_date = filters.value.startDate
      if (filters.value.endDate) params.end_date = filters.value.endDate

      const res = await api.exportJournal(params)

      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `activity-journal-${Date.now()}.${format}`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[Journal] export error:', err)
    }
  }

  return {
    // State
    entries, total, isLoading, error,
    filters, limit, offset,
    selectedEntry, correlatedEntries, showDetail, isLoadingDetail,
    saleExpansion, showSaleExpansion, isLoadingExpansion,
    eventTypes,

    // Computed
    hasMore, currentPage, totalPages,

    // Actions
    fetchEntries, fetchEventTypes, fetchEntryDetail, fetchSaleExpansion,
    setFilters, clearFilters, closeDetail,
    goToPage, goToPrevPage, goToNextPage,
    exportEntries,
  }
})
