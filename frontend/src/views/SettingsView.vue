<script setup>
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { api } from '../api'
import Modal from '../components/base/Modal.vue'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'
import PageContainer from '../components/base/PageContainer.vue'
import ActionToolbar from '../components/base/ActionToolbar.vue'

const auth = useAuthStore()
const app = useAppStore()

const subTab = ref('ingredients')
const isSaving = ref(false)

// ── Ingredient Form (Create) ──
const ingName = ref('')
const ingUnit = ref('g')
const ingPurchaseUnit = ref('paquet')
const ingPurchaseUnitPrice = ref('')
const ingConversionFactor = ref('')
const ingAlertThreshold = ref('')
const ingError = ref(null)
const ingSuccess = ref(null)

// ── Ingredient Edit ──
const showEditModal = ref(false)
const editingIngredient = ref(null)
const editName = ref('')
const editUnit = ref('g')
const editPurchaseUnit = ref('paquet')
const editPurchaseUnitPrice = ref('')
const editConversionFactor = ref('')
const editAlertThreshold = ref('')
const editError = ref(null)
const editLoading = ref(false)

// ── Ingredient Delete ──
const showDeleteDialog = ref(false)
const deletingIngredient = ref(null)
const deleteLoading = ref(false)
const deleteError = ref(null)
const deleteWarnings = ref([])

// ── Ingredient Search / Sort / Pagination ──
const ingSearch = ref('')
const ingSortBy = ref('name')
const ingSortDir = ref('asc')
const ingPage = ref(1)
const ingPerPage = ref(10)

const filteredIngredients = computed(() => {
  let list = [...app.ingredients]
  const q = ingSearch.value.toLowerCase().trim()
  if (q) {
    list = list.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.purchase_unit && i.purchase_unit.toLowerCase().includes(q))
    )
  }
  list.sort((a, b) => {
    let cmp = 0
    if (ingSortBy.value === 'name') cmp = a.name.localeCompare(b.name)
    else if (ingSortBy.value === 'purchase_unit') cmp = (a.purchase_unit || '').localeCompare(b.purchase_unit || '')
    else if (ingSortBy.value === 'purchase_unit_price') cmp = parseFloat(a.purchase_unit_price) - parseFloat(b.purchase_unit_price)
    else if (ingSortBy.value === 'conversion_factor') cmp = parseFloat(a.conversion_factor) - parseFloat(b.conversion_factor)
    return ingSortDir.value === 'asc' ? cmp : -cmp
  })
  return list
})

const paginatedIngredients = computed(() => {
  const start = (ingPage.value - 1) * ingPerPage.value
  return filteredIngredients.value.slice(start, start + ingPerPage.value)
})

const totalIngPages = computed(() => Math.max(1, Math.ceil(filteredIngredients.value.length / ingPerPage.value)))

watch([ingSearch, ingSortBy, ingSortDir], () => { ingPage.value = 1 })

function toggleSort(col) {
  if (ingSortBy.value === col) {
    ingSortDir.value = ingSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    ingSortBy.value = col
    ingSortDir.value = 'asc'
  }
}

function sortIcon(col) {
  if (ingSortBy.value !== col) return ''
  return ingSortDir.value === 'asc' ? ' ▲' : ' ▼'
}

// ── Recipe Form ──
const recName = ref('')
const recSalePrice = ref('')
const recError = ref(null)
const recSuccess = ref(null)

// ── Fiche Technique ──
const selectedRecipeId = ref('')
const ficheIngredients = ref([])
const selectedIngId = ref('')
const ingQtyNeeded = ref('')
const ficheError = ref(null)
const ficheSuccess = ref(null)

// ── Stock Adjustment ──
const depts = ref([])
const movements = ref([])
const adjDeptId = ref('')
const adjIngId = ref('')
const adjQty = ref('')
const adjType = ref('purchase')
const adjRef = ref('')
const adjError = ref(null)
const adjSuccess = ref(null)
const historySearch = ref('')
const historyTypeFilter = ref('all')

// ── Users ──
const users = ref([])
const userId = ref(null)
const userUsername = ref('')
const userPassword = ref('')
const userRole = ref('cook')
const userFirstName = ref('')
const userLastName = ref('')
const userError = ref(null)
const userSuccess = ref(null)

// ── Recipe Edit ──
const showRecipeEditModal = ref(false)
const editingRecipe = ref(null)
const editRecipeName = ref('')
const editRecipePrice = ref('')
const editRecipeError = ref(null)
const editRecipeLoading = ref(false)

// ── User Delete Dialog ──
const showUserDeleteDialog = ref(false)
const deletingUserId = ref(null)
const deletingUserName = ref('')

// ── Department Delete Dialog ──
const showDeptDeleteDialog = ref(false)
const deletingDeptId = ref(null)
const deletingDeptName = ref('')

// ── Departments ──
const deptId = ref(null)
const deptName = ref('')
const deptStockType = ref('isolated')
const deptDescription = ref('')
const deptError = ref(null)
const deptSuccess = ref(null)

const getCalculatedBasePrice = (price, factor) => {
  const p = parseFloat(price)
  const f = parseFloat(factor)
  if (!isNaN(p) && !isNaN(f) && f > 0) return (p / f).toFixed(4)
  return '0.0000'
}

const filteredMovements = computed(() =>
  movements.value.filter(mov => {
    const q = historySearch.value.toLowerCase()
    const match = mov.ingredient_name.toLowerCase().includes(q) || (mov.reference_id && mov.reference_id.toLowerCase().includes(q)) || mov.department_name.toLowerCase().includes(q)
    if (!match) return false
    if (historyTypeFilter.value === 'all') return true
    const qty = parseFloat(mov.quantity)
    if (historyTypeFilter.value === 'purchase_pos') return mov.type === 'purchase' && qty >= 0
    if (historyTypeFilter.value === 'purchase_neg') return mov.type === 'purchase' && qty < 0
    if (historyTypeFilter.value === 'reconciliation') return mov.type === 'reconciliation'
    return true
  })
)

