<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useBatchStore } from '../stores/batches'
import { useAppStore } from '../stores/app'
import { useSupplierStore } from '../stores/suppliers'
import { useAuthStore } from '../stores/auth'
import PageContainer from '../components/base/PageContainer.vue'
import Card from '../components/base/Card.vue'
import RowActionMenu from '../components/base/RowActionMenu.vue'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'
import EmptyState from '../components/base/EmptyState.vue'
import Skeleton from '../components/base/Skeleton.vue'

const store = useBatchStore()
const app = useAppStore()
const supplierStore = useSupplierStore()
const auth = useAuthStore()

const addToast = (msg, type) => {
  const event = new CustomEvent('toast', { detail: { message: msg, type: type || 'success' } })
  window.dispatchEvent(event)
}

onMounted(() => {
  store.fetchExpiring()
  store.fetchBatches(true)
  if (!app.ingredients.length) app.fetchData(auth.user)
  if (!supplierStore.suppliers.length) supplierStore.fetchSuppliers()
})

watch([() => store.ingredientFilter, () => store.warehouseFilter, () => store.statusFilter, () => store.expiringWithin, () => store.page], () => {
  store.fetchBatches(store.page === 1)
})

// ── Detail Drawer ──
const showDetailDrawer = ref(false)
const detailLoading = ref(false)

function openDetail(batch) {
  showDetailDrawer.value = true
  detailLoading.value = true
  store.fetchBatch(batch.id).finally(() => {
    detailLoading.value = false
  })
}

function closeDetailDrawer() {
  showDetailDrawer.value = false
  store.currentBatch = null
  store.batchMovements = []
}

// ── Consume Modal ──
const showConsumeModal = ref(false)
const consumeBatchItem = ref(null)
const consumeQuantity = ref('')

function openConsume(batch) {
  consumeBatchItem.value = batch
  consumeQuantity.value = ''
  showConsumeModal.value = true
}

async function handleConsume() {
  if (!consumeBatchItem.value || !consumeQuantity.value) return
  try {
    await store.consumeBatch(consumeBatchItem.value.id, parseFloat(consumeQuantity.value))
    addToast(`Lot ${consumeBatchItem.value.batch_number} consommé.`)
    showConsumeModal.value = false
    consumeBatchItem.value = null
    store.fetchBatches(true)
    store.fetchExpiring()
  } catch (err) {
    addToast(err.message || 'Erreur lors de la consommation.', 'error')
  }
}

// ── Transfer Modal ──
const showTransferModal = ref(false)
const transferBatchItem = ref(null)
const transferQuantity = ref('')
const transferWarehouse = ref('')

function openTransfer(batch) {
  transferBatchItem.value = batch
  transferQuantity.value = ''
  transferWarehouse.value = ''
  showTransferModal.value = true
}

async function handleTransfer() {
  if (!transferBatchItem.value || !transferQuantity.value || !transferWarehouse.value) return
  try {
    await store.transferBatch(transferBatchItem.value.id, {
      destination_warehouse_id: parseInt(transferWarehouse.value),
      quantity: parseFloat(transferQuantity.value),
    })
    addToast(`Lot ${transferBatchItem.value.batch_number} transféré.`)
    showTransferModal.value = false
    transferBatchItem.value = null
    store.fetchBatches(true)
    store.fetchExpiring()
  } catch (err) {
    addToast(err.message || 'Erreur lors du transfert.', 'error')
  }
}

// ── Split Modal ──
const showSplitModal = ref(false)
const splitBatchItem = ref(null)
const splitQuantity = ref('')

function openSplit(batch) {
  splitBatchItem.value = batch
  splitQuantity.value = ''
  showSplitModal.value = true
}

async function handleSplit() {
  if (!splitBatchItem.value || !splitQuantity.value) return
  try {
    await store.splitBatch(splitBatchItem.value.id, parseFloat(splitQuantity.value))
    addToast(`Lot ${splitBatchItem.value.batch_number} divisé.`)
    showSplitModal.value = false
    splitBatchItem.value = null
    store.fetchBatches(true)
    store.fetchExpiring()
  } catch (err) {
    addToast(err.message || 'Erreur lors de la division.', 'error')
  }
}

// ── Adjust Modal ──
const showAdjustModal = ref(false)
const adjustBatchItem = ref(null)
const adjustQuantity = ref('')
const adjustReason = ref('')

