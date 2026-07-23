<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { usePurchaseStore } from '../stores/purchases'
import { useSupplierStore } from '../stores/suppliers'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import PageContainer from '../components/base/PageContainer.vue'
import EmptyState from '../components/base/EmptyState.vue'
import RowActionMenu from '../components/base/RowActionMenu.vue'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'
import Modal from '../components/base/Modal.vue'

const store = usePurchaseStore()
const supplierStore = useSupplierStore()
const auth = useAuthStore()
const app = useAppStore()

const addToast = (msg, type) => {
  const event = new CustomEvent('toast', { detail: { message: msg, type: type || 'success' } })
  window.dispatchEvent(event)
}

onMounted(() => {
  store.fetchOrders(true)
  supplierStore.fetchSuppliers()
  app.fetchData(auth.user)
})

watch([() => store.search, () => store.statusFilter, () => store.supplierFilter, () => store.page], () => {
  store.fetchOrders(true)
})

// Modal state
const showForm = ref(false)
const editingOrder = ref(null)

// Line items
const lineItems = ref([])

const emptyLine = () => ({
  ingredient_id: null,
  ingredient_name: '',
  quantity_ordered: 1,
  unit: 'kg',
  unit_price: 0,
  discount_percent: 0,
  tax_percent: 0,
})

// Form fields
const form = ref({
  supplier_id: null,
  department_id: null,
  expected_delivery_date: '',
  currency: 'TND',
  notes: '',
})

function resetForm() {
  form.value = {
    supplier_id: null,
    department_id: null,
    expected_delivery_date: '',
    currency: 'TND',
    notes: '',
  }
  lineItems.value = [emptyLine()]
}

function openCreateModal() {
  editingOrder.value = null
  resetForm()
  showForm.value = true
}

function editOrder(order) {
  editingOrder.value = order
  form.value = {
    supplier_id: order.supplier_id,
    department_id: order.department_id,
    expected_delivery_date: order.expected_delivery_date ? order.expected_delivery_date.split('T')[0] : '',
    currency: order.currency || 'TND',
    notes: order.notes || '',
  }
  lineItems.value = order.items && order.items.length > 0
    ? order.items.map(item => ({
        ingredient_id: item.ingredient_id,
        ingredient_name: item.ingredient_name || '',
        quantity_ordered: parseFloat(item.quantity_ordered) || 1,
        unit: item.unit || 'kg',
        unit_price: parseFloat(item.unit_price) || 0,
        discount_percent: parseFloat(item.discount_percent) || 0,
        tax_percent: parseFloat(item.tax_percent) || 0,
      }))
    : [emptyLine()]
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingOrder.value = null
}

function addLine() {
  lineItems.value.push(emptyLine())
}

function removeLine(index) {
  if (lineItems.value.length > 1) {
    lineItems.value.splice(index, 1)
  }
}

const lineTotal = (item) => {
  const qty = parseFloat(item.quantity_ordered) || 0
  const price = parseFloat(item.unit_price) || 0
  const discount = parseFloat(item.discount_percent) || 0
  const tax = parseFloat(item.tax_percent) || 0
  const subtotal = qty * price
  const afterDiscount = subtotal * (1 - discount / 100)
  return afterDiscount * (1 + tax / 100)
}

const computedSubtotal = computed(() =>
  lineItems.value.reduce((sum, item) => {
    const qty = parseFloat(item.quantity_ordered) || 0
    const price = parseFloat(item.unit_price) || 0
    return sum + qty * price
  }, 0)
)

const computedDiscountTotal = computed(() =>
  lineItems.value.reduce((sum, item) => {
    const qty = parseFloat(item.quantity_ordered) || 0
    const price = parseFloat(item.unit_price) || 0
    const discount = parseFloat(item.discount_percent) || 0
    return sum + qty * price * (discount / 100)
  }, 0)
)

