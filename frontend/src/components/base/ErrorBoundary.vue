<script setup>
import { ref, onErrorCaptured } from 'vue'

defineProps({
  /**
   * Optional: a function that receives the error and returns a string message.
   * If not provided, uses error.message or a default.
   */
  errorMessage: {
    type: Function,
    default: null
  }
})

const hasError = ref(false)
const error = ref(null)

onErrorCaptured((err, instance, info) => {
  hasError.value = true
  error.value = err
  console.error('[ErrorBoundary]', err, { component: instance, info })
  // Stop propagation — don't let the error bubble up further
  return false
})

function reload() {
  window.location.reload()
}
</script>

<template>
  <div
    v-if="hasError"
    class="error-boundary"
  >
    <div class="error-boundary__card">
      <h2 class="error-boundary__title">
        Une erreur est survenue
      </h2>
      <p class="error-boundary__message">
        {{ errorMessage ? errorMessage(error) : (error?.message || 'Erreur inconnue') }}
      </p>
      <button
        class="error-boundary__reload touch-btn"
        @click="reload"
      >
        Recharger la page
      </button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  padding: 2rem;
  display: flex;
  justify-content: center;
  align-items: center;
}

.error-boundary__card {
  text-align: center;
  color: var(--text-secondary, #6b7280);
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--radius-lg, 12px);
  margin: 1rem;
  padding: 2rem;
  max-width: 480px;
}

.error-boundary__title {
  color: var(--coral, #ef4444);
  margin-bottom: 0.5rem;
  font-size: 1.25rem;
}

.error-boundary__message {
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 1rem;
}

.error-boundary__reload {
  margin-top: 1rem;
  padding: 0.5rem 1.5rem;
  font-size: 0.875rem;
  cursor: pointer;
}
</style>
