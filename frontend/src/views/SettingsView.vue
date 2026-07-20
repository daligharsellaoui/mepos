<script setup>
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { api } from '../api'

const auth = useAuthStore()
const app = useAppStore()

const subTab = ref('ingredients')

// ── Ingredient Form ──
const ingName = ref('')
const ingUnit = ref('g')
const ingPurchaseUnit = ref('paquet')
const ingPurchaseUnitPrice = ref('')
const ingConversionFactor = ref('')
const ingAlertThreshold = ref('')
const ingError = ref(null)
const ingSuccess = ref(null)

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

// ── Departments ──
const deptId = ref(null)
const deptName = ref('')
const deptStockType = ref('isolated')
const deptDescription = ref('')
const deptError = ref(null)
const deptSuccess = ref(null)

const getCalculatedBasePrice = () => {
  const price = parseFloat(ingPurchaseUnitPrice.value)
  const factor = parseFloat(ingConversionFactor.value)
  if (!isNaN(price) && !isNaN(factor) && factor > 0) return (price / factor).toFixed(4)
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

// ── CRUD Handlers ──
async function handleCreateIngredient(e) {
  e.preventDefault(); ingError.value = null; ingSuccess.value = null
  const priceVal = parseFloat(ingPurchaseUnitPrice.value)
  const factorVal = parseFloat(ingConversionFactor.value)
  if (!ingName.value || !ingUnit.value || isNaN(priceVal) || isNaN(factorVal) || factorVal <= 0) {
    ingError.value = "Veuillez remplir tous les champs correctement."; return
  }
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
    } else ingError.value = j.message || "Erreur."
  } catch { ingError.value = "Impossible de contacter l'API." }
}

async function handleCreateRecipe(e) {
  e.preventDefault(); recError.value = null; recSuccess.value = null
  const priceVal = parseFloat(recSalePrice.value)
  if (!recName.value || isNaN(priceVal)) { recError.value = "Nom et prix requis."; return }
  try {
    const { data: j } = await api.createRecipe({ name: recName.value, sale_price: priceVal })
    if (j.status === 'success') {
      recSuccess.value = `Recette '${recName.value}' créée !`
      recName.value = ''; recSalePrice.value = ''
      app.fetchData(auth.user)
    } else recError.value = j.message || "Erreur."
  } catch { recError.value = "Impossible de contacter l'API." }
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
  if (!selectedIngId.value || !ingQtyNeeded.value) { ficheError.value = "Sélectionnez un ingrédient et saisissez une quantité."; return }
  const qty = parseFloat(ingQtyNeeded.value)
  if (isNaN(qty) || qty <= 0) { ficheError.value = "Quantité > 0 requise."; return }
  if (ficheIngredients.value.some(i => i.ingredient_id === parseInt(selectedIngId.value))) { ficheError.value = "Déjà présent."; return }
  ficheIngredients.value.push({ ingredient_id: parseInt(selectedIngId.value), quantity_needed: qty })
  selectedIngId.value = ''; ingQtyNeeded.value = ''
}

function handleRemoveIngredientFromFiche(ingId) {
  ficheIngredients.value = ficheIngredients.value.filter(i => i.ingredient_id !== ingId)
}

async function handleSaveFiche() {
  ficheError.value = null; ficheSuccess.value = null
  if (!selectedRecipeId.value) { ficheError.value = "Sélectionnez un produit."; return }
  try {
    const { data: j } = await api.saveRecipeIngredients(parseInt(selectedRecipeId.value), ficheIngredients.value)
    if (j.status === 'success') { ficheSuccess.value = "Fiche technique mise à jour !"; app.fetchData(auth.user) }
    else ficheError.value = j.message || "Erreur."
  } catch { ficheError.value = "Impossible de contacter l'API." }
}

async function handleAdjustStock(e) {
  e.preventDefault(); adjError.value = null; adjSuccess.value = null
  const qtyVal = parseFloat(adjQty.value)
  if (!adjDeptId.value || !adjIngId.value || isNaN(qtyVal) || qtyVal < 0) { adjError.value = "Champs requis."; return }
  const data = {
    department_id: parseInt(adjDeptId.value),
    ingredient_id: parseInt(adjIngId.value),
    quantity: adjType.value === 'decrease' ? -qtyVal : qtyVal,
    type: adjType.value === 'decrease' ? 'purchase' : adjType.value,
    reference_id: adjRef.value || undefined
  }
  try {
    const success = await app.handleAdjustSubmit(data, auth.user)
    if (success) {
      adjSuccess.value = "Ajustement enregistré !"
      adjQty.value = ''; adjRef.value = ''
      fetchDeptsAndMovements()
    } else adjError.value = "Erreur."
  } catch { adjError.value = "Impossible de contacter l'API." }
}

