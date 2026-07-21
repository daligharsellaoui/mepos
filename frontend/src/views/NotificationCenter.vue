<script setup>
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from '../stores/notifications'
import NotificationCard from '../components/notifications/NotificationCard.vue'
import Modal from '../components/base/Modal.vue'

const router = useRouter()
const notifStore = useNotificationStore()
const searchQuery = ref('')
const activeFilter = ref('all')
const containerRef = ref(null)
const groupBy = ref('date')
const detailNotif = ref(null)
const showDetail = ref(false)

const priorityLabels = { critical: 'Critique', high: 'Haute', medium: 'Moyenne', low: 'Basse' }
const priorityColors = { critical: '#dc2626', high: '#f59e0b', medium: '#3b82f6', low: '#64748b' }

const filterOptions = [
  { value: 'all', label: 'Toutes' },
  { value: 'unread', label: 'Non lues' },
  { value: 'critical', label: 'Critiques' },
  { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Basse' },
]

const groupOptions = [
  { value: 'date', label: 'Par date' },
  { value: 'category', label: 'Par catégorie' },
]

const categoryLabels = {
  inventory: 'Inventaire', synchronization: 'Sync', transfer: 'Transferts',
  warehouse: 'Pertes', purchase: 'Achats', agent: 'Agents',
  authentication: 'Auth', recipe: 'Recettes', administration: 'Admin',
  reports: 'Rapports', security: 'Sécurité', general: 'Général',
}

const categoryColors = {
  inventory: '#06b6d4', synchronization: '#8b5cf6', transfer: '#f97316',
  warehouse: '#ef4444', purchase: '#22c55e', agent: '#8b5cf6',
  authentication: '#6366f1', recipe: '#a855f7', administration: '#6366f1',
  reports: '#10b981', security: '#e11d48', general: '#64748b',
}

const categorySvgs = {
  inventory: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  synchronization: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  transfer: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  warehouse: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  agent: '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  authentication: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  administration: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  general: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
}

const categories = [
  { value: 'inventory', label: 'Inventaire', svg: categorySvgs.inventory, color: '#06b6d4' },
  { value: 'synchronization', label: 'Sync', svg: categorySvgs.synchronization, color: '#8b5cf6' },
  { value: 'transfer', label: 'Transferts', svg: categorySvgs.transfer, color: '#f97316' },
  { value: 'warehouse', label: 'Pertes', svg: categorySvgs.warehouse, color: '#ef4444' },
  { value: 'agent', label: 'Agents', svg: categorySvgs.agent, color: '#8b5cf6' },
  { value: 'authentication', label: 'Auth', svg: categorySvgs.authentication, color: '#6366f1' },
  { value: 'administration', label: 'Admin', svg: categorySvgs.administration, color: '#6366f1' },
  { value: 'security', label: 'Sécurité', svg: categorySvgs.security, color: '#e11d48' },
  { value: 'general', label: 'Général', svg: categorySvgs.general, color: '#64748b' },
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

function openDetail(notif) {
  if (!notif.read) {
    notifStore.markAsRead(notif.id)
  }
  detailNotif.value = notif
  showDetail.value = true
}

function closeDetail() {
  showDetail.value = false
  detailNotif.value = null
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const groupedItems = computed(() => {
  if (groupBy.value === 'category') {
    const groups = {}
    notifStore.items.forEach((n) => {
      const cat = n.category || 'general'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(n)
    })
    return groups
  }

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

    <div class="group-bar">
      <button
        v-for="opt in groupOptions"
        :key="opt.value"
        class="group-btn"
        :class="{ active: groupBy === opt.value }"
        @click="groupBy = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="category-bar">
      <button
        v-for="cat in categories"
        :key="cat.value"
        class="category-chip"
        :class="{ active: activeCategory === cat.value }"
        @click="handleCategoryToggle(cat.value)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          v-html="cat.svg"
        />
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
        <div v-for="(group, label) in groupedItems" :key="label" class="notification-group">
          <div class="group-header">
            <template v-if="groupBy === 'category'">
              <span
                class="group-category-dot"
                :style="{ background: categoryColors[label] || '#64748b' }"
              />
              {{ categoryLabels[label] || label }}
            </template>
            <template v-else>
              {{ label }}
            </template>
          </div>
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
    <Modal
      :is-open="showDetail"
      title="Détails de la notification"
      max-width="520px"
      @close="closeDetail"
    >
      <div v-if="detailNotif" class="detail-content">
        <div class="detail-header">
          <div
            class="detail-icon"
            :style="{ background: `${detailNotif.color}15`, color: detailNotif.color }"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <div>
            <h3 class="detail-title">{{ detailNotif.title }}</h3>
            <p class="detail-date">{{ formatDate(detailNotif.created_at) }}</p>
          </div>
        </div>

        <div v-if="detailNotif.message" class="detail-message">
          {{ detailNotif.message }}
        </div>

        <div class="detail-meta">
          <div class="detail-meta-item">
            <span class="detail-meta-label">Priorité</span>
            <span
              class="detail-priority"
              :style="{
                background: `${priorityColors[detailNotif.priority]}15`,
                color: priorityColors[detailNotif.priority],
                border: `1px solid ${priorityColors[detailNotif.priority]}25`
              }"
            >
              {{ priorityLabels[detailNotif.priority] || detailNotif.priority }}
            </span>
          </div>
          <div v-if="detailNotif.category" class="detail-meta-item">
            <span class="detail-meta-label">Catégorie</span>
            <span class="detail-category">{{ categoryLabels[detailNotif.category] || detailNotif.category }}</span>
          </div>
          <div v-if="detailNotif.type" class="detail-meta-item">
            <span class="detail-meta-label">Type</span>
            <span class="detail-category">{{ detailNotif.type }}</span>
          </div>
          <div v-if="detailNotif.read_at" class="detail-meta-item">
            <span class="detail-meta-label">Lu le</span>
            <span class="detail-category">{{ formatDate(detailNotif.read_at) }}</span>
          </div>
          <div v-if="detailNotif.entity_type" class="detail-meta-item">
            <span class="detail-meta-label">Entité liée</span>
            <span class="detail-category">{{ detailNotif.entity_type }} #{{ detailNotif.entity_id }}</span>
          </div>
        </div>

        <div v-if="detailNotif.action_url" class="detail-actions">
          <button
            class="touch-btn touch-btn-primary"
            @click="closeDetail(); handleNavigate(detailNotif.action_url)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Voir
          </button>
        </div>
      </div>

      <template #footer>
        <div class="detail-footer-actions">
          <button
            v-if="detailNotif && !detailNotif.read"
            class="touch-btn touch-btn-secondary"
            @click="notifStore.markAsRead(detailNotif.id); closeDetail()"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Marquer comme lu
          </button>
          <button
            v-if="detailNotif"
            class="touch-btn touch-btn-secondary"
            @click="notifStore.archiveNotification(detailNotif.id); closeDetail()"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            Archiver
          </button>
          <button
            v-if="detailNotif"
            class="touch-btn touch-btn-danger"
            @click="notifStore.deleteNotification(detailNotif.id); closeDetail()"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Supprimer
          </button>
          <button class="touch-btn" @click="closeDetail()">Fermer</button>
        </div>
      </template>
    </Modal>
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
.group-bar {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}
.group-btn {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  padding: 0.3rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.group-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}
.group-btn.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
  color: var(--indigo-light);
}
.group-category-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
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
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.detail-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.detail-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.15rem;
}
.detail-date {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: 0;
}
.detail-message {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.02);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
}
.detail-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.detail-meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.detail-meta-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.detail-priority {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  display: inline-block;
  width: fit-content;
  text-transform: uppercase;
}
.detail-category {
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-weight: 500;
}
.detail-actions {
  display: flex;
  gap: 0.5rem;
}
.detail-footer-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

@media (max-width: 600px) {
  .notification-center {
    padding: 0;
  }
  .page-header {
    flex-direction: column;
    gap: 0.75rem;
  }
  .page-title {
    font-size: 1.25rem;
  }
  .header-actions {
    width: 100%;
  }
  .header-actions .touch-btn {
    width: 100%;
  }
  .filter-pills {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 0.25rem;
    -webkit-overflow-scrolling: touch;
  }
  .category-bar {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 0.25rem;
    -webkit-overflow-scrolling: touch;
  }
  .category-chip {
    white-space: nowrap;
  }
  .notifications-list {
    max-height: none;
  }
  .detail-meta {
    grid-template-columns: 1fr;
  }
}
</style>
