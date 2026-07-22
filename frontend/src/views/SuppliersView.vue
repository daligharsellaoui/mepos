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
  addToast(editingSupplier.value ? 'Fournisseur mis à jour.' : 'Fournisseur créé.')
}

function viewDetails(id) {
  router.push(`/app/suppliers/${id}`)
}

function viewIngredients(s) {
  router.push(`/app/suppliers/${s.id}`)
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
    { label: 'Modifier', icon: 'edit', action: () => editSupplier(s), hidden: auth.isCook },
    { label: s.status === 'archived' ? 'Restaurer' : 'Archiver', icon: s.status === 'archived' ? 'refresh' : 'archive', action: () => s.status === 'archived' ? restoreSupplier(s) : archiveSupplier(s), hidden: auth.isCook },
    { label: 'Voir ingrédients', icon: 'list', action: () => viewIngredients(s) },
    { label: 'Détails', icon: 'eye', action: () => viewDetails(s.id) },
    { label: 'Supprimer', icon: 'trash', action: () => confirmDelete(s), danger: true, hidden: !auth.isAdmin },
  ]
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
          <th>Dernier achat</th>
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
          <td data-label="Dernier achat">{{ s.last_purchase_date || '—' }}</td>
          <td data-label="Actions" @click.stop>
            <RowActionMenu :actions="rowActions(s)" />
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
</template>