async function fetchDeptsAndMovements() {
  try {
    const [deptsRes, movRes] = await Promise.all([
      api.getDepartments(),
      api.getMovements()
    ])
    if (deptsRes.data.status === 'success') depts.value = deptsRes.data.data
    if (movRes.data.status === 'success') movements.value = movRes.data.data
  } catch (err) { console.error(err) }
}

async function fetchUsers() {
  try {
    const { data: res } = await api.getUsers()
    if (res.status === 'success') users.value = res.data
  } catch (err) { console.error(err) }
}

watch(subTab, (tab) => {
  if (tab === 'stocks' || tab === 'depts') fetchDeptsAndMovements()
  else if (tab === 'users') fetchUsers()
})

// ── Ingredient CRUD ──
async function handleCreateIngredient(e) {
  e.preventDefault(); ingError.value = null; ingSuccess.value = null
  const priceVal = parseFloat(ingPurchaseUnitPrice.value)
  const factorVal = parseFloat(ingConversionFactor.value)
  if (!ingName.value || !ingUnit.value || isNaN(priceVal) || isNaN(factorVal) || factorVal <= 0) {
    ingError.value = 'Veuillez remplir tous les champs correctement.'; return
  }
  isSaving.value = true
  try {
    const { data: j } = await api.createIngredient({
      name: ingName.value, unit: ingUnit.value, purchase_unit: ingPurchaseUnit.value,
      purchase_unit_price: priceVal, conversion_factor: factorVal,
      alert_threshold: parseFloat(ingAlertThreshold.value) || 0
    })
    if (j.status === 'success') {
      ingSuccess.value = `Ingrédient '${ingName.value}' créé !`
      ingName.value = ''; ingPurchaseUnitPrice.value = ''; ingConversionFactor.value = ''
      app.fetchData(auth.user)
    } else ingError.value = j.message || 'Erreur.'
  } catch { ingError.value = "Impossible de contacter l'API." }
  finally { isSaving.value = false }
}

function openEditModal(ing) {
  editingIngredient.value = ing
  editName.value = ing.name
  editUnit.value = ing.unit
  editPurchaseUnit.value = ing.purchase_unit || 'paquet'
  editPurchaseUnitPrice.value = ing.purchase_unit_price?.toString() || ''
  editConversionFactor.value = ing.conversion_factor?.toString() || ''
  editAlertThreshold.value = ing.alert_threshold?.toString() || ''
  editError.value = null
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editingIngredient.value = null
}

async function handleEditIngredient() {
  editError.value = null; editLoading.value = true
  const priceVal = parseFloat(editPurchaseUnitPrice.value)
  const factorVal = parseFloat(editConversionFactor.value)
  if (!editName.value || !editUnit.value || isNaN(priceVal) || isNaN(factorVal) || factorVal <= 0) {
    editError.value = 'Veuillez remplir tous les champs correctement.'; editLoading.value = false; return
  }
  try {
    const { data: j } = await api.updateIngredient(editingIngredient.value.id, {
      name: editName.value, unit: editUnit.value,
      purchase_unit: editPurchaseUnit.value,
      purchase_unit_price: priceVal, conversion_factor: factorVal,
      alert_threshold: parseFloat(editAlertThreshold.value) || 0
    })
    if (j.status === 'success') {
      closeEditModal()
      app.fetchData(auth.user)
    } else editError.value = j.message || 'Erreur.'
  } catch { editError.value = "Impossible de contacter l'API." }
  finally { editLoading.value = false }
}

function openDeleteDialog(ing) {
  deletingIngredient.value = ing
  deleteWarnings.value = []
  deleteError.value = null
  showDeleteDialog.value = true
}

function closeDeleteDialog() {
  showDeleteDialog.value = false
  deletingIngredient.value = null
  deleteWarnings.value = []
}

async function handleDeleteIngredient() {
  deleteLoading.value = true; deleteError.value = null
  try {
    const { data: j } = await api.deleteIngredient(deletingIngredient.value.id)
    if (j.status === 'success') {
      closeDeleteDialog()
      app.fetchData(auth.user)
    } else {
      if (j.dependencies) {
        const warnings = []
        if (j.dependencies.recipes?.length > 0) {
          warnings.push(`Utilisé dans les recettes : ${j.dependencies.recipes.join(', ')}`)
        }
        if (j.dependencies.stocks > 0) {
          warnings.push(`Stock restant dans ${j.dependencies.stocks} dépôt(s)`)
        }
        deleteWarnings.value = warnings
      }
      deleteError.value = j.message || 'Erreur.'
    }
  } catch { deleteError.value = "Impossible de contacter l'API." }
  finally { deleteLoading.value = false }
}

// ── Recipe CRUD ──
async function handleCreateRecipe(e) {
  e.preventDefault(); recError.value = null; recSuccess.value = null
  const priceVal = parseFloat(recSalePrice.value)
  if (!recName.value || isNaN(priceVal)) { recError.value = 'Nom et prix requis.'; return }
  isSaving.value = true
  try {
    const { data: j } = await api.createRecipe({ name: recName.value, sale_price: priceVal })
    if (j.status === 'success') {
      recSuccess.value = `Recette '${recName.value}' créée !`
      recName.value = ''; recSalePrice.value = ''
      app.fetchData(auth.user)
    } else recError.value = j.message || 'Erreur.'
  } catch { recError.value = "Impossible de contacter l'API." }
  finally { isSaving.value = false }
}

function openRecipeEditModal(rec) {
  editingRecipe.value = rec
  editRecipeName.value = rec.name
  editRecipePrice.value = rec.sale_price?.toString() || ''
  editRecipeError.value = null
  showRecipeEditModal.value = true
}

function closeRecipeEditModal() {
  showRecipeEditModal.value = false
  editingRecipe.value = null
}