const computedTaxTotal = computed(() =>
  lineItems.value.reduce((sum, item) => {
    const afterDiscount = (parseFloat(item.quantity_ordered) || 0) * (parseFloat(item.unit_price) || 0) * (1 - (parseFloat(item.discount_percent) || 0) / 100)
    const tax = parseFloat(item.tax_percent) || 0
    return sum + afterDiscount * (tax / 100)
  }, 0)
)

const computedGrandTotal = computed(() =>
  lineItems.value.reduce((sum, item) => sum + lineTotal(item), 0)
)

function handleSelectIngredient(index) {
  const ingId = lineItems.value[index].ingredient_id
  if (ingId) {
    const ing = app.ingredients.find(i => i.id === parseInt(ingId))
    if (ing) {
      lineItems.value[index].ingredient_name = ing.name || ''
      lineItems.value[index].unit = ing.purchase_unit || ing.unit || 'kg'
    }
  }
}

async function handleSave() {
  if (!form.value.supplier_id) {
    addToast('Veuillez sélectionner un fournisseur.', 'error')
    return
  }
  if (!form.value.department_id) {
    addToast('Veuillez sélectionner un entrepôt.', 'error')
    return
  }
  if (lineItems.value.length === 0 || lineItems.value.every(l => !l.ingredient_id)) {
    addToast('Veuillez ajouter au moins une ligne avec un ingrédient.', 'error')
    return
  }

  const payload = {
    supplier_id: parseInt(form.value.supplier_id),
    department_id: parseInt(form.value.department_id),
    expected_delivery_date: form.value.expected_delivery_date || null,
    currency: form.value.currency,
    notes: form.value.notes,
    items: lineItems.value.filter(l => l.ingredient_id).map(l => ({
      ingredient_id: parseInt(l.ingredient_id),
      quantity_ordered: parseFloat(l.quantity_ordered) || 1,
      unit: l.unit || 'kg',
      unit_price: parseFloat(l.unit_price) || 0,
      discount_percent: parseFloat(l.discount_percent) || 0,
      tax_percent: parseFloat(l.tax_percent) || 0,
    })),
  }

  try {
    if (editingOrder.value) {
      await store.updateOrder(editingOrder.value.id, payload)
      addToast('Bon de commande mis à jour.')
    } else {
      payload.status = 'draft'
      await store.createOrder(payload)
      addToast('Bon de commande créé.')
    }
    await store.fetchOrders(true)
    closeForm()
  } catch (err) {
    addToast(err.message || 'Erreur lors de l\'enregistrement.', 'error')
  }
}

// Action confirm dialogs
const confirmAction = ref(null)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmVariant = ref('danger')
const confirmLoading = ref(false)
const showConfirm = ref(false)

const actionOrder = ref(null)

function confirmWithDialog(order, action, title, message, variant = 'danger') {
  actionOrder.value = order
  confirmAction.value = action
  confirmTitle.value = title
  confirmMessage.value = message
  confirmVariant.value = variant
  showConfirm.value = true
}

async function handleConfirmedAction() {
  if (!actionOrder.value || !confirmAction.value) return
  confirmLoading.value = true
  const order = actionOrder.value
  try {
    if (confirmAction.value === 'submit') {
      await store.submitOrder(order.id)
      addToast('Bon de commande soumis pour approbation.')
    } else if (confirmAction.value === 'approve') {
      await store.approveOrder(order.id)
      addToast('Bon de commande approuvé.')
    } else if (confirmAction.value === 'reject') {
      await store.rejectOrder(order.id)
      addToast('Bon de commande rejeté.')
    } else if (confirmAction.value === 'cancel') {
      await store.cancelOrder(order.id)
      addToast('Bon de commande annulé.')
    } else if (confirmAction.value === 'close') {
      await store.closeOrder(order.id)
      addToast('Bon de commande clôturé.')
    } else if (confirmAction.value === 'delete') {
      await store.deleteOrder(order.id)
      addToast('Bon de commande supprimé.')
    }
    await store.fetchOrders(true)
  } catch (err) {
    addToast(err.message || 'Erreur lors de l\'action.', 'error')
  } finally {
    confirmLoading.value = false
    showConfirm.value = false
    actionOrder.value = null
    confirmAction.value = null
  }
}

