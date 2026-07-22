<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { api } from '../api'
import PageContainer from '../components/base/PageContainer.vue'
import EmptyState from '../components/base/EmptyState.vue'

const auth = useAuthStore()

const recipes = ref([])
const isLoading = ref(true)
const search = ref('')
const page = ref(1)
const perPage = 10
const showForm = ref(false)
const editingRecipe = ref(null)
const form = ref({ name: '', sale_price: '' })
const saving = ref(false)
const error = ref('')
const detailRecipe = ref(null)

const filtered = computed(() => {
  let list = recipes.value
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(r => r.name.toLowerCase().includes(q))
  }
  return list
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / perPage)))

const paginated = computed(() => {
  const start = (page.value - 1) * perPage
  return filtered.value.slice(start, start + perPage)
})

onMounted(() => fetchRecipes())

async function fetchRecipes() {
  isLoading.value = true
  try {
    const res = await api.getRecipes()
    if (res.data.status === 'success') {
      recipes.value = res.data.data || []
    }
  } catch (err) {
    console.error('[Recipes] fetch error:', err)
  }
  finally { isLoading.value = false }
}

function openCreate() {
  editingRecipe.value = null
  form.value = { name: '', sale_price: '' }
  error.value = ''
  showForm.value = true
}

function openEdit(recipe) {
  editingRecipe.value = recipe
  form.value = { name: recipe.name, sale_price: recipe.sale_price }
  error.value = ''
  showForm.value = true
}

async function saveRecipe() {
  if (!form.value.name.trim()) {
    error.value = 'Le nom de la recette est requis.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload = { name: form.value.name.trim(), sale_price: parseFloat(form.value.sale_price) || 0 }
    if (editingRecipe.value) {
      await api.updateRecipe(editingRecipe.value.id, payload)
    } else {
      await api.createRecipe(payload)
    }
    showForm.value = false
    await fetchRecipes()
  } catch (err) {
    console.error('[Recipes] save error:', err)
    error.value = err?.response?.data?.message || 'Erreur lors de l\'enregistrement.'
  }
  finally { saving.value = false }
}

function showDetail(recipe) {
  detailRecipe.value = recipe
}
</script>

