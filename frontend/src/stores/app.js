import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

export const useAppStore = defineStore('app', () => {
  // ── Data ──
  const stocks = ref([])
  const losses = ref([])
  const departments = ref([])
  const ingredients = ref([])
  const recipes = ref([])
  const forecast = ref(null)
  const isForecastLoading = ref(false)

  // ── Offline / Sync ──
  const isOffline = ref(!navigator.onLine)
  const isSyncing = ref(false)

  // ── Loss Alerts ──
  const alerts = ref([])
  const knownLossIds = new Set()

  // ── Active Tab ──
  const activeTab = ref('dashboard')

  // ── Computed ──
  const lowStockAlerts = computed(() =>
    stocks.value.filter(s => parseFloat(s.quantity) <= parseFloat(s.alert_threshold))
  )

  // ── Cache helpers ──
  // ── SSE Data Stream ──
  let dataEventSource = null
  let dataRefreshTimer = null

  function scheduleDataRefresh(user) {
    if (dataRefreshTimer) return
    // Debounce: coalesce rapid events into a single fetch
    dataRefreshTimer = setTimeout(() => {
      dataRefreshTimer = null
      fetchData(user)
    }, 500)
  }

  function connectDataStream(user) {
    if (!user || dataEventSource) return

    const token = localStorage.getItem('mepos_token')
    if (!token) return

    const base = import.meta.env.VITE_API_URL || '/api/v1'
    const baseOrigin = base.replace('/api/v1', '').replace(/\/+$/, '') || ''
    const url = `${baseOrigin}/api/v1/data/stream?token=${encodeURIComponent(token)}`

    const es = new EventSource(url)

    es.addEventListener('data:stocks_updated', () => { scheduleDataRefresh(user) })
    es.addEventListener('data:loss_created', () => { scheduleDataRefresh(user) })
    es.addEventListener('data:ingredient_updated', () => { scheduleDataRefresh(user) })
    es.addEventListener('data:recipe_updated', () => { scheduleDataRefresh(user) })
    es.addEventListener('data:department_updated', () => { scheduleDataRefresh(user) })

    // Let the browser handle auto-reconnect natively — do NOT close & reopen in onerror
    es.onerror = () => {
      console.debug('[DataStream] Connection error, browser will auto-reconnect')
    }

    dataEventSource = es
  }

  function disconnectDataStream() {
    if (dataRefreshTimer) {
      clearTimeout(dataRefreshTimer)
      dataRefreshTimer = null
    }
    if (dataEventSource) {
      dataEventSource.close()
      dataEventSource = null
    }
  }

  function loadOfflineCache() {
    const load = (key, setter) => {
      const cached = localStorage.getItem(key)
      if (cached) {
        try { setter(JSON.parse(cached)) } catch { /* ignore */ }
      }
    }
    load('mepos_stocks', (d) => (stocks.value = d))
    load('mepos_losses', (d) => (losses.value = d))
    load('mepos_departments', (d) => (departments.value = d))
    load('mepos_ingredients', (d) => (ingredients.value = d))
    load('mepos_recipes', (d) => (recipes.value = d))
  }

  function saveToCache(key, data) {
    localStorage.setItem(key, JSON.stringify(data))
  }

  // ── Network status ──
  function setupNetworkListeners() {
    window.addEventListener('online', () => {
      isOffline.value = false
      syncOfflineActions()
    })
    window.addEventListener('offline', () => {
      isOffline.value = true
    })
  }

  // ── Detect new losses for real-time alerts ──
  function detectNewLosses(user) {
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return
    if (losses.value.length === 0) return

    if (knownLossIds.size === 0) {
      losses.value.forEach(l => knownLossIds.add(l.id))
      return
    }

    const newAlerts = []
    losses.value.forEach(l => {
      if (!knownLossIds.has(l.id)) {
        knownLossIds.add(l.id)
        newAlerts.push({
          id: l.id,
          ingredientName: l.ingredient_name || 'Inconnu',
          quantity: parseFloat(l.quantity),
          unit: l.unit || 'g',
          departmentName: l.department_name || 'Dépôt',
          reason: l.loss_reason,
          costLoss: parseFloat(l.cost_loss),
          opportunityLoss: parseFloat(l.opportunity_loss),
          timestamp: new Date(l.created_at || Date.now())
        })
      }
    })

    if (newAlerts.length > 0) {
      alerts.value = [...newAlerts, ...alerts.value]
      newAlerts.forEach(alert => {
        setTimeout(() => {
          alerts.value = alerts.value.filter(a => a.id !== alert.id)
        }, 15000)
      })
    }
  }

  function closeAlert(id) {
    alerts.value = alerts.value.filter(a => a.id !== id)
  }

  // ── Data fetching ──
  let isFetchingData = false
  async function fetchData(user) {
    if (!user || isFetchingData) return
    isFetchingData = true

    if (!navigator.onLine) {
      loadOfflineCache()
      isOffline.value = true
      return
    }

    try {
      const [stocksRes, lossesRes, deptsRes, ingsRes, recipesRes] = await Promise.all([
        api.getStocks(),
        api.getLosses(),
        api.getDepartments(),
        api.getIngredients(),
        api.getRecipes()
      ])

      if (stocksRes.data.status === 'success') {
        stocks.value = stocksRes.data.data
        saveToCache('mepos_stocks', stocksRes.data.data)
      }
      if (lossesRes.data.status === 'success') {
        losses.value = lossesRes.data.data
        saveToCache('mepos_losses', lossesRes.data.data)
        detectNewLosses(user)
      }
      if (deptsRes.data.status === 'success') {
        departments.value = deptsRes.data.data
        saveToCache('mepos_departments', deptsRes.data.data)
      }
      if (ingsRes.data.status === 'success') {
        ingredients.value = ingsRes.data.data
        saveToCache('mepos_ingredients', ingsRes.data.data)
      }
      if (recipesRes.data.status === 'success') {
        recipes.value = recipesRes.data.data
        saveToCache('mepos_recipes', recipesRes.data.data)
      }

      // Forecast (admin only, non-critical)
      if (user?.role === 'admin') {
        try {
          isForecastLoading.value = true
          const forecastRes = await api.getForecast()
          if (forecastRes.data.status === 'success' && forecastRes.data.data) {
            forecast.value = forecastRes.data.data
          }
        } catch { /* forecast is non-critical */ }
        finally { isForecastLoading.value = false }
      }

      isOffline.value = false
      syncOfflineActions()
    } catch (err) {
      console.warn('Network error:', err)
      loadOfflineCache()
      isOffline.value = true
    } finally {
      isFetchingData = false
    }
  }

  // ── Offline queue ──
  function queueOfflineAction(type, data) {
    const action = {
      id: Date.now() + Math.random(),
      type,
      data,
      timestamp: new Date().toISOString()
    }
    const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]')
    queue.push(action)
    localStorage.setItem('mepos_offline_queue', JSON.stringify(queue))

    // Optimistic update for losses
    if (type === 'losses') {
      const ing = ingredients.value.find(i => i.id === parseInt(data.ingredient_id))
      const dept = departments.value.find(d => d.id === parseInt(data.department_id))
      const stock = stocks.value.find(s =>
        s.ingredient_id === parseInt(data.ingredient_id) &&
        s.department_id === parseInt(data.department_id)
      )
      const pPrice = stock?.purchase_price_per_unit || '0'
      const costLoss = parseFloat(pPrice) * parseFloat(data.quantity)
      const tempLoss = {
        id: action.id,
        ingredient_id: parseInt(data.ingredient_id),
        ingredient_name: ing?.name || 'Ingrédient',
        quantity: data.quantity,
        unit: data.unit || ing?.unit || 'g',
        department_id: parseInt(data.department_id),
        department_name: dept?.name || 'Dépôt',
        loss_reason: data.loss_reason,
        cost_loss: costLoss.toString(),
        opportunity_loss: (costLoss * 2.5).toString(),
        created_at: action.timestamp,
        is_offline: true
      }
      losses.value = [tempLoss, ...losses.value]
      stocks.value = stocks.value.map(s => {
        if (s.ingredient_id === parseInt(data.ingredient_id) && s.department_id === parseInt(data.department_id)) {
          return { ...s, quantity: Math.max(0, parseFloat(s.quantity) - parseFloat(data.quantity)).toString() }
        }
        return s
      })
    }

    if (type === 'transfers') {
      stocks.value = stocks.value.map(s => {
        if (s.ingredient_id === parseInt(data.ingredient_id)) {
          if (s.department_id === parseInt(data.source_dept_id)) {
            return { ...s, quantity: Math.max(0, parseFloat(s.quantity) - parseFloat(data.quantity)).toString() }
          }
          if (s.department_id === parseInt(data.dest_dept_id)) {
            return { ...s, quantity: (parseFloat(s.quantity) + parseFloat(data.quantity)).toString() }
          }
        }
        return s
      })
    }

    if (type === 'adjustments') {
      stocks.value = stocks.value.map(s => {
        if (s.ingredient_id === parseInt(data.ingredient_id) && s.department_id === parseInt(data.department_id)) {
          let newQty = parseFloat(s.quantity)
          if (data.type === 'purchase') newQty = Math.max(0, newQty + parseFloat(data.quantity))
          else if (data.type === 'reconciliation') newQty = Math.max(0, parseFloat(data.quantity))
          return { ...s, quantity: newQty.toString() }
        }
        return s
      })
    }
  }

  async function syncOfflineActions() {
    const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]')
    if (queue.length === 0) return
    isSyncing.value = true

    const remaining = []
    let hasFailed = false

    for (const action of queue) {
      if (hasFailed) { remaining.push(action); continue }
      try {
        let res
        if (action.type === 'losses') res = await api.createLoss(action.data)
        else if (action.type === 'transfers') res = await api.transferStock(action.data)
        else if (action.type === 'adjustments') res = await api.adjustStock(action.data)

        if (res?.data?.status !== 'success') remaining.push(action)
      } catch {
        hasFailed = true
        remaining.push(action)
      }
    }

    localStorage.setItem('mepos_offline_queue', JSON.stringify(remaining))
    isSyncing.value = false
  }

  // ── Action handlers ──
  async function handleLossSubmit(lossData, user) {
    if (isOffline.value || !navigator.onLine) {
      queueOfflineAction('losses', lossData)
      return true
    }
    try {
      const res = await api.createLoss(lossData)
      if (res.data.status === 'success') { fetchData(user); return true }
      return false
    } catch {
      isOffline.value = true
      queueOfflineAction('losses', lossData)
      return true
    }
  }

  async function handleTransferSubmit(transferData, user) {
    if (isOffline.value || !navigator.onLine) {
      queueOfflineAction('transfers', transferData)
      return true
    }
    try {
      const res = await api.transferStock(transferData)
      if (res.data.status === 'success') { fetchData(user); return true }
      return false
    } catch {
      isOffline.value = true
      queueOfflineAction('transfers', transferData)
      return true
    }
  }

  async function handleAdjustSubmit(adjustData, user) {
    if (isOffline.value || !navigator.onLine) {
      queueOfflineAction('adjustments', adjustData)
      return true
    }
    try {
      const res = await api.adjustStock(adjustData)
      if (res.data.status === 'success') { fetchData(user); return true }
      return false
    } catch {
      isOffline.value = true
      queueOfflineAction('adjustments', adjustData)
      return true
    }
  }

  function toggleOfflineManual() {
    isOffline.value = !isOffline.value
  }

  function setActiveTab(tab) {
    activeTab.value = tab
  }

  return {
    // Data
    stocks, losses, departments, ingredients, recipes, forecast, isForecastLoading,
    // Offline
    isOffline, isSyncing,
    // Alerts
    alerts,
    // Tab
    activeTab,
    // Computed
    lowStockAlerts,
    // Methods
    setupNetworkListeners, fetchData, closeAlert, toggleOfflineManual, setActiveTab,
    handleLossSubmit, handleTransferSubmit, handleAdjustSubmit,
    loadOfflineCache, saveToCache,
    connectDataStream, disconnectDataStream
  }
})
