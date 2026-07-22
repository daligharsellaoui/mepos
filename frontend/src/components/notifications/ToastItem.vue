<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  toast: { type: Object, required: true },
})

const emit = defineEmits(['close'])

const isExiting = ref(false)
let timer = null

onMounted(() => {
  if (props.toast.duration > 0) {
    timer = setTimeout(() => {
      isExiting.value = true
      setTimeout(() => emit('close'), 300)
    }, props.toast.duration)
  }
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})

function handleClose() {
  if (timer) clearTimeout(timer)
  isExiting.value = true
  setTimeout(() => emit('close'), 300)
}
</script>

<template>
  <div
    class="toast-item"
    :class="{ 'fade-out': isExiting }"
    :style="{ borderLeft: `4px solid ${toast.color}`, borderColor: toast.border }"
  >
    <div class="toast-icon" :style="iconColor(toast.type)">
      <slot name="icon">
        <span style="font-weight: 800; font-size: 0.8rem;">&#9432;</span>
      </slot>
    </div>
    <div class="toast-content">
      <div class="toast-title">{{ toast.title }}</div>
      <div v-if="toast.message" class="toast-message">{{ toast.message }}</div>
    </div>
    <button class="toast-close" aria-label="Fermer" @click="handleClose">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div
      v-if="toast.duration > 0"
      class="toast-progress"
      :style="{ animationDuration: `${toast.duration}ms` }"
    />
  </div>
</template>

<script>
export function iconColor(type) {
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', critical: '#dc2626' }
  return `background: ${colors[type] || '#3b82f6'}15; color: ${colors[type] || '#3b82f6'}`
}
</script>

<style scoped>
.toast-item {
  pointer-events: auto;
  background: rgba(21, 26, 41, 0.96);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 4px solid var(--blue);
  border-radius: var(--radius-md);
  padding: 0.85rem 1rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  gap: 0.75rem;
  position: relative;
  overflow: hidden;
  animation: toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: all 0.3s ease;
}
.toast-item.fade-out {
  opacity: 0;
  transform: translateX(60px);
}
.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  margin-top: 0.1rem;
}
.toast-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.toast-title {
  font-weight: 700;
  font-size: 0.875rem;
  color: var(--text-primary);
}
.toast-message {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
}
.toast-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.2rem;
  display: flex;
  border-radius: 4px;
  transition: all 0.2s;
  align-self: flex-start;
  margin: -0.2rem -0.2rem 0 0;
}
.toast-close:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.15);
  animation: toastProgress linear forwards;
}
@keyframes toastSlideIn {
  from { opacity: 0; transform: translateX(100%); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes toastProgress {
  from { width: 100%; }
  to { width: 0%; }
}
</style>
