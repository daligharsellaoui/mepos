<script setup>
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import Modal from '../components/base/Modal.vue'

const auth = useAuthStore()
const app = useAppStore()

const isAdmin = computed(() => auth.isAdmin)
const isCook = computed(() => auth.isCook)

const isModalOpen = ref(false)
const selectedDept = ref('')
const selectedIng = ref('')
const quantity = ref('')
const reason = ref('spoilage')
const errorMsg = ref(null)

function findKitchenDept() {
  return app.departments.find(d =>
    d.name.toLowerCase().includes('cuisine') ||
    d.name.toLowerCase().includes('kitchen')
  ) || app.departments.find(d => d.stock_type === 'isolated' && d.id !== 1) || app.departments[0]
}

watch(() => app.departments, (depts) => {
  if (depts.length > 0 && isCook.value) {
    const kitchen = findKitchenDept()
    selectedDept.value = kitchen ? kitchen.id.toString() : ''
  }
}, { immediate: true })

function getReasonLabel(r) {
  switch (r) {
    case 'spoilage': return 'Périmé / Gâté'
    case 'theft': return 'Vol / Disparition'
    case 'preparation_error': return 'Erreur de Préparation'
    default: return r
  }
}

async function handleSubmit() {
  errorMsg.value = null

  if (!selectedDept.value || !selectedIng.value || !quantity.value) {
    errorMsg.value = "Veuillez remplir tous les champs obligatoires."
    return
  }

  const qtyVal = parseFloat(quantity.value)
  if (isNaN(qtyVal) || qtyVal <= 0) {
    errorMsg.value = "La quantité doit être supérieure à 0."
    return
  }

  const stockRow = app.stocks.find(
    s => s.department_id === parseInt(selectedDept.value) && s.ingredient_id === parseInt(selectedIng.value)
  )
  const availableQty = stockRow ? parseFloat(stockRow.quantity) : 0

  if (qtyVal > availableQty) {
    if (!window.confirm(`Attention: Le stock disponible est de ${availableQty.toFixed(2)}. Continuer ?`)) return
  }

  const success = await app.handleLossSubmit({
    department_id: parseInt(selectedDept.value),
    ingredient_id: parseInt(selectedIng.value),
    quantity: qtyVal,
    loss_reason: reason.value,
    reported_by: auth.user?.id
  }, auth.user)

  if (success) {
    quantity.value = ''
    selectedIng.value = ''
    if (!isCook.value) selectedDept.value = ''
    isModalOpen.value = false
  } else {
    errorMsg.value = "Erreur lors de la déclaration de la perte."
  }
}
</script>

<template>
  <div>
    <div class="view-title-section">
      <div>
        <h1 class="view-title">
          Registre des Pertes
        </h1>
        <p style="color: var(--text-secondary); margin-top: 0.25rem;">
          Déclarer et suivre le gaspillage et les freintes.
        </p>
      </div>
      <div style="display: flex; gap: 0.75rem;">
        <button
          class="touch-btn touch-btn-secondary"
          @click="app.fetchData(auth.user)"
        >
          Actualiser
        </button>
        <button
          class="touch-btn"
          @click="isModalOpen = true"
        >
          + Déclarer une perte
        </button>
      </div>
    </div>

    <div class="glass-panel table-wrapper">
      <div
        v-if="app.losses.length === 0"
        style="padding: 2rem; text-align: center; color: var(--text-secondary);"
      >
        Aucune perte déclarée.
      </div>
      <table
        v-else
        class="mepos-table"
      >
        <thead>
          <tr>
            <th>Date</th>
            <th>Ingrédient</th>
            <th>Dépôt</th>
            <th>Quantité Perdue</th>
            <th>Motif</th>
            <th>Déclaré par</th>
            <th>Perte Sèche</th>
            <th>Manque à Gagner</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="loss in app.losses"
            :key="loss.id"
          >
            <td
              data-label="Date"
              style="color: var(--text-secondary); font-size: 0.875rem;"
            >
              {{ new Date(loss.created_at).toLocaleString('fr-TN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
            </td>
            <td data-label="Ingrédient">
              <strong>{{ loss.ingredient_name }}</strong>
            </td>
            <td data-label="Dépôt">
              {{ loss.department_name }}
            </td>
            <td
              data-label="Quantité"
              style="font-weight: 600;"
            >
              {{ parseFloat(loss.quantity).toFixed(2) }} {{ loss.unit }}
            </td>
            <td data-label="Motif">
              <span class="badge badge-warn">{{ getReasonLabel(loss.loss_reason) }}</span>
            </td>
            <td
              data-label="Déclaré par"
              style="color: var(--text-secondary);"
            >
              {{ loss.reported_by_username || '—' }}
            </td>
            <td
              data-label="Perte Sèche"
              style="color: #ef4444; font-weight: 600;"
            >
              {{ isAdmin ? `-${parseFloat(loss.cost_loss).toFixed(2)} TND` : '*** TND' }}
            </td>
            <td
              data-label="Manque à Gagner"
              style="color: var(--amber); font-weight: 600;"
            >
              {{ isAdmin ? `-${parseFloat(loss.opportunity_loss).toFixed(2)} TND` : '*** TND' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Declare Loss Modal -->
    <Modal
      :is-open="isModalOpen"
      title="Déclarer une Perte"
      max-width="520px"
      @close="isModalOpen = false"
    >
      <div
        v-if="errorMsg"
        class="alert-banner alert-banner-danger"
        style="margin-bottom: 1rem;"
      >
        <span>{{ errorMsg }}</span>
      </div>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label class="form-label">Dépôt *</label>
          <select
            v-model="selectedDept"
            class="form-select"
            :disabled="isCook"
            required
          >
            <option value="">
              -- Choisir --
            </option>
            <option
              v-for="d in app.departments"
              :key="d.id"
              :value="d.id"
            >
              {{ d.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Ingrédient *</label>
          <select
            v-model="selectedIng"
            class="form-select"
            required
          >
            <option value="">
              -- Choisir --
            </option>
            <option
              v-for="ing in app.ingredients"
              :key="ing.id"
              :value="ing.id"
            >
              {{ ing.name }} ({{ ing.unit }})
            </option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Quantité perdue *</label>
          <input
            v-model="quantity"
            type="number"
            step="any"
            class="form-input"
            placeholder="Ex: 5.0"
            required
          >
        </div>
        <div class="form-group">
          <label class="form-label">Motif *</label>
          <select
            v-model="reason"
            class="form-select"
          >
            <option value="spoilage">
              Périmé / Gâté
            </option>
            <option value="theft">
              Vol / Disparition
            </option>
            <option value="preparation_error">
              Erreur de Préparation
            </option>
            <option value="overproduction">
              Surproduction
            </option>
            <option value="other">
              Autre
            </option>
          </select>
        </div>
        <div
          class="modal-footer"
          style="margin-top: 1rem;"
        >
          <button
            type="button"
            class="touch-btn touch-btn-secondary"
            @click="isModalOpen = false"
          >
            Annuler
          </button>
          <button
            type="submit"
            class="touch-btn touch-btn-danger"
          >
            Confirmer la perte
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