async function handleUserSubmit(e) {
  e.preventDefault(); userError.value = null; userSuccess.value = null
  if (!userUsername.value || !userRole.value) { userError.value = "Username et rôle requis."; return }
  if (!userId.value && !userPassword.value) { userError.value = "Mot de passe requis pour nouveau compte."; return }
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
      userSuccess.value = userId.value ? "Compte mis à jour !" : "Compte créé !"
      userId.value = null; userUsername.value = ''; userPassword.value = ''
      userRole.value = 'cook'; userFirstName.value = ''; userLastName.value = ''
      fetchUsers()
    } else userError.value = j.message || "Erreur."
  } catch { userError.value = "Impossible de contacter l'API." }
}

function handleEditUser(u) {
  userId.value = u.id; userUsername.value = u.username; userPassword.value = ''
  userRole.value = u.role; userFirstName.value = u.first_name || ''; userLastName.value = u.last_name || ''
}

async function handleDeleteUser(id) {
  if (!window.confirm("Supprimer ce compte ?")) return
  try {
    const { data: j } = await api.deleteUser(id)
    if (j.status === 'success') { userSuccess.value = "Supprimé."; fetchUsers() }
    else userError.value = j.message
  } catch { userError.value = "Erreur." }
}

async function handleDeptSubmit(e) {
  e.preventDefault(); deptError.value = null; deptSuccess.value = null
  if (!deptName.value) { deptError.value = "Nom requis."; return }
  try {
    const payload = { name: deptName.value, stock_type: deptStockType.value, description: deptDescription.value }
    const { data: j } = deptId.value
      ? await api.updateDepartment(deptId.value, payload)
      : await api.createDepartment(payload)
    if (j.status === 'success') {
      deptSuccess.value = deptId.value ? "Dépôt mis à jour !" : "Dépôt créé !"
      deptId.value = null; deptName.value = ''; deptDescription.value = ''
      fetchDeptsAndMovements()
      app.fetchData(auth.user)
    } else deptError.value = j.message
  } catch { deptError.value = "Erreur." }
}

function handleEditDept(d) {
  deptId.value = d.id; deptName.value = d.name
  deptStockType.value = d.stock_type; deptDescription.value = d.description || ''
}

async function handleDeleteDept(id) {
  if (!window.confirm("Supprimer ce dépôt ?")) return
  try {
    const { data: j } = await api.deleteDepartment(id)
    if (j.status === 'success') {
      deptSuccess.value = "Supprimé."
      fetchDeptsAndMovements()
      app.fetchData(auth.user)
    } else deptError.value = j.message
  } catch { deptError.value = "Erreur." }
}
</script>

