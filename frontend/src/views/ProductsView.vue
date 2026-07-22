<script setup>
import { ref, computed, onMounted } from 'vue'
import { useImportStore } from '../stores/import'
import { useAppStore } from '../stores/app'
import { useAuthStore } from '../stores/auth'

const importStore = useImportStore()
const app = useAppStore()
const auth = useAuthStore()

const isAdmin = computed(() => auth.isAdmin)
const isManager = computed(() => auth.isManager || auth.isAdmin)
const showImportWizard = ref(false)
const dragActive = ref(false)
const fileInput = ref(null)

const recipes = computed(() => app.recipes || [])

onMounted(async () => {
  if (!app.recipes.length) {
    await app.fetchData(auth.user)
  }
})

function openWizard() {
  importStore.reset()
  showImportWizard.value = true
}

function closeWizard() {
  showImportWizard.value = false
  importStore.reset()
}

function handleDragOver(e) {
  e.preventDefault()
  dragActive.value = true
}

function handleDragLeave() {
  dragActive.value = false
}

function handleDrop(e) {
  e.preventDefault()
  dragActive.value = false
  const files = e.dataTransfer.files
  if (files.length > 0 && files[0].name.endsWith('.csv')) {
    handleFileUpload(files[0])
  }
}

function handleFileSelect(e) {
  const files = e.target.files
  if (files.length > 0) {
    handleFileUpload(files[0])
  }
}

async function handleFileUpload(file) {
  try {
    await importStore.uploadAndValidate(file)
  } catch (err) {
    console.error('Upload error:', err)
  }
}

async function downloadTemplate() {
  await importStore.downloadTemplate()
}

async function confirmImport() {
  try {
    await importStore.executeImport()
  } catch (err) {
    console.error('Import error:', err)
  }
}

function getConfidenceColor(confidence) {
  if (confidence >= 90) return '#10b981'
  if (confidence >= 70) return '#f59e0b'
  return '#ef4444'
}

const stepLabels = [
  'Téléverser',
  'Validation',
  'Aperçu',
  'Résoudre',
  'Confirmer',
  'Importation',
  'Terminé'
]
</script>