<template>
  <PageContainer title="Gestion des Recettes" subtitle="Créez, modifiez et consultez toutes les recettes.">
    <template #actions>
      <button v-if="auth.user?.role !== 'cook'" class="touch-btn touch-btn-primary" @click="openCreate">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nouvelle Recette
      </button>
    </template>

    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <!-- Search + count -->
      <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
        <input v-model="search" class="form-input" placeholder="Rechercher une recette..." style="flex: 1; min-width: 200px;">
        <span style="font-size: 0.85rem; color: var(--text-secondary);">{{ filtered.length }} recette(s)</span>
      </div>

      <!-- Table -->
      <div v-if="isLoading" style="display: flex; justify-content: center; padding: 3rem;">
        <div class="spinner" />
      </div>
      <template v-else-if="paginated.length === 0">
        <EmptyState title="Aucune recette" description="Créez votre première recette avec le bouton ci-dessus." />
      </template>
      <div v-else class="table-wrapper">
        <table class="mepos-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prix de vente</th>
              <th>Ingrédients</th>
              <th style="width: 200px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="rec in paginated" :key="rec.id">
              <td><strong>{{ rec.name }}</strong></td>
              <td>{{ parseFloat(rec.sale_price || 0).toFixed(3) }} TND</td>
              <td>{{ rec.ingredients?.length || 0 }} ingrédient(s)</td>
              <td>
                <div style="display: flex; gap: 0.5rem;">
                  <button class="touch-btn touch-btn-secondary" style="padding: 0.35rem 1rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.35rem;" @click="showDetail(rec)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Détails
                  </button>
                  <button v-if="auth.user?.role !== 'cook'" class="touch-btn touch-btn-secondary" style="padding: 0.35rem 1rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.35rem;" @click="openEdit(rec)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Modifier
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" style="display: flex; justify-content: center; align-items: center; gap: 0.5rem; padding: 1rem 0;">
        <button class="touch-btn touch-btn-secondary" style="padding: 0.35rem 1rem; font-size: 0.8rem;" :disabled="page <= 1" @click="page = Math.max(1, page - 1)">← Précédent</button>
        <span style="font-size: 0.85rem; color: var(--text-secondary);">Page {{ page }} / {{ totalPages }}</span>
        <button class="touch-btn touch-btn-secondary" style="padding: 0.35rem 1rem; font-size: 0.8rem;" :disabled="page >= totalPages" @click="page = Math.min(totalPages, page + 1)">Suivant →</button>
      </div>
    </div>

    <!-- Recipe Form Modal -->
    <Teleport to="body">
      <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
        <div class="glass-panel modal-content" style="max-width: 480px;">
          <div class="modal-header">
            <h3 class="modal-title">{{ editingRecipe ? 'Modifier la recette' : 'Nouvelle recette' }}</h3>
            <button class="btn-close" @click="showForm = false">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body-scroll" style="display: flex; flex-direction: column; gap: 1rem;">
            <div v-if="error" style="padding: 0.75rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; color: #fca5a5; font-size: 0.85rem;">
              {{ error }}
            </div>
            <div>
              <label class="form-label">Nom de la recette</label>
              <input v-model="form.name" class="form-input" placeholder="Ex: Pizza Margherita">
            </div>
            <div>
              <label class="form-label">Prix de vente (TND)</label>
              <input v-model="form.sale_price" class="form-input" type="number" step="0.001" min="0" placeholder="0.000">
            </div>
          </div>
          <div class="modal-footer">
            <button class="touch-btn touch-btn-secondary" @click="showForm = false">Annuler</button>
            <button class="touch-btn" :disabled="saving" @click="saveRecipe">
              {{ saving ? 'Enregistrement...' : (editingRecipe ? 'Modifier' : 'Créer') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Recipe Detail Modal -->
    <Teleport to="body">
      <div v-if="detailRecipe" class="modal-overlay" @click.self="detailRecipe = null">
        <div class="glass-panel modal-content" style="max-width: 520px;">
          <div class="modal-header">
            <h3 class="modal-title">{{ detailRecipe.name }}</h3>
            <button class="btn-close" @click="detailRecipe = null">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body-scroll" style="display: flex; flex-direction: column; gap: 1rem;">
            <div style="display: flex; gap: 1.5rem; font-size: 0.9rem; flex-wrap: wrap;">
              <span style="color: var(--text-secondary);">Prix de vente : <strong style="color: var(--emerald);">{{ parseFloat(detailRecipe.sale_price || 0).toFixed(3) }} TND</strong></span>
              <span style="color: var(--text-secondary);">Ingrédients : <strong>{{ detailRecipe.ingredients?.length || 0 }}</strong></span>
            </div>
            <div v-if="!detailRecipe.ingredients || detailRecipe.ingredients.length === 0" style="text-align: center; padding: 2rem; color: var(--text-muted);">
              Aucun ingrédient configuré pour cette recette.
            </div>
            <div v-else class="table-wrapper">
              <table class="mepos-table">
                <thead>
                  <tr><th>Ingrédient</th><th>Quantité</th><th>Unité</th></tr>
                </thead>
                <tbody>
                  <tr v-for="ing in detailRecipe.ingredients" :key="ing.ingredient_id">
                    <td data-label="Ingrédient">{{ ing.name || ing.ingredient_name || `#${ing.ingredient_id}` }}</td>
                    <td data-label="Quantité">{{ parseFloat(ing.quantity_needed).toFixed(2) }}</td>
                    <td data-label="Unité">{{ ing.unit || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="touch-btn touch-btn-secondary" @click="detailRecipe = null">Fermer</button>
            <button v-if="auth.user?.role !== 'cook'" class="touch-btn" @click="openEdit(detailRecipe); detailRecipe = null">
              Modifier
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </PageContainer>
</template>