function openAdjust(batch) {
  adjustBatchItem.value = batch
  adjustQuantity.value = batch.remaining_quantity || ''
  adjustReason.value = ''
  showAdjustModal.value = true
}

async function handleAdjust() {
  if (!adjustBatchItem.value || !adjustQuantity.value) return
  try {
    await store.adjustBatch(adjustBatchItem.value.id, {
      new_quantity: parseFloat(adjustQuantity.value),
      reason: adjustReason.value || undefined,
    })
    addToast(`Lot ${adjustBatchItem.value.batch_number} ajusté.`)
    showAdjustModal.value = false
    adjustBatchItem.value = null
    store.fetchBatches(true)
    store.fetchExpiring()
  } catch (err) {
    addToast(err.message || "Erreur lors de l'ajustement.", 'error')
  }
}

// ── Discard ──
const showDiscardDialog = ref(false)
const discardBatchItem = ref(null)
const discardLoading = ref(false)

function confirmDiscard(batch) {
  discardBatchItem.value = batch
  showDiscardDialog.value = true
}

async function handleDiscard() {
  if (!discardBatchItem.value) return
  discardLoading.value = true
  try {
    await store.discardBatch(discardBatchItem.value.id, 'Mise au rebut manuelle')
    addToast(`Lot ${discardBatchItem.value.batch_number} mis au rebut.`)
    showDiscardDialog.value = false
    discardBatchItem.value = null
    store.fetchBatches(true)
    store.fetchExpiring()
  } catch (err) {
    addToast(err.message || 'Erreur lors de la mise au rebut.', 'error')
  } finally {
    discardLoading.value = false
  }
}

// ── Helpers ──
const statusLabels = {
  active: 'Actif',
  partially_consumed: 'Partiellement Consommé',
  consumed: 'Consommé',
  expired: 'Expiré',
  discarded: 'Mis au Rebut',
}

const statusBadge = {
  active: 'badge-success',
  partially_consumed: 'badge-warn',
  consumed: 'badge',
  expired: 'badge-danger',
  discarded: 'badge',
}

