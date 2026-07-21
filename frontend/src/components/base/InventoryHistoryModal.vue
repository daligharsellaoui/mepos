<script setup>
import { ref, watch } from 'vue'
import { api } from '../../api'
import Modal from './Modal.vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  ingredient: { type: Object, default: null }
})

const emit = defineEmits(['close'])

const movements = ref([])
const loading = ref(false)
const error = ref(null)

watch(() => props.isOpen, async (val) => {
  if (val && props.ingredient) {
    await fetchMovements()
  }
})

async function fetchMovements() {
  loading.value = true
  error.value = null
  try {
    const { data: res } = await api.getMovements({ ingredient_id: props.ingredient.id })
    if (res.status === 'success') {
      movements.value = res.data
    } else {
      error.value = res.message || 'Erreur lors du chargement.'
    }
  } catch {
    error.value = "Impossible de contacter l'API."
  } finally {
    loading.value = false
  }
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('fr-TN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function movementTypeLabel(type) {
  const labels = {
    purchase: 'Achat',
    reconciliation: 'Réconciliation',
    transfer_out: 'Transfert Sortie',
    transfer_in: 'Transfert Entrée',
    sale: 'Vente',
    adjustment: 'Ajustement',
    waste: 'Perte',
    spoilage: 'Avarié',
    synchronization: 'Synchronisation'
  }
  return labels[type] || type
}

function movementIcon(type) {
  const icons = {
    purchase: '+',
    reconciliation: '⟳',
    transfer_out: '→',
    transfer_in: '←',
    sale: '−',
    adjustment: '±',
    waste: '✕',
    spoilage: '⚠',
    synchronization: '⇄'
  }
  return icons[type] || '•'
}
</script>

<template>
  <Modal
    :is-open="isOpen"
    :title="ingredient ? `Historique — ${ingredient.name}` : 'Historique'"
    max-width="720px"
    @close="emit('close')"
  >
    <div v-if="loading" style="padding: 2rem 0; text-align: center;">
      <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--indigo); border-radius: 50%; animation: spin 1s linear infinite;" />
      <p style="color: var(--text-secondary); margin-top: 0.75rem; font-size: 0.9rem;">Chargement...</p>
    </div>
    <div v-else-if="error" style="padding: 1rem; color: var(--coral);">
      {{ error }}
    </div>
    <div v-else-if="movements.length === 0" style="padding: 2rem 0; text-align: center; color: var(--text-secondary);">
      Aucun mouvement trouvé pour cet ingrédient.
    </div>
    <div v-else class="table-wrapper" style="max-height: 400px; overflow-y: auto; margin-top: 0.5rem;">
      <table class="mepos-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Opération</th>
            <th>Qté</th>
            <th>Dépôt</th>
            <th>Référence</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="mov in movements" :key="mov.id">
            <td style="font-size: 0.85rem; white-space: nowrap;">{{ formatDate(mov.created_at) }}</td>
            <td>
              <span class="movement-type-badge" :class="`movement-type-${mov.type}`">
                {{ movementIcon(mov.type) }} {{ movementTypeLabel(mov.type) }}
              </span>
            </td>
            <td :style="{ color: parseFloat(mov.quantity) >= 0 ? 'var(--emerald)' : 'var(--coral)', fontWeight: 700 }">
              {{ parseFloat(mov.quantity) >= 0 ? '+' : '' }}{{ parseFloat(mov.quantity).toFixed(2) }}
            </td>
            <td>{{ mov.department_name }}</td>
            <td style="font-size: 0.85rem; color: var(--text-muted);">{{ mov.reference_id || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <template #footer>
      <button class="touch-btn touch-btn-secondary" style="width: 100%;" @click="emit('close')">Fermer</button>
    </template>
  </Modal>
</template>

<style scoped>
.movement-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}
.movement-type-purchase { background: rgba(16,185,129,0.1); color: var(--emerald); }
.movement-type-reconciliation { background: rgba(99,102,241,0.1); color: var(--indigo-light); }
.movement-type-transfer_out { background: rgba(245,158,11,0.1); color: var(--amber); }
.movement-type-transfer_in { background: rgba(59,130,246,0.1); color: var(--blue); }
.movement-type-sale { background: rgba(239,68,68,0.1); color: var(--coral); }
.movement-type-adjustment { background: rgba(255,255,255,0.05); color: var(--text-secondary); }
.movement-type-waste { background: rgba(239,68,68,0.1); color: var(--coral); }
.movement-type-spoilage { background: rgba(245,158,11,0.1); color: var(--amber); }
.movement-type-synchronization { background: rgba(99,102,241,0.1); color: var(--indigo-light); }
</style>