// Status helpers
const statusLabels = {
  draft: 'Brouillon',
  pending_approval: 'En attente',
  approved: 'Approuvé',
  ordered: 'Commandé',
  partially_received: 'Partiellement reçu',
  received: 'Reçu',
  cancelled: 'Annulé',
  closed: 'Clôturé',
}

const statusBadgeClass = (status) => {
  const map = {
    draft: 'badge-neutral',
    pending_approval: 'badge-warn',
    approved: 'badge-info',
    ordered: 'badge-info',
    partially_received: 'badge-warn',
    received: 'badge-success',
    cancelled: 'badge-danger',
    closed: 'badge-neutral',
  }
  return map[status] || 'badge-neutral'
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatAmount(val, currency) {
  const num = parseFloat(val) || 0
  const curr = currency || 'TND'
  return `${num.toFixed(3)} ${curr}`
}

// Row actions
function getSupplierName(supplierId) {
  const s = supplierStore.suppliers.find(sp => sp.id === supplierId)
  return s ? s.name : '—'
}

function getWarehouseName(deptId) {
  const d = app.departments.find(dp => dp.id === deptId)
  return d ? d.name : '—'
}

function rowActions(order) {
  const isCook = auth.isCook
  const isManager = auth.isManager
  const isAdmin = auth.isAdmin

  return [
    {
      key: 'view',
      label: 'Voir',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    },
    {
      key: 'edit',
      label: 'Modifier',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      hidden: isCook || order.status !== 'draft',
    },
    {
      key: 'submit',
      label: 'Soumettre',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg>',
      hidden: isCook || order.status !== 'draft',
    },
    {
      key: 'approve',
      label: 'Approuver',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      hidden: !isAdmin || order.status !== 'pending_approval',
    },
    {
      key: 'reject',
      label: 'Rejeter',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      hidden: !isAdmin || order.status !== 'pending_approval',
      danger: true,
    },
    {
      key: 'cancel',
      label: 'Annuler',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      hidden: ['cancelled', 'closed', 'received'].includes(order.status),
      danger: true,
    },
    {
      key: 'close',
      label: 'Clôturer',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/></svg>',
      hidden: ['cancelled', 'closed', 'draft', 'pending_approval'].includes(order.status),
    },
    {
      key: 'delete',
      label: 'Supprimer',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      danger: true,
      hidden: !isAdmin || order.status !== 'draft',
    },
  ]
}

function handleRowAction(key, order) {
  if (key === 'view') {
    addToast(`Détails de la commande ${order.reference || order.id}`, 'info')
  } else if (key === 'edit') {
    editOrder(order)
  } else if (key === 'submit') {
    confirmWithDialog(order, 'submit', 'Soumettre le bon de commande',
      `Êtes-vous sûr de vouloir soumettre le bon de commande ${order.reference || ''} pour approbation ?`, 'primary')
  } else if (key === 'approve') {
    confirmWithDialog(order, 'approve', 'Approuver le bon de commande',
      `Êtes-vous sûr de vouloir approuver le bon de commande ${order.reference || ''} ?`, 'primary')
  } else if (key === 'reject') {
    confirmWithDialog(order, 'reject', 'Rejeter le bon de commande',
      `Êtes-vous sûr de vouloir rejeter le bon de commande ${order.reference || ''} ?`, 'danger')
  } else if (key === 'cancel') {
    confirmWithDialog(order, 'cancel', 'Annuler le bon de commande',
      `Êtes-vous sûr de vouloir annuler le bon de commande ${order.reference || ''} ?`, 'danger')
  } else if (key === 'close') {
    confirmWithDialog(order, 'close', 'Clôturer le bon de commande',
      `Êtes-vous sûr de vouloir clôturer le bon de commande ${order.reference || ''} ?`, 'primary')
  } else if (key === 'delete') {
    confirmWithDialog(order, 'delete', 'Supprimer le bon de commande',
      `Êtes-vous sûr de vouloir supprimer le bon de commande ${order.reference || ''} ? Cette action est irréversible.`, 'danger')
  }
}
</script>

<template>
  <PageContainer title="Bons de Commande" subtitle="Gestion des achats et approvisionnements">
    <template #actions>
      <button class="touch-btn" @click="openCreateModal">+ Nouveau Bon de Commande</button>
    </template>
  </PageContainer>

  <div class="table-search-bar" style="padding: 0 1.25rem;">
    <input
      v-model="store.search"
      class="form-input"
      placeholder="Rechercher par référence..."
      aria-label="Rechercher"
    >
    <span v-if="store.search" class="search-clear-btn" @click="store.search = ''">&times;</span>
  </div>

  <div class="dept-filter-section" style="padding: 0 1.25rem;">
    <select v-model="store.statusFilter" class="form-select" style="width: auto;">
      <option value="">Tous les statuts</option>
      <option value="draft">Brouillon</option>
      <option value="pending_approval">En attente</option>
      <option value="approved">Approuvé</option>
      <option value="ordered">Commandé</option>
      <option value="partially_received">Partiellement reçu</option>
      <option value="received">Reçu</option>
      <option value="cancelled">Annulé</option>
      <option value="closed">Clôturé</option>
    </select>
    <select v-model="store.supplierFilter" class="form-select" style="width: auto;">
      <option value="">Tous les fournisseurs</option>
      <option v-for="s in supplierStore.suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
  </div>

  <div class="table-wrapper" v-if="!store.loading && store.orders.length">
    <table class="mepos-table">
      <thead>
        <tr>
          <th>Référence</th>
          <th>Fournisseur</th>
          <th>Entrepôt</th>
          <th>Date</th>
          <th>Statut</th>
          <th>Total</th>
          <th class="actions-th">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in store.orders" :key="order.id || order.reference">
          <td data-label="Référence">
            <strong style="color: var(--text-primary);">{{ order.reference || '—' }}</strong>
          </td>
          <td data-label="Fournisseur">{{ getSupplierName(order.supplier_id) }}</td>
          <td data-label="Entrepôt">{{ getWarehouseName(order.department_id) }}</td>
          <td data-label="Date">{{ formatDate(order.order_date || order.created_at) }}</td>
          <td data-label="Statut">
            <span :class="['badge', statusBadgeClass(order.status)]">{{ statusLabels[order.status] || order.status }}</span>
          </td>
          <td data-label="Total" style="font-weight: 600;">{{ formatAmount(order.total_amount, order.currency) }}</td>
          <td data-label="Actions" @click.stop>
            <RowActionMenu :actions="rowActions(order)" @action="(key) => handleRowAction(key, order)" />
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

  <EmptyState v-else-if="!store.loading" title="Aucun bon de commande" description="Créez votre premier bon de commande pour commencer." />

  <div v-if="store.loading" style="display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem;">
    <div v-for="n in 5" :key="n" class="skeleton" style="height: 52px; width: 100%; border-radius: var(--radius-sm);" />
  </div>

  <Modal
    :is-open="showForm"
    :title="editingOrder ? 'Modifier le Bon de Commande' : 'Nouveau Bon de Commande'"
    max-width="900px"
    @close="closeForm"
  >
    <div class="form-grid" style="display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Fournisseur</label>
          <select v-model="form.supplier_id" class="form-select" required>
            <option value="">Sélectionner un fournisseur</option>
            <option v-for="s in supplierStore.suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Entrepôt</label>
          <select v-model="form.department_id" class="form-select" required>
            <option value="">Sélectionner un entrepôt</option>
            <option v-for="d in app.departments" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Date de livraison prévue</label>
          <input v-model="form.expected_delivery_date" type="date" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Devise</label>
          <select v-model="form.currency" class="form-select">
            <option value="TND">TND</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea v-model="form.notes" class="form-input" rows="2" placeholder="Notes optionnelles..." style="resize: vertical;"></textarea>
      </div>
    </div>

    <div style="margin-top: 1.5rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h4 style="margin: 0; color: var(--text-primary); font-size: 0.95rem; font-weight: 700;">Lignes de commande</h4>
        <button class="touch-btn touch-btn-sm" @click="addLine">+ Ajouter une ligne</button>
      </div>
      <div style="overflow-x: auto;">
        <table class="mepos-table" style="min-width: 800px;">
          <thead>
            <tr>
              <th style="min-width: 180px;">Ingrédient</th>
              <th style="min-width: 70px;">Qté commandée</th>
              <th style="min-width: 70px;">Unité</th>
              <th style="min-width: 90px;">Prix unitaire</th>
              <th style="min-width: 70px;">Remise %</th>
              <th style="min-width: 60px;">Taxe %</th>
              <th style="min-width: 90px;">Total</th>
              <th style="width: 50px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in lineItems" :key="index">
              <td>
                <select v-model="item.ingredient_id" class="form-select" style="width: 100%;" @change="handleSelectIngredient(index)">
                  <option :value="null">Choisir...</option>
                  <option v-for="ing in app.ingredients" :key="ing.id" :value="ing.id">{{ ing.name }}</option>
                </select>
              </td>
              <td>
                <input v-model.number="item.quantity_ordered" type="number" min="0" step="0.01" class="form-input" style="width: 100%;">
              </td>
              <td>
                <input v-model="item.unit" class="form-input" style="width: 100%;">
              </td>
              <td>
                <input v-model.number="item.unit_price" type="number" min="0" step="0.001" class="form-input" style="width: 100%;">
              </td>
              <td>
                <input v-model.number="item.discount_percent" type="number" min="0" max="100" step="0.1" class="form-input" style="width: 100%;">
              </td>
              <td>
                <input v-model.number="item.tax_percent" type="number" min="0" max="100" step="0.1" class="form-input" style="width: 100%;">
              </td>
              <td style="font-weight: 600; color: var(--text-primary); white-space: nowrap;">
                {{ lineTotal(item).toFixed(3) }}
              </td>
              <td>
                <button class="touch-btn touch-btn-danger touch-btn-sm" @click="removeLine(index)" :disabled="lineItems.length <= 1" title="Supprimer la ligne">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; margin-top: 0.75rem; padding-right: 0.5rem;">
        <div style="display: flex; gap: 2rem; font-size: 0.85rem; color: var(--text-secondary);">
          <span>Sous-total : <strong style="color: var(--text-primary);">{{ computedSubtotal.toFixed(3) }}</strong></span>
          <span>Remise totale : <strong style="color: var(--coral);">-{{ computedDiscountTotal.toFixed(3) }}</strong></span>
          <span>Taxe totale : <strong style="color: var(--text-primary);">+{{ computedTaxTotal.toFixed(3) }}</strong></span>
        </div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-top: 0.25rem;">
          Total général : {{ computedGrandTotal.toFixed(3) }} {{ form.currency }}
        </div>
      </div>
    </div>

    <template #footer>
      <button class="touch-btn touch-btn-secondary" @click="closeForm">Annuler</button>
      <button class="touch-btn" @click="handleSave">{{ editingOrder ? 'Mettre à jour' : 'Créer' }}</button>
    </template>
  </Modal>

  <ConfirmDialog
    :is-open="showConfirm"
    :title="confirmTitle"
    :message="confirmMessage"
    confirm-label="Confirmer"
    :variant="confirmVariant"
    :loading="confirmLoading"
    @confirm="handleConfirmedAction"
    @cancel="showConfirm = false; actionOrder = null; confirmAction = null"
    @close="showConfirm = false; actionOrder = null; confirmAction = null"
  />
</template>
