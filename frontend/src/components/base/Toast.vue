<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  id: { type: [String, Number], default: null },
  type: { type: String, default: 'info' },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  duration: { type: Number, default: 5000 }
})

const emit = defineEmits(['close'])

const isExiting = ref(false)
let timer = null
let exitTimer = null

const typeConfig = {
  success: { icon: '✓', color: 'var(--emerald)', border: 'rgba(16, 185, 129, 0.2)' },
  error: { icon: '✕', color: 'var(--coral)', border: 'rgba(239, 68, 68, 0.2)' },
  warning: { icon: '⚠', color: 'var(--amber)', border: 'rgba(245, 158, 11, 0.2)' },
  info: { icon: 'ℹ', color: 'var(--blue)', border: 'rgba(59, 130, 246, 0.2)' }
}

onMounted(() => {
  timer = setTimeout(() => {
    isExiting.value = true
    exitTimer = setTimeout(() => emit('close', props.id), 300)
  }, props.duration)
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  if (exitTimer) clearTimeout(exitTimer)
})

function handleClose() {
  isExiting.value = true
  setTimeout(() => emit('close', props.id), 300)
}
</script>

<template>
  <div
    class="notification-toast"
    :class="{ 'fade-out': isExiting }"
    :style="{ borderLeft: `4px solid ${typeConfig[type].color}`, borderColor: typeConfig[type].border }"
  >
    <div
      class="notification-icon"
      :style="{ background: `${typeConfig[type].color}15`, color: typeConfig[type].color }"
    >
      <span style="font-weight: 800; font-size: 0.8rem;">{{ typeConfig[type].icon }}</span>
    </div>
    <div class="notification-content">
      <div
        class="notification-title"
        style="font-size: 0.85rem;"
      >
        {{ title }}
      </div>
      <div
        v-if="message"
        class="notification-body"
        style="font-size: 0.8rem;"
      >
        {{ message }}
      </div>
    </div>
    <button
      class="notification-close-btn"
      aria-label="Fermer"
      @click="handleClose"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line
          x1="18"
          y1="6"
          x2="6"
          y2="18"
        /><line
          x1="6"
          y1="6"
          x2="18"
          y2="18"
        />
      </svg>
    </button>
  </div>
</template>
