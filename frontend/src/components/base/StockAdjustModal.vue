<script setup>
import { ref, computed, watch } from 'vue'
import { api } from '../../api'
import Modal from './Modal.vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  stock: { type: Object, default: null },
  departments: { type: Array, default: () => [] },
  ingredients: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'saved'])

const isNew = computed(() => !props.stock?.ingredient_id)

const adjDeptId = ref('')
const adjIngId = ref('')
const adjType = ref('purchase')
const adjQty = ref('')
const adjRef = ref('')
const isSaving = ref(false)
const error = ref('')
const success = ref('')

function reset() {
  adjDeptId.value = ''
  adjIngId.value = ''
  adjType.value = 'purchase'
  adjQty.value = ''
  adjRef.value = ''
  error.value = ''
  success.value = ''
}

function init() {
  reset()
  if (props.stock?.department_id) adjDeptId.value = props.stock.department_id.toString()
  if (props.stock?.ingredient_id) adjIngId.value = props.stock.ingredient_id.toString()
}

watch(() => props.isOpen, (val) => {
  if (val) init()
})

async function handleSubmit() {
  error.value = ''
  success.value = ''
  isSaving.value = true
  try {
    const { data: res } = await api.adjustStock({
      department_id: parseInt(adjDeptId.value, 10),
      ingredient_id: parseInt(adjIngId.value, 10),
      quantity: parseFloat(adjQty.value),
      type: adjType.value,
      reference_id: adjRef.value || undefined,
    })
    if (res.status === 'success') {
      success.value = 'Ajustement appliqué avec succès.'
      setTimeout(() => {
        emit('saved')
        emit('close')
      }, 1200)
    } else {
      error.value = res.message || 'Erreur lors de l\'ajustement.'
    }
  } catch (err) {
    error.value = err.response?.data?.message || err.message || 'Erreur réseau.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Modal :is-open="isOpen" title="Ajuster le stock" max-width="480px" @close="emit('close')">
    <div v-if="stock && !isNew" style="margin-bottom: 1rem;">
      <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        <strong style="color: var(--text-primary);">{{ stock.ingredient_name }}</strong>
        <span class="badge badge-success">{{ stock.department_name }}</span>
      </div>
      <div style="margin-top: 0.25rem; color: var(--text-secondary); font-size: 0.85rem;">
        Quantité actuelle: <strong>{{ parseFloat(stock.quantity).toFixed(2) }} {{ stock.unit }}</strong>
      </div>
    </div>

    <div v-if="error" class="alert-banner alert-banner-danger" style="margin-bottom: 1rem;">{{ error }}</div>
    <div v-if="success" class="alert-banner" style="margin-bottom: 1rem; background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.15); color: var(--emerald);">{{ success }}</div>

    <form @submit.prevent="handleSubmit">
      <div v-if="isNew" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label class="form-label">Dépôt *</label>
          <select v-model="adjDeptId" class="form-select" required>
            <option value="">-- Choisir --</option>
            <option v-for="d in departments" :key="d.id" :value="d.id">
              {{ d.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Ingrédient *</label>
          <select v-model="adjIngId" class="form-select" required>
            <option value="">-- Choisir --</option>
            <option v-for="ing in ingredients" :key="ing.id" :value="ing.id">
              {{ ing.name }}
            </option>
          </select>
        </div>
      </div>
      <div class="form-group" :style="{ marginTop: isNew ? '1rem' : '0' }">
        <label class="form-label">Type d'ajustement *</label>
        <select v-model="adjType" class="form-select" required>
          <option value="purchase">Entrée (Achat)</option>
          <option value="reconciliation">Réconciliation</option>
          <option value="decrease">Sortie (Retrait)</option>
        </select>
      </div>
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label">Quantité *</label>
        <input v-model="adjQty" type="number" step="any" min="0" class="form-input" placeholder="5.0" required>
      </div>
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label">Référence</label>
        <input v-model="adjRef" class="form-input" placeholder="Bon de commande, etc.">
      </div>
    </form>

    <template #footer>
      <button class="touch-btn touch-btn-secondary" style="flex: 1;" @click="emit('close')">Annuler</button>
      <button class="touch-btn" style="flex: 1;" :disabled="isSaving || !adjQty" @click="handleSubmit">
        <span v-if="isSaving" class="spinner" style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;" />
        <span v-else>Appliquer</span>
      </button>
    </template>
  </Modal>
</template>
