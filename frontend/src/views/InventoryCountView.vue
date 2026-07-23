<script setup>
import { ref, computed, watch, onMounted, inject } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { useInventoryCountStore } from '../stores/inventoryCounts'
import PageContainer from '../components/base/PageContainer.vue'
import Modal from '../components/base/Modal.vue'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'

const addToast = inject('addToast')

const auth = useAuthStore()
const app = useAppStore()
const store = useInventoryCountStore()

const showCreateModal = ref(false)
const showDiscrepanciesModal = ref(false)
const showApproveConfirm = ref(false)
const showCancelConfirm = ref(false)
const selectedActionId = ref(null)
const isProcessing = ref(false)

const createWarehouse = ref('')
const createNotes = ref('')
const createError = ref('')

const editingItem = ref(null)
const editQuantity = ref('')
const editReason = ref('')
const editNotes = ref('')

const dateFrom = ref('')
const dateTo = ref('')

const statusBadge = {
  draft: 'badge-warn',
  in_progress: 'badge-warn',
  completed: 'badge-info',
  approved: 'badge-success',
  cancelled: 'badge-danger',
}

const statusLabel = {
  draft: 'Brouillon',
  in_progress: 'En cours',
  completed: 'Terminé',
  approved: 'Approuvé',
  cancelled: 'Annulé',
}

const isEditable = computed(() =>
  store.currentSession &&
  (store.currentSession.status === 'draft' || store.currentSession.status === 'in_progress')
)

