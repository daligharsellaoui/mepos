<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '../../stores/notifications'
import NotificationCard from './NotificationCard.vue'

const emit = defineEmits(['close'])
const router = useRouter()
const notifStore = useNotificationStore()
const drawerRef = ref(null)
const isVisible = ref(false)

onMounted(() => {
  requestAnimationFrame(() => { isVisible.value = true })
  if (notifStore.items.length === 0) {
    notifStore.fetchNotifications(true)
  }
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e) {
  if (e.key === 'Escape') close()
}

function close() {
  isVisible.value = false
  setTimeout(() => emit('close'), 250)
}

function handleBackdropClick(e) {
  if (e.target === e.currentTarget) close()
}

function handleViewAll() {
  close()
  router.push('/app/notifications')
}

function handleNavigate(url) {
  close()
  if (url) router.push(url)
}

watch(() => notifStore.unreadCount, () => {})
</script>

<template>
  <Teleport to="body">
    <div
      class="drawer-backdrop"
      :class="{ visible: isVisible }"
      @click="handleBackdropClick"
    >
      <aside
        ref="drawerRef"
        class="notification-drawer"
        :class="{ open: isVisible }"
        role="dialog"
        aria-label="Notifications"
      >
        <div class="drawer-header">
          <div class="drawer-title-row">
            <h2 class="drawer-title">Notifications</h2>
            <button
              class="drawer-close"
              aria-label="Fermer"
              @click="close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="drawer-actions">
            <span v-if="notifStore.unreadCount > 0" class="unread-label">
              {{ notifStore.unreadCount }} non lue{{ notifStore.unreadCount !== 1 ? 's' : '' }}
            </span>
            <button
              v-if="notifStore.unreadCount > 0"
              class="drawer-action-btn"
              @click="notifStore.markAllAsRead()"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Tout marquer lu
            </button>
          </div>
        </div>

        <div class="drawer-body">
          <div v-if="notifStore.isLoading && notifStore.items.length === 0" class="drawer-loading">
            <div class="spinner" />
            <p>Chargement...</p>
          </div>

          <div v-else-if="notifStore.items.length === 0" class="drawer-empty">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <p>Aucune notification</p>
          </div>

          <div v-else class="drawer-list">
            <div
              v-for="notif in notifStore.sortedByPriority.slice(0, 20)"
              :key="notif.id"
            >
              <NotificationCard
                :notification="notif"
                @read="notifStore.markAsRead"
                @archive="notifStore.archiveNotification"
                @delete="notifStore.deleteNotification"
                @navigate="handleNavigate"
              />
            </div>
          </div>
        </div>

        <div v-if="notifStore.total > 0" class="drawer-footer">
          <button class="view-all-btn" @click="handleViewAll">
            Voir toutes les notifications ({{ notifStore.total }})
          </button>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 15000;
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
.drawer-backdrop.visible {
  opacity: 1;
  pointer-events: auto;
}
.notification-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 420px;
  max-width: 100vw;
  height: 100vh;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 40px rgba(0, 0, 0, 0.5);
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 15001;
}
.notification-drawer.open {
  transform: translateX(0);
}
.drawer-header {
  padding: 1.25rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.drawer-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.drawer-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}
.drawer-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 4px;
  transition: all 0.2s;
}
.drawer-close:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}
.drawer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
}
.unread-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 600;
}
.drawer-action-btn {
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
.drawer-action-btn:hover {
  background: rgba(99, 102, 241, 0.1);
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
}
.drawer-loading, .drawer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 1.5rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.drawer-list {
  padding: 0.25rem 0.75rem;
}
.drawer-footer {
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
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
}
.view-all-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}
</style>
