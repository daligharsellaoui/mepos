<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMappingStore } from '../stores/mappings'
import { useAppStore } from '../stores/app'
import { useAuthStore } from '../stores/auth'

const mappingStore = useMappingStore()
const app = useAppStore()
const auth = useAuthStore()

const isAdmin = computed(() => auth.isAdmin)
const isMappingMode = ref(false)
const selectedExternal = ref(null)
const leftSearch = ref('')
const rightSearch = ref('')
const statusFilter = ref('all')
const autoMatchThreshold = ref(60)
const isAutoMatching = ref(false)
const showAutoMatchResults = ref(false)
const autoMatchResults = ref(null)

const recipes = computed(() => app.recipes || [])
const mappings = computed(() => mappingStore.mappings)
const stats = computed(() => mappingStore.stats)

const filteredExternal = computed(() => {
  let list = mappings.value
  if (statusFilter.value !== 'all') {
    list = list.filter(m => m.mapping_status === statusFilter.value)
  }
  if (leftSearch.value) {
    const q = leftSearch.value.toLowerCase()
    list = list.filter(m =>
      m.external_product_name?.toLowerCase().includes(q) ||
      m.external_product_code?.toLowerCase().includes(q)
    )
  }
  return list
})

const filteredRecipes = computed(() => {
  let list = recipes.value
  if (rightSearch.value) {
    const q = rightSearch.value.toLowerCase()
    list = list.filter(r => r.name?.toLowerCase().includes(q))
  }
  return list
})

const unmappedCount = computed(() =>
  mappings.value.filter(m => m.mapping_status === 'unmapped').length
)

const mappedCount = computed(() =>
  mappings.value.filter(m => m.mapping_status === 'mapped').length
)

const ignoredCount = computed(() =>
  mappings.value.filter(m => m.mapping_status === 'ignored').length
)

const mappedByRecipeId = computed(() => {
  const map = {}
  for (const m of mappings.value) {
    if (m.mepos_product_id && m.mapping_status === 'mapped') {
      if (!map[m.mepos_product_id]) map[m.mepos_product_id] = m
      // Keep first mapping if multiple exist
    }
  }
  return map
})

function selectExternal(mapping) {
  if (mapping.mapping_status === 'mapped' || mapping.mapping_status === 'ignored') {
    return
  }
  selectedExternal.value = mapping
  isMappingMode.value = true
}

function cancelMapping() {
  selectedExternal.value = null
  isMappingMode.value = false
}