function discrepancyCount(session) {
  if (!session.items) return 0
  return session.items.filter(i => parseFloat(i.difference || 0) !== 0).length
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('fr-TN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function selectSession(session) {
  store.fetchSession(session.id)
}

function closeSession() {
  store.currentSession = null
}

async function handleCreateSession() {
  createError.value = ''
  if (!createWarehouse.value) {
    createError.value = 'Veuillez sélectionner un entrepôt.'
    return
  }
  isProcessing.value = true
  try {
    await store.createSession({
      warehouse_id: parseInt(createWarehouse.value),
      notes: createNotes.value || null,
    })
    addToast({ type: 'success', title: 'Session créée', message: 'Les articles ont été chargés automatiquement.' })
    showCreateModal.value = false
    createWarehouse.value = ''
    createNotes.value = ''
  } catch (err) {
    createError.value = err.message
  } finally {
    isProcessing.value = false
  }
}

function startEditItem(item) {
  if (!isEditable.value) return
  editingItem.value = item.id
  editQuantity.value = item.actual_quantity ?? item.expected_quantity ?? ''
  editReason.value = item.reason ?? ''
  editNotes.value = item.notes ?? ''
}

function cancelEdit() {
  editingItem.value = null
}

async function saveItem(item) {
  isProcessing.value = true
  try {
    await store.updateItem(item.id, {
      actual_quantity: parseFloat(editQuantity.value) || 0,
      reason: editReason.value || null,
      notes: editNotes.value || null,
    })
    await store.fetchSession(store.currentSession.value.id)
    addToast({ type: 'success', title: 'Article mis à jour', message: 'Les modifications ont été enregistrées.' })
    cancelEdit()
  } catch (err) {
    addToast({ type: 'error', title: 'Erreur', message: err.message })
  } finally {
    isProcessing.value = false
  }
}

async function handleStartSession(id) {
  isProcessing.value = true
  try {
    await store.startSession(id)
    await store.fetchSessions(true)
    if (store.currentSession.value?.id === id) await store.fetchSession(id)
    addToast({ type: 'success', title: 'Comptage démarré', message: 'La session est maintenant en cours.' })
  } catch (err) {
    addToast({ type: 'error', title: 'Erreur', message: err.message })
  } finally {
    isProcessing.value = false
  }
}

async function handleCompleteSession(id) {
  const session = store.currentSession.value
  if (session?.items) {
    const incomplete = session.items.filter(i => {
      const aq = parseFloat(i.actual_quantity)
      return aq <= 0 && !i.notes
    })
    if (incomplete.length > 0) {
      addToast({
        type: 'warning', title: 'Articles incomplets',
        message: `${incomplete.length} article(s) n'ont pas de quantité réelle ou de note.`
      })
      return
    }
  }
  isProcessing.value = true
  try {
    await store.completeSession(id)
    await store.fetchSessions(true)
    if (store.currentSession.value?.id === id) await store.fetchSession(id)
    addToast({ type: 'success', title: 'Comptage terminé', message: 'La session est en attente d\'approbation.' })
  } catch (err) {
    addToast({ type: 'error', title: 'Erreur', message: err.message })
  } finally {
    isProcessing.value = false
  }
}

function openApproveConfirm(id) {
  selectedActionId.value = id
  showApproveConfirm.value = true
}

async function confirmApprove() {
  showApproveConfirm.value = false
  const id = selectedActionId.value
  selectedActionId.value = null
  isProcessing.value = true
  try {
    await store.approveSession(id)
    await store.fetchSessions(true)
    await app.fetchData(auth.user)
    if (store.currentSession.value?.id === id) await store.fetchSession(id)
    addToast({ type: 'success', title: 'Inventaire approuvé', message: 'Les ajustements de stock ont été appliqués.' })
  } catch (err) {
    addToast({ type: 'error', title: 'Erreur', message: err.message })
  } finally {
    isProcessing.value = false
  }
}

function openCancelConfirm(id) {
  selectedActionId.value = id
  showCancelConfirm.value = true
}

async function confirmCancel() {
  showCancelConfirm.value = false
  const id = selectedActionId.value
  selectedActionId.value = null
  isProcessing.value = true
  try {
    await store.cancelSession(id)
    await store.fetchSessions(true)
    if (store.currentSession.value?.id === id) store.currentSession.value = null
    addToast({ type: 'warning', title: 'Session annulée', message: 'La session a été annulée.' })
  } catch (err) {
    addToast({ type: 'error', title: 'Erreur', message: err.message })
  } finally {
    isProcessing.value = false
  }
}

function openDiscrepancies(session) {
  store.fetchDiscrepancies(session.id)
  showDiscrepanciesModal.value = true
}

function sortedDiscrepancies() {
  return [...store.discrepancies].sort(
    (a, b) => Math.abs(parseFloat(b.difference || 0)) - Math.abs(parseFloat(a.difference || 0))
  )
}

watch([store.statusFilter, store.warehouseFilter, store.dateFrom, store.dateTo], () => {
  store.fetchSessions(true)
})

watch([dateFrom, dateTo], ([f, t]) => {
  store.dateFrom = f
  store.dateTo = t
})

onMounted(() => {
  if (auth.user) {
    app.fetchData(auth.user)
    store.fetchSessions(true)
  }
})
</script>

<template>
  <PageContainer title="Inventaire Physique" subtitle="Comptage et ajustement des stocks">
    <template #actions>
      <button class="touch-btn" @click="showCreateModal = true">
        + Nouvelle Session
      </button>
    </template>

    <div class="glass-panel" style="padding: 1rem; margin-bottom: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end;">
      <div class="form-group" style="margin: 0; min-width: 140px;">
        <label class="form-label">Statut</label>
        <select v-model="store.statusFilter" class="form-select">
          <option value="">Tous</option>
          <option value="draft">Brouillon</option>
          <option value="in_progress">En cours</option>
          <option value="completed">Terminé</option>
          <option value="approved">Approuvé</option>
          <option value="cancelled">Annulé</option>
        </select>
      </div>
      <div class="form-group" style="margin: 0; min-width: 180px;">
        <label class="form-label">Entrepôt</label>
        <select v-model="store.warehouseFilter" class="form-select">
          <option value="">Tous</option>
          <option v-for="d in app.departments" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>
      <div class="form-group" style="margin: 0;">
        <label class="form-label">Du</label>
        <input v-model="dateFrom" type="date" class="form-input">
      </div>
      <div class="form-group" style="margin: 0;">
        <label class="form-label">Au</label>
        <input v-model="dateTo" type="date" class="form-input">
      </div>
    </div>

    <div class="glass-panel table-wrapper">
      <div v-if="store.loading && store.sessions.length === 0" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
        Chargement...
      </div>
      <div v-else-if="store.sessions.length === 0" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
        Aucune session d'inventaire trouvée.
      </div>
      <table v-else class="mepos-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Entrepôt</th>
            <th>Date</th>
            <th>Statut</th>
            <th>Compté par</th>
            <th>Approuvé par</th>
            <th>Écarts</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in store.sessions"
            :key="s.id"
            :style="store.currentSession?.id === s.id ? 'background: rgba(99,102,241,0.05);' : ''"
            @click="selectSession(s)"
            style="cursor: pointer;"
          >
            <td data-label="#">#{{ s.id }}</td>
            <td data-label="Entrepôt">{{ s.warehouse_name || app.departments.find(d => d.id === s.warehouse_id)?.name || '-' }}</td>
            <td data-label="Date" style="color: var(--text-secondary); font-size: 0.875rem;">{{ formatDate(s.created_at) }}</td>
            <td data-label="Statut">
              <span :class="['badge', statusBadge[s.status] || 'badge-warn']">{{ statusLabel[s.status] || s.status }}</span>
            </td>
            <td data-label="Compté par" style="font-size: 0.875rem;">{{ s.counted_by_username || '-' }}</td>
            <td data-label="Approuvé par" style="font-size: 0.875rem;">{{ s.approved_by_username || '-' }}</td>
            <td data-label="Écarts">
              <span :class="['badge', discrepancyCount(s) > 0 ? 'badge-danger' : 'badge-success']">{{ discrepancyCount(s) }}</span>
            </td>
            <td data-label="Actions">
              <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                <button class="touch-btn touch-btn-sm touch-btn-secondary" @click.stop="selectSession(s)" title="Voir">Voir</button>
                <button
                  v-if="s.status === 'draft'"
                  class="touch-btn touch-btn-sm"
                  style="background: var(--indigo);"
                  @click.stop="handleStartSession(s.id)"
                  :disabled="isProcessing"
                >Démarrer</button>
                <button
                  v-if="s.status === 'in_progress'"
                  class="touch-btn touch-btn-sm"
                  style="background: var(--teal);"
                  @click.stop="handleCompleteSession(s.id)"
                  :disabled="isProcessing"
                >Terminer</button>
                <button
                  v-if="s.status === 'completed'"
                  class="touch-btn touch-btn-sm"
                  style="background: var(--emerald);"
                  @click.stop="openApproveConfirm(s.id)"
                  :disabled="isProcessing"
                >Approuver</button>
                <button
                  v-if="s.status !== 'approved' && s.status !== 'cancelled'"
                  class="touch-btn touch-btn-sm touch-btn-secondary"
                  @click.stop="openCancelConfirm(s.id)"
                  :disabled="isProcessing"
                >Annuler</button>
                <button
                  v-if="s.status === 'completed' || s.status === 'approved'"
                  class="touch-btn touch-btn-sm touch-btn-secondary"
                  @click.stop="openDiscrepancies(s)"
                  title="Rapport d'écarts"
                >Écarts</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="store.totalPages > 1" class="pagination">
        <button class="touch-btn touch-btn-secondary" :disabled="store.page <= 1" @click="store.page--; store.fetchSessions(true)">←</button>
        <span style="color: var(--text-secondary); font-size: 0.9rem; padding: 0 0.75rem;">Page {{ store.page }} / {{ store.totalPages }}</span>
        <button class="touch-btn touch-btn-secondary" :disabled="store.page >= store.totalPages" @click="store.page++; store.fetchSessions(true)">→</button>
      </div>
    </div>

    <div v-if="store.currentSession" class="glass-panel" style="padding: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
        <div>
          <h2 style="font-size: 1.3rem; margin: 0 0 0.25rem 0;">Session #{{ store.currentSession.id }}</h2>
          <div style="color: var(--text-secondary); font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 1rem;">
            <span>Entrepôt : <strong>{{ store.currentSession.warehouse_name || '-' }}</strong></span>
            <span>Date : <strong>{{ formatDate(store.currentSession.created_at) }}</strong></span>
            <span>Statut : <span :class="['badge', statusBadge[store.currentSession.status] || 'badge-warn']">{{ statusLabel[store.currentSession.status] || store.currentSession.status }}</span></span>
            <span v-if="store.currentSession.counted_by_username">Compté par : <strong>{{ store.currentSession.counted_by_username }}</strong></span>
            <span v-if="store.currentSession.approved_by_username">Approuvé par : <strong>{{ store.currentSession.approved_by_username }}</strong></span>
          </div>
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button
            v-if="store.currentSession.status === 'draft'"
            class="touch-btn touch-btn-sm"
            style="background: var(--indigo);"
            @click="handleStartSession(store.currentSession.id)"
            :disabled="isProcessing"
          >Démarrer le comptage</button>
          <button
            v-if="store.currentSession.status === 'in_progress'"
            class="touch-btn touch-btn-sm"
            style="background: var(--teal);"
            @click="handleCompleteSession(store.currentSession.id)"
            :disabled="isProcessing"
          >Terminer le comptage</button>
          <button
            v-if="store.currentSession.status === 'completed'"
            class="touch-btn touch-btn-sm"
            style="background: var(--emerald);"
            @click="openApproveConfirm(store.currentSession.id)"
            :disabled="isProcessing"
          >Approuver l'inventaire</button>
          <button
            v-if="store.currentSession.status !== 'approved' && store.currentSession.status !== 'cancelled'"
            class="touch-btn touch-btn-sm"
            style="background: var(--coral);"
            @click="openCancelConfirm(store.currentSession.id)"
            :disabled="isProcessing"
          >Annuler</button>
          <button class="touch-btn touch-btn-sm touch-btn-secondary" @click="closeSession">Fermer</button>
        </div>
      </div>

      <div v-if="store.loading && !store.currentSession.items" style="padding: 1rem; text-align: center; color: var(--text-secondary);">
        Chargement des articles...
      </div>
      <div v-else-if="!store.currentSession.items || store.currentSession.items.length === 0" style="padding: 1rem; text-align: center; color: var(--text-secondary);">
        Aucun article dans cette session.
      </div>
      <div v-else class="table-wrapper">
        <table class="mepos-table">
          <thead>
            <tr>
              <th>Ingrédient</th>
              <th>Quantité Attendue</th>
              <th>Quantité Réelle</th>
              <th>Écart</th>
              <th>Raison</th>
              <th>Notes</th>
              <th v-if="isEditable">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in store.currentSession.items" :key="item.id">
              <td data-label="Ingrédient"><strong>{{ item.ingredient_name || app.ingredients.find(i => i.id === item.ingredient_id)?.name || '-' }}</strong></td>
              <td data-label="Attendu">{{ parseFloat(item.expected_quantity || 0).toFixed(2) }} {{ item.unit || '' }}</td>
              <td data-label="Réel">
                <template v-if="editingItem === item.id && isEditable">
                  <input
                    v-model="editQuantity"
                    type="number"
                    step="any"
                    class="form-input"
                    style="width: 100px;"
                    @keyup.enter="saveItem(item)"
                  >
                </template>
                <template v-else>
                  <span
                    @click="startEditItem(item)"
                    style="cursor: pointer;"
                    :class="{ 'has-diff': parseFloat(item.difference || 0) !== 0 }"
                  >{{ parseFloat(item.actual_quantity || 0).toFixed(2) }}</span>
                </template>
              </td>
              <td
                data-label="Écart"
                :style="{
                  color: parseFloat(item.difference || 0) !== 0 ? 'var(--coral)' : 'var(--text-secondary)',
                  fontWeight: parseFloat(item.difference || 0) !== 0 ? 600 : 400
                }"
              >{{ parseFloat(item.difference || 0) > 0 ? '+' : '' }}{{ parseFloat(item.difference || 0).toFixed(2) }}</td>
              <td data-label="Raison">
                <template v-if="editingItem === item.id && isEditable">
                  <select v-model="editReason" class="form-select" style="width: 130px;">
                    <option value="">--</option>
                    <option value="casse">Casse</option>
                    <option value="vol">Vol</option>
                    <option value="erreur_réception">Erreur de réception</option>
                    <option value="erreur_commande">Erreur de commande</option>
                    <option value="mauvaise_conservation">Mauvaise conservation</option>
                    <option value="inventaire_précédent">Erreur inventaire précédent</option>
                    <option value="autre">Autre</option>
                  </select>
                </template>
                <template v-else>
                  <span @click="startEditItem(item)" style="cursor: pointer; color: var(--text-secondary);">{{ item.reason || '-' }}</span>
                </template>
              </td>
              <td data-label="Notes">
                <template v-if="editingItem === item.id && isEditable">
                  <input
                    v-model="editNotes"
                    type="text"
                    class="form-input"
                    style="width: 120px;"
                    placeholder="Note..."
                    @keyup.enter="saveItem(item)"
                  >
                </template>
                <template v-else>
                  <span @click="startEditItem(item)" style="cursor: pointer; color: var(--text-secondary);">{{ item.notes || '-' }}</span>
                </template>
              </td>
              <td v-if="editingItem === item.id && isEditable" data-label="Actions" style="white-space: nowrap;">
                <button class="touch-btn touch-btn-sm" style="background: var(--emerald);" @click="saveItem(item)" :disabled="isProcessing">✓</button>
                <button class="touch-btn touch-btn-sm touch-btn-secondary" @click="cancelEdit">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Modal :is-open="showCreateModal" title="Nouvelle Session d'Inventaire" @close="showCreateModal = false">
      <div v-if="createError" class="alert-banner alert-banner-danger" style="margin-bottom: 1rem;">
        <span>{{ createError }}</span>
      </div>
      <div class="form-group">
        <label class="form-label">Entrepôt *</label>
        <select v-model="createWarehouse" class="form-select" required>
          <option value="">-- Sélectionner --</option>
          <option v-for="d in app.departments" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notes (optionnel)</label>
        <textarea v-model="createNotes" class="form-input" rows="3" placeholder="Notes sur cette session..."></textarea>
      </div>
      <template #footer>
        <button class="touch-btn touch-btn-secondary" @click="showCreateModal = false">Annuler</button>
        <button class="touch-btn" style="background: var(--indigo);" @click="handleCreateSession" :disabled="isProcessing">
          {{ isProcessing ? 'Création...' : 'Créer la session' }}
        </button>
      </template>
    </Modal>

    <Modal :is-open="showDiscrepanciesModal" title="Rapport d'Écarts" max-width="640px" @close="showDiscrepanciesModal = false">
      <div v-if="store.loading" style="padding: 1rem; text-align: center; color: var(--text-secondary);">Chargement...</div>
      <div v-else-if="store.discrepancies.length === 0" style="padding: 1rem; text-align: center; color: var(--text-secondary);">Aucun écart à signaler.</div>
      <div v-else class="table-wrapper">
        <table class="mepos-table">
          <thead>
            <tr>
              <th>Ingrédient</th>
              <th>Quantité Attendue</th>
              <th>Quantité Réelle</th>
              <th>Écart</th>
              <th>Raison</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in sortedDiscrepancies()" :key="item.id">
              <td data-label="Ingrédient"><strong>{{ item.ingredient_name || '-' }}</strong></td>
              <td data-label="Attendu">{{ parseFloat(item.expected_quantity || 0).toFixed(2) }}</td>
              <td data-label="Réel">{{ parseFloat(item.actual_quantity || 0).toFixed(2) }}</td>
              <td data-label="Écart" style="color: var(--coral); font-weight: 600;">{{ parseFloat(item.difference || 0) > 0 ? '+' : '' }}{{ parseFloat(item.difference || 0).toFixed(2) }}</td>
              <td data-label="Raison" style="color: var(--text-secondary);">{{ item.reason || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <template #footer>
        <button class="touch-btn" @click="showDiscrepanciesModal = false">Fermer</button>
      </template>
    </Modal>

    <ConfirmDialog
      :is-open="showApproveConfirm"
      title="Approuver l'inventaire"
      message="L'approbation va créer des ajustements et mettre à jour les niveaux de stock. Les écarts seront appliqués aux quantités actuelles. Confirmez-vous ?"
      confirm-label="Approuver"
      variant="primary"
      :loading="isProcessing"
      @confirm="confirmApprove"
      @close="showApproveConfirm = false"
      @cancel="showApproveConfirm = false"
    />

    <ConfirmDialog
      :is-open="showCancelConfirm"
      title="Annuler la session"
      message="Êtes-vous sûr de vouloir annuler cette session d'inventaire ? Cette action est irréversible."
      confirm-label="Annuler"
      variant="danger"
      :loading="isProcessing"
      @confirm="confirmCancel"
      @close="showCancelConfirm = false"
      @cancel="showCancelConfirm = false"
    />
  </PageContainer>
</template>
