<script setup>
import { ref, watch } from 'vue'
import { api } from '../../api'
import Modal from './Modal.vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  stock: { type: Object, default: null },
  departments: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'saved'])

const destDeptId = ref('')
const transferQty = ref('')
const isSaving = ref(false)
const error = ref('')
const success = ref('')

const availableDepts = ref([])

function reset() {
  destDeptId.value = ''
  transferQty.value = ''
  error.value = ''
  success.value = ''
}

function init() {
  reset()
  if (props.stock) {
    availableDepts.value = (props.departments || []).filter(d => d.id !== props.stock.department_id)
    if (availableDepts.value.length === 1) destDeptId.value = availableDepts.value[0].id.toString()
  }
}

watch(() => props.isOpen, (val) => {
  if (val) init()
})

async function handleTransfer() {
  error.value = ''
  success.value = ''
  isSaving.value = true
  try {
    const { data: res } = await api.transferStock({
      source_department_id: props.stock.department_id,
      destination_department_id: parseInt(destDeptId.value, 10),
      ingredient_id: props.stock.ingredient_id,
      quantity: parseFloat(transferQty.value),
    })
    if (res.status === 'success') {
      success.value = 'Transfert effectué avec succès.'
      setTimeout(() => {
        emit('saved')
        emit('close')
      }, 1200)
    } else {
      error.value = res.message || 'Erreur lors du transfert.'
    }
  } catch (err) {
    error.value = err.response?.data?.message || err.message || 'Erreur réseau.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Modal :is-open="isOpen" title="Transférer le stock" max-width="480px" @close="emit('close')">
    <div v-if="stock" style="margin-bottom: 1rem;">
      <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        <strong style="color: var(--text-primary);">{{ stock.ingredient_name }}</strong>
        <span class="badge badge-warn">{{ stock.department_name }}</span>
      </div>
      <div style="margin-top: 0.25rem; color: var(--text-secondary); font-size: 0.85rem;">
        Quantité disponible: <strong>{{ parseFloat(stock.quantity).toFixed(2) }} {{ stock.unit }}</strong>
      </div>
    </div>

    <div v-if="error" class="alert-banner alert-banner-danger" style="margin-bottom: 1rem;">{{ error }}</div>
    <div v-if="success" class="alert-banner" style="margin-bottom: 1rem; background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.15); color: var(--emerald);">{{ success }}</div>

    <form @submit.prevent="handleTransfer">
      <div class="form-group">
        <label class="form-label">Dépôt de destination *</label>
        <select v-model="destDeptId" class="form-select" required>
          <option value="">-- Choisir --</option>
          <option v-for="d in availableDepts" :key="d.id" :value="d.id">
            {{ d.name }} ({{ d.stock_type === 'inherited' ? 'Hérité' : 'Isolé' }})
          </option>
        </select>
      </div>
      <div class="form-group" style="margin-top: 1rem;">
        <label class="form-label">Quantité à transférer *</label>
        <input v-model="transferQty" type="number" step="any" min="0" :max="parseFloat(stock.quantity)" class="form-input" placeholder="5.0" required>
      </div>
    </form>

    <template #footer>
      <button class="touch-btn touch-btn-secondary" style="flex: 1;" @click="emit('close')">Annuler</button>
      <button class="touch-btn" style="flex: 1;" :disabled="isSaving || !transferQty || !destDeptId" @click="handleTransfer">
        <span v-if="isSaving" class="spinner" style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;" />
        <span v-else>Transférer</span>
      </button>
    </template>
  </Modal>
</template>
