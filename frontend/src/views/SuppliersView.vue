<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSupplierStore } from '../stores/suppliers'
import { useAuthStore } from '../stores/auth'
import PageContainer from '../components/base/PageContainer.vue'
import ActionToolbar from '../components/base/ActionToolbar.vue'
import EmptyState from '../components/base/EmptyState.vue'
import Skeleton from '../components/base/Skeleton.vue'
import RowActionMenu from '../components/base/RowActionMenu.vue'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'
import SupplierForm from '../components/suppliers/SupplierForm.vue'

const router = useRouter()
const store = useSupplierStore()
const auth = useAuthStore()

const showForm = ref(false)
const editingSupplier = ref(null)
const supplierToDelete = ref(null)
const showDeleteDialog = ref(false)
const deleteLoading = ref(false)
const showIngredientsModal = ref(false)
const ingredientsModalSupplier = ref(null)
const ingredientsModalList = ref([])
const ingredientsModalLoading = ref(false)

const addToast = (msg, type) => {
  const event = new CustomEvent('toast', { detail: { message: msg, type: type || 'success' } })
  window.dispatchEvent(event)
}

onMounted(() => {
  store.fetchSuppliers()
})

watch([() => store.search, () => store.statusFilter, () => store.preferredFilter, () => store.countryFilter, () => store.sortBy, () => store.sortDir, () => store.page], () => {
  store.fetchSuppliers()
})

const countries = computed(() => {
  const set = new Set(store.suppliers.map(s => s.country).filter(Boolean))
  return [...set].sort()
})

function openCreateModal() {
  editingSupplier.value = null
  showForm.value = true
}

function editSupplier(s) {
  editingSupplier.value = s
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingSupplier.value = null
}

function onSaved() {
  closeForm()
  store.fetchSuppliers()
  addToast(editingSupplier.value ? 'Fournisseur mis à jour.' : 'Fournisseur créé.')
}

function viewDetails(id) {
  router.push(`/app/suppliers/${id}`)
}

async function viewIngredients(s) {
  ingredientsModalSupplier.value = s
  showIngredientsModal.value = true
  ingredientsModalLoading.value = true
  try {
    const data = await store.fetchSupplierIngredients(s.id)
    ingredientsModalList.value = data || []
  } catch {
    ingredientsModalList.value = []
  } finally {
    ingredientsModalLoading.value = false
  }
}

function closeIngredientsModal() {
  showIngredientsModal.value = false
  ingredientsModalSupplier.value = null
  ingredientsModalList.value = []
}

async function archiveSupplier(s) {
  try {
    await store.archiveSupplier(s.id)
    addToast(`${s.name} archivé.`)
  } catch { addToast("Erreur lors de l'archivage.", 'error') }
}

async function restoreSupplier(s) {
  try {
    await store.restoreSupplier(s.id)
    addToast(`${s.name} restauré.`)
  } catch { addToast('Erreur lors de la restauration.', 'error') }
}

function confirmDelete(s) {
  supplierToDelete.value = s
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!supplierToDelete.value) return
  deleteLoading.value = true
  try {
    await store.deleteSupplier(supplierToDelete.value.id)
    addToast('Fournisseur supprimé.')
    showDeleteDialog.value = false
    supplierToDelete.value = null
  } catch (err) {
    addToast(err.message || 'Erreur lors de la suppression.', 'error')
  } finally {
    deleteLoading.value = false
  }
}

