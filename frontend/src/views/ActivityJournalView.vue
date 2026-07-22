<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useJournalStore } from '../stores/journal'
import { useAuthStore } from '../stores/auth'
import PageContainer from '../components/base/PageContainer.vue'

const router = useRouter()
const journal = useJournalStore()
const auth = useAuthStore()

// ── Local state ──
const searchQuery = ref('')
const activeFilter = ref('all')
const selectedEventTypes = ref([])
const activeSeverity = ref('')
const activeSource = ref('')
const startDate = ref('')
const endDate = ref('')
const showFilters = ref(false)
const expandedSales = ref(new Set())

// ── Severity config ──
const severityConfig = {
  info: { label: 'Info', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  notice: { label: 'Notice', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  warning: { label: 'Warning', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  error: { label: 'Error', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  critical: { label: 'Critical', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
}

// ── Source config ──
const sourceLabels = {
  web_application: 'Web App',
  legacy_pos_agent: 'POS Agent',
  api: 'API',
  synchronization_service: 'Sync',
  system: 'Système',
  scheduler: 'Planificateur',
  forecast_engine: 'Prévisions',
}

const sourceColors = {
  web_application: '#6366f1',
  legacy_pos_agent: '#f59e0b',
  api: '#8b5cf6',
  synchronization_service: '#06b6d4',
  system: '#64748b',
  scheduler: '#f97316',
  forecast_engine: '#a855f7',
}

// ── Event type category colors ──
const categoryColors = {
  authentication: '#6366f1',
  inventory: '#06b6d4',
  products: '#10b981',
  recipes: '#a855f7',
  suppliers: '#22c55e',
  purchases: '#22c55e',
  transfers: '#f97316',
  losses: '#ef4444',
  synchronization: '#8b5cf6',
  mappings: '#8b5cf6',
  users: '#6366f1',
  tenants: '#6366f1',
  settings: '#64748b',
  forecast: '#a855f7',
  imports: '#8b5cf6',
  sales: '#10b981',
  notifications: '#f59e0b',
}

const categoryLabels = {
  authentication: 'Auth',
  inventory: 'Inventaire',
  products: 'Produits',
  recipes: 'Recettes',
  suppliers: 'Fournisseurs',
  purchases: 'Achats',
  transfers: 'Transferts',
  losses: 'Pertes',
  synchronization: 'Sync',
  mappings: 'Mappings',
  users: 'Utilisateurs',
  tenants: 'Restaurants',
  settings: 'Paramètres',
  forecast: 'Prévisions',
  imports: 'Imports',
  sales: 'Ventes',
  notifications: 'Notifications',
}

// ── Quick filters ──
const filterOptions = [
  { value: 'all', label: 'Tous' },
  { value: 'critical', label: 'Critique' },
  { value: 'sales', label: 'Ventes' },
  { value: 'inventory', label: 'Inventaire' },
  { value: 'sync', label: 'Sync' },
  { value: 'transfers', label: 'Transferts' },
  { value: 'losses', label: 'Pertes' },
  { value: 'users', label: 'Utilisateurs' },
]

const sourceOptions = [
  { value: '', label: 'Toutes sources' },
  { value: 'web_application', label: 'Web App' },
  { value: 'legacy_pos_agent', label: 'POS Agent' },
  { value: 'api', label: 'API' },
  { value: 'synchronization_service', label: 'Sync' },
  { value: 'system', label: 'Système' },
  { value: 'forecast_engine', label: 'Prévisions' },
]

// ── Lifecycle ──
onMounted(async () => {
  await journal.fetchEventTypes()
  await journal.fetchEntries(true)
})

// ── Filter handlers ──
function handleQuickFilter(value) {
  activeFilter.value = value
  const filterMap = {
    all: { eventTypes: [], severity: '' },
    critical: { eventTypes: [], severity: 'critical' },
    sales: { eventTypes: ['sale.imported'], severity: '' },
    inventory: { eventTypes: ['inventory.ingredient.created', 'inventory.ingredient.updated', 'inventory.ingredient.deleted', 'inventory.stock.low', 'inventory.stock.critical'], severity: '' },
    sync: { eventTypes: ['sync.started', 'sync.completed', 'sync.failed', 'sync.heartbeat_lost', 'sync.heartbeat_restored'], severity: '' },
    transfers: { eventTypes: ['transfer.requested', 'transfer.approved', 'transfer.rejected', 'transfer.completed'], severity: '' },
    losses: { eventTypes: ['loss.declared'], severity: '' },
    users: { eventTypes: ['user.created', 'user.disabled', 'auth.login', 'auth.login_failed'], severity: '' },
  }
  const f = filterMap[value] || filterMap.all
  selectedEventTypes.value = []
  activeSeverity.value = f.severity
  journal.setFilters({ eventTypes: f.eventTypes, severity: f.severity })
}

function handleSearch() {
  journal.setFilters({ search: searchQuery.value || '' })
  journal.fetchEntries(true)
}

function handleDateFilter() {
  journal.setFilters({
    startDate: startDate.value || '',
    endDate: endDate.value || '',
  })
  journal.fetchEntries(true)
}

function handleEventTypeSelect(eventType) {
  const idx = selectedEventTypes.value.indexOf(eventType)
  if (idx >= 0) {
    selectedEventTypes.value.splice(idx, 1)
  } else {
    selectedEventTypes.value.push(eventType)
  }
  activeFilter.value = 'all'
  journal.setFilters({ eventTypes: [...selectedEventTypes.value], severity: activeSeverity.value || '' })
  journal.fetchEntries(true)
}

function handleSeverityFilter(severity) {
  activeSeverity.value = activeSeverity.value === severity ? '' : severity
  journal.setFilters({ severity: activeSeverity.value || '' })
  journal.fetchEntries(true)
}

function handleSourceFilter(source) {
  activeSource.value = source
  journal.setFilters({ performedBySource: source || '' })
  journal.fetchEntries(true)
}

// ── Detail panel ──
async function openDetail(entry) {
  await journal.fetchEntryDetail(entry.id)
}

function closeDetail() {
  journal.closeDetail()
}

// ── Sale expansion ──
async function toggleSaleExpansion(ticketId, entryId) {
  if (expandedSales.value.has(entryId)) {
    expandedSales.value.delete(entryId)
    return
  }
  expandedSales.value.add(entryId)
  if (!journal.saleExpansion || journal.saleExpansion.ticket?.id !== ticketId) {
    await journal.fetchSaleExpansion(ticketId)
  }
}

function isSaleExpanded(entryId) {
  return expandedSales.value.has(entryId)
}

function isSaleEvent(entry) {
  return entry.event_type === 'sale.imported' || entry.event_type === 'sale.expanded'
}

// ── Formatting helpers ──
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function getEventCategory(eventType) {
  if (!eventType) return 'general'
  return journal.eventTypes.find(et => et.value === eventType)?.category || eventType.split('.')[0] || 'general'
}

function formatMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return ''
  return Object.entries(metadata)
    .filter(([_, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
}

function getSeverityStyle(severity) {
  const cfg = severityConfig[severity] || severityConfig.info
  return { color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}20` }
}

function getSourceStyle(source) {
  return { color: sourceColors[source] || '#64748b' }
}

// ── Export ──
async function handleExport(format) {
  await journal.exportEntries(format)
}

// ── Clear ──
function clearAllFilters() {
  searchQuery.value = ''
  activeFilter.value = 'all'
  selectedEventTypes.value = []
  activeSeverity.value = ''
  activeSource.value = ''
  startDate.value = ''
  endDate.value = ''
  journal.clearFilters()
}
</script>

<template>
  <div class="journal-page">
    <!-- Page Header -->
    <div class="journal-header">
      <div>
        <h1 class="journal-title">📋 Journal d'Activité</h1>
        <p class="journal-subtitle">
          Historique complet des opérations — {{ journal.total }} événements
          <span v-if="journal.isLoading" class="loading-dots">Chargement...</span>
        </p>
      </div>
      <div class="header-actions">
        <button class="touch-btn touch-btn-secondary" @click="showFilters = !showFilters">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          Filtres
        </button>
        <div class="export-dropdown">
          <button class="touch-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exporter
          </button>
          <div class="export-menu">
            <button @click="handleExport('csv')">📄 CSV</button>
            <button @click="handleExport('excel')">📊 Excel</button>
            <button @click="handleExport('pdf')">📑 PDF</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="search-bar">
      <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="Rechercher par produit, ingrédient, vente, utilisateur, fournisseur, transfert..."
        @keyup.enter="handleSearch"
      />
      <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''; handleSearch()">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Quick Filters -->
    <div class="quick-filters">
      <button
        v-for="opt in filterOptions"
        :key="opt.value"
        class="filter-pill"
        :class="{ active: activeFilter === opt.value }"
        @click="handleQuickFilter(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <!-- Extended Filters -->
    <div v-if="showFilters" class="extended-filters">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">Date début</label>
          <input v-model="startDate" type="datetime-local" class="form-input filter-input" @change="handleDateFilter" />
        </div>
        <div class="filter-group">
          <label class="filter-label">Date fin</label>
          <input v-model="endDate" type="datetime-local" class="form-input filter-input" @change="handleDateFilter" />
        </div>
        <div class="filter-group">
          <label class="filter-label">Source</label>
          <select v-model="activeSource" class="form-select filter-input" @change="handleSourceFilter(activeSource)">
            <option v-for="opt in sourceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Sévérité</label>
          <div class="severity-pills">
            <button
              v-for="(cfg, key) in severityConfig"
              :key="key"
              class="severity-pill"
              :class="{ active: activeSeverity === key }"
              :style="activeSeverity === key ? { background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` } : {}"
              @click="handleSeverityFilter(key)"
            >
              {{ cfg.label }}
            </button>
          </div>
        </div>
        <div class="filter-group">
          <button class="touch-btn touch-btn-secondary" style="margin-top: 1.5rem;" @click="clearAllFilters">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            Réinitialiser
          </button>
        </div>
      </div>

      <!-- Event type chips -->
      <div class="event-type-chips">
        <span class="filter-label">Types d'événements:</span>
        <div class="chip-grid">
          <button
            v-for="et in journal.eventTypes"
            :key="et.value"
            class="event-chip"
            :class="{ active: selectedEventTypes.includes(et.value) }"
            :style="selectedEventTypes.includes(et.value) ? {
              background: `${categoryColors[et.category] || '#6366f1'}20`,
              color: categoryColors[et.category] || '#6366f1',
              border: `1px solid ${categoryColors[et.category] || '#6366f1'}40`,
            } : {}"
            @click="handleEventTypeSelect(et.value)"
          >
            {{ et.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Active filter indicators -->
    <div v-if="activeSeverity || selectedEventTypes.length > 0 || activeSource || searchQuery || startDate || endDate" class="active-filters">
      <span class="active-filter-label">Filtres actifs:</span>
      <span v-if="activeSeverity" class="active-filter-badge" :style="getSeverityStyle(activeSeverity)">
        {{ severityConfig[activeSeverity]?.label }}
        <button @click="handleSeverityFilter(activeSeverity)" class="badge-remove">&times;</button>
      </span>
      <span v-if="activeSource" class="active-filter-badge" :style="{ background: `${sourceColors[activeSource]}15`, color: sourceColors[activeSource], border: `1px solid ${sourceColors[activeSource]}30` }">
        {{ sourceLabels[activeSource] }}
        <button @click="activeSource = ''; journal.setFilters({ performedBySource: '' }); journal.fetchEntries(true)" class="badge-remove">&times;</button>
      </span>
      <span v-if="searchQuery" class="active-filter-badge">🔍 {{ searchQuery }}<button @click="searchQuery = ''; journal.setFilters({ search: '' }); journal.fetchEntries(true)" class="badge-remove">&times;</button></span>
      <span v-if="startDate || endDate" class="active-filter-badge">📅 {{ startDate?.split('T')[0] || '...' }} → {{ endDate?.split('T')[0] || '...' }}<button @click="startDate = ''; endDate = ''; journal.setFilters({ startDate: '', endDate: '' }); journal.fetchEntries(true)" class="badge-remove">&times;</button></span>
      <button v-if="selectedEventTypes.length > 0" class="clear-types-btn" @click="selectedEventTypes = []; journal.setFilters({ eventTypes: [] }); journal.fetchEntries(true)">Effacer les types ({{ selectedEventTypes.length }})</button>
    </div>

    <!-- Loading -->
    <div v-if="journal.isLoading && journal.entries.length === 0" class="loading-state">
      <div class="spinner" />
      <p>Chargement du journal d'activité...</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="journal.entries.length === 0" class="empty-state">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
      <h3>Aucun événement trouvé</h3>
      <p>Essayez de modifier vos filtres ou d'élargir la période de recherche.</p>
      <button v-if="activeFilter !== 'all' || searchQuery || activeSeverity" class="touch-btn touch-btn-secondary" @click="clearAllFilters">Réinitialiser les filtres</button>
    </div>

    <!-- Journal Table -->
    <div v-else class="table-wrapper">
      <table class="mepos-table journal-table">
        <thead>
          <tr>
            <th class="col-time">Date</th>
            <th class="col-event">Événement</th>
            <th class="col-user">Utilisateur</th>
            <th class="col-source">Source</th>
            <th class="col-severity">Sévérité</th>
            <th class="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="entry in journal.entries" :key="entry.id">
            <tr
              class="journal-row"
              :class="{ 'is-sale': isSaleEvent(entry), 'is-expanded': isSaleExpanded(entry.id) }"
              @click="openDetail(entry)"
            >
              <td class="cell-time" data-label="Date">
                <span class="time-text">{{ formatDate(entry.occurred_at) }}</span>
              </td>
              <td class="cell-event" data-label="Événement">
                <div class="event-cell">
                  <span
                    class="event-category-dot"
                    :style="{ background: categoryColors[getEventCategory(entry.event_type)] || '#64748b' }"
                  />
                  <div class="event-info">
                    <span class="event-title">{{ entry.title }}</span>
                    <span v-if="entry.description" class="event-desc">{{ entry.description }}</span>
                  </div>
                </div>
              </td>
              <td class="cell-user" data-label="Utilisateur">
                <span v-if="entry.performed_by_user_id" class="user-badge-small">
                  #{{ entry.performed_by_user_id }}
                  <span v-if="entry.performed_by_role" class="role-tag">{{ entry.performed_by_role }}</span>
                </span>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="cell-source" data-label="Source">
                <span class="source-badge" :style="getSourceStyle(entry.performed_by_source)">
                  {{ sourceLabels[entry.performed_by_source] || entry.performed_by_source }}
                </span>
              </td>
              <td class="cell-severity" data-label="Sévérité">
                <span class="severity-badge" :style="getSeverityStyle(entry.severity)">
                  {{ severityConfig[entry.severity]?.label || entry.severity }}
                </span>
              </td>
              <td class="cell-actions" data-label="Actions" @click.stop>
                <div class="row-actions">
                  <button class="action-btn" title="Détails" @click.stop="openDetail(entry)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button
                    v-if="isSaleEvent(entry)"
                    class="action-btn"
                    :class="{ expanded: isSaleExpanded(entry.id) }"
                    :title="isSaleExpanded(entry.id) ? 'Réduire' : 'Voir détails vente'"
                    @click.stop="toggleSaleExpansion(parseInt(entry.entity_id), entry.id)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
              </td>
            </tr>

            <!-- Sale Expansion Row -->
            <tr v-if="isSaleExpanded(entry.id) && journal.saleExpansion && journal.saleExpansion.ticket?.id == entry.entity_id" class="expansion-row">
              <td colspan="6">
                <div class="sale-expansion">
                  <!-- Customer & Sale Info -->
                  <div class="expansion-header">
                    <div class="expansion-header-left">
                      <strong>Vente #{{ journal.saleExpansion.ticket?.external_ticket_id }}</strong>
                      <span class="expansion-meta">{{ formatDate(journal.saleExpansion.ticket?.ticket_date) }}</span>
                      <span class="expansion-meta">{{ journal.saleExpansion.ticket?.total_amount }} TND</span>
                    </div>
                    <div class="expansion-header-right">
                      <span class="expansion-badge">{{ journal.saleExpansion.items?.length || 0 }} article(s)</span>
                    </div>
                  </div>

                  <!-- Products Sold -->
                  <div class="expansion-products">
                    <div class="expansion-section-title">Produits vendus</div>
                    <div v-for="item in journal.saleExpansion.items" :key="item.recipe_id" class="expansion-product">
                      <div class="product-header">
                        <span class="product-name">{{ item.recipe_name }}</span>
                        <span class="product-qty">×{{ item.quantity }}</span>
                        <span class="product-price">{{ (parseFloat(item.quantity) * parseFloat(item.unit_price)).toFixed(2) }} TND</span>
                      </div>

                      <!-- Ingredient Consumption -->
                      <div class="ingredient-consumption">
                        <div class="consumption-title">Consommation d'ingrédients</div>
                        <div v-for="ing in item.ingredients" :key="ing.ingredient_id" class="consumption-row">
                          <span class="consumption-name">{{ ing.ingredient_name }}</span>
                          <span class="consumption-qty" :class="{ negative: ing.total_consumed > 0 }">
                            {{ ing.total_consumed > 0 ? '-' : '' }}{{ ing.total_consumed }} {{ ing.unit }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Inventory Before/After -->
                  <div v-if="journal.saleExpansion.items?.[0]?.ingredients?.length" class="expansion-inventory">
                    <div class="expansion-section-title">État des stocks</div>
                    <div class="inventory-table-mini">
                      <div class="inv-row inv-header">
                        <span>Ingrédient</span>
                        <span>Avant</span>
                        <span>Après</span>
                      </div>
                      <div
                        v-for="ing in journal.saleExpansion.items.flatMap(i => i.ingredients).slice(0, 10)"
                        :key="ing.ingredient_id"
                        class="inv-row"
                      >
                        <span>{{ ing.ingredient_name }}</span>
                        <span class="inv-before">{{ ing.inventory_before }} {{ ing.unit }}</span>
                        <span class="inv-after">{{ ing.inventory_after }} {{ ing.unit }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Related Notifications -->
                  <div v-if="journal.saleExpansion.notifications?.length" class="expansion-notifications">
                    <div class="expansion-section-title">Notifications déclenchées ({{ journal.saleExpansion.notifications.length }})</div>
                    <div v-for="notif in journal.saleExpansion.notifications.slice(0, 5)" :key="notif.id" class="notif-row">
                      <span class="notif-icon">🔔</span>
                      <span class="notif-title">{{ notif.title }}</span>
                    </div>
                  </div>

                  <!-- Related Journal Events (Timeline) -->
                  <div v-if="journal.saleExpansion.journal?.length" class="expansion-timeline">
                    <div class="expansion-section-title">Corrélation d'événements</div>
                    <div class="timeline-mini">
                      <div v-for="je in journal.saleExpansion.journal" :key="je.id" class="timeline-item">
                        <div class="timeline-dot" :style="{ background: categoryColors[getEventCategory(je.event_type)] || '#64748b' }" />
                        <div class="timeline-content">
                          <span class="timeline-title">{{ je.title }}</span>
                          <span class="timeline-time">{{ formatDate(je.occurred_at) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="journal.total > journal.limit" class="pagination-bar">
        <div class="pagination-info">{{ journal.entries.length }} sur {{ journal.total }} événements</div>
        <div class="pagination-controls">
          <button class="pagination-btn touch-btn touch-btn-secondary" :disabled="journal.currentPage <= 1" @click="journal.goToPrevPage()">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Précédent
          </button>
          <div class="page-numbers">
            <button
              v-for="p in Math.min(journal.totalPages, 10)"
              :key="p"
              class="pagination-dot"
              :class="{ active: p === journal.currentPage }"
              @click="journal.goToPage(p)"
            >{{ p }}</button>
            <span v-if="journal.totalPages > 10" class="pagination-ellipsis">...</span>
          </div>
          <button class="pagination-btn touch-btn touch-btn-secondary" :disabled="journal.currentPage >= journal.totalPages" @click="journal.goToNextPage()">
            Suivant
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Detail Side Panel -->
    <Transition name="panel-slide">
      <div v-if="journal.showDetail" class="detail-overlay" @click.self="closeDetail">
        <div class="detail-panel">
          <div class="detail-panel-header">
            <h3 class="detail-panel-title">{{ journal.selectedEntry?.title }}</h3>
            <button class="detail-close-btn" @click="closeDetail">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div v-if="journal.isLoadingDetail" class="detail-loading">
            <div class="spinner" />
          </div>

          <div v-else-if="journal.selectedEntry" class="detail-body">
            <!-- Main Info -->
            <div class="detail-section">
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">Date</span>
                  <span class="detail-value">{{ formatDate(journal.selectedEntry.occurred_at) }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Type d'événement</span>
                  <span class="detail-value event-type-text">{{ journal.selectedEntry.event_type }}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Sévérité</span>
                  <span class="severity-badge" :style="getSeverityStyle(journal.selectedEntry.severity)">
                    {{ severityConfig[journal.selectedEntry.severity]?.label || journal.selectedEntry.severity }}
                  </span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Source</span>
                  <span class="source-text" :style="getSourceStyle(journal.selectedEntry.performed_by_source)">
                    {{ sourceLabels[journal.selectedEntry.performed_by_source] || journal.selectedEntry.performed_by_source }}
                  </span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Utilisateur</span>
                  <span>{{ journal.selectedEntry.performed_by_user_id ? `#${journal.selectedEntry.performed_by_user_id}` : 'Système' }}</span>
                </div>
                <div v-if="journal.selectedEntry.performed_by_role" class="detail-item">
                  <span class="detail-label">Rôle</span>
                  <span class="role-tag">{{ journal.selectedEntry.performed_by_role }}</span>
                </div>
                <div v-if="journal.selectedEntry.entity_type" class="detail-item">
                  <span class="detail-label">Entité</span>
                  <span>{{ journal.selectedEntry.entity_type }} #{{ journal.selectedEntry.entity_id }}</span>
                </div>
                <div v-if="journal.selectedEntry.correlation_id" class="detail-item">
                  <span class="detail-label">Corrélation</span>
                  <span class="correlation-id" :title="journal.selectedEntry.correlation_id">{{ journal.selectedEntry.correlation_id?.substring(0, 12) }}...</span>
                </div>
                <div v-if="journal.selectedEntry.external_reference" class="detail-item">
                  <span class="detail-label">Réf. externe</span>
                  <span>{{ journal.selectedEntry.external_reference }}</span>
                </div>
                <div v-if="journal.selectedEntry.connector_id" class="detail-item">
                  <span class="detail-label">Connecteur</span>
                  <span>Agent #{{ journal.selectedEntry.connector_id }}</span>
                </div>
              </div>
            </div>

            <!-- Description -->
            <div v-if="journal.selectedEntry.description" class="detail-section">
              <div class="detail-section-title">Description</div>
              <p class="detail-description">{{ journal.selectedEntry.description }}</p>
            </div>

            <!-- Metadata -->
            <div v-if="journal.selectedEntry.metadata && Object.keys(journal.selectedEntry.metadata).length > 0" class="detail-section">
              <div class="detail-section-title">Métadonnées</div>
              <div class="metadata-grid">
                <div v-for="(val, key) in journal.selectedEntry.metadata" :key="key" class="metadata-item">
                  <span class="metadata-key">{{ key }}</span>
                  <span class="metadata-value">{{ typeof val === 'object' ? JSON.stringify(val) : val }}</span>
                </div>
              </div>
            </div>

            <!-- Previous / New Values (Audit Trail) -->
            <div v-if="journal.selectedEntry.previous_values || journal.selectedEntry.new_values" class="detail-section">
              <div class="detail-section-title">Modifications</div>
              <div class="diff-grid">
                <div v-if="journal.selectedEntry.previous_values" class="diff-side">
                  <div class="diff-label diff-old">Ancienne valeur</div>
                  <pre class="diff-pre">{{ JSON.stringify(journal.selectedEntry.previous_values, null, 2) }}</pre>
                </div>
                <div v-if="journal.selectedEntry.new_values" class="diff-side">
                  <div class="diff-label diff-new">Nouvelle valeur</div>
                  <pre class="diff-pre">{{ JSON.stringify(journal.selectedEntry.new_values, null, 2) }}</pre>
                </div>
              </div>
            </div>

            <!-- Timeline (Correlated Events) -->
            <div v-if="journal.correlatedEntries && journal.correlatedEntries.length > 1" class="detail-section">
              <div class="detail-section-title">
                Chaîne d'événements
                <span class="correlation-count">{{ journal.correlatedEntries.length }} événements</span>
              </div>
              <div class="timeline">
                <div
                  v-for="(ce, idx) in journal.correlatedEntries"
                  :key="ce.id"
                  class="timeline-item"
                  :class="{ active: ce.id === journal.selectedEntry?.id }"
                >
                  <div class="timeline-dot" :style="{ background: categoryColors[getEventCategory(ce.event_type)] || '#64748b' }" />
                  <div v-if="idx < journal.correlatedEntries.length - 1" class="timeline-line" />
                  <div class="timeline-content" @click="journal.fetchEntryDetail(ce.id)">
                    <span class="timeline-title">{{ ce.title }}</span>
                    <span class="timeline-meta">{{ formatDate(ce.occurred_at) }}</span>
                    <span class="timeline-event-type">{{ ce.event_type }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sale Expansion in Detail -->
            <div v-if="isSaleEvent(journal.selectedEntry) && journal.selectedEntry.entity_id" class="detail-section">
              <div class="detail-section-title">Détails de la vente</div>
              <button class="touch-btn" @click="journal.fetchSaleExpansion(parseInt(journal.selectedEntry.entity_id))">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                Voir l'expansion complète
              </button>

              <div v-if="journal.saleExpansion && journal.showSaleExpansion" class="detail-sale-expansion">
                <div class="expansion-section-title">Produits vendus</div>
                <div v-for="item in journal.saleExpansion.items" :key="item.recipe_id" class="expansion-product">
                  <div class="product-header">
                    <span class="product-name">{{ item.recipe_name }}</span>
                    <span class="product-qty">×{{ item.quantity }}</span>
                  </div>
                  <div v-for="ing in item.ingredients" :key="ing.ingredient_id" class="consumption-row">
                    <span class="consumption-name">{{ ing.ingredient_name }}</span>
                    <span class="consumption-qty negative">-{{ ing.total_consumed }} {{ ing.unit }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.journal-page {
  padding: 0;
  position: relative;
}

.journal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  gap: 1rem;
}

.journal-title {
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
}

.journal-subtitle {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.export-dropdown {
  position: relative;
}

.export-menu {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  z-index: 20;
  min-width: 140px;
}

.export-dropdown:hover .export-menu,
.export-dropdown:focus-within .export-menu {
  display: flex;
  flex-direction: column;
}

.export-menu button {
  background: transparent;
  border: none;
  color: var(--text-primary);
  padding: 0.7rem 1rem;
  font-size: 0.85rem;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  font-family: var(--font-sans);
}

.export-menu button:hover {
  background: rgba(255,255,255,0.03);
}

/* Search */
.search-bar {
  position: relative;
  margin-bottom: 0.75rem;
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
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0.25rem;
}

.search-clear:hover {
  color: var(--text-primary);
}

/* Quick Filters */
.quick-filters {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filter-pill {
  background: rgba(255,255,255,0.01);
  border: 1px solid var(--border-color);
  padding: 0.45rem 1rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  font-family: var(--font-sans);
}

.filter-pill:hover {
  background: rgba(255,255,255,0.03);
  color: var(--text-primary);
}

.filter-pill.active {
  background: var(--indigo);
  border-color: transparent;
  color: white;
}

/* Extended Filters */
.extended-filters {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1rem;
  margin-bottom: 1rem;
  animation: fadeIn 0.2s ease;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.filter-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filter-input {
  min-height: 38px;
  font-size: 0.85rem;
  padding: 0.5rem 0.75rem;
  width: 200px;
}

.event-type-chips {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.event-chip {
  background: rgba(255,255,255,0.01);
  border: 1px solid var(--border-color);
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: var(--font-sans);
}

.event-chip:hover {
  color: var(--text-primary);
  border-color: var(--border-hover);
}

.severity-pills {
  display: flex;
  gap: 0.3rem;
}

.severity-pill {
  background: transparent;
  border: 1px solid var(--border-color);
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: var(--font-sans);
}

.severity-pill:hover {
  color: var(--text-primary);
}

/* Active Filters */
.active-filters {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.active-filter-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.active-filter-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-remove {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
  opacity: 0.7;
}

.badge-remove:hover {
  opacity: 1;
}

.clear-types-btn {
  background: transparent;
  border: none;
  color: var(--indigo-light);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
}

.clear-types-btn:hover {
  text-decoration: underline;
}

/* Table */
.journal-table {
  font-size: 0.85rem;
}

.col-time { width: 150px; }
.col-event { min-width: 250px; }
.col-user { width: 120px; }
.col-source { width: 100px; }
.col-severity { width: 100px; }
.col-actions { width: 80px; text-align: center; }

.journal-row {
  cursor: pointer;
  transition: background 0.12s ease;
}

.journal-row:hover td {
  background: rgba(99,102,241,0.02) !important;
}

.journal-row.is-sale td {
  border-left: 3px solid rgba(16,185,129,0.3);
}

.event-cell {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}

.event-category-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.35rem;
}

.event-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.event-title {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 0.88rem;
}

.event-desc {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.cell-time .time-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.user-badge-small {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
}

.role-tag {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: rgba(99,102,241,0.1);
  color: var(--indigo-light);
  text-transform: uppercase;
}

.source-badge {
  font-size: 0.78rem;
  font-weight: 600;
}

.severity-badge {
  display: inline-flex;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.text-muted {
  color: var(--text-muted);
}

.row-actions {
  display: flex;
  gap: 0.3rem;
  justify-content: center;
}

.action-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255,255,255,0.03);
  color: var(--text-primary);
  border-color: var(--border-hover);
}

.action-btn.expanded {
  background: var(--indigo);
  border-color: transparent;
  color: white;
}

/* Expansion Row */
.expansion-row td {
  padding: 0 !important;
  background: rgba(0,0,0,0.1) !important;
}

.sale-expansion {
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-left: 3px solid var(--emerald);
  margin: 0 0.5rem;
}

.expansion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.expansion-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.expansion-meta {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.expansion-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(16,185,129,0.1);
  color: var(--emerald);
  border: 1px solid rgba(16,185,129,0.15);
}

.expansion-section-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.5rem;
}

.expansion-product {
  margin-bottom: 0.75rem;
}

.product-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255,255,255,0.02);
  border-radius: var(--radius-sm);
}

.product-name {
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.product-qty {
  color: var(--text-secondary);
}

.product-price {
  color: var(--indigo-light);
  font-weight: 600;
}

/* Ingredient consumption */
.ingredient-consumption {
  padding: 0.5rem 0.75rem 0.5rem 1.5rem;
}

.consumption-title {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 0.25rem;
}

.consumption-row {
  display: flex;
  justify-content: space-between;
  padding: 0.2rem 0;
  font-size: 0.8rem;
}

.consumption-name {
  color: var(--text-secondary);
}

.consumption-qty {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.consumption-qty.negative {
  color: var(--coral);
}

/* Inventory mini table */
.inventory-table-mini {
  font-size: 0.8rem;
}

.inv-row {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0.75rem;
  gap: 1rem;
}

.inv-row.inv-header {
  font-weight: 700;
  color: var(--text-secondary);
  font-size: 0.7rem;
  text-transform: uppercase;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 0.25rem;
}

.inv-row span:first-child { flex: 1; }
.inv-before { color: var(--text-secondary); }
.inv-after { color: var(--emerald); font-weight: 600; }

/* Notification rows */
.notif-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
  font-size: 0.8rem;
}

.notif-icon { font-size: 0.8rem; }
.notif-title { color: var(--text-primary); }

/* Timeline mini */
.timeline-mini {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timeline-item {
  display: flex;
  gap: 0.75rem;
  position: relative;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.25rem;
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.timeline-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.82rem;
}

.timeline-time {
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* Pagination */
.pagination-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-numbers {
  display: flex;
  gap: 0.25rem;
}

.pagination-ellipsis {
  color: var(--text-muted);
  padding: 0 0.25rem;
}

/* Detail Panel */
.detail-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.detail-panel {
  width: 520px;
  max-width: 100vw;
  height: 100vh;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: -10px 0 40px rgba(0,0,0,0.3);
}

.detail-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.detail-panel-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.detail-close-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: var(--radius-sm);
}

.detail-close-btn:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.03);
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.detail-section-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.detail-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.detail-value {
  font-size: 0.9rem;
  color: var(--text-primary);
  font-weight: 500;
}

.event-type-text {
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--indigo-light);
  word-break: break-all;
}

.source-text {
  font-weight: 600;
}

.correlation-id {
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.detail-description {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.metadata-grid {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.metadata-item {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  background: rgba(255,255,255,0.01);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
}

.metadata-key {
  font-weight: 600;
  color: var(--text-secondary);
}

.metadata-value {
  color: var(--text-primary);
  max-width: 60%;
  text-align: right;
  word-break: break-all;
}

/* Diff */
.diff-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.diff-side {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.diff-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.diff-label.diff-old {
  color: var(--coral);
  background: rgba(239,68,68,0.1);
}

.diff-label.diff-new {
  color: var(--emerald);
  background: rgba(16,185,129,0.1);
}

.diff-pre {
  font-size: 0.75rem;
  background: rgba(0,0,0,0.2);
  padding: 0.75rem;
  border-radius: var(--radius-sm);
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary);
}

/* Timeline in detail */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;
}

.timeline-item {
  display: flex;
  gap: 0.75rem;
  position: relative;
  padding: 0.5rem 0;
  cursor: pointer;
  transition: background 0.1s ease;
  border-radius: var(--radius-sm);
  padding-left: 0.5rem;
}

.timeline-item:hover {
  background: rgba(255,255,255,0.02);
}

.timeline-item.active {
  background: rgba(99,102,241,0.05);
  border-left: 2px solid var(--indigo);
}

.timeline-line {
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: -5px;
  width: 2px;
  background: var(--border-color);
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.timeline-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.82rem;
}

.timeline-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.timeline-event-type {
  font-size: 0.68rem;
  font-family: monospace;
  color: var(--text-muted);
}

.correlation-count {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--indigo-light);
  background: rgba(99,102,241,0.1);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

/* Loading */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  gap: 1rem;
  color: var(--text-secondary);
}

/* Transitions */
.panel-slide-enter-active {
  animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-slide-leave-active {
  animation: slideInRight 0.2s ease reverse;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.loading-dots {
  font-size: 0.8rem;
  color: var(--indigo-light);
  margin-left: 0.5rem;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top: 3px solid var(--indigo);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Detail sale expansion */
.detail-sale-expansion {
  margin-top: 0.75rem;
  background: rgba(0,0,0,0.1);
  border-radius: var(--radius-md);
  padding: 1rem;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  gap: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
}

.empty-state h3 {
  color: var(--text-primary);
  font-size: 1rem;
}

/* Responsive */
@media (max-width: 900px) {
  .journal-header {
    flex-direction: column;
  }

  .detail-panel {
    width: 100vw;
  }

  .diff-grid {
    grid-template-columns: 1fr;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .filter-input {
    width: 100%;
  }

  .filter-row {
    flex-direction: column;
  }
}

@media (max-width: 600px) {
  .col-time, .col-user, .col-source, .col-severity { display: none; }
  .col-event { min-width: auto; }
}
</style>
