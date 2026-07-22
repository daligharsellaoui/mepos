<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMappingStore } from '../stores/mappings'
import { useAppStore } from '../stores/app'
import { useAuthStore } from '../stores/auth'

const mappingStore = useMappingStore()
const app = useAppStore()
const auth = useAuthStore()

const isAdmin = computed(() => auth.isAdmin)
const isManager = computed(() => auth.isManager || auth.isAdmin)
const activeTab = ref('overview')
const searchQuery = ref('')
const selectedConnector = ref('pos')
const showMapModal = ref(false)
const selectedMapping = ref(null)
const selectedRecipeId = ref(null)
const autoMatchThreshold = ref(60)
const isAutoMatching = ref(false)

const recipes = computed(() => app.recipes || [])
const mappings = computed(() => mappingStore.mappings)
const stats = computed(() => mappingStore.stats)

const filteredMappings = computed(() => {
  let list = mappings.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(m =>
      m.external_product_name?.toLowerCase().includes(q) ||
      m.external_product_code?.toLowerCase().includes(q) ||
      m.mepos_product_name?.toLowerCase().includes(q)
    )
  }
  return list
})

const unmappedMappings = computed(() =>
  mappings.value.filter(m => m.mapping_status === 'unmapped')
)

const mappedMappings = computed(() =>
  mappings.value.filter(m => m.mapping_status === 'mapped')
)

onMounted(async () => {
  await Promise.all([
    mappingStore.fetchMappings(),
    mappingStore.fetchStats(),
    app.fetchData(auth.user)
  ])
})

async function refresh() {
  await Promise.all([
    mappingStore.fetchMappings(),
    mappingStore.fetchStats()
  ])
}

function getConfidenceClass(confidence) {
  if (confidence >= 90) return 'confidence-high'
  if (confidence >= 70) return 'confidence-medium'
  return 'confidence-low'
}

function getStatusBadge(status) {
  switch (status) {
    case 'mapped': return { class: 'badge-success', label: 'Mappé' }
    case 'unmapped': return { class: 'badge-warning', label: 'Non mappé' }
    case 'ignored': return { class: 'badge-muted', label: 'Ignoré' }
    default: return { class: 'badge-muted', label: status }
  }
}

function openMapModal(mapping) {
  selectedMapping.value = mapping
  selectedRecipeId.value = mapping.mepos_product_id || null
  showMapModal.value = true
}

function closeMapModal() {
  showMapModal.value = false
  selectedMapping.value = null
  selectedRecipeId.value = null
}

async function applyMapping() {
  if (!selectedMapping.value || !selectedRecipeId.value) return
  try {
    await mappingStore.updateMapping(selectedMapping.value.id, {
      mepos_product_id: selectedRecipeId.value,
      mapping_status: 'mapped',
      confidence: 100
    })
    closeMapModal()
  } catch (err) {
    console.error('Mapping error:', err)
  }
}

async function ignoreMapping(mapping) {
  try {
    await mappingStore.updateMapping(mapping.id, { mapping_status: 'ignored' })
  } catch (err) {
    console.error('Ignore error:', err)
  }
}

async function removeMapping(mapping) {
  if (!confirm('Supprimer ce mapping ?')) return
  try {
    await mappingStore.deleteMapping(mapping.id)
  } catch (err) {
    console.error('Delete error:', err)
  }
}

async function runAutoMatch() {
  isAutoMatching.value = true
  try {
    await mappingStore.autoMatch(selectedConnector.value, autoMatchThreshold.value)
  } catch (err) {
    console.error('Auto-match error:', err)
  } finally {
    isAutoMatching.value = false
  }
}
</script>

