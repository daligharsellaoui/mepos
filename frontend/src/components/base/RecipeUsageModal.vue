<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../../stores/app'
import Modal from './Modal.vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  ingredient: { type: Object, default: null }
})

const emit = defineEmits(['close'])

const router = useRouter()
const app = useAppStore()

const recipes = computed(() => {
  if (!props.ingredient) return []
  return app.recipes.filter(r =>
    r.ingredients?.some(i => i.ingredient_id === props.ingredient.id)
  ).map(r => {
    const ing = r.ingredients.find(i => i.ingredient_id === props.ingredient.id)
    return { ...r, quantity_needed: ing ? ing.quantity_needed : 0 }
  })
})

function navigateToRecipe(recipeId) {
  emit('close')
  router.push('/settings')
}
</script>

<template>
  <Modal
    :is-open="isOpen"
    :title="ingredient ? `Recettes contenant « ${ingredient.name} »` : 'Recettes'"
    max-width="620px"
    @close="emit('close')"
  >
    <div v-if="recipes.length === 0" style="padding: 2rem 0; text-align: center; color: var(--text-secondary);">
      Aucune recette n'utilise cet ingrédient.
    </div>
    <div v-else style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
      <div
        v-for="recipe in recipes"
        :key="recipe.id"
        class="recipe-usage-card"
        tabindex="0"
        role="button"
        :aria-label="`Voir la recette ${recipe.name}`"
        @click="navigateToRecipe(recipe.id)"
        @keydown.enter="navigateToRecipe(recipe.id)"
      >
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">{{ recipe.name }}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">
              {{ recipe.ingredients?.length || 0 }} ingrédient(s)
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Quantité utilisée</div>
            <div style="font-weight: 700; color: var(--indigo-light);">{{ recipe.quantity_needed }} {{ ingredient?.unit || '' }}</div>
          </div>
        </div>
        <div v-if="recipe.sale_price" style="margin-top: 0.4rem; font-size: 0.8rem; color: var(--emerald);">
          Prix vente: {{ parseFloat(recipe.sale_price).toFixed(2) }} TND
        </div>
      </div>
    </div>
    <template #footer>
      <button class="touch-btn touch-btn-secondary" style="width: 100%;" @click="emit('close')">Fermer</button>
    </template>
  </Modal>
</template>

<style scoped>
.recipe-usage-card {
  padding: 0.9rem 1rem;
  background: rgba(255,255,255,0.01);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
}
.recipe-usage-card:hover {
  background: rgba(99,102,241,0.04);
  border-color: rgba(99,102,241,0.2);
}
.recipe-usage-card:focus-visible {
  outline: 2px solid var(--indigo);
  outline-offset: 2px;
}
</style>