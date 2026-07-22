import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Composable for online/offline status detection.
 */
export function useOffline() {
  const isOffline = ref(!navigator.onLine)

  function handleOnline() { isOffline.value = false }
  function handleOffline() { isOffline.value = true }

  onMounted(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  })

  onUnmounted(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  })

  return { isOffline }
}