async function mapToRecipe(recipe) {
  if (!selectedExternal.value) return
  try {
    await mappingStore.updateMapping(selectedExternal.value.id, {
      mepos_product_id: recipe.id,
      mapping_status: 'mapped',
      confidence: 100
    })
    cancelMapping()
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

async function unmapMapping(mapping) {
  try {
    await mappingStore.updateMapping(mapping.id, {
      mepos_product_id: null,
      mapping_status: 'unmapped',
      confidence: 0
    })
  } catch (err) {
    console.error('Unmap error:', err)
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
    const result = await mappingStore.autoMatch('pos', autoMatchThreshold.value)
    autoMatchResults.value = result
    showAutoMatchResults.value = true
  } catch (err) {
    console.error('Auto-match error:', err)
  } finally {
    isAutoMatching.value = false
  }
}

async function applyAutoMatchSuggestions() {
  if (!autoMatchResults.value?.suggestions?.length) return
  try {
    const mappingData = autoMatchResults.value.suggestions.map(s => ({
      external_product_id: mappings.value.find(m => m.id === s.mapping_id)?.external_product_id,
      mepos_product_id: s.matched_recipe_id
    }))
    await mappingStore.bulkMap(mappingData)
    closeAutoMatchResults()
  } catch (err) {
    console.error('Apply suggestions error:', err)
  }
}

function closeAutoMatchResults() {
  showAutoMatchResults.value = false
  autoMatchResults.value = null
}

async function refresh() {
  await Promise.all([
    mappingStore.fetchMappings(),
    mappingStore.fetchStats(),
    app.fetchData(auth.user)
  ])
}

function getStatusClass(status) {
  switch (status) {
    case 'mapped': return 'status-mapped'
    case 'unmapped': return 'status-unmapped'
    case 'ignored': return 'status-ignored'
    default: return ''
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'mapped': return 'Mappé'
    case 'unmapped': return 'Non mappé'
    case 'ignored': return 'Ignoré'
    default: return status
  }
}

function getConfidenceClass(confidence) {
  if (confidence >= 90) return 'conf-high'
  if (confidence >= 70) return 'conf-medium'
  return 'conf-low'
}

onMounted(async () => {
  await Promise.all([
    mappingStore.fetchMappings(),
    mappingStore.fetchStats(),
    app.fetchData(auth.user)
  ])
})
</script>

<template>
  <div class="mapping-view">
    <!-- Header -->
    <div class="view-header">
      <div class="header-left">
        <h1 class="view-title">🔗 Correspondance Produits POS</h1>
        <p class="view-subtitle">Associez les produits externes aux recettes mePOS</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-ghost" @click="refresh">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Actualiser
        </button>
        <button v-if="isAdmin" class="btn btn-primary" @click="runAutoMatch" :disabled="isAutoMatching">
          <svg v-if="!isAutoMatching" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span v-if="isAutoMatching" class="spinner-small"></span>
          {{ isAutoMatching ? 'Analyse...' : 'Auto-mapping' }}
        </button>
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-number">{{ stats?.total || 0 }}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item stat-mapped">
        <span class="stat-number">{{ mappedCount }}</span>
        <span class="stat-label">Mappés</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item stat-unmapped">
        <span class="stat-number">{{ unmappedCount }}</span>
        <span class="stat-label">Non mappés</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item stat-ignored">
        <span class="stat-number">{{ ignoredCount }}</span>
        <span class="stat-label">Ignorés</span>
      </div>
      <div class="stat-divider"></div>
      <div class="stat-item stat-progress">
        <span class="stat-number">{{ stats?.completionPercentage || 0 }}%</span>
        <span class="stat-label">Complétion</span>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: (stats?.completionPercentage || 0) + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- Mapping Mode Banner -->
    <Transition name="slide">
      <div v-if="isMappingMode && selectedExternal" class="mapping-banner">
        <div class="banner-content">
          <span class="banner-icon">👆</span>
          <span>
            Sélectionnez un produit mePOS à droite pour mapper avec
            <strong>"{{ selectedExternal.external_product_name }}"</strong>
          </span>
        </div>
        <button class="btn btn-ghost btn-sm" @click="cancelMapping">Annuler</button>
      </div>
    </Transition>

    <!-- Two Column Layout -->
    <div class="columns-container">
      <!-- LEFT: External POS Products -->
      <div class="column column-left">
        <div class="column-header">
          <h2 class="column-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Produits Externes (POS)
          </h2>
          <span class="column-count">{{ filteredExternal.length }}</span>
        </div>

        <div class="column-toolbar">
          <div class="search-box">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input v-model="leftSearch" type="text" placeholder="Rechercher..." class="search-input" />
          </div>
          <select v-model="statusFilter" class="filter-select">
            <option value="all">Tous</option>
            <option value="unmapped">Non mappés</option>
            <option value="mapped">Mappés</option>
            <option value="ignored">Ignorés</option>
          </select>
        </div>

        <div class="column-body">
          <div v-if="filteredExternal.length === 0" class="empty-state">
            <div class="empty-icon">📦</div>
            <p>Aucun produit externe trouvé</p>
          </div>
          <div v-for="mapping in filteredExternal" :key="mapping.id"
               :class="['product-card', 'external-card', getStatusClass(mapping.mapping_status),
                        { 'selected': selectedExternal?.id === mapping.id,
                          'clickable': mapping.mapping_status === 'unmapped' }]"
               @click="selectExternal(mapping)">
            <div class="card-header">
              <span class="card-name">{{ mapping.external_product_name || 'Sans nom' }}</span>
              <span :class="['status-badge', getStatusClass(mapping.mapping_status)]">
                {{ getStatusLabel(mapping.mapping_status) }}
              </span>
            </div>
            <div class="card-code">
              {{ mapping.external_product_code || mapping.external_product_id }}
            </div>
            <div v-if="mapping.mepos_product_name" class="card-mapped">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {{ mapping.mepos_product_name }}
            </div>
            <div v-if="mapping.confidence > 0" class="card-confidence">
              <span :class="['conf-dot', getConfidenceClass(mapping.confidence)]"></span>
              {{ mapping.confidence }}% confiance
            </div>
            <div class="card-actions" v-if="mapping.mapping_status !== 'unmapped'">
              <button v-if="mapping.mapping_status === 'mapped'" class="action-btn" title="Dé-mapper" @click.stop="unmapMapping(mapping)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <button class="action-btn action-btn-danger" title="Supprimer" @click.stop="removeMapping(mapping)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
            <div class="card-actions" v-else>
              <button class="action-btn" title="Ignorer" @click.stop="ignoreMapping(mapping)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
              <button class="action-btn action-btn-danger" title="Supprimer" @click.stop="removeMapping(mapping)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Center Connector -->
      <div class="column-center">
        <div class="connector-line"></div>
        <div class="connector-icon">⇄</div>
        <div class="connector-line"></div>
      </div>

      <!-- RIGHT: mePOS Products -->
      <div class="column column-right">
        <div class="column-header">
          <h2 class="column-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            Produits mePOS (Recettes)
          </h2>
          <span class="column-count">{{ filteredRecipes.length }}</span>
        </div>

        <div class="column-toolbar">
          <div class="search-box">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input v-model="rightSearch" type="text" placeholder="Rechercher une recette..." class="search-input" />
          </div>
        </div>

        <div class="column-body">
          <div v-if="isMappingMode" class="mapping-hint">
            Cliquez sur une recette pour l'associer
          </div>
          <div v-if="filteredRecipes.length === 0" class="empty-state">
            <div class="empty-icon">🍽️</div>
            <p>Aucune recette trouvée</p>
          </div>
          <div v-for="recipe in filteredRecipes" :key="recipe.id"
               :class="['product-card', 'recipe-card',
                        { 'clickable': isMappingMode,
                          'has-mapping': mappedByRecipeId[recipe.id] }]"
               @click="isMappingMode ? mapToRecipe(recipe) : null">
            <div class="card-header">
              <span class="card-name">{{ recipe.name }}</span>
              <span v-if="mappedByRecipeId[recipe.id]" class="mapped-indicator">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>
            <div class="card-price">
              {{ parseFloat(recipe.sale_price).toFixed(2) }} TND
            </div>
            <div v-if="mappedByRecipeId[recipe.id]" class="card-mapped-external">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {{ mappedByRecipeId[recipe.id].external_product_name }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Auto-Match Results Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAutoMatchResults" class="modal-overlay" @click.self="closeAutoMatchResults">
          <div class="modal-panel">
            <div class="modal-header">
              <h2>Résultats Auto-matching</h2>
              <button class="btn-close" @click="closeAutoMatchResults">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="match-summary">
                <div class="match-stat">
                  <span class="match-number">{{ autoMatchResults?.matched || 0 }}</span>
                  <span class="match-label">Correspondances trouvées</span>
                </div>
                <div class="match-stat">
                  <span class="match-number">{{ autoMatchResults?.suggestions?.length || 0 }}</span>
                  <span class="match-label">Suggestions</span>
                </div>
              </div>
              <div v-if="autoMatchResults?.suggestions?.length" class="suggestions-list">
                <div v-for="(suggestion, idx) in autoMatchResults.suggestions" :key="idx" class="suggestion-card">
                  <div class="suggestion-from">{{ suggestion.external_product_name }}</div>
                  <div class="suggestion-arrow">→</div>
                  <div class="suggestion-to">{{ suggestion.matched_recipe }}</div>
                  <div :class="['suggestion-conf', getConfidenceClass(suggestion.confidence)]">
                    {{ suggestion.confidence }}%
                  </div>
                </div>
              </div>
              <div v-else class="empty-suggestions">
                <p>Aucune suggestion d'auto-matching trouvée.</p>
                <p class="text-muted">Essayez de diminuer le seuil de confiance ou ajoutez plus de produits.</p>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="closeAutoMatchResults">Fermer</button>
              <button v-if="autoMatchResults?.suggestions?.length" class="btn btn-primary" @click="applyAutoMatchSuggestions">
                Appliquer toutes les suggestions ({{ autoMatchResults.suggestions.length }})
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
  max-width: 1600px;
  margin: 0 auto;
}