async function handleEditRecipe() {
  editRecipeError.value = null; editRecipeLoading.value = true
  const priceVal = parseFloat(editRecipePrice.value)
  if (!editRecipeName.value || isNaN(priceVal)) { editRecipeError.value = 'Nom et prix requis.'; editRecipeLoading.value = false; return }
  try {
    const payload = { name: editRecipeName.value, sale_price: priceVal }
    const { data: j } = await api.updateRecipe(editingRecipe.value.id, payload)
    if (j.status === 'success') {
      closeRecipeEditModal()
      app.fetchData(auth.user)
    } else editRecipeError.value = j.message || 'Erreur.'
  } catch { editRecipeError.value = "Impossible de contacter l'API." }
  finally { editRecipeLoading.value = false }
}

function handleSelectRecipeForFiche(recipeIdStr) {
  selectedRecipeId.value = recipeIdStr; ficheError.value = null; ficheSuccess.value = null
  if (!recipeIdStr) { ficheIngredients.value = []; return }
  const recipe = app.recipes.find(r => r.id === parseInt(recipeIdStr))
  ficheIngredients.value = recipe?.ingredients?.map(i => ({
    ingredient_id: i.ingredient_id,
    quantity_needed: parseFloat(i.quantity_needed)
  })) || []
}

function handleAddIngredientToFiche() {
  ficheError.value = null
  if (!selectedIngId.value || !ingQtyNeeded.value) { ficheError.value = 'Sélectionnez un ingrédient et saisissez une quantité.'; return }
  const qty = parseFloat(ingQtyNeeded.value)
  if (isNaN(qty) || qty <= 0) { ficheError.value = 'Quantité > 0 requise.'; return }
  if (ficheIngredients.value.some(i => i.ingredient_id === parseInt(selectedIngId.value))) { ficheError.value = 'Déjà présent.'; return }
  ficheIngredients.value.push({ ingredient_id: parseInt(selectedIngId.value), quantity_needed: qty })
  selectedIngId.value = ''; ingQtyNeeded.value = ''
}

function handleRemoveIngredientFromFiche(ingId) {
  ficheIngredients.value = ficheIngredients.value.filter(i => i.ingredient_id !== ingId)
}

async function handleSaveFiche() {
  ficheError.value = null; ficheSuccess.value = null
  if (!selectedRecipeId.value) { ficheError.value = 'Sélectionnez un produit.'; return }
  isSaving.value = true
  try {
    const { data: j } = await api.saveRecipeIngredients(parseInt(selectedRecipeId.value), ficheIngredients.value)
    if (j.status === 'success') { ficheSuccess.value = 'Fiche technique mise à jour !'; app.fetchData(auth.user) }
    else ficheError.value = j.message || 'Erreur.'
  } catch { ficheError.value = "Impossible de contacter l'API." }
  finally { isSaving.value = false }
}

// ── Stock Adjustment ──
async function handleAdjustStock(e) {
  e.preventDefault(); adjError.value = null; adjSuccess.value = null
  const qtyVal = parseFloat(adjQty.value)
  if (!adjDeptId.value || !adjIngId.value || isNaN(qtyVal) || qtyVal < 0) { adjError.value = 'Champs requis.'; return }
  const data = {
    department_id: parseInt(adjDeptId.value),
    ingredient_id: parseInt(adjIngId.value),
    quantity: adjType.value === 'decrease' ? -qtyVal : qtyVal,
    type: adjType.value === 'decrease' ? 'purchase' : adjType.value,
    reference_id: adjRef.value || undefined
  }
  isSaving.value = true
  try {
    const success = await app.handleAdjustSubmit(data, auth.user)
    if (success) {
      adjSuccess.value = 'Ajustement enregistré !'
      adjQty.value = ''; adjRef.value = ''
      fetchDeptsAndMovements()
    } else adjError.value = 'Erreur.'
  } catch { adjError.value = "Impossible de contacter l'API." }
  finally { isSaving.value = false }
}

// ── User CRUD ──
async function handleUserSubmit(e) {
  e.preventDefault(); userError.value = null; userSuccess.value = null
  if (!userUsername.value || !userRole.value) { userError.value = 'Username et rôle requis.'; return }
  if (!userId.value && !userPassword.value) { userError.value = 'Mot de passe requis pour nouveau compte.'; return }
  isSaving.value = true
  try {
    const payload = {
      username: userUsername.value,
      password: userPassword.value || undefined,
      role: userRole.value,
      first_name: userFirstName.value,
      last_name: userLastName.value
    }
    const { data: j } = userId.value
      ? await api.updateUser(userId.value, payload)
      : await api.createUser(payload)
    if (j.status === 'success') {
      userSuccess.value = userId.value ? 'Compte mis à jour !' : 'Compte créé !'
      userId.value = null; userUsername.value = ''; userPassword.value = ''
      userRole.value = 'cook'; userFirstName.value = ''; userLastName.value = ''
      fetchUsers()
    } else userError.value = j.message || 'Erreur.'
  } catch { userError.value = "Impossible de contacter l'API." }
  finally { isSaving.value = false }
}

function handleEditUser(u) {
  userId.value = u.id; userUsername.value = u.username; userPassword.value = ''
  userRole.value = u.role; userFirstName.value = u.first_name || ''; userLastName.value = u.last_name || ''
}

function handleDeleteUserClick(id, username) {
  deletingUserId.value = id
  deletingUserName.value = username
  showUserDeleteDialog.value = true
}

async function handleDeleteUserConfirm() {
  try {
    const { data: j } = await api.deleteUser(deletingUserId.value)
    if (j.status === 'success') { userSuccess.value = 'Supprimé.'; fetchUsers() }
    else userError.value = j.message
  } catch { userError.value = 'Erreur.' }
  finally { showUserDeleteDialog.value = false; deletingUserId.value = null }
}

