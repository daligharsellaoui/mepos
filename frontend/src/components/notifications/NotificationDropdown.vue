<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '../../stores/notifications'
import NotificationCard from './NotificationCard.vue'

const emit = defineEmits(['close'])
const router = useRouter()
const notifStore = useNotificationStore()

onMounted(() => {
  if (notifStore.items.length === 0) {
    notifStore.fetchNotifications(true)
  }
})

function handleViewAll() {
  emit('close')
  router.push('/app/notifications')
}

function handleNavigate(url) {
  emit('close')
  if (url) router.push(url)
}
</script>

<template>
  <Teleport to="body">
    <div class="dropdown-backdrop" @click="emit('close')" />
    <div class="notification-dropdown">
      <div class="dropdown-header">
        <div class="dropdown-title-row">
          <h3 class="dropdown-title">Notifications</h3>
          <button class="dropdown-settings-btn" @click="emit('close'); router.push('/app/notifications/preferences')" title="Préférences">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
        <button
          v-if="notifStore.unreadCount > 0"
          class="dropdown-mark-read"
          @click="notifStore.markAllAsRead()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Tout marquer lu
        </button>
      </div>

      <div class="dropdown-body">
        <div v-if="notifStore.isLoading && notifStore.items.length === 0" class="dropdown-empty">
          <div class="spinner" />
          <p>Chargement...</p>
        </div>
        <div v-else-if="notifStore.items.length === 0" class="dropdown-empty">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <p>Aucune notification</p>
        </div>
        <div v-else class="dropdown-list">
          <NotificationCard
            v-for="notif in notifStore.sortedByPriority.slice(0, 10)"
            :key="notif.id"
            :notification="notif"
            @read="notifStore.markAsRead"
            @archive="notifStore.archiveNotification"
            @delete="notifStore.deleteNotification"
            @navigate="handleNavigate"
          />
        </div>
      </div>

      <div class="dropdown-footer">
        <button class="view-all-btn" @click="handleViewAll">
          Voir toutes les notifications ({{ notifStore.total }})
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 14999;
}
.notification-dropdown {
  position: fixed;
  top: 60px;
  right: 16px;
  width: 400px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 80px);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  z-index: 15000;
  animation: dropIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes dropIn {
  from { opacity: 0; transform: translateY(-8px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.dropdown-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.dropdown-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.dropdown-settings-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}
.dropdown-settings-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}
.dropdown-mark-read {
  background: transparent;
  border: none;
  color: var(--indigo-light);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  transition: all 0.2s;
}
.dropdown-mark-read:hover {
  background: rgba(99, 102, 241, 0.1);
}
.dropdown-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
  min-height: 0;
}
.dropdown-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2.5rem 1.5rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.dropdown-list {
  padding: 0.25rem 0.75rem;
}
.dropdown-footer {
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.view-all-btn {
  width: 100%;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 0.7rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}
.view-all-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

</style>