<template>
  <div>
    <div class="view-title-section">
      <div>
        <h1 class="view-title">
          ⚙️ Paramétrage Système
        </h1>
        <p style="color: var(--text-secondary); margin-top: 0.25rem;">
          Gestion des fiches techniques, ingrédients, stocks et comptes utilisateurs.
        </p>
      </div>
    </div>

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

    <!-- Ingredients Tab -->
    <div
      v-if="subTab === 'ingredients'"
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;"
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
            <label class="form-label">Nom *</label><input
              v-model="ingName"
              class="form-input"
              placeholder="Ex: Fromage Cheddar"
              required
            >
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Unité Cuisine *</label><select
                v-model="ingUnit"
                class="form-select"
              >
                <option value="g">
                  gramme (g)
                </option><option value="ml">
                  millilitre (ml)
                </option><option value="pcs">
                  pièce (pcs)
                </option><option value="kg">
                  kilogramme (kg)
                </option><option value="l">
                  litre (l)
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Unité Achat *</label><input
                v-model="ingPurchaseUnit"
                class="form-input"
                placeholder="carton, sac..."
                required
              >
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Capacité Paquet *</label><input
                v-model="ingConversionFactor"
                type="number"
                step="any"
                class="form-input"
                placeholder="5000 (si 5kg en g)"
                required
              >
            </div>
            <div class="form-group">
              <label class="form-label">Prix Paquet (TND) *</label><input
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
            <label class="form-label">Seuil d'Alerte</label><input
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
              {{ getCalculatedBasePrice() }} TND / {{ ingUnit }}
            </div>
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%;"
            :disabled="app.isOffline"
          >
            Enregistrer l'ingrédient
          </button>
        </form>
      </div>
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.25rem; margin-bottom: 1.25rem;">
          Catalogue des Ingrédients
        </h2>
        <div class="table-wrapper">
          <table class="mepos-table">
            <thead><tr><th>Nom</th><th>Unité Achat</th><th>Capacité</th><th>Prix Colis</th><th>Coût Cuisine</th></tr></thead>
            <tbody>
              <tr
                v-for="ing in app.ingredients"
                :key="ing.id"
              >
                <td><strong style="color: var(--text-primary);">{{ ing.name }}</strong></td>
                <td><span class="badge badge-success">{{ ing.purchase_unit }}</span></td>
                <td>{{ parseFloat(ing.conversion_factor).toLocaleString() }} {{ ing.unit }}</td>
                <td>{{ parseFloat(ing.purchase_unit_price).toFixed(2) }} TND</td>
                <td style="color: var(--indigo-light); font-weight: 600;">
                  {{ parseFloat(ing.purchase_price_per_unit).toFixed(4) }} TND/{{ ing.unit }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Recipes Tab -->
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
              <label class="form-label">Nom du Produit *</label><input
                v-model="recName"
                class="form-input"
                placeholder="Ex: Cheeseburger"
                required
              >
            </div>
            <div class="form-group">
              <label class="form-label">Prix de Vente (TND) *</label><input
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
              :disabled="app.isOffline"
            >
              Créer le produit
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
              <thead><tr><th>Produit</th><th>Prix</th><th>Nb Ingr.</th></tr></thead>
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
          <label class="form-label">Produit à configurer *</label><select
            v-model="selectedRecipeId"
            class="form-select"
            @change="handleSelectRecipeForFiche(selectedRecipeId)"
          >
            <option value="">
              -- Choisir --
            </option><option
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
                <label class="form-label">Ingrédient</label><select
                  v-model="selectedIngId"
                  class="form-select"
                >
                  <option value="">
                    -- Choisir --
                  </option><option
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
                <label class="form-label">Grammage requis</label><input
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
            :disabled="app.isOffline"
            @click="handleSaveFiche"
          >
            Sauvegarder la fiche
          </button>
        </div>
      </div>
    </div>

    <!-- Stocks Adjustments Tab -->
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
            <label class="form-label">Dépôt *</label><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.25rem;">
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
            <label class="form-label">Ingrédient *</label><select
              v-model="adjIngId"
              class="form-select"
              required
            >
              <option value="">
                -- Choisir --
              </option><option
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
              <label class="form-label">Type d'ajustement *</label><select
                v-model="adjType"
                class="form-select"
              >
                <option value="purchase">
                  Entrée (Achat)
                </option><option value="reconciliation">
                  Réconciliation
                </option><option value="decrease">
                  Sortie (Retrait)
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Quantité *</label><input
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
            <label class="form-label">Référence</label><input
              v-model="adjRef"
              class="form-input"
              placeholder="Bon de commande, etc."
            >
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%; margin-top: 0.5rem;"
          >
            Appliquer l'ajustement
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
            <option value="all">
              Tous
            </option><option value="purchase_pos">
              Entrées
            </option><option value="purchase_neg">
              Sorties
            </option><option value="reconciliation">
              Réconciliation
            </option>
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

    <!-- Users Tab -->
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
              <label class="form-label">Prénom</label><input
                v-model="userFirstName"
                class="form-input"
                placeholder="Mohamed"
              >
            </div>
            <div class="form-group">
              <label class="form-label">Nom</label><input
                v-model="userLastName"
                class="form-input"
                placeholder="Ali"
              >
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Nom d'utilisateur *</label><input
              v-model="userUsername"
              class="form-input"
              placeholder="med"
              required
            >
          </div>
          <div class="form-group">
            <label class="form-label">Mot de passe {{ userId ? '(laisser vide pour garder)' : '*' }}</label><input
              v-model="userPassword"
              type="password"
              class="form-input"
              placeholder="••••••"
              :required="!userId"
            >
          </div>
          <div class="form-group">
            <label class="form-label">Rôle *</label><select
              v-model="userRole"
              class="form-select"
            >
              <option value="cook">
                Cuisinier / Comptoir
              </option><option value="manager">
                Gérant
              </option><option value="admin">
                Administrateur
              </option>
            </select>
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%; margin-top: 0.5rem;"
          >
            {{ userId ? 'Mettre à jour' : 'Créer le compte' }}
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
                      @click="handleDeleteUser(u.id)"
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

    <!-- Departments Tab -->
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
            <label class="form-label">Nom du Dépôt *</label><input
              v-model="deptName"
              class="form-input"
              placeholder="Ex: Cuisine Centrale"
              required
            >
          </div>
          <div class="form-group">
            <label class="form-label">Type de Stock *</label><select
              v-model="deptStockType"
              class="form-select"
            >
              <option value="isolated">
                Stock Isolé (Physique)
              </option><option value="inherited">
                Stock Hérité (Virtuel)
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label><input
              v-model="deptDescription"
              class="form-input"
              placeholder="Description optionnelle"
            >
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%; margin-top: 0.5rem;"
          >
            {{ deptId ? 'Mettre à jour' : 'Créer le dépôt' }}
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
                      @click="handleDeleteDept(d.id)"
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
  </div>
</template>