function supplierName(id) {
  const s = supplierStore.suppliers.find(s => s.id === id)
  return s ? s.name : '—'
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function isExpired(date) {
  if (!date) return false
  return new Date(date) < new Date()
}

function daysUntil(date) {
  if (!date) return null
  const diff = new Date(date) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function rowActions(batch) {
  const canModify = batch.status === 'active' || batch.status === 'partially_consumed'
  const canSplit = batch.status === 'active'
  const canDiscard = batch.status !== 'consumed' && batch.status !== 'expired' && batch.status !== 'discarded'
  return [
    { key: 'details', label: 'Détails', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' },
    { key: 'consume', label: 'Consommer', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>', hidden: !canModify },
    { key: 'transfer', label: 'Transférer', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>', hidden: !canModify },
    { key: 'split', label: 'Diviser', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="19 15 12 22 5 15"/></svg>', hidden: !canSplit },
    { key: 'adjust', label: 'Ajuster', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
    { key: 'discard', label: 'Mettre au rebut', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', danger: true, hidden: !canDiscard },
  ]
}

function handleRowAction(key, batch) {
  if (key === 'details') openDetail(batch)
  else if (key === 'consume') openConsume(batch)
  else if (key === 'transfer') openTransfer(batch)
  else if (key === 'split') openSplit(batch)
  else if (key === 'adjust') openAdjust(batch)
  else if (key === 'discard') confirmDiscard(batch)
}

// ── Modal close helpers ──
function closeConsumeModal() {
  showConsumeModal.value = false
  consumeBatchItem.value = null
}

function closeTransferModal() {
  showTransferModal.value = false
  transferBatchItem.value = null
}

function closeSplitModal() {
  showSplitModal.value = false
  splitBatchItem.value = null
}

function closeAdjustModal() {
  showAdjustModal.value = false
  adjustBatchItem.value = null
}
</script>

<template>
  <PageContainer title="Gestion des Lots" subtitle="Suivi des lots, expiration et traçabilité">
    <template #actions>
      <button class="touch-btn" @click="store.fetchExpiring(); store.fetchBatches(true)">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 0.35rem;"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Actualiser
      </button>
    </template>
  </PageContainer>

  <Card style="margin-bottom: 1.25rem;">
    <div class="metrics-grid">
      <div class="metric-card" style="border-left: 3px solid var(--coral);">
        <span class="metric-label">Expire Aujourd'hui</span>
        <span class="metric-value">{{ store.expiringData?.today?.count ?? store.expiringData?.today_count ?? 0 }}</span>
        <span class="metric-sub" v-if="store.expiringData">Quantité: {{ store.expiringData?.today?.total_quantity ?? store.expiringData?.today_quantity ?? 0 }} unités</span>
      </div>
      <div class="metric-card" style="border-left: 3px solid var(--amber);">
        <span class="metric-label">Expire Cette Semaine</span>
        <span class="metric-value">{{ store.expiringData?.this_week?.count ?? store.expiringData?.this_week_count ?? 0 }}</span>
        <span class="metric-sub" v-if="store.expiringData">Quantité: {{ store.expiringData?.this_week?.total_quantity ?? store.expiringData?.this_week_quantity ?? 0 }} unités</span>
      </div>
      <div class="metric-card" style="border-left: 3px solid var(--coral);">
        <span class="metric-label">Périmés</span>
        <span class="metric-value">{{ store.expiringData?.expired?.count ?? store.expiringData?.expired_count ?? 0 }}</span>
        <span class="metric-sub" v-if="store.expiringData">Quantité: {{ store.expiringData?.expired?.total_quantity ?? store.expiringData?.expired_quantity ?? 0 }} unités</span>
      </div>
      <div class="metric-card" style="border-left: 3px solid var(--indigo);">
        <span class="metric-label">Valeur en Risque</span>
        <span class="metric-value">{{ store.expiringData?.value_at_risk ? Number(store.expiringData.value_at_risk).toFixed(3) : '0.000' }} TND</span>
        <span class="metric-sub">Coût total estimé</span>
      </div>
    </div>
  </Card>

  <div class="dept-filter-section" style="padding: 0 1.25rem; margin-bottom: 1rem;">
    <select v-model="store.ingredientFilter" class="form-select" style="width: auto;">
      <option value="">Tous les ingrédients</option>
      <option v-for="ing in app.ingredients" :key="ing.id" :value="ing.id">{{ ing.name }}</option>
    </select>
    <select v-model="store.warehouseFilter" class="form-select" style="width: auto;">
      <option value="">Tous les entrepôts</option>
      <option v-for="dept in app.departments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
    </select>
    <select v-model="store.statusFilter" class="form-select" style="width: auto;">
      <option value="">Tous les statuts</option>
      <option value="active">Actif</option>
      <option value="partially_consumed">Partiellement Consommé</option>
      <option value="consumed">Consommé</option>
      <option value="expired">Expiré</option>
      <option value="discarded">Mis au Rebut</option>
    </select>
    <input v-model="store.expiringWithin" class="form-input" type="number" min="0" placeholder="Expire dans (jours)" style="width: 160px;">
  </div>

  <div class="table-wrapper" v-if="!store.loading && store.batches.length">
    <table class="mepos-table">
      <thead>
        <tr>
          <th>Numéro de Lot</th>
          <th>Ingrédient</th>
          <th>Fournisseur</th>
          <th>Entrepôt</th>
          <th>Qté Restante</th>
          <th>Date d'Expiration</th>
          <th>Statut</th>
          <th class="actions-th">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="batch in store.batches" :key="batch.id">
          <td data-label="Numéro de Lot">
            <strong style="color: var(--text-primary);">{{ batch.batch_number }}</strong>
          </td>
          <td data-label="Ingrédient">{{ batch.ingredient_name }}</td>
          <td data-label="Fournisseur">{{ batch.supplier_name || supplierName(batch.supplier_id) }}</td>
          <td data-label="Entrepôt">{{ batch.warehouse_name || batch.department_name || '—' }}</td>
          <td data-label="Qté Restante" style="font-weight: 600;">
            {{ parseFloat(batch.remaining_quantity).toFixed(2) }}
            <small style="color: var(--text-muted);"> / {{ parseFloat(batch.initial_quantity).toFixed(2) }} {{ batch.unit }}</small>
          </td>
          <td data-label="Date d'Expiration">
            <span :style="{ color: isExpired(batch.expiration_date) ? 'var(--coral)' : daysUntil(batch.expiration_date) <= 7 ? 'var(--amber)' : 'inherit', fontWeight: daysUntil(batch.expiration_date) <= 7 ? 600 : 400 }">
              {{ formatDate(batch.expiration_date) }}
              <span v-if="daysUntil(batch.expiration_date) !== null && daysUntil(batch.expiration_date) > 0" style="display: block; font-size: 0.75rem;">
                (J-{{ daysUntil(batch.expiration_date) }})
              </span>
              <span v-else-if="isExpired(batch.expiration_date)" style="display: block; font-size: 0.75rem; color: var(--coral);">Périmé</span>
            </span>
          </td>
          <td data-label="Statut">
            <span :class="['badge', statusBadge[batch.status] || 'badge']">
              {{ statusLabels[batch.status] || batch.status }}
            </span>
          </td>
          <td data-label="Actions" @click.stop>
            <RowActionMenu :actions="rowActions(batch)" @action="(key) => handleRowAction(key, batch)" />
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="store.totalPages > 1" class="pagination-bar">
      <span class="pagination-info">{{ store.total }} résultat(s) — Page {{ store.page }} / {{ store.totalPages }}</span>
      <div style="display: flex; gap: 0.3rem;">
        <button class="touch-btn touch-btn-secondary pagination-btn" :disabled="store.page <= 1" @click="store.page = Math.max(1, store.page - 1)">◀</button>
        <span v-for="p in store.totalPages" :key="p" :class="['pagination-dot', { active: p === store.page }]" @click="store.page = p">{{ p }}</span>
        <button class="touch-btn touch-btn-secondary pagination-btn" :disabled="store.page >= store.totalPages" @click="store.page = Math.min(store.totalPages, store.page + 1)">▶</button>
      </div>
    </div>
  </div>

  <EmptyState v-else-if="!store.loading" title="Aucun lot" description="Aucun lot ne correspond aux critères sélectionnés." />

  <div v-if="store.loading" style="display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem;">
    <div v-for="n in 5" :key="n" class="skeleton" style="height: 52px; width: 100%; border-radius: var(--radius-sm);" />
  </div>

  <ConfirmDialog
    :is-open="showDiscardDialog"
    title="Mettre au rebut"
    :message="`Êtes-vous sûr de vouloir mettre le lot '${discardBatchItem?.batch_number}' au rebut ? Cette action est irréversible.`"
    confirm-label="Mettre au rebut"
    variant="danger"
    :loading="discardLoading"
    @confirm="handleDiscard"
    @cancel="showDiscardDialog = false; discardBatchItem = null"
    @close="showDiscardDialog = false; discardBatchItem = null"
  />

  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showDetailDrawer" class="drawer-overlay" @click.self="closeDetailDrawer">
        <div class="drawer-panel">
          <div class="drawer-header">
            <h3>Détail du Lot</h3>
            <button class="modal-close-btn" @click="closeDetailDrawer">&times;</button>
          </div>
          <div v-if="detailLoading" class="drawer-body" style="padding: 1.5rem;">
            <div v-for="n in 6" :key="n" class="skeleton" style="height: 28px; margin-bottom: 0.75rem; border-radius: var(--radius-sm);" />
          </div>
          <div v-else-if="store.currentBatch" class="drawer-body">
            <div class="detail-grid">
              <div class="detail-field">
                <span class="detail-label">Numéro de Lot</span>
                <span class="detail-value">{{ store.currentBatch.batch_number }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Ingrédient</span>
                <span class="detail-value">{{ store.currentBatch.ingredient_name }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Fournisseur</span>
                <span class="detail-value">{{ store.currentBatch.supplier_name || supplierName(store.currentBatch.supplier_id) }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Quantité Initiale</span>
                <span class="detail-value">{{ parseFloat(store.currentBatch.initial_quantity).toFixed(2) }} {{ store.currentBatch.unit }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Quantité Restante</span>
                <span class="detail-value">{{ parseFloat(store.currentBatch.remaining_quantity).toFixed(2) }} {{ store.currentBatch.unit }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Unité</span>
                <span class="detail-value">{{ store.currentBatch.unit }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Prix d'Achat</span>
                <span class="detail-value">{{ store.currentBatch.purchase_price ? `${parseFloat(store.currentBatch.purchase_price).toFixed(3)} TND` : '—' }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Coût Total</span>
                <span class="detail-value" style="color: var(--blue); font-weight: 600;">{{ store.currentBatch.total_cost ? `${parseFloat(store.currentBatch.total_cost).toFixed(3)} TND` : '—' }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Date de Fabrication</span>
                <span class="detail-value">{{ formatDate(store.currentBatch.manufacturing_date) }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Date d'Expiration</span>
                <span class="detail-value" :style="{ color: isExpired(store.currentBatch.expiration_date) ? 'var(--coral)' : 'inherit' }">{{ formatDate(store.currentBatch.expiration_date) }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Emplacement</span>
                <span class="detail-value">{{ store.currentBatch.location || '—' }}</span>
              </div>
              <div class="detail-field">
                <span class="detail-label">Statut</span>
                <span :class="['badge', statusBadge[store.currentBatch.status] || 'badge']">{{ statusLabels[store.currentBatch.status] || store.currentBatch.status }}</span>
              </div>
            </div>
            <div v-if="store.currentBatch.notes" class="detail-notes">
              <span class="detail-label">Notes</span>
              <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.85rem;">{{ store.currentBatch.notes }}</p>
            </div>

            <h4 style="margin: 1.5rem 0 0.75rem; font-size: 0.95rem; color: var(--text-primary);">Mouvements</h4>
            <div v-if="store.batchMovements.length">
              <table class="mepos-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Quantité</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="mov in store.batchMovements" :key="mov.id">
                    <td data-label="Type">
                      <span :class="['badge', mov.type === 'in' ? 'badge-success' : mov.type === 'out' ? 'badge-warn' : 'badge']">
                        {{ mov.type === 'in' ? 'Entrée' : mov.type === 'out' ? 'Sortie' : mov.type === 'transfer' ? 'Transfert' : mov.type === 'adjustment' ? 'Ajustement' : mov.type === 'discard' ? 'Rebus' : mov.type }}
                      </span>
                    </td>
                    <td data-label="Quantité" style="font-weight: 600;">{{ parseFloat(mov.quantity).toFixed(2) }}</td>
                    <td data-label="Date">{{ formatDate(mov.created_at || mov.date) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else style="color: var(--text-muted); font-size: 0.85rem; margin: 0.5rem 0;">Aucun mouvement enregistré.</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showConsumeModal" class="modal-overlay" @click.self="closeConsumeModal">
        <div class="glass-panel modal-content" style="max-width: 420px; padding: 2rem;">
          <div class="modal-header">
            <h2 class="modal-title" style="font-size: 1.15rem; margin: 0;">Consommer le Lot</h2>
            <button class="btn-close" aria-label="Fermer" @click="closeConsumeModal">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <p v-if="consumeBatchItem" style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.5rem 0 1rem;">
            Lot: <strong>{{ consumeBatchItem.batch_number }}</strong> — {{ consumeBatchItem.ingredient_name }}
            (Disponible: {{ parseFloat(consumeBatchItem.remaining_quantity).toFixed(2) }} {{ consumeBatchItem.unit }})
          </p>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">Quantité à consommer</label>
            <input v-model="consumeQuantity" class="form-input" type="number" min="0" step="any" placeholder="Quantité" style="width: 100%;">
          </div>
          <div class="modal-footer" style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
            <button class="touch-btn touch-btn-secondary" style="flex: 1;" @click="closeConsumeModal">Annuler</button>
            <button class="touch-btn" style="flex: 1; background: var(--indigo);" :disabled="!consumeQuantity" @click="handleConsume">Consommer</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showTransferModal" class="modal-overlay" @click.self="closeTransferModal">
        <div class="glass-panel modal-content" style="max-width: 420px; padding: 2rem;">
          <div class="modal-header">
            <h2 class="modal-title" style="font-size: 1.15rem; margin: 0;">Transférer le Lot</h2>
            <button class="btn-close" aria-label="Fermer" @click="closeTransferModal">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <p v-if="transferBatchItem" style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.5rem 0 1rem;">
            Lot: <strong>{{ transferBatchItem.batch_number }}</strong> — {{ transferBatchItem.ingredient_name }}
          </p>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">Entrepôt de destination</label>
            <select v-model="transferWarehouse" class="form-select" style="width: 100%;">
              <option value="">Sélectionner...</option>
              <option v-for="dept in app.departments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
            </select>
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">Quantité à transférer</label>
            <input v-model="transferQuantity" class="form-input" type="number" min="0" step="any" placeholder="Quantité" style="width: 100%;">
          </div>
          <div class="modal-footer" style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
            <button class="touch-btn touch-btn-secondary" style="flex: 1;" @click="closeTransferModal">Annuler</button>
            <button class="touch-btn" style="flex: 1; background: var(--indigo);" :disabled="!transferQuantity || !transferWarehouse" @click="handleTransfer">Transférer</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showSplitModal" class="modal-overlay" @click.self="closeSplitModal">
        <div class="glass-panel modal-content" style="max-width: 420px; padding: 2rem;">
          <div class="modal-header">
            <h2 class="modal-title" style="font-size: 1.15rem; margin: 0;">Diviser le Lot</h2>
            <button class="btn-close" aria-label="Fermer" @click="closeSplitModal">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <p v-if="splitBatchItem" style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.5rem 0 1rem;">
            Lot: <strong>{{ splitBatchItem.batch_number }}</strong> — {{ splitBatchItem.ingredient_name }}
            (Disponible: {{ parseFloat(splitBatchItem.remaining_quantity).toFixed(2) }} {{ splitBatchItem.unit }})
          </p>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin: 0 0 0.75rem;">
            La quantité saisie sera détachée du lot actuel pour créer un nouveau lot.
          </p>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">Quantité à diviser</label>
            <input v-model="splitQuantity" class="form-input" type="number" min="0" step="any" placeholder="Quantité" style="width: 100%;">
          </div>
          <div class="modal-footer" style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
            <button class="touch-btn touch-btn-secondary" style="flex: 1;" @click="closeSplitModal">Annuler</button>
            <button class="touch-btn" style="flex: 1; background: var(--indigo);" :disabled="!splitQuantity" @click="handleSplit">Diviser</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showAdjustModal" class="modal-overlay" @click.self="closeAdjustModal">
        <div class="glass-panel modal-content" style="max-width: 420px; padding: 2rem;">
          <div class="modal-header">
            <h2 class="modal-title" style="font-size: 1.15rem; margin: 0;">Ajuster le Lot</h2>
            <button class="btn-close" aria-label="Fermer" @click="closeAdjustModal">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
          <p v-if="adjustBatchItem" style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.5rem 0 1rem;">
            Lot: <strong>{{ adjustBatchItem.batch_number }}</strong> — {{ adjustBatchItem.ingredient_name }}
            (Actuel: {{ parseFloat(adjustBatchItem.remaining_quantity).toFixed(2) }} {{ adjustBatchItem.unit }})
          </p>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">Nouvelle quantité restante</label>
            <input v-model="adjustQuantity" class="form-input" type="number" min="0" step="any" placeholder="Quantité" style="width: 100%;">
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.35rem;">Motif (optionnel)</label>
            <input v-model="adjustReason" class="form-input" type="text" placeholder="Raison de l'ajustement" style="width: 100%;">
          </div>
          <div class="modal-footer" style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
            <button class="touch-btn touch-btn-secondary" style="flex: 1;" @click="closeAdjustModal">Annuler</button>
            <button class="touch-btn" style="flex: 1; background: var(--indigo);" :disabled="!adjustQuantity" @click="handleAdjust">Ajuster</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 1.25rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: all 0.2s ease;
}

.metric-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metric-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
}

.metric-sub {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.dept-filter-section {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.drawer-panel {
  width: 100%;
  max-width: 640px;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  box-shadow: -6px 0 24px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.drawer-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.detail-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.detail-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-value {
  font-size: 0.9rem;
  color: var(--text-primary);
  font-weight: 500;
}

.detail-notes {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.modal-close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.25rem;
  line-height: 1;
  transition: color 0.15s ease;
}

.modal-close-btn:hover {
  color: var(--text-primary);
}

@media (max-width: 640px) {
  .metrics-grid {
    grid-template-columns: 1fr 1fr;
  }
  .detail-grid {
    grid-template-columns: 1fr;
  }
  .drawer-panel {
    max-width: 100%;
  }
  .dept-filter-section {
    flex-direction: column;
    align-items: stretch;
  }
  .dept-filter-section select,
  .dept-filter-section input {
    width: 100% !important;
  }
}
</style>
