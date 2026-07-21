<script setup>
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '../stores/notifications'
import NotificationCard from '../components/notifications/NotificationCard.vue'

const router = useRouter()
const notifStore = useNotificationStore()
const searchQuery = ref('')
const activeFilter = ref('all')
const containerRef = ref(null)

const filterOptions = [
  { value: 'all', label: 'Toutes' },
  { value: 'unread', label: 'Non lues' },
  { value: 'critical', label: 'Critiques' },
  { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Basse' },
]

const categories = [
  { value: 'inventory', label: 'Inventaire', icon: '📦' },
  { value: 'synchronization', label: 'Sync', icon: '🔄' },
  { value: 'transfer', label: 'Transferts', icon: '↔️' },
  { value: 'warehouse', label: 'Pertes', icon: '⚠️' },
  { value: 'agent', label: 'Agents', icon: '🤖' },
  { value: 'authentication', label: 'Auth', icon: '🔐' },
  { value: 'administration', label: 'Admin', icon: '⚙️' },
  { value: 'security', label: 'Sécurité', icon: '🛡️' },
  { value: 'general', label: 'Général', icon: '📋' },
]

const activeCategory = ref(null)

onMounted(() => {
  notifStore.fetchNotifications(true)
  notifStore.fetchUnreadCount()
  window.addEventListener('scroll', handleScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

function handleScroll() {
  const el = containerRef.value
  if (!el || notifStore.isLoading || !notifStore.hasMore) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
    notifStore.fetchNotifications()
  }
}

function handleFilterChange(value) {
  activeFilter.value = value
  const filterMap = {
    all: { read: undefined },
    unread: { read: false },
    critical: { priorities: ['critical'] },
    high: { priorities: ['high'] },
    medium: { priorities: ['medium'] },
    low: { priorities: ['low'] },
  }
  notifStore.setFilters(filterMap[value] || {})
}

function handleCategoryToggle(cat) {
  if (activeCategory.value === cat) {
    activeCategory.value = null
    notifStore.setFilters({ categories: [] })
  } else {
    activeCategory.value = cat
    notifStore.setFilters({ categories: [cat] })
  }
}

function handleSearch() {
  notifStore.setFilters({ search: searchQuery.value })
}

function handleNavigate(url) {
  if (url) router.push(url)
}

const groupedItems = computed(() => {
  const groups = {}
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const thisWeek = new Date(today)
  thisWeek.setDate(thisWeek.getDate() - 7)

  notifStore.items.forEach((n) => {
    const d = new Date(n.created_at)
    let groupKey
    if (d >= today) groupKey = 'Aujourd\'hui'
    else if (d >= yesterday) groupKey = 'Hier'
    else if (d >= thisWeek) groupKey = 'Cette semaine'
    else groupKey = 'Plus ancien'

    if (!groups[groupKey]) groups[groupKey] = []
    groups[groupKey].push(n)
  })
  return groups
})
</script>

<template>
  <div class="notification-center">
    <div class="page-header">
      <div>
        <h1 class="page-title">Notifications</h1>
        <p class="page-subtitle">
          {{ notifStore.unreadCount }} non lue{{ notifStore.unreadCount !== 1 ? 's' : '' }}
          sur {{ notifStore.total }} total
        </p>
      </div>
      <div class="header-actions">
        <button
          v-if="notifStore.unreadCount > 0"
          class="touch-btn touch-btn-secondary"
          style="min-height: 36px; font-size: 0.8rem;"
          @click="notifStore.markAllAsRead()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Tout marquer lu
        </button>
      </div>
    </div>

    <div class="search-bar">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Rechercher dans les notifications..."
        @input="handleSearch"
      />
      <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''; handleSearch()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div class="filter-section">
      <div class="filter-pills">
        <button
          v-for="opt in filterOptions"
          :key="opt.value"
          class="filter-pill"
          :class="{ active: activeFilter === opt.value }"
          @click="handleFilterChange(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="category-bar">
      <button
        v-for="cat in categories"
        :key="cat.value"
        class="category-chip"
        :class="{ active: activeCategory === cat.value }"
        @click="handleCategoryToggle(cat.value)"
      >
        <span>{{ cat.icon }}</span>
        <span>{{ cat.label }}</span>
      </button>
    </div>

    <div ref="containerRef" class="notifications-list">
      <div v-if="notifStore.isLoading && notifStore.items.length === 0" class="center-state">
        <div class="spinner" />
        <p>Chargement des notifications...</p>
      </div>

      <div v-else-if="notifStore.items.length === 0" class="center-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <h3 style="color: var(--text-primary); font-size: 1rem; margin: 0;">Aucune notification</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">Vous n'avez aucune notification pour le moment.</p>
      </div>

      <div v-else>
        <div v-for="(group, dateLabel) in groupedItems" :key="dateLabel" class="notification-group">
          <div class="group-header">{{ dateLabel }}</div>
          <NotificationCard
            v-for="notif in group"
            :key="notif.id"
            :notification="notif"
            @read="notifStore.markAsRead"
            @archive="notifStore.archiveNotification"
            @delete="notifStore.deleteNotification"
            @navigate="handleNavigate"
          />
        </div>

        <div v-if="notifStore.isLoading" class="load-more">
          <div class="spinner" />
        </div>

        <div v-if="!notifStore.hasMore && notifStore.items.length > 0" class="end-message">
          Toutes les notifications sont chargées.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notification-center {
  padding: 0;
  max-width: 800px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  gap: 1rem;
}
.page-title {
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
}
.page-subtitle {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}
.header-actions {
  display: flex;
  gap: 0.5rem;
}
.search-bar {
  position: relative;
  margin-bottom: 1rem;
}
.search-icon {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}
.search-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 0.75rem 1rem 0.75rem 2.75rem;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 500;
  outline: none;
  font-family: var(--font-sans);
  transition: border-color 0.2s;
}
.search-input:focus {
  border-color: var(--indigo);
}
.search-input::placeholder {
  color: var(--text-muted);
}
.search-clear {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
}
.search-clear:hover {
  color: var(--text-primary);
}
.filter-section {
  margin-bottom: 0.75rem;
}
.filter-pills {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.filter-pill {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.filter-pill:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}
.filter-pill.active {
  background: var(--indigo);
  border-color: transparent;
  color: white;
}
.category-bar {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 1.25rem;
}
.category-chip {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  padding: 0.3rem 0.7rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.category-chip:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}
.category-chip.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
  color: var(--indigo-light);
}
.notifications-list {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow-y: auto;
  max-height: calc(100vh - 320px);
}
.center-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 4rem 2rem;
  text-align: center;
}
.notification-group {
  padding: 0.5rem;
}
.group-header {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.75rem 0.75rem 0.25rem;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 1.5rem;
}
.end-message {
  text-align: center;
  padding: 1rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>
