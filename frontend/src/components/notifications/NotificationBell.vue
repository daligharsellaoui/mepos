<script setup>
import { computed } from 'vue'
import { useNotificationStore } from '../../stores/notifications'

defineProps({
  onClick: { type: Function, default: () => {} },
})

const notifStore = useNotificationStore()

const displayCount = computed(() => {
  if (notifStore.unreadCount > 99) return '99+'
  return notifStore.unreadCount
})
</script>

<template>
  <button
    class="notification-bell"
    :title="`${notifStore.unreadCount} notification${notifStore.unreadCount !== 1 ? 's' : ''} non lue${notifStore.unreadCount !== 1 ? 's' : ''}`"
    aria-label="Notifications"
    @click="onClick"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
    <span
      v-if="notifStore.unreadCount > 0"
      class="bell-badge"
    >
      {{ displayCount }}
    </span>
  </button>
</template>

<style scoped>
.notification-bell {
  position: relative;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.notification-bell:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  border-color: var(--border-hover);
}
.bell-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: var(--coral);
  color: white;
  font-size: 0.65rem;
  font-weight: 800;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
  animation: badgePop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes badgePop {
  0% { transform: scale(0); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
</style>