// ── Department CRUD ──
async function handleDeptSubmit(e) {
  e.preventDefault(); deptError.value = null; deptSuccess.value = null
  if (!deptName.value) { deptError.value = 'Nom requis.'; return }
  isSaving.value = true
  try {
    const payload = { name: deptName.value, stock_type: deptStockType.value, description: deptDescription.value }
    const { data: j } = deptId.value
      ? await api.updateDepartment(deptId.value, payload)
      : await api.createDepartment(payload)
    if (j.status === 'success') {
      deptSuccess.value = deptId.value ? 'Dépôt mis à jour !' : 'Dépôt créé !'
      deptId.value = null; deptName.value = ''; deptDescription.value = ''
      fetchDeptsAndMovements()
      app.fetchData(auth.user)
    } else deptError.value = j.message
  } catch { deptError.value = 'Erreur.' }
  finally { isSaving.value = false }
}

function handleEditDept(d) {
  deptId.value = d.id; deptName.value = d.name
  deptStockType.value = d.stock_type; deptDescription.value = d.description || ''
}

function handleDeleteDeptClick(id, name) {
  deletingDeptId.value = id
  deletingDeptName.value = name
  showDeptDeleteDialog.value = true
}

async function handleDeleteDeptConfirm() {
  try {
    const { data: j } = await api.deleteDepartment(deletingDeptId.value)
    if (j.status === 'success') {
      deptSuccess.value = 'Supprimé.'
      fetchDeptsAndMovements()
      app.fetchData(auth.user)
    } else deptError.value = j.message
  } catch { deptError.value = 'Erreur.' }
  finally { showDeptDeleteDialog.value = false; deletingDeptId.value = null }
}
</script>