<template>
  <div class="products-view">
    <div class="view-title-section">
      <div>
        <h1 class="view-title">📦 Produits & Importation</h1>
        <p class="view-subtitle">Gestion des produits (recettes) et importation CSV</p>
      </div>
      <div class="action-buttons">
        <button class="touch-btn touch-btn-secondary" @click="downloadTemplate">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Télécharger le modèle
        </button>
        <button v-if="isManager" class="touch-btn touch-btn-primary" @click="openWizard">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Importer CSV
        </button>
      </div>
    </div>

    <!-- Products Table -->
    <div class="glass-panel table-wrapper">
      <div class="table-header">
        <h3 class="table-title">Liste des Produits ({{ recipes.length }})</h3>
      </div>
      <div v-if="recipes.length === 0" class="empty-state">
        <div class="empty-icon">🍽️</div>
        <h3>Aucun produit trouvé</h3>
        <p>Importez un fichier CSV pour créer des produits.</p>
      </div>
      <table v-else class="mepos-table">
        <thead>
          <tr>
            <th>Nom du Produit</th>
            <th>Prix de Vente</th>
            <th>Statut</th>
            <th>Date de Création</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="recipe in recipes" :key="recipe.id">
            <td data-label="Produit">
              <strong style="color: var(--text-primary);">{{ recipe.name }}</strong>
            </td>
            <td data-label="Prix" style="font-weight: 600; color: var(--blue);">
              {{ parseFloat(recipe.sale_price).toFixed(2) }} TND
            </td>
            <td data-label="Statut">
              <span :class="['badge', recipe.is_active ? 'badge-success' : 'badge-warn']">
                {{ recipe.is_active ? 'Actif' : 'Inactif' }}
              </span>
            </td>
            <td data-label="Créé le" style="color: var(--text-secondary);">
              {{ recipe.created_at ? new Date(recipe.created_at).toLocaleDateString('fr-FR') : 'N/A' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Import Wizard Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showImportWizard" class="modal-overlay" @click.self="closeWizard">
          <div class="glass-panel modal-content wizard-modal">
            <div class="modal-header">
              <h2 class="modal-title">Import de Produits CSV</h2>
              <button class="btn-close" @click="closeWizard">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <!-- Step Indicator -->
            <div class="step-indicator">
              <div
                v-for="(label, idx) in stepLabels"
                :key="idx"
                :class="['step', { active: importStore.currentStep === idx, completed: importStore.currentStep > idx }]"
              >
                <div class="step-circle">{{ importStore.currentStep > idx ? '✓' : idx + 1 }}</div>
                <span class="step-label">{{ label }}</span>
              </div>
            </div>

            <div class="wizard-content">
              <!-- Step 0: Upload -->
              <div v-if="importStore.currentStep === 0" class="wizard-step">
                <div
                  :class="['drop-zone', { active: dragActive }]"
                  @dragover="handleDragOver"
                  @dragleave="handleDragLeave"
                  @drop="handleDrop"
                  @click="fileInput?.click()"
                >
                  <input
                    ref="fileInput"
                    type="file"
                    accept=".csv"
                    style="display: none;"
                    @change="handleFileSelect"
                  />
                  <div class="drop-icon">📄</div>
                  <h3>Glissez votre fichier CSV ici</h3>
                  <p>ou cliquez pour sélectionner un fichier</p>
                  <p class="drop-hint">Format: .csv (max 10 Mo)</p>
                </div>
              </div>

              <!-- Step 1: Validating -->
              <div v-else-if="importStore.currentStep === 1" class="wizard-step">
                <div class="loading-state">
                  <div class="spinner"></div>
                  <h3>Validation en cours...</h3>
                  <p>Analyse du fichier CSV</p>
                </div>
              </div>

              <!-- Step 2: Preview -->
              <div v-else-if="importStore.currentStep === 2" class="wizard-step">
                <div class="preview-header">
                  <div class="stat-card success">
                    <span class="stat-value">{{ importStore.totalProducts }}</span>
                    <span class="stat-label">Produits valides</span>
                  </div>
                  <div v-if="importStore.hasErrors" class="stat-card danger">
                    <span class="stat-value">{{ importStore.errorRows.length }}</span>
                    <span class="stat-label">Erreurs</span>
                  </div>
                  <div v-if="importStore.validationResult?.warnings?.length" class="stat-card warning">
                    <span class="stat-value">{{ importStore.validationResult.warnings.length }}</span>
                    <span class="stat-label">Avertissements</span>
                  </div>
                </div>

                <div class="preview-table-wrapper">
                  <table class="preview-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Produit</th>
                        <th>Prix</th>
                        <th>Ingrédients</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in importStore.validRows.slice(0, 20)" :key="row.rowNum">
                        <td>{{ row.rowNum }}</td>
                        <td><strong>{{ row.productName }}</strong></td>
                        <td>{{ row.sellingPrice?.toFixed(2) }} TND</td>
                        <td>
                          <span v-for="(ing, idx) in row.ingredients" :key="idx" class="ingredient-badge" :class="{ 'new': ing.isNew, 'existing': !ing.isNew }">
                            {{ ing.name }} {{ ing.isNew ? '(nouveau)' : '✅' }}
                          </span>
                        </td>
                        <td>
                          <span class="badge badge-success">Valide</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="importStore.hasErrors" class="error-list">
                  <h4>Erreurs détectées:</h4>
                  <div v-for="err in importStore.errorRows.slice(0, 10)" :key="err.rowNum" class="error-item">
                    <span class="error-row">Ligne {{ err.rowNum }}:</span>
                    <span v-for="(e, idx) in err.errors" :key="idx" class="error-msg">{{ e }}</span>
                  </div>
                </div>
              </div>

              <!-- Step 3: Resolve Issues -->
              <div v-else-if="importStore.currentStep === 3" class="wizard-step">
                <div class="resolve-header">
                  <h3 class="resolve-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Résolution des Problèmes
                  </h3>
                  <p class="resolve-subtitle">Corrigez ou supprimez les lignes problématiques avant d'importer</p>
                </div>

                <!-- Summary Stats -->
                <div class="resolve-stats">
                  <div class="resolve-stat success">
                    <span class="stat-num">{{ importStore.effectiveTotalProducts }}</span>
                    <span class="stat-txt">à importer</span>
                  </div>
                  <div v-if="importStore.errorRows.length > 0" class="resolve-stat danger">
                    <span class="stat-num">{{ importStore.errorRows.length }}</span>
                    <span class="stat-txt">erreurs</span>
                  </div>
                  <div v-if="importStore.removedRowNums.length > 0" class="resolve-stat muted">
                    <span class="stat-num">{{ importStore.removedRowNums.length }}</span>
                    <span class="stat-txt">supprimées</span>
                  </div>
                </div>

                <!-- Error Rows (must fix) -->
                <div v-if="importStore.errorRows.length > 0" class="resolve-section">
                  <h4 class="section-title error-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Erreurs à corriger ({{ importStore.errorRows.length }})
                  </h4>
                  <div v-for="err in importStore.errorRows" :key="err.rowNum" class="resolve-row error-row-item">
                    <div class="resolve-row-header">
                      <span class="row-num">Ligne {{ err.rowNum }}</span>
                      <span v-if="importStore.editedRows[err.rowNum]" class="edited-badge">Modifié</span>
                      <button class="resolve-action-btn danger" @click="importStore.removeRow(err.rowNum)">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Supprimer
                      </button>
                    </div>
                    <div class="resolve-row-body">
                      <div class="resolve-field">
                        <label>Nom</label>
                        <input :value="err.productName" @input="importStore.editRow(err.rowNum, { productName: $event.target.value })" class="resolve-input" placeholder="Nom du produit" />
                      </div>
                      <div class="resolve-field">
                        <label>Prix (TND)</label>
                        <input type="number" step="0.01" min="0" :value="err.sellingPrice" @input="importStore.editRow(err.rowNum, { sellingPrice: parseFloat($event.target.value) || 0 })" class="resolve-input" placeholder="0.00" />
                      </div>
                    </div>
                    <div class="resolve-errors">
                      <span v-for="(e, idx) in err.errors" :key="idx" class="error-tag">{{ e }}</span>
                    </div>
                  </div>
                </div>

                <!-- Valid Rows (can remove) -->
                <div class="resolve-section">
                  <h4 class="section-title success-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Produits valides ({{ importStore.validRows.length }})
                  </h4>
                  <div class="valid-rows-list">
                    <div v-for="row in importStore.validRows" :key="row.rowNum"
                         :class="['resolve-row', 'valid-row-item', { removed: importStore.removedRowNums.includes(row.rowNum) }]">
                      <div class="valid-row-content">
                        <span class="row-num">#{{ row.rowNum }}</span>
                        <span class="row-name">{{ row.productName }}</span>
                        <span class="row-price">{{ row.sellingPrice?.toFixed(2) }} TND</span>
                        <span v-if="importStore.editedRows[row.rowNum]" class="edited-badge">Modifié</span>
                        <span class="row-ings">
                          <span v-for="(ing, idx) in row.ingredients?.slice(0, 3)" :key="idx" class="ing-mini" :class="{ new: ing.isNew }">
                            {{ ing.name }}{{ ing.isNew ? '*' : '' }}
                          </span>
                          <span v-if="row.ingredients?.length > 3" class="ing-more">+{{ row.ingredients.length - 3 }}</span>
                        </span>
                      </div>
                      <button v-if="!importStore.removedRowNums.includes(row.rowNum)" class="resolve-action-btn muted" @click="importStore.removeRow(row.rowNum)" title="Retirer">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                      <button v-else class="resolve-action-btn restore" @click="importStore.restoreRow(row.rowNum)" title="Restaurer">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- No Issues -->
                <div v-if="importStore.errorRows.length === 0" class="no-issues">
                  <div class="no-issues-icon">✅</div>
                  <p>Aucune erreur détectée. Vous pouvez passer à la confirmation.</p>
                </div>
              </div>

              <!-- Step 5: Importing -->
              <div v-else-if="importStore.currentStep === 5" class="wizard-step">
                <div class="loading-state">
                  <div class="spinner"></div>
                  <h3>Importation en cours...</h3>
                  <p>Création des produits et ingrédients</p>
                </div>
              </div>

              <!-- Step 6: Done -->
              <div v-else-if="importStore.currentStep === 6" class="wizard-step">
                <div class="success-state">
                  <div class="success-icon">✅</div>
                  <h3>Importation terminée!</h3>
                  <div class="result-stats">
                    <div class="result-item">
                      <span class="result-value">{{ importStore.importResult?.productsCreated || 0 }}</span>
                      <span class="result-label">Produits créés</span>
                    </div>
                    <div class="result-item">
                      <span class="result-value">{{ importStore.importResult?.ingredientsCreated || 0 }}</span>
                      <span class="result-label">Nouveaux ingrédients</span>
                    </div>
                    <div class="result-item">
                      <span class="result-value">{{ importStore.importResult?.ingredientsReused || 0 }}</span>
                      <span class="result-label">Ingrédients réutilisés</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="wizard-footer">
              <button v-if="importStore.currentStep > 0 && importStore.currentStep < 5" class="touch-btn touch-btn-secondary" @click="importStore.goToStep(importStore.currentStep - 1)">
                Retour
              </button>
              <div style="flex: 1;" />
              <button v-if="importStore.currentStep === 2" class="touch-btn touch-btn-primary" @click="importStore.goToStep(3)">
                Résoudre les problèmes
              </button>
              <button v-if="importStore.currentStep === 3" class="touch-btn touch-btn-primary" @click="importStore.goToStep(4)">
                Continuer ({{ importStore.effectiveTotalProducts }} produits)
              </button>
              <button v-if="importStore.currentStep === 4" class="touch-btn touch-btn-primary" @click="confirmImport" :disabled="importStore.isLoading || importStore.effectiveTotalProducts === 0">
                Lancer l'importation ({{ importStore.effectiveTotalProducts }})
              </button>
              <button v-if="importStore.currentStep === 6" class="touch-btn touch-btn-primary" @click="closeWizard">
                Fermer
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.products-view {
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

/* Table */
.table-wrapper {
  overflow: hidden;
}

.table-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.table-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

/* Wizard Modal */
.wizard-modal {
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
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
  transition: all 0.2s;
}

.btn-close:hover {
  color: var(--coral);
  background: rgba(239, 68, 68, 0.1);
}

/* Step Indicator */
.step-indicator {
  display: flex;
  justify-content: space-between;
  padding: 1rem 0;
  gap: 0.25rem;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
}

.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-secondary);
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.3s;
}

.step.active .step-circle {
  background: var(--blue);
  border-color: var(--blue);
  color: white;
}

.step.completed .step-circle {
  background: #10b981;
  border-color: #10b981;
  color: white;
}

.step-label {
  font-size: 0.65rem;
  color: var(--text-secondary);
  text-align: center;
}

.step.active .step-label {
  color: var(--blue);
  font-weight: 600;
}

/* Wizard Content */
.wizard-content {
  flex: 1;
  overflow-y: auto;
  min-height: 300px;
}

.wizard-step {
  padding: 1.5rem 0;
}

/* Drop Zone */
.drop-zone {
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-lg);
  padding: 3rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.drop-zone:hover,
.drop-zone.active {
  border-color: var(--blue);
  background: rgba(59, 130, 246, 0.05);
}

.drop-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.drop-hint {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.5rem;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 3rem;
  gap: 1rem;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--border-color);
  border-top-color: var(--blue);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Preview */
.preview-header {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  padding: 1rem;
  border-radius: var(--radius-md);
  text-align: center;
}

.stat-card.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.stat-card.danger {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.stat-card.warning {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.preview-table-wrapper {
  overflow-x: auto;
  margin-bottom: 1rem;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.preview-table th,
.preview-table td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.preview-table th {
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.ingredient-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-size: 0.7rem;
  margin: 0.1rem;
}

.ingredient-badge.new {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.ingredient-badge.existing {
  background: rgba(59, 130, 246, 0.15);
  color: var(--blue);
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.error-list {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: var(--radius-md);
}

.error-list h4 {
  margin: 0 0 0.75rem 0;
  color: var(--coral);
  font-size: 0.9rem;
}

.error-item {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
}

.error-row {
  font-weight: 600;
  color: var(--coral);
}

.error-msg {
  color: var(--text-secondary);
}

/* Resolve Step */
.resolve-header {
  margin-bottom: 1.25rem;
}

.resolve-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.resolve-subtitle {
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin: 0.25rem 0 0;
}

.resolve-stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.resolve-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
}

.resolve-stat.success { background: rgba(16, 185, 129, 0.1); }
.resolve-stat.danger { background: rgba(239, 68, 68, 0.1); }
.resolve-stat.muted { background: var(--bg-secondary); }

.stat-num {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-primary);
}

.resolve-stat.success .stat-num { color: #10b981; }
.resolve-stat.danger .stat-num { color: #ef4444; }

.stat-txt {
  font-size: 0.7rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.resolve-section {
  margin-bottom: 1.25rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 0.75rem;
}

.error-title { color: #ef4444; }
.success-title { color: #10b981; }

.resolve-row {
  padding: 0.75rem;
  background: var(--bg-secondary);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  border: 1px solid var(--border-color);
}

.resolve-row.error-row-item {
  border-left: 3px solid #ef4444;
}

.resolve-row.valid-row-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.resolve-row.valid-row-item.removed {
  opacity: 0.5;
  text-decoration: line-through;
}

.resolve-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.row-num {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-muted);
  font-family: monospace;
}

.resolve-row-body {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.resolve-field {
  flex: 1;
}

.resolve-field label {
  display: block;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.resolve-input {
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 0.8rem;
  outline: none;
  transition: border-color 0.2s;
}

.resolve-input:focus {
  border-color: var(--blue);
}

.resolve-errors {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.error-tag {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border-radius: 6px;
  font-size: 0.65rem;
  font-weight: 500;
}

.valid-row-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.row-name {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--text-primary);
}

.row-price {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--blue);
}

.row-ings {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.ing-mini {
  padding: 0.1rem 0.4rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.6rem;
  color: var(--text-secondary);
}

.ing-mini.new {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.ing-more {
  font-size: 0.6rem;
  color: var(--text-muted);
}

.resolve-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  border: none;
  border-radius: 5px;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.resolve-action-btn.danger {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.resolve-action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.resolve-action-btn.muted {
  background: var(--bg-card);
  color: var(--text-muted);
}

.resolve-action-btn.muted:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.resolve-action-btn.restore {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.resolve-action-btn.restore:hover {
  background: rgba(16, 185, 129, 0.2);
}

.no-issues {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.no-issues-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
}

/* Success State */
.success-state {
  text-align: center;
  padding: 2rem;
}

.success-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.result-stats {
  display: flex;
  justify-content: center;
  gap: 2rem;
  margin-top: 1.5rem;
}

.result-item {
  text-align: center;
}

.result-value {
  display: block;
  font-size: 2rem;
  font-weight: 800;
  color: var(--blue);
}

.result-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

/* Footer */
.wizard-footer {
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

.touch-btn-primary:hover {
  background: #2563eb;
}

.touch-btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.touch-btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.touch-btn-secondary:hover {
  background: var(--bg-tertiary);
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

.modal-content {
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Badge */
.badge {
  display: inline-block;
  padding: 0.25rem 0.6rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
}

.badge-success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.badge-warn {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
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

  .step-indicator {
    overflow-x: auto;
  }

  .step-label {
    display: none;
  }

  .result-stats {
    flex-direction: column;
    gap: 1rem;
  }
}

.edited-badge {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  background: rgba(59, 130, 246, 0.1);
  color: var(--blue);
  border-radius: 4px;
  font-size: 0.6rem;
  font-weight: 600;
}
</style>