function rowActions(s) {
  return [
    { key: 'edit', label: 'Modifier', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', hidden: auth.isCook },
    { key: 'archive', label: s.status === 'archived' ? 'Restaurer' : 'Archiver', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>', hidden: auth.isCook },
    { key: 'ingredients', label: 'Voir ingrédients', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' },
    { key: 'details', label: 'Détails', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' },
    { key: 'delete', label: 'Supprimer', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', danger: true, hidden: !auth.isAdmin },
  ]
}

function handleRowAction(key, s) {
  if (key === 'edit') editSupplier(s)
  else if (key === 'archive') s.status === 'archived' ? restoreSupplier(s) : archiveSupplier(s)
  else if (key === 'ingredients') viewIngredients(s)
  else if (key === 'details') viewDetails(s.id)
  else if (key === 'delete') confirmDelete(s)
}
</script>

<template>
  <PageContainer title="Fournisseurs" subtitle="Gérez vos fournisseurs">
    <template #actions>
      <button class="touch-btn" @click="openCreateModal" v-if="!auth.isCook">+ Nouveau Fournisseur</button>
    </template>
  </PageContainer>

  <div class="table-search-bar" style="padding: 0 1.25rem;">
    <input
      v-model="store.search"
      class="form-input"
      placeholder="Rechercher un fournisseur..."
      aria-label="Rechercher"
    >
    <span v-if="store.search" class="search-clear-btn" @click="store.search = ''">&times;</span>
  </div>

  <div class="dept-filter-section" style="padding: 0 1.25rem;">
    <select v-model="store.statusFilter" class="form-select" style="width: auto;">
      <option value="">Tous les statuts</option>
      <option value="active">Actif</option>
      <option value="archived">Archivé</option>
    </select>
    <select v-model="store.preferredFilter" class="form-select" style="width: auto;">
      <option value="">Tous</option>
      <option value="true">Préféré</option>
      <option value="false">Non préféré</option>
    </select>
    <select v-model="store.countryFilter" class="form-select" style="width: auto;">
      <option value="">Tous pays</option>
      <option v-for="c in countries" :key="c" :value="c">{{ c }}</option>
    </select>
  </div>

  <div class="table-wrapper" v-if="!store.loading && store.paginatedSuppliers.length">
    <table class="mepos-table">
      <thead>
        <tr>
          <th class="sortable-th" @click="store.sortBy = 'name'; store.sortDir = store.sortDir === 'asc' ? 'desc' : 'asc'">Fournisseur</th>
          <th>Contact</th>
          <th>Téléphone</th>
          <th>Email</th>
          <th>Ville</th>
          <th>Préféré</th>
          <th>Statut</th>
          <th>Ingrédients</th>
          <th class="actions-th">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in store.paginatedSuppliers" :key="s.id" @click="viewDetails(s.id)" style="cursor: pointer;">
          <td data-label="Fournisseur">
            <strong style="color: var(--text-primary);">{{ s.name }}</strong>
            <br><small style="color: var(--text-muted);">{{ s.company_name || '' }}</small>
          </td>
          <td data-label="Contact">{{ s.contact_person || '—' }}</td>
          <td data-label="Téléphone">{{ s.phone || '—' }}</td>
          <td data-label="Email">{{ s.email || '—' }}</td>
          <td data-label="Ville">{{ s.city || '—' }}</td>
          <td data-label="Préféré">
            <span v-if="s.preferred" class="badge badge-success">Préféré</span>
          </td>
          <td data-label="Statut">
            <span :class="['badge', s.status === 'active' ? 'badge-success' : 'badge-warn']">{{ s.status === 'active' ? 'Actif' : 'Archivé' }}</span>
          </td>
          <td data-label="Ingrédients">{{ s.ingredients_count || 0 }}</td>
          <td data-label="Actions" @click.stop>
            <RowActionMenu :actions="rowActions(s)" @action="(key) => handleRowAction(key, s)" />
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

  <EmptyState v-else-if="!store.loading" title="Aucun fournisseur" description="Créez votre premier fournisseur pour commencer." />

  <div v-if="store.loading" style="display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem;">
    <div v-for="n in 5" :key="n" class="skeleton" style="height: 52px; width: 100%; border-radius: var(--radius-sm);" />
  </div>

  <SupplierForm :is-open="showForm" :supplier="editingSupplier" @close="closeForm" @saved="onSaved" />

  <ConfirmDialog
    :is-open="showDeleteDialog"
    title="Supprimer le fournisseur"
    :message="`Êtes-vous sûr de vouloir supprimer '${supplierToDelete?.name}' ? Cette action est irréversible.`"
    confirm-label="Supprimer"
    variant="danger"
    :loading="deleteLoading"
    @confirm="handleDelete"
    @cancel="showDeleteDialog = false; supplierToDelete = null"
    @close="showDeleteDialog = false; supplierToDelete = null"
  />

  <Teleport to="body">
    <div v-if="showIngredientsModal" class="ingredients-modal-overlay" @click.self="closeIngredientsModal">
      <div class="ingredients-modal">
        <div class="ingredients-modal-header">
          <h3>Ingrédients — {{ ingredientsModalSupplier?.name }}</h3>
          <button class="modal-close-btn" @click="closeIngredientsModal">&times;</button>
        </div>
        <div class="ingredients-modal-body">
          <div v-if="ingredientsModalLoading" style="display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem;">
            <div v-for="n in 4" :key="n" class="skeleton" style="height: 36px; border-radius: var(--radius-sm);" />
          </div>
          <table v-else-if="ingredientsModalList.length" class="mepos-table">
            <thead>
              <tr><th>Ingrédient</th><th>Unité</th><th>Prix unitaire</th><th>Seuil alerte</th></tr>
            </thead>
            <tbody>
              <tr v-for="ing in ingredientsModalList" :key="ing.id">
                <td><strong style="color: var(--text-primary);">{{ ing.name }}</strong></td>
                <td>{{ ing.unit }}</td>
                <td>{{ parseFloat(ing.purchase_price_per_unit).toFixed(3) }} TND</td>
                <td>{{ ing.alert_threshold }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else style="color: var(--text-muted); padding: 1rem; text-align: center;">Aucun ingrédient lié à ce fournisseur.</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
