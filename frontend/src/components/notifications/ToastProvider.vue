<script setup>
import { ref, provide } from 'vue'
import ToastItem from './ToastItem.vue'

const toasts = ref([])
let toastId = 0

const typeConfig = {
  success: { icon: 'check-circle', color: 'var(--emerald)', border: 'rgba(16, 185, 129, 0.2)' },
  error: { icon: 'x-circle', color: 'var(--coral)', border: 'rgba(239, 68, 68, 0.2)' },
  warning: { icon: 'alert-triangle', color: 'var(--amber)', border: 'rgba(245, 158, 11, 0.2)' },
  info: { icon: 'info', color: 'var(--blue)', border: 'rgba(59, 130, 246, 0.2)' },
  critical: { icon: 'alert-octagon', color: '#dc2626', border: 'rgba(220, 38, 38, 0.3)' },
}

function addToast({ type = 'info', title, message, duration = 5000, action }) {
  const id = ++toastId
  const config = typeConfig[type] || typeConfig.info
  const toast = { id, type, title, message, duration, action, ...config }
  toasts.value.push(toast)
  return id
}

function removeToast(id) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

provide('addToast', addToast)
provide('removeToast', removeToast)

function iconSvg(icon) {
  const paths = {
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    'x-circle': '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    'alert-triangle': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    'alert-octagon': '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  }
  return paths[icon] || paths.info
}

function iconColor(type) {
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6', critical: '#dc2626' }
  return `background: ${colors[type] || '#3b82f6'}15; color: ${colors[type] || '#3b82f6'}`
}
</script>

<template>
  <div class="toast-container">
    <ToastItem
      v-for="toast in toasts"
      :key="toast.id"
      :toast="toast"
      @close="removeToast(toast.id)"
    >
      <template #icon>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          v-html="iconSvg(toast.icon)"
        />
      </template>
    </ToastItem>
  </div>
  <slot />
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 20000;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
  max-width: 400px;
  pointer-events: none;
}
</style>