<template>
  <PageContainer
    title="Paramétrage Système"
    subtitle="Gestion des matières premières, fiches techniques, stocks et comptes utilisateurs."
  >
    <template #actions>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button
          class="touch-btn touch-btn-secondary"
          style="padding: 0.5rem 1rem; min-height: 40px;"
          @click="app.toggleOfflineManual()"
        >
          {{ app.isOffline ? '🟢 En ligne' : '🔴 Hors ligne' }}
        </button>
      </div>
    </template>

    <div class="dept-filter-section">
      <div
        v-for="tab in ['ingredients', 'recipes', 'stocks', 'users', 'depts']"
        :key="tab"
        :class="['dept-pill', { active: subTab === tab }]"
        @click="subTab = tab"
      >
        {{ tab === 'ingredients' ? 'Matières Premières' : tab === 'recipes' ? 'Fiches Techniques' : tab === 'stocks' ? 'Ajustements' : tab === 'users' ? 'Utilisateurs' : 'Dépôts' }}
      </div>
    </div>

    <!-- ══════════════ INGREDIENTS TAB ══════════════ -->
    <div
      v-if="subTab === 'ingredients'"
      style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 2rem; align-items: start;"
    >
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          Nouvel Ingrédient
        </h2>
        <div
          v-if="app.isOffline"
          class="alert-banner alert-banner-danger"
          style="margin-bottom: 1.5rem;"
        >
          Création désactivée hors ligne.
        </div>
        <div
          v-if="ingError"
          class="alert-banner alert-banner-danger"
        >
          {{ ingError }}
        </div>
        <div
          v-if="ingSuccess"
          class="alert-banner"
          style="background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.15); color: var(--emerald);"
        >
          {{ ingSuccess }}
        </div>
        <form @submit.prevent="handleCreateIngredient">
          <div class="form-group">
            <label class="form-label">Nom *</label>
            <input
              v-model="ingName"
              class="form-input"
              placeholder="Ex: Fromage Cheddar"
              required
            >
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Unité Cuisine *</label>
              <select
                v-model="ingUnit"
                class="form-select"
              >
                <option value="g">gramme (g)</option>
                <option value="ml">millilitre (ml)</option>
                <option value="pcs">pièce (pcs)</option>
                <option value="kg">kilogramme (kg)</option>
                <option value="l">litre (l)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Unité Achat *</label>
              <input
                v-model="ingPurchaseUnit"
                class="form-input"
                placeholder="carton, sac..."
                required
              >
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Capacité Paquet *</label>
              <input
                v-model="ingConversionFactor"
                type="number"
                step="any"
                class="form-input"
                placeholder="5000 (si 5kg en g)"
                required
              >
            </div>
            <div class="form-group">
              <label class="form-label">Prix Paquet (TND) *</label>
              <input
                v-model="ingPurchaseUnitPrice"
                type="number"
                step="0.01"
                class="form-input"
                placeholder="120.00"
                required
              >
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Seuil d'Alerte</label>
            <input
              v-model="ingAlertThreshold"
              type="number"
              step="any"
              class="form-input"
              placeholder="2000"
            >
          </div>
          <div style="padding: 1rem; background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: 8px; margin-bottom: 1.5rem;">
            <span style="color: var(--text-secondary); font-size: 0.875rem;">Coût unitaire de base :</span>
            <div style="font-size: 1.2rem; font-weight: 800; color: var(--indigo-light); margin-top: 0.25rem;">
              {{ getCalculatedBasePrice(ingPurchaseUnitPrice, ingConversionFactor) }} TND / {{ ingUnit }}
            </div>
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%;"
            :disabled="app.isOffline || isSaving"
          >
            <span
              v-if="isSaving"
              class="spinner"
              style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
            />
            <span v-else>Enregistrer l'ingrédient</span>
          </button>
        </form>
      </div>

      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          Catalogue des Ingrédients ({{ app.ingredients.length }})
        </h2>

        <input
          v-model="ingSearch"
          class="form-input"
          placeholder="Rechercher par nom ou unité d'achat..."
          style="width: 100%; margin-bottom: 1rem;"
        >

        <div
          v-if="app.ingredients.length === 0"
          style="padding: 2rem 0;"
        >
          <p style="color: var(--text-secondary); text-align: center;">
            Aucun ingrédient. Créez-en un premier.
          </p>
        </div>
        <div
          v-else-if="filteredIngredients.length === 0"
          style="padding: 2rem 0;"
        >
          <p style="color: var(--text-secondary); text-align: center;">
            Aucun ingrédient ne correspond à votre recherche.
          </p>
        </div>
        <div
          v-else
          class="table-wrapper"
        >
          <table class="mepos-table">
            <thead>
              <tr>
                <th
                  style="cursor: pointer; user-select: none;"
                  @click="toggleSort('name')"
                >
                  Nom{{ sortIcon('name') }}
                </th>
                <th
                  style="cursor: pointer; user-select: none;"
                  @click="toggleSort('purchase_unit')"
                >
                  Unité Achat{{ sortIcon('purchase_unit') }}
                </th>
                <th
                  style="cursor: pointer; user-select: none;"
                  @click="toggleSort('conversion_factor')"
                >
                  Capacité{{ sortIcon('conversion_factor') }}
                </th>
                <th
                  style="cursor: pointer; user-select: none;"
                  @click="toggleSort('purchase_unit_price')"
                >
                  Prix Colis{{ sortIcon('purchase_unit_price') }}
                </th>
                <th>Coût Cuisine</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="ing in paginatedIngredients"
                :key="ing.id"
              >
                <td><strong style="color: var(--text-primary);">{{ ing.name }}</strong></td>
                <td><span class="badge badge-success">{{ ing.purchase_unit }}</span></td>
                <td>{{ parseFloat(ing.conversion_factor).toLocaleString() }} {{ ing.unit }}</td>
                <td>{{ parseFloat(ing.purchase_unit_price).toFixed(2) }} TND</td>
                <td style="color: var(--indigo-light); font-weight: 600;">
                  {{ parseFloat(ing.purchase_price_per_unit).toFixed(4) }} TND/{{ ing.unit }}
                </td>
                <td>
                  <div style="display: flex; gap: 0.4rem;">
                    <button
                      class="badge badge-info"
                      style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                      aria-label="Modifier"
                      @click="openEditModal(ing)"
                    >
                      Modifier
                    </button>
                    <button
                      class="badge badge-danger"
                      style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                      aria-label="Supprimer"
                      @click="openDeleteDialog(ing)"
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div
            v-if="totalIngPages > 1"
            style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-color);"
          >
            <span style="font-size: 0.82rem; color: var(--text-secondary);">
              {{ filteredIngredients.length }} résultat(s) — Page {{ ingPage }} / {{ totalIngPages }}
            </span>
            <div style="display: flex; gap: 0.4rem;">
              <button
                class="touch-btn touch-btn-secondary"
                style="padding: 0.3rem 0.8rem; min-height: 32px; font-size: 0.8rem;"
                :disabled="ingPage <= 1"
                @click="ingPage = Math.max(1, ingPage - 1)"
              >
                ←
              </button>
              <button
                class="touch-btn touch-btn-secondary"
                style="padding: 0.3rem 0.8rem; min-height: 32px; font-size: 0.8rem;"
                :disabled="ingPage >= totalIngPages"
                @click="ingPage = Math.min(totalIngPages, ingPage + 1)"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════ RECIPES TAB ══════════════ -->
    <div
      v-if="subTab === 'recipes'"
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;"
    >
      <div style="display: flex; flex-direction: column; gap: 2rem;">
        <div
          class="glass-panel"
          style="padding: 2rem;"
        >
          <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
            Nouveau Produit
          </h2>
          <div
            v-if="app.isOffline"
            class="alert-banner alert-banner-danger"
            style="margin-bottom: 1.5rem;"
          >
            Création désactivée hors ligne.
          </div>
          <div
            v-if="recError"
            class="alert-banner alert-banner-danger"
          >
            {{ recError }}
          </div>
          <div
            v-if="recSuccess"
            class="alert-banner"
            style="background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.15); color: var(--emerald);"
          >
            {{ recSuccess }}
          </div>
          <form @submit.prevent="handleCreateRecipe">
            <div class="form-group">
              <label class="form-label">Nom du Produit *</label>
              <input
                v-model="recName"
                class="form-input"
                placeholder="Ex: Cheeseburger"
                required
              >
            </div>
            <div class="form-group">
              <label class="form-label">Prix de Vente (TND) *</label>
              <input
                v-model="recSalePrice"
                type="number"
                step="0.01"
                class="form-input"
                placeholder="15.00"
                required
              >
            </div>
            <button
              type="submit"
              class="touch-btn"
              style="width: 100%; margin-top: 0.5rem;"
              :disabled="app.isOffline || isSaving"
            >
              <span
                v-if="isSaving"
                class="spinner"
                style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
              />
              <span v-else>Créer le produit</span>
            </button>
          </form>
        </div>
        <div
          class="glass-panel"
          style="padding: 2rem;"
        >
          <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
            Menu mePOS ({{ app.recipes.length }})
          </h2>
          <div class="table-wrapper">
            <table class="mepos-table">
              <thead><tr><th>Produit</th><th>Prix</th><th>Nb Ingr.</th><th>Actions</th></tr></thead>
              <tbody>
                <tr
                  v-for="rec in app.recipes"
                  :key="rec.id"
                  style="cursor: pointer;"
                  @click="handleSelectRecipeForFiche(rec.id.toString())"
                >
                  <td><strong style="color: var(--text-primary);">{{ rec.name }}</strong></td>
                  <td style="color: var(--emerald); font-weight: 600;">
                    {{ parseFloat(rec.sale_price).toFixed(2) }} TND
                  </td>
                  <td>{{ rec.ingredients?.length || 0 }} réf(s)</td>
                  <td>
                    <button
                      class="badge badge-info"
                      style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                      @click.stop="openRecipeEditModal(rec)"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          Fiche Technique
        </h2>
        <div
          v-if="app.isOffline"
          class="alert-banner alert-banner-danger"
          style="margin-bottom: 1.5rem;"
        >
          Modification désactivée hors ligne.
        </div>
        <div
          v-if="ficheError"
          class="alert-banner alert-banner-danger"
        >
          {{ ficheError }}
        </div>
        <div
          v-if="ficheSuccess"
          class="alert-banner"
          style="background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.15); color: var(--emerald);"
        >
          {{ ficheSuccess }}
        </div>
        <div class="form-group">
          <label class="form-label">Produit à configurer *</label>
          <select
            v-model="selectedRecipeId"
            class="form-select"
            @change="handleSelectRecipeForFiche(selectedRecipeId)"
          >
            <option value="">-- Choisir --</option>
            <option
              v-for="rec in app.recipes"
              :key="rec.id"
              :value="rec.id"
            >
              {{ rec.name }}
            </option>
          </select>
        </div>
        <div
          v-if="selectedRecipeId"
          style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;"
        >
          <div style="padding: 1rem; background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 12px;">
            <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 1rem; text-transform: uppercase; color: var(--text-secondary);">
              Ajouter un ingrédient
            </h3>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <div
                class="form-group"
                style="margin-bottom: 0;"
              >
                <label class="form-label">Ingrédient</label>
                <select
                  v-model="selectedIngId"
                  class="form-select"
                >
                  <option value="">-- Choisir --</option>
                  <option
                    v-for="ing in app.ingredients"
                    :key="ing.id"
                    :value="ing.id"
                  >
                    {{ ing.name }} ({{ ing.unit }})
                  </option>
                </select>
              </div>
              <div
                class="form-group"
                style="margin-bottom: 0;"
              >
                <label class="form-label">Grammage requis</label>
                <input
                  v-model="ingQtyNeeded"
                  type="number"
                  step="any"
                  class="form-input"
                  placeholder="150 (g)"
                >
              </div>
              <button
                type="button"
                class="touch-btn touch-btn-secondary"
                :disabled="app.isOffline"
                @click="handleAddIngredientToFiche"
              >
                + Insérer
              </button>
            </div>
          </div>
          <div v-if="ficheIngredients.length > 0">
            <h3 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.75rem; text-transform: uppercase; color: var(--text-secondary);">
              Composition actuelle
            </h3>
            <div
              class="table-wrapper"
              style="max-height: 250px; overflow-y: auto;"
            >
              <table class="mepos-table">
                <thead><tr><th>Ingrédient</th><th>Grammage</th><th>Action</th></tr></thead>
                <tbody>
                  <tr
                    v-for="item in ficheIngredients"
                    :key="item.ingredient_id"
                  >
                    <td><strong style="color: var(--text-primary);">{{ app.ingredients.find(i => i.id === item.ingredient_id)?.name || 'Unknown' }}</strong></td>
                    <td>{{ item.quantity_needed }} {{ app.ingredients.find(i => i.id === item.ingredient_id)?.unit || '' }}</td>
                    <td>
                      <button
                        class="badge badge-danger"
                        style="border: none; cursor: pointer;"
                        @click="handleRemoveIngredientFromFiche(item.ingredient_id)"
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <button
            class="touch-btn"
            style="width: 100%;"
            :disabled="app.isOffline || isSaving"
            @click="handleSaveFiche"
          >
            <span
              v-if="isSaving"
              class="spinner"
              style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
            />
            <span v-else>Sauvegarder la fiche</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════ STOCKS TAB ══════════════ -->
    <div
      v-if="subTab === 'stocks'"
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;"
    >
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          Modification de Stock
        </h2>
        <div
          v-if="adjError"
          class="alert-banner alert-banner-danger"
        >
          {{ adjError }}
        </div>
        <div
          v-if="adjSuccess"
          class="alert-banner"
          style="background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.15); color: var(--emerald);"
        >
          {{ adjSuccess }}
        </div>
        <form @submit.prevent="handleAdjustStock">
          <div class="form-group">
            <label class="form-label">Dépôt *</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.25rem;">
              <div
                v-for="d in depts"
                :key="d.id"
                :style="{ padding: '0.8rem', borderRadius: 'var(--radius-md)', background: adjDeptId === d.id.toString() ? 'rgba(99,102,241,0.08)' : 'var(--bg-input)', border: `1px solid ${adjDeptId === d.id.toString() ? 'var(--indigo)' : 'var(--border-color)'}`, cursor: 'pointer', textAlign: 'center' }"
                @click="adjDeptId = d.id.toString()"
              >
                <span style="font-size: 0.85rem; font-weight: 700;">{{ d.name }}</span>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Ingrédient *</label>
            <select
              v-model="adjIngId"
              class="form-select"
              required
            >
              <option value="">-- Choisir --</option>
              <option
                v-for="ing in app.ingredients"
                :key="ing.id"
                :value="ing.id"
              >
                {{ ing.name }}
              </option>
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Type d'ajustement *</label>
              <select
                v-model="adjType"
                class="form-select"
              >
                <option value="purchase">Entrée (Achat)</option>
                <option value="reconciliation">Réconciliation</option>
                <option value="decrease">Sortie (Retrait)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Quantité *</label>
              <input
                v-model="adjQty"
                type="number"
                step="any"
                class="form-input"
                placeholder="5.0"
                required
              >
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Référence</label>
            <input
              v-model="adjRef"
              class="form-input"
              placeholder="Bon de commande, etc."
            >
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%; margin-top: 0.5rem;"
            :disabled="isSaving"
          >
            <span
              v-if="isSaving"
              class="spinner"
              style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
            />
            <span v-else>Appliquer l'ajustement</span>
          </button>
        </form>
      </div>
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          Historique des Mouvements
        </h2>
        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
          <input
            v-model="historySearch"
            class="form-input"
            placeholder="Rechercher..."
            style="flex: 1;"
          >
          <select
            v-model="historyTypeFilter"
            class="form-select"
            style="width: auto;"
          >
            <option value="all">Tous</option>
            <option value="purchase_pos">Entrées</option>
            <option value="purchase_neg">Sorties</option>
            <option value="reconciliation">Réconciliation</option>
          </select>
        </div>
        <div
          class="table-wrapper"
          style="max-height: 400px; overflow-y: auto;"
        >
          <table class="mepos-table">
            <thead><tr><th>Date</th><th>Ingrédient</th><th>Dépôt</th><th>Qté</th><th>Type</th><th>Réf</th></tr></thead>
            <tbody>
              <tr
                v-for="mov in filteredMovements"
                :key="mov.id"
              >
                <td style="color: var(--text-secondary); font-size: 0.875rem;">
                  {{ new Date(mov.created_at).toLocaleString('fr-TN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
                </td>
                <td><strong>{{ mov.ingredient_name }}</strong></td>
                <td>{{ mov.department_name }}</td>
                <td :style="{ color: parseFloat(mov.quantity) >= 0 ? 'var(--emerald)' : '#ef4444', fontWeight: 600 }">
                  {{ parseFloat(mov.quantity) >= 0 ? '+' : '' }}{{ parseFloat(mov.quantity).toFixed(2) }} {{ mov.unit }}
                </td>
                <td>
                  <span
                    class="badge"
                    :class="mov.type === 'purchase' ? 'badge-success' : 'badge-warn'"
                  >{{ mov.type }}</span>
                </td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">
                  {{ mov.reference_id || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════ USERS TAB ══════════════ -->
    <div
      v-if="subTab === 'users'"
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;"
    >
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          {{ userId ? 'Modifier' : 'Nouveau' }} Compte Utilisateur
        </h2>
        <div
          v-if="userError"
          class="alert-banner alert-banner-danger"
        >
          {{ userError }}
        </div>
        <div
          v-if="userSuccess"
          class="alert-banner"
          style="background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.15); color: var(--emerald);"
        >
          {{ userSuccess }}
        </div>
        <form @submit.prevent="handleUserSubmit">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Prénom</label>
              <input
                v-model="userFirstName"
                class="form-input"
                placeholder="Mohamed"
              >
            </div>
            <div class="form-group">
              <label class="form-label">Nom</label>
              <input
                v-model="userLastName"
                class="form-input"
                placeholder="Ali"
              >
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Nom d'utilisateur *</label>
            <input
              v-model="userUsername"
              class="form-input"
              placeholder="med"
              required
            >
          </div>
          <div class="form-group">
            <label class="form-label">Mot de passe {{ userId ? '(laisser vide pour garder)' : '*' }}</label>
            <input
              v-model="userPassword"
              type="password"
              class="form-input"
              placeholder="••••••"
              :required="!userId"
            >
          </div>
          <div class="form-group">
            <label class="form-label">Rôle *</label>
            <select
              v-model="userRole"
              class="form-select"
            >
              <option value="cook">Cuisinier / Comptoir</option>
              <option value="manager">Gérant</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%; margin-top: 0.5rem;"
            :disabled="isSaving"
          >
            <span
              v-if="isSaving"
              class="spinner"
              style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
            />
            <span v-else>{{ userId ? 'Mettre à jour' : 'Créer le compte' }}</span>
          </button>
        </form>
      </div>
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          Comptes Utilisateurs ({{ users.length }})
        </h2>
        <div class="table-wrapper">
          <table class="mepos-table">
            <thead><tr><th>Utilisateur</th><th>Nom complet</th><th>Rôle</th><th>Actions</th></tr></thead>
            <tbody>
              <tr
                v-for="u in users"
                :key="u.id"
              >
                <td><strong style="color: var(--text-primary);">@{{ u.username }}</strong></td>
                <td>{{ u.first_name }} {{ u.last_name }}</td>
                <td><span :class="['badge', u.role === 'admin' ? 'badge-danger' : u.role === 'manager' ? 'badge-warn' : 'badge-success']">{{ u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Gérant' : 'Cuisinier' }}</span></td>
                <td>
                  <div style="display: flex; gap: 0.5rem;">
                    <button
                      class="badge badge-info"
                      style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                      @click="handleEditUser(u)"
                    >
                      Modifier
                    </button>
                    <button
                      class="badge badge-danger"
                      style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                      @click="handleDeleteUserClick(u.id, u.username)"
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════ DEPARTMENTS TAB ══════════════ -->
    <div
      v-if="subTab === 'depts'"
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;"
    >
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          {{ deptId ? 'Modifier' : 'Nouveau' }} Dépôt
        </h2>
        <div
          v-if="deptError"
          class="alert-banner alert-banner-danger"
        >
          {{ deptError }}
        </div>
        <div
          v-if="deptSuccess"
          class="alert-banner"
          style="background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.15); color: var(--emerald);"
        >
          {{ deptSuccess }}
        </div>
        <form @submit.prevent="handleDeptSubmit">
          <div class="form-group">
            <label class="form-label">Nom du Dépôt *</label>
            <input
              v-model="deptName"
              class="form-input"
              placeholder="Ex: Cuisine Centrale"
              required
            >
          </div>
          <div class="form-group">
            <label class="form-label">Type de Stock *</label>
            <select
              v-model="deptStockType"
              class="form-select"
            >
              <option value="isolated">Stock Isolé (Physique)</option>
              <option value="inherited">Stock Hérité (Virtuel)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <input
              v-model="deptDescription"
              class="form-input"
              placeholder="Description optionnelle"
            >
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%; margin-top: 0.5rem;"
            :disabled="isSaving"
          >
            <span
              v-if="isSaving"
              class="spinner"
              style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
            />
            <span v-else>{{ deptId ? 'Mettre à jour' : 'Créer le dépôt' }}</span>
          </button>
        </form>
      </div>
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          Dépôts ({{ depts.length }})
        </h2>
        <div class="table-wrapper">
          <table class="mepos-table">
            <thead><tr><th>Nom</th><th>Type</th><th>Actions</th></tr></thead>
            <tbody>
              <tr
                v-for="d in depts"
                :key="d.id"
              >
                <td><strong style="color: var(--text-primary);">{{ d.name }}</strong></td>
                <td><span :class="['badge', d.stock_type === 'inherited' ? 'badge-warn' : 'badge-success']">{{ d.stock_type === 'inherited' ? 'Hérité' : 'Isolé' }}</span></td>
                <td>
                  <div style="display: flex; gap: 0.5rem;">
                    <button
                      class="badge badge-info"
                      style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                      @click="handleEditDept(d)"
                    >
                      Modifier
                    </button>
                    <button
                      class="badge badge-danger"
                      style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                      @click="handleDeleteDeptClick(d.id, d.name)"
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </PageContainer>

  <!-- ══════════════ EDIT INGREDIENT MODAL ══════════════ -->
  <Modal
    :is-open="showEditModal"
    title="Modifier l'ingrédient"
    max-width="520px"
    @close="closeEditModal"
  >
    <div
      v-if="editError"
      class="alert-banner alert-banner-danger"
      style="margin-bottom: 1rem;"
    >
      {{ editError }}
    </div>
    <form @submit.prevent="handleEditIngredient">
      <div class="form-group">
        <label class="form-label">Nom *</label>
        <input
          v-model="editName"
          class="form-input"
          placeholder="Ex: Fromage Cheddar"
          required
        >
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Unité Cuisine *</label>
          <select
            v-model="editUnit"
            class="form-select"
          >
            <option value="g">gramme (g)</option>
            <option value="ml">millilitre (ml)</option>
            <option value="pcs">pièce (pcs)</option>
            <option value="kg">kilogramme (kg)</option>
            <option value="l">litre (l)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Unité Achat *</label>
          <input
            v-model="editPurchaseUnit"
            class="form-input"
            placeholder="carton, sac..."
            required
          >
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Capacité Paquet *</label>
          <input
            v-model="editConversionFactor"
            type="number"
            step="any"
            class="form-input"
            placeholder="5000"
            required
          >
        </div>
        <div class="form-group">
          <label class="form-label">Prix Paquet (TND) *</label>
          <input
            v-model="editPurchaseUnitPrice"
            type="number"
            step="0.01"
            class="form-input"
            placeholder="120.00"
            required
          >
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Seuil d'Alerte</label>
        <input
          v-model="editAlertThreshold"
          type="number"
          step="any"
          class="form-input"
          placeholder="2000"
        >
      </div>
      <div style="padding: 1rem; background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: 8px; margin-bottom: 1.5rem;">
        <span style="color: var(--text-secondary); font-size: 0.875rem;">Coût unitaire de base :</span>
        <div style="font-size: 1.2rem; font-weight: 800; color: var(--indigo-light); margin-top: 0.25rem;">
          {{ getCalculatedBasePrice(editPurchaseUnitPrice, editConversionFactor) }} TND / {{ editUnit }}
        </div>
      </div>
      <div class="modal-footer">
        <button
          type="button"
          class="touch-btn touch-btn-secondary"
          :disabled="editLoading"
          @click="closeEditModal"
        >
          Annuler
        </button>
        <button
          type="submit"
          class="touch-btn"
          :disabled="editLoading"
        >
          <span
            v-if="editLoading"
            class="spinner"
            style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
          />
          <span v-else>Enregistrer les modifications</span>
        </button>
      </div>
    </form>
  </Modal>

  <!-- ══════════════ DELETE INGREDIENT CONFIRMATION ══════════════ -->
  <ConfirmDialog
    :is-open="showDeleteDialog"
    title="Supprimer l'ingrédient"
    :message="deletingIngredient ? `Êtes-vous sûr de vouloir supprimer « ${deletingIngredient.name} » ?` : ''"
    confirm-label="Supprimer"
    cancel-label="Annuler"
    variant="danger"
    :loading="deleteLoading"
    :disabled="deleteWarnings.length > 0"
    :warnings="deleteWarnings"
    @confirm="handleDeleteIngredient"
    @cancel="closeDeleteDialog"
    @close="closeDeleteDialog"
  />

  <!-- ══════════════ EDIT RECIPE MODAL ══════════════ -->
  <Modal
    :is-open="showRecipeEditModal"
    title="Modifier le produit"
    max-width="440px"
    @close="closeRecipeEditModal"
  >
    <div
      v-if="editRecipeError"
      class="alert-banner alert-banner-danger"
      style="margin-bottom: 1rem;"
    >
      {{ editRecipeError }}
    </div>
    <form @submit.prevent="handleEditRecipe">
      <div class="form-group">
        <label class="form-label">Nom du Produit *</label>
        <input
          v-model="editRecipeName"
          class="form-input"
          placeholder="Ex: Cheeseburger"
          required
        >
      </div>
      <div class="form-group">
        <label class="form-label">Prix de Vente (TND) *</label>
        <input
          v-model="editRecipePrice"
          type="number"
          step="0.01"
          class="form-input"
          placeholder="15.00"
          required
        >
      </div>
      <div class="modal-footer">
        <button
          type="button"
          class="touch-btn touch-btn-secondary"
          :disabled="editRecipeLoading"
          @click="closeRecipeEditModal"
        >
          Annuler
        </button>
        <button
          type="submit"
          class="touch-btn"
          :disabled="editRecipeLoading"
        >
          <span
            v-if="editRecipeLoading"
            class="spinner"
            style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
          />
          <span v-else>Enregistrer</span>
        </button>
      </div>
    </form>
  </Modal>

  <!-- ══════════════ DELETE USER CONFIRMATION ══════════════ -->
  <ConfirmDialog
    :is-open="showUserDeleteDialog"
    title="Supprimer l'utilisateur"
    :message="`Êtes-vous sûr de vouloir supprimer le compte « ${deletingUserName} » ?`"
    confirm-label="Supprimer"
    cancel-label="Annuler"
    variant="danger"
    @confirm="handleDeleteUserConfirm"
    @cancel="showUserDeleteDialog = false"
    @close="showUserDeleteDialog = false"
  />

  <!-- ══════════════ DELETE DEPARTMENT CONFIRMATION ══════════════ -->
  <ConfirmDialog
    :is-open="showDeptDeleteDialog"
    title="Supprimer le dépôt"
    :message="`Êtes-vous sûr de vouloir supprimer le dépôt « ${deletingDeptName} » ?`"
    confirm-label="Supprimer"
    cancel-label="Annuler"
    variant="danger"
    @confirm="handleDeleteDeptConfirm"
    @cancel="showDeptDeleteDialog = false"
    @close="showDeptDeleteDialog = false"
  />
</template>