<template>
  <div class="mapping-view">
    <div class="view-title-section">
      <div>
        <h1 class="view-title">🔗 Correspondance Produits POS</h1>
        <p class="view-subtitle">Associez les produits externes aux recettes mePOS</p>
      </div>
      <div class="action-buttons">
        <button class="touch-btn touch-btn-secondary" @click="refresh">Actualiser</button>
        <button v-if="isAdmin" class="touch-btn touch-btn-primary" @click="runAutoMatch" :disabled="isAutoMatching">
          {{ isAutoMatching ? 'Analyse...' : 'Auto-mapping' }}
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">📊</div>
        <div class="stat-info">
          <span class="stat-value">{{ stats?.total || 0 }}</span>
          <span class="stat-label">Total Produits</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✅</div>
        <div class="stat-info">
          <span class="stat-value">{{ stats?.mapped || 0 }}</span>
          <span class="stat-label">Mappés</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber">⚠️</div>
        <div class="stat-info">
          <span class="stat-value">{{ stats?.unmapped || 0 }}</span>
          <span class="stat-label">Non mappés</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple">📈</div>
        <div class="stat-info">
          <span class="stat-value">{{ stats?.completionPercentage || 0 }}%</span>
          <span class="stat-label">Complétion</span>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button :class="['tab', { active: activeTab === 'overview' }]" @click="activeTab = 'overview'">Vue d'ensemble</button>
      <button :class="['tab', { active: activeTab === 'all' }]" @click="activeTab = 'all'">Tous les mappings</button>
      <button :class="['tab', { active: activeTab === 'unmapped' }]" @click="activeTab = 'unmapped'">
        Non mappés
        <span v-if="stats?.unmapped" class="tab-badge">{{ stats.unmapped }}</span>
      </button>
    </div>

    <!-- Overview Tab -->
    <div v-if="activeTab === 'overview'" class="tab-content">
      <div class="completion-bar-wrapper">
        <div class="completion-label">
          <span>Progression du mapping</span>
          <span class="completion-percent">{{ stats?.completionPercentage || 0 }}%</span>
        </div>
        <div class="completion-bar">
          <div class="completion-fill" :style="{ width: (stats?.completionPercentage || 0) + '%' }"></div>
        </div>
      </div>
      <div class="glass-panel" style="padding: 1.5rem; text-align: center;">
        <p style="color: var(--text-secondary);">
          Utilisez l'onglet "Tous les mappings" pour gérer les correspondances individuellement,
          ou lancez l'auto-mapping pour une correspondance automatique basée sur le nom.
        </p>
      </div>
    </div>

    <!-- All Mappings Tab -->
    <div v-if="activeTab === 'all'" class="tab-content">
      <div class="filter-bar">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Rechercher un produit..."
        />
        <select v-model="selectedConnector" class="filter-select" @change="mappingStore.setConnectorFilter(selectedConnector)">
          <option value="">Tous les connecteurs</option>
          <option value="pos">POS</option>
          <option value="api">API</option>
          <option value="database">Base de données</option>
        </select>
      </div>
      <div class="glass-panel table-wrapper">
        <table class="mepos-table">
          <thead>
            <tr>
              <th>Produit Externe</th>
              <th>Code</th>
              <th>Produit mePOS</th>
              <th>Statut</th>
              <th>Confiance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="mapping in filteredMappings" :key="mapping.id">
              <td data-label="Produit Externe">
                <strong>{{ mapping.external_product_name || 'Sans nom' }}</strong>
              </td>
              <td data-label="Code" style="color: var(--text-secondary);">
                {{ mapping.external_product_code || mapping.external_product_id }}
              </td>
              <td data-label="Produit mePOS">
                <span v-if="mapping.mepos_product_name" class="mapped-product">
                  {{ mapping.mepos_product_name }}
                </span>
                <span v-else class="unmapped-text">Non assigné</span>
              </td>
              <td data-label="Statut">
                <span :class="['badge', getStatusBadge(mapping.mapping_status).class]">
                  {{ getStatusBadge(mapping.mapping_status).label }}
                </span>
              </td>
              <td data-label="Confiance">
                <span :class="['confidence-badge', getConfidenceClass(mapping.confidence)]">
                  {{ mapping.confidence }}%
                </span>
              </td>
              <td data-label="Actions">
                <div class="action-group">
                  <button class="btn-icon" title="Mapper" @click="openMapModal(mapping)">🔗</button>
                  <button v-if="mapping.mapping_status === 'mapped'" class="btn-icon" title="Ignorer" @click="ignoreMapping(mapping)">⚠️</button>
                  <button class="btn-icon btn-icon-danger" title="Supprimer" @click="removeMapping(mapping)">🗑️</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="filteredMappings.length === 0" class="empty-state">
          <p>Aucun mapping trouvé</p>
        </div>
      </div>
    </div>

    <!-- Unmapped Tab -->
    <div v-if="activeTab === 'unmapped'" class="tab-content">
      <div class="glass-panel table-wrapper">
        <table class="mepos-table">
          <thead>
            <tr>
              <th>Produit Externe</th>
              <th>Code</th>
              <th>Connecteur</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="mapping in unmappedMappings" :key="mapping.id">
              <td data-label="Produit">
                <strong>{{ mapping.external_product_name || 'Sans nom' }}</strong>
              </td>
              <td data-label="Code" style="color: var(--text-secondary);">
                {{ mapping.external_product_code || mapping.external_product_id }}
              </td>
              <td data-label="Connecteur">
                <span class="badge badge-info">{{ mapping.connector_type }}</span>
              </td>
              <td data-label="Actions">
                <div class="action-group">
                  <button class="btn-icon" title="Mapper" @click="openMapModal(mapping)">🔗</button>
                  <button class="btn-icon" title="Ignorer" @click="ignoreMapping(mapping)">⚠️</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="unmappedMappings.length === 0" class="empty-state">
          <div class="empty-icon">✅</div>
          <h3>Tout est mappé!</h3>
          <p>Aucun produit externe en attente de mapping.</p>
        </div>
      </div>
    </div>

    <!-- Map Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showMapModal" class="modal-overlay" @click.self="closeMapModal">
          <div class="glass-panel modal-content map-modal">
            <div class="modal-header">
              <h2 class="modal-title">Mapper le produit</h2>
              <button class="btn-close" @click="closeMapModal">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div class="modal-body" v-if="selectedMapping">
              <div class="mapping-source">
                <h4>Produit Externe</h4>
                <p><strong>{{ selectedMapping.external_product_name || 'Sans nom' }}</strong></p>
                <p class="text-muted">Code: {{ selectedMapping.external_product_code || selectedMapping.external_product_id }}</p>
              </div>

              <div class="mapping-arrow">→</div>

              <div class="mapping-target">
                <h4>Produit mePOS</h4>
                <select v-model="selectedRecipeId" class="recipe-select">
                  <option :value="null">-- Sélectionner un produit --</option>
                  <option v-for="recipe in recipes" :key="recipe.id" :value="recipe.id">
                    {{ recipe.name }} ({{ parseFloat(recipe.sale_price).toFixed(2) }} TND)
                  </option>
                </select>
              </div>
            </div>

            <div class="modal-footer">
              <button class="touch-btn touch-btn-secondary" @click="closeMapModal">Annuler</button>
              <button class="touch-btn touch-btn-primary" @click="applyMapping" :disabled="!selectedRecipeId">
                Appliquer le mapping
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.mapping-view {
  padding: 0.5rem;
}

