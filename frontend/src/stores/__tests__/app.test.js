import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../app'

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    getStocks: vi.fn(),
    getLosses: vi.fn(),
    getDepartments: vi.fn(),
    getIngredients: vi.fn(),
    getRecipes: vi.fn(),
    getForecast: vi.fn(),
    createLoss: vi.fn(),
    transferStock: vi.fn(),
    adjustStock: vi.fn(),
  }
}))

import { api } from '../../api'

const mockSuccess = (data) => ({ data: { status: 'success', data } })

describe('App Store', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useAppStore()
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Initial state', () => {
    it('starts with empty data arrays', () => {
      expect(store.stocks).toEqual([])
      expect(store.losses).toEqual([])
      expect(store.departments).toEqual([])
      expect(store.ingredients).toEqual([])
      expect(store.recipes).toEqual([])
      expect(store.forecast).toBeNull()
    })

    it('starts with empty alerts', () => {
      expect(store.alerts).toEqual([])
    })

    it('activeTab defaults to dashboard', () => {
      expect(store.activeTab).toBe('dashboard')
    })
  })

  describe('lowStockAlerts computed', () => {
    it('filters stocks at or below alert threshold', () => {
      store.stocks = [
        { id: 1, quantity: '5', alert_threshold: '10', ingredient_name: 'Low Item' },
        { id: 2, quantity: '20', alert_threshold: '10', ingredient_name: 'OK Item' },
        { id: 3, quantity: '10', alert_threshold: '10', ingredient_name: 'At Threshold' },
      ]

      expect(store.lowStockAlerts).toHaveLength(2)
      expect(store.lowStockAlerts.map(s => s.id)).toContain(1)
      expect(store.lowStockAlerts.map(s => s.id)).toContain(3)
    })
  })

  describe('fetchData()', () => {
    it('fetches all data when online', async () => {
      const user = { id: 1, role: 'admin' }
      api.getStocks.mockResolvedValue(mockSuccess([{ id: 1, quantity: '10' }]))
      api.getLosses.mockResolvedValue(mockSuccess([{ id: 1, loss_reason: 'spoilage' }]))
      api.getDepartments.mockResolvedValue(mockSuccess([{ id: 1, name: 'Kitchen' }]))
      api.getIngredients.mockResolvedValue(mockSuccess([{ id: 1, name: 'Flour' }]))
      api.getRecipes.mockResolvedValue(mockSuccess([{ id: 1, name: 'Burger' }]))
      api.getForecast.mockResolvedValue(mockSuccess({ summary: {} }))

      await store.fetchData(user)

      expect(store.stocks).toHaveLength(1)
      expect(store.losses).toHaveLength(1)
      expect(store.departments).toHaveLength(1)
      expect(store.ingredients).toHaveLength(1)
      expect(store.recipes).toHaveLength(1)
      expect(store.isOffline).toBe(false)
    })

    it('returns early when user is null', async () => {
      await store.fetchData(null)

      expect(api.getStocks).not.toHaveBeenCalled()
    })

    it('loads from cache when offline', async () => {
      const cachedStocks = [{ id: 1, quantity: '5' }]
      localStorage.setItem('mepos_stocks', JSON.stringify(cachedStocks))

      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

      await store.fetchData({ id: 1, role: 'admin' })

      expect(store.stocks).toEqual(cachedStocks)
      expect(store.isOffline).toBe(true)

      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    })

    it('fetches forecast for admin users', async () => {
      const user = { id: 1, role: 'admin' }
      api.getStocks.mockResolvedValue(mockSuccess([]))
      api.getLosses.mockResolvedValue(mockSuccess([]))
      api.getDepartments.mockResolvedValue(mockSuccess([]))
      api.getIngredients.mockResolvedValue(mockSuccess([]))
      api.getRecipes.mockResolvedValue(mockSuccess([]))
      api.getForecast.mockResolvedValue(mockSuccess({ summary: { total_recipes_analyzed: 5 } }))

      await store.fetchData(user)

      expect(api.getForecast).toHaveBeenCalledOnce()
      expect(store.forecast).toEqual({ summary: { total_recipes_analyzed: 5 } })
    })

    it('skips forecast for non-admin users', async () => {
      const user = { id: 3, role: 'cook' }
      api.getStocks.mockResolvedValue(mockSuccess([]))
      api.getLosses.mockResolvedValue(mockSuccess([]))
      api.getDepartments.mockResolvedValue(mockSuccess([]))
      api.getIngredients.mockResolvedValue(mockSuccess([]))
      api.getRecipes.mockResolvedValue(mockSuccess([]))

      await store.fetchData(user)

      expect(api.getForecast).not.toHaveBeenCalled()
      expect(store.forecast).toBeNull()
    })

    it('handles forecast API failure gracefully', async () => {
      const user = { id: 1, role: 'admin' }
      api.getStocks.mockResolvedValue(mockSuccess([]))
      api.getLosses.mockResolvedValue(mockSuccess([]))
      api.getDepartments.mockResolvedValue(mockSuccess([]))
      api.getIngredients.mockResolvedValue(mockSuccess([]))
      api.getRecipes.mockResolvedValue(mockSuccess([]))
      api.getForecast.mockRejectedValue(new Error('Forecast unavailable'))

      await store.fetchData(user)

      // Main data should still be fetched
      expect(store.stocks).toEqual([])
      expect(store.isForecastLoading).toBe(false)
      expect(store.forecast).toBeNull()
    })

    it('sets isForecastLoading correctly', async () => {
      const user = { id: 1, role: 'admin' }
      api.getStocks.mockResolvedValue(mockSuccess([]))
      api.getLosses.mockResolvedValue(mockSuccess([]))
      api.getDepartments.mockResolvedValue(mockSuccess([]))
      api.getIngredients.mockResolvedValue(mockSuccess([]))
      api.getRecipes.mockResolvedValue(mockSuccess([]))
      api.getForecast.mockResolvedValue(mockSuccess({}))

      expect(store.isForecastLoading).toBe(false)
      await store.fetchData(user)
      expect(store.isForecastLoading).toBe(false)
    })
  })

  describe('closeAlert()', () => {
    it('removes alert by id', () => {
      store.alerts = [
        { id: 1, ingredientName: 'Flour' },
        { id: 2, ingredientName: 'Sugar' },
      ]

      store.closeAlert(1)

      expect(store.alerts).toHaveLength(1)
      expect(store.alerts[0].id).toBe(2)
    })
  })

  describe('setActiveTab()', () => {
    it('updates activeTab', () => {
      store.setActiveTab('inventory')
      expect(store.activeTab).toBe('inventory')
    })
  })

  describe('toggleOfflineManual()', () => {
    it('toggles isOffline state', () => {
      store.isOffline = false
      store.toggleOfflineManual()
      expect(store.isOffline).toBe(true)
      store.toggleOfflineManual()
      expect(store.isOffline).toBe(false)
    })
  })

  describe('handleLossSubmit()', () => {
    it('queues action when offline', async () => {
      store.isOffline = true
      store.ingredients = [{ id: 1, name: 'Flour', unit: 'kg' }]
      store.departments = [{ id: 1, name: 'Kitchen' }]
      store.stocks = [{ ingredient_id: 1, department_id: 1, quantity: '10', purchase_price_per_unit: '5' }]

      const result = await store.handleLossSubmit({
        ingredient_id: '1',
        department_id: '1',
        quantity: '2',
        loss_reason: 'spoilage'
      }, { id: 1 })

      expect(result).toBe(true)
      const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]')
      expect(queue).toHaveLength(1)
      expect(queue[0].type).toBe('losses')
    })

    it('calls API when online and succeeds', async () => {
      store.isOffline = false
      api.createLoss.mockResolvedValue({ data: { status: 'success' } })
      api.getStocks.mockResolvedValue(mockSuccess([]))
      api.getLosses.mockResolvedValue(mockSuccess([]))
      api.getDepartments.mockResolvedValue(mockSuccess([]))
      api.getIngredients.mockResolvedValue(mockSuccess([]))
      api.getRecipes.mockResolvedValue(mockSuccess([]))

      const result = await store.handleLossSubmit({
        ingredient_id: '1',
        department_id: '1',
        quantity: '2',
        loss_reason: 'spoilage'
      }, { id: 1 })

      expect(result).toBe(true)
      expect(api.createLoss).toHaveBeenCalled()
    })

    it('queues offline and returns true when API fails', async () => {
      store.isOffline = false
      api.createLoss.mockRejectedValue(new Error('Network error'))

      const result = await store.handleLossSubmit({
        ingredient_id: '1',
        department_id: '1',
        quantity: '2',
        loss_reason: 'spoilage'
      }, { id: 1 })

      expect(result).toBe(true)
      expect(store.isOffline).toBe(true)
      const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]')
      expect(queue).toHaveLength(1)
    })
  })

  describe('handleTransferSubmit()', () => {
    it('queues action when offline', async () => {
      store.isOffline = true

      const result = await store.handleTransferSubmit({
        ingredient_id: '1',
        source_dept_id: '1',
        dest_dept_id: '2',
        quantity: '5'
      }, { id: 1 })

      expect(result).toBe(true)
      const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]')
      expect(queue[0].type).toBe('transfers')
    })

    it('calls API when online', async () => {
      store.isOffline = false
      api.transferStock.mockResolvedValue({ data: { status: 'success' } })
      api.getStocks.mockResolvedValue(mockSuccess([]))
      api.getLosses.mockResolvedValue(mockSuccess([]))
      api.getDepartments.mockResolvedValue(mockSuccess([]))
      api.getIngredients.mockResolvedValue(mockSuccess([]))
      api.getRecipes.mockResolvedValue(mockSuccess([]))

      const result = await store.handleTransferSubmit({
        ingredient_id: '1',
        source_dept_id: '1',
        dest_dept_id: '2',
        quantity: '5'
      }, { id: 1 })

      expect(result).toBe(true)
      expect(api.transferStock).toHaveBeenCalled()
    })
  })

  describe('handleAdjustSubmit()', () => {
    it('queues action when offline', async () => {
      store.isOffline = true

      const result = await store.handleAdjustSubmit({
        ingredient_id: '1',
        department_id: '1',
        quantity: '5',
        type: 'purchase'
      }, { id: 1 })

      expect(result).toBe(true)
      const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]')
      expect(queue[0].type).toBe('adjustments')
    })

    it('calls API when online', async () => {
      store.isOffline = false
      api.adjustStock.mockResolvedValue({ data: { status: 'success' } })
      api.getStocks.mockResolvedValue(mockSuccess([]))
      api.getLosses.mockResolvedValue(mockSuccess([]))
      api.getDepartments.mockResolvedValue(mockSuccess([]))
      api.getIngredients.mockResolvedValue(mockSuccess([]))
      api.getRecipes.mockResolvedValue(mockSuccess([]))

      const result = await store.handleAdjustSubmit({
        ingredient_id: '1',
        department_id: '1',
        quantity: '5',
        type: 'purchase'
      }, { id: 1 })

      expect(result).toBe(true)
      expect(api.adjustStock).toHaveBeenCalled()
    })
  })

  describe('saveToCache()', () => {
    it('stores data in localStorage', () => {
      const data = [{ id: 1, name: 'Test' }]
      store.saveToCache('mepos_stocks', data)

      expect(JSON.parse(localStorage.getItem('mepos_stocks'))).toEqual(data)
    })
  })

  describe('loadOfflineCache()', () => {
    it('loads cached data from localStorage', () => {
      const cachedStocks = [{ id: 1, quantity: '10' }]
      const cachedLosses = [{ id: 1, loss_reason: 'spoilage' }]
      localStorage.setItem('mepos_stocks', JSON.stringify(cachedStocks))
      localStorage.setItem('mepos_losses', JSON.stringify(cachedLosses))

      store.loadOfflineCache()

      expect(store.stocks).toEqual(cachedStocks)
      expect(store.losses).toEqual(cachedLosses)
    })

    it('handles missing cache gracefully', () => {
      store.loadOfflineCache()
      expect(store.stocks).toEqual([])
    })
  })
})