/* Header */
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.view-title {
  font-size: clamp(1.25rem, 3vw, 1.5rem);
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
}

.view-subtitle {
  color: var(--text-secondary);
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-primary {
  background: var(--blue);
  color: white;
}
.btn-primary:hover { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-ghost {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}
.btn-ghost:hover { background: var(--bg-tertiary); }

.btn-sm { padding: 0.35rem 0.75rem; font-size: 0.75rem; }

/* Stats Bar */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 60px;
}

.stat-number {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.65rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-mapped .stat-number { color: #10b981; }
.stat-unmapped .stat-number { color: #f59e0b; }
.stat-ignored .stat-number { color: var(--text-muted); }
.stat-progress .stat-number { color: var(--blue); }

.stat-divider {
  width: 1px;
  height: 30px;
  background: var(--border-color);
}

.progress-bar-wrap {
  flex: 1;
  min-width: 100px;
}

.progress-bar {
  height: 6px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--blue), #10b981);
  border-radius: 3px;
  transition: width 0.5s ease;
}

/* Mapping Banner */
.mapping-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 10px;
  margin-bottom: 1rem;
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-primary);
}

.banner-icon {
  font-size: 1.25rem;
}

/* Two Column Layout */
.columns-container {
  display: flex;
  gap: 0;
  min-height: 500px;
}

.column {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.column-left {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.column-right {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.column-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 40px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

.connector-line {
  flex: 1;
  width: 2px;
  background: var(--border-color);
}

.connector-icon {
  font-size: 1.25rem;
  color: var(--blue);
  padding: 0.5rem 0;
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.column-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.column-count {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
}

.column-toolbar {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.search-box {
  position: relative;
  flex: 1;
}

.search-icon {
  position: absolute;
  left: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 0.45rem 0.6rem 0.45rem 2rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.8rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--blue);
}

.filter-select {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.8rem;
  outline: none;
}

.column-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.mapping-hint {
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 6px;
  font-size: 0.75rem;
  color: var(--blue);
  text-align: center;
  font-weight: 600;
}

/* Product Cards */
.product-card {
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: 0.35rem;
  transition: all 0.15s;
  position: relative;
}

.product-card.clickable {
  cursor: pointer;
}

.product-card.clickable:hover {
  border-color: var(--blue);
  background: rgba(59, 130, 246, 0.04);
}

.product-card.selected {
  border-color: var(--blue);
  background: rgba(59, 130, 246, 0.08);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.product-card.has-mapping {
  border-left: 3px solid #10b981;
}

.product-card.status-mapped {
  border-left: 3px solid #10b981;
}

.product-card.status-unmapped {
  border-left: 3px solid #f59e0b;
}

.product-card.status-ignored {
  border-left: 3px solid var(--text-muted);
  opacity: 0.7;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.card-name {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-code {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
  font-family: monospace;
}

.card-price {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--blue);
}

.card-mapped {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.35rem;
  font-size: 0.7rem;
  color: #10b981;
  font-weight: 500;
}

.card-mapped-external {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.35rem;
  font-size: 0.7rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.card-confidence {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.25rem;
  font-size: 0.65rem;
  color: var(--text-secondary);
}

.conf-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.conf-high { background: #10b981; }
.conf-medium { background: #f59e0b; }
.conf-low { background: #ef4444; }

.mapped-indicator {
  color: #10b981;
  flex-shrink: 0;
}

/* Status Badges */
.status-badge {
  padding: 0.15rem 0.45rem;
  border-radius: 8px;
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.status-badge.status-mapped {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.status-badge.status-unmapped {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.status-badge.status-ignored {
  background: var(--bg-secondary);
  color: var(--text-muted);
}

/* Card Actions */
.card-actions {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.4rem;
  justify-content: flex-end;
}

.action-btn {
  width: 26px;
  height: 26px;
  border: none;
  background: var(--bg-secondary);
  border-radius: 5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.action-btn-danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

/* Spinner */
.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.modal-footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

.match-summary {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
}

.match-stat {
  display: flex;
  flex-direction: column;
}

.match-number {
  font-size: 2rem;
  font-weight: 800;
  color: var(--blue);
}

.match-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.suggestion-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.suggestion-from {
  flex: 1;
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-primary);
}

.suggestion-arrow {
  color: var(--blue);
  font-weight: 700;
}

.suggestion-to {
  flex: 1;
  font-size: 0.8rem;
  color: #10b981;
  font-weight: 500;
}

.suggestion-conf {
  padding: 0.15rem 0.5rem;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 700;
}

.suggestion-conf.conf-high { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.suggestion-conf.conf-medium { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.suggestion-conf.conf-low { background: rgba(239, 68, 68, 0.15); color: #ef4444; }

.empty-suggestions {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.text-muted {
  color: var(--text-muted);
  font-size: 0.8rem;
}

/* Transitions */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 900px) {
  .columns-container {
    flex-direction: column;
  }

  .column-left,
  .column-right {
    border-radius: 12px;
    max-height: 400px;
  }

  .column-center {
    flex-direction: row;
    width: 100%;
    height: 40px;
    border-radius: 0;
    border-left: 1px solid var(--border-color);
    border-right: 1px solid var(--border-color);
  }

  .connector-line {
    height: 2px;
    width: auto;
    flex: 1;
  }

  .connector-icon {
    padding: 0 0.5rem;
  }

  .stats-bar {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .stat-divider {
    display: none;
  }

  .progress-bar-wrap {
    width: 100%;
    order: 10;
  }
}

@media (max-width: 600px) {
  .view-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn {
    flex: 1;
    justify-content: center;
  }

  .mapping-banner {
    flex-direction: column;
    gap: 0.5rem;
    text-align: center;
  }

  .match-summary {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>