.view-title-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.view-title {
  font-size: clamp(1.25rem, 3vw, 1.75rem);
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.view-subtitle {
  color: var(--text-secondary);
  margin: 0.25rem 0 0 0;
  font-size: 0.9rem;
}

.action-buttons {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.stat-icon.blue { background: rgba(59, 130, 246, 0.1); }
.stat-icon.green { background: rgba(16, 185, 129, 0.1); }
.stat-icon.amber { background: rgba(245, 158, 11, 0.1); }
.stat-icon.purple { background: rgba(139, 92, 246, 0.1); }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

/* Tabs */
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--blue);
  border-bottom-color: var(--blue);
}

.tab-badge {
  background: var(--coral);
  color: white;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 700;
}

/* Completion Bar */
.completion-bar-wrapper {
  margin-bottom: 1.5rem;
}

.completion-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.completion-percent {
  font-weight: 700;
  color: var(--blue);
}

.completion-bar {
  height: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  overflow: hidden;
}

.completion-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--blue), #10b981);
  border-radius: 6px;
  transition: width 0.5s ease;
}

/* Filter Bar */
.filter-bar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.search-input,
.filter-select {
  padding: 0.6rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus,
.filter-select:focus {
  border-color: var(--blue);
}

.search-input {
  flex: 1;
  min-width: 200px;
}

/* Table */
.table-wrapper {
  overflow: hidden;
}

.mapped-product {
  color: #10b981;
  font-weight: 600;
}

.unmapped-text {
  color: var(--text-muted);
  font-style: italic;
}

.confidence-badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}

.confidence-high { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.confidence-medium { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.confidence-low { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

.action-group {
  display: flex;
  gap: 0.25rem;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.2s;
}

.btn-icon:hover {
  background: var(--bg-secondary);
}

.btn-icon-danger:hover {
  background: rgba(239, 68, 68, 0.1);
}

/* Empty State */
.empty-state {
  padding: 3rem;
  text-align: center;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.map-modal {
  max-width: 500px;
  width: 100%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.375rem;
}

.btn-close:hover {
  color: var(--coral);
  background: rgba(239, 68, 68, 0.1);
}

.modal-body {
  padding: 1.5rem 0;
}

.mapping-source,
.mapping-target {
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 1rem;
}

.mapping-source h4,
.mapping-target h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.mapping-arrow {
  text-align: center;
  font-size: 1.5rem;
  color: var(--blue);
  margin: 0.5rem 0;
}

.text-muted {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0.25rem 0 0 0;
}

.recipe-select {
  width: 100%;
  padding: 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

/* Buttons */
.touch-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.2rem;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  white-space: nowrap;
}

.touch-btn-primary {
  background: var(--blue);
  color: white;
}

.touch-btn-primary:hover { background: #2563eb; }
.touch-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.touch-btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.touch-btn-secondary:hover { background: var(--bg-tertiary); }

/* Badge */
.badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
}

.badge-success { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.badge-warning { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.badge-muted { background: var(--bg-secondary); color: var(--text-secondary); }
.badge-info { background: rgba(59, 130, 246, 0.15); color: var(--blue); }

/* Modal Transition */
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
}

@media (max-width: 600px) {
  .view-title-section {
    flex-direction: column;
  }
  .action-buttons {
    width: 100%;
  }
  .touch-btn {
    flex: 1;
    justify-content: center;
  }
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
