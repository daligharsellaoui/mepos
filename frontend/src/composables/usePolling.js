import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Generic polling composable for API data.
 * @param {Function} fetcher - async function returning { status, data }
 * @param {number} intervalMs - polling interval
 * @param {boolean} enabled - whether polling is active
 */
export function usePolling(fetcher, intervalMs = 8000, enabled = true) {
  const data = ref(null)
  const loading = ref(true)
  const error = ref(null)
  let intervalId = null

  async function refresh() {
    try {
      const res = await fetcher()
      if (res.status === 'success' && res.data) {
        data.value = res.data
        error.value = null
      }
    } catch (err) {
      error.value = err.message || 'Erreur de chargement'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    if (!enabled) return
    refresh()
    intervalId = setInterval(refresh, intervalMs)
  })

  onUnmounted(() => {
    if (intervalId) clearInterval(intervalId)
  })

  return { data, loading, error, refresh }
}
