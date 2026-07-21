<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { api } from '../api'

const auth = useAuthStore()
const app = useAppStore()

const isAdminOrManager = computed(() => auth.isAdmin || auth.isManager)
const isCook = computed(() => auth.isCook)

function findCentralDept() {
  return app.departments.find(d =>
    d.name.toLowerCase().includes('central') ||
    d.name.toLowerCase().includes('principal') ||
    d.name.toLowerCase().includes('main')
  ) || app.departments[0]
}

function findKitchenDept() {
  return app.departments.find(d =>
    d.name.toLowerCase().includes('cuisine') ||
    d.name.toLowerCase().includes('kitchen')
  ) || app.departments.find(d => d.id !== (findCentralDept()?.id || null)) || app.departments[0]
}

const centralDept = computed(() => findCentralDept())
const kitchenDept = computed(() => findKitchenDept())
const centralId = computed(() => centralDept.value ? centralDept.value.id : 1)
const kitchenId = computed(() => kitchenDept.value ? kitchenDept.value.id : 2)

const srcDept = ref('')
const destDept = ref('')
const selectedIng = ref('')
const quantity = ref('')
const errorMsg = ref(null)
const successMsg = ref(null)
const isSubmitting = ref(false)
const requests = ref([])

const requestPage = ref(1)
const requestPerPage = ref(10)

const paginatedRequests = computed(() => {
  const start = (requestPage.value - 1) * requestPerPage.value
  return requests.value.slice(start, start + requestPerPage.value)
})

const totalRequestPages = computed(() => Math.max(1, Math.ceil(requests.value.length / requestPerPage.value)))

watch(() => requests.value.length, () => { requestPage.value = 1 })

watch(() => app.departments, (depts) => {
  if (depts.length > 0) {
    srcDept.value = centralId.value.toString()
    destDept.value = isCook.value ? kitchenId.value.toString() : ''
  }
}, { immediate: true })

async function fetchRequests() {
  try {
    const { data: resJson } = await api.getTransferRequests()
    if (resJson.status === 'success') {
      if (isCook.value) {
        requests.value = resJson.data.filter(r => r.destination_department_id === kitchenId.value || r.source_department_id === kitchenId.value)
      } else {
        requests.value = resJson.data
      }
    }
  } catch (err) {
    console.error('Error fetching transfer requests:', err)
  }
}

let interval = null
onMounted(() => { fetchRequests(); interval = setInterval(fetchRequests, 5000) })
onUnmounted(() => { if (interval) clearInterval(interval) })

async function handleSubmit() {
  errorMsg.value = null
  successMsg.value = null

  if (!srcDept.value || !destDept.value || !selectedIng.value || !quantity.value) {
    errorMsg.value = "Veuillez remplir tous les champs."
    return
  }
  if (srcDept.value === destDept.value) {
    errorMsg.value = "Les dépôts doivent être différents."
    return
  }
  const qtyVal = parseFloat(quantity.value)
  if (isNaN(qtyVal) || qtyVal <= 0) {
    errorMsg.value = "La quantité doit être supérieure à 0."
    return
  }

  const srcStock = app.stocks.find(s => s.department_id === parseInt(srcDept.value) && s.ingredient_id === parseInt(selectedIng.value))
  if (qtyVal > (srcStock ? parseFloat(srcStock.quantity) : 0)) {
    errorMsg.value = `Stock insuffisant. Disponible: ${srcStock ? parseFloat(srcStock.quantity).toFixed(2) : 0}.`
    return
  }

  isSubmitting.value = true
  try {
    if (isCook.value) {
      const { data: resJson } = await api.createTransferRequest({
        source_department_id: parseInt(srcDept.value),
        destination_department_id: parseInt(destDept.value),
        ingredient_id: parseInt(selectedIng.value),
        quantity: qtyVal,
        requested_by: auth.user?.id
      })
      if (resJson.status === 'success') {
        successMsg.value = "Demande de recharge soumise !"
        quantity.value = ''; selectedIng.value = ''
        fetchRequests()
      } else {
        errorMsg.value = resJson.message || "Erreur."
      }
    } else {
      const success = await app.handleTransferSubmit({
        source_department_id: parseInt(srcDept.value),
        destination_department_id: parseInt(destDept.value),
        ingredient_id: parseInt(selectedIng.value),
        quantity: qtyVal
      }, auth.user)
      if (success) {
        successMsg.value = "Transfert effectué avec succès !"
        quantity.value = ''; selectedIng.value = ''; destDept.value = ''
        fetchRequests()
      } else {
        errorMsg.value = "Erreur lors du transfert."
      }
    }
  } catch {
    errorMsg.value = "Erreur réseau."
  } finally {
    isSubmitting.value = false
  }
}

async function handleValidateRequest(id) {
  if (!window.confirm("Approuver cette demande ?")) return
  try {
    const { data: resJson } = await api.approveTransferRequest(id, auth.user?.id)
    if (resJson.status === 'success') { alert("Demande approuvée !"); fetchRequests(); app.fetchData(auth.user) }
    else alert("Erreur: " + resJson.message)
  } catch { alert("Erreur de connexion.") }
}

async function handleRejectRequest(id) {
  if (!window.confirm("Rejeter cette demande ?")) return
  try {
    const { data: resJson } = await api.rejectTransferRequest(id, auth.user?.id)
    if (resJson.status === 'success') { alert("Demande rejetée."); fetchRequests() }
    else alert("Erreur: " + resJson.message)
  } catch { alert("Erreur de connexion.") }
}
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 2rem;">
    <div class="view-title-section">
      <div>
        <h1 class="view-title">
          📦 Recharges & Transferts
        </h1>
        <p style="color: var(--text-secondary); margin-top: 0.25rem;">
          {{ isCook ? "Demander le réapprovisionnement de votre cuisine." : "Valider les recharges et gérer les transferts directs." }}
        </p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;">
      <!-- Transfer Form -->
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.4rem; margin-bottom: 0.5rem;">
          {{ isCook ? "Demander une recharge" : "Transfert Direct" }}
        </h2>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
          {{ isCook ? "Demande à valider par le gérant." : "Transférer instantanément les stocks." }}
        </p>

        <div
          v-if="errorMsg"
          class="alert-banner alert-banner-danger"
        >
          <span>{{ errorMsg }}</span>
        </div>
        <div
          v-if="successMsg"
          class="alert-banner"
          style="background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.2); color: var(--emerald);"
        >
          <span>{{ successMsg }}</span>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="form-group">
            <label class="form-label">Dépôt Source</label>
            <input
              v-if="isCook"
              type="text"
              class="form-input"
              :value="centralDept?.name || 'Dépôt Central'"
              disabled
            >
            <select
              v-else
              v-model="srcDept"
              class="form-select"
            >
              <option
                v-for="d in app.departments.filter(d => d.stock_type === 'isolated')"
                :key="d.id"
                :value="d.id"
              >
                {{ d.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Dépôt Destination *</label>
            <input
              v-if="isCook"
              type="text"
              class="form-input"
              :value="kitchenDept?.name || 'Cuisine Centrale'"
              disabled
            >
            <select
              v-else
              v-model="destDept"
              class="form-select"
              required
            >
              <option value="">
                -- Choisir --
              </option>
              <option
                v-for="d in app.departments.filter(d => d.stock_type === 'isolated' && d.id !== parseInt(srcDept))"
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
                {{ ing.name }} (Dispo: {{ (app.stocks.find(s => s.department_id === parseInt(srcDept) && s.ingredient_id === ing.id)?.quantity || '0') }} {{ ing.unit }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Quantité *</label>
            <input
              v-model="quantity"
              type="number"
              step="any"
              class="form-input"
              placeholder="Ex: 5.0"
              required
            >
          </div>
          <button
            type="submit"
            class="touch-btn"
            style="width: 100%; margin-top: 1rem;"
            :disabled="isSubmitting"
          >
            {{ isSubmitting ? "Envoi..." : isCook ? "Demander" : "Confirmer" }}
          </button>
        </form>
      </div>

      <!-- Stock Distribution -->
      <div
        class="glass-panel"
        style="padding: 2rem;"
      >
        <h2 style="font-size: 1.4rem; margin-bottom: 0.5rem;">
          État des stocks isolés
        </h2>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
          Distribution actuelle des stocks.
        </p>
        <div class="panel-content-scroll" style="display: flex; flex-direction: column; gap: 1rem;">
          <div
            v-for="ing in app.ingredients"
            :key="ing.id"
            style="padding: 1rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px;"
          >
            <strong style="font-size: 1rem;">{{ ing.name }}</strong>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem; font-size: 0.875rem;">
              <div>
                <span style="color: var(--text-secondary);">{{ centralDept?.name || 'Central' }} :</span>
                <div style="font-weight: 600; color: var(--text-primary);">
                  {{ (app.stocks.find(s => s.department_id === centralId && s.ingredient_id === ing.id)?.quantity || '0') }} {{ ing.unit }}
                </div>
              </div>
              <div>
                <span style="color: var(--text-secondary);">{{ kitchenDept?.name || 'Cuisine' }} :</span>
                <div style="font-weight: 600; color: var(--indigo);">
                  {{ (app.stocks.find(s => s.department_id === kitchenId && s.ingredient_id === ing.id)?.quantity || '0') }} {{ ing.unit }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Transfer Requests -->
    <div
      class="glass-panel"
      style="padding: 2rem;"
    >
      <h2 style="font-size: 1.4rem; margin-bottom: 0.5rem;">
        📋 Suivi des Demandes
      </h2>
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
        Demandes de recharge en attente ou traitées.
      </p>
      <div class="table-wrapper">
        <div
          v-if="requests.length === 0"
          style="padding: 2rem; text-align: center; color: var(--text-secondary);"
        >
          Aucune demande.
        </div>
        <table
          v-else
          class="mepos-table"
        >
          <thead>
            <tr>
              <th>Date</th><th>Demandeur</th><th>Ingrédient</th><th>Qté</th><th>Trajet</th><th>Statut</th><th>Traité par</th><th v-if="isAdminOrManager">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="req in paginatedRequests"
              :key="req.id"
            >
              <td data-label="Date" style="color: var(--text-secondary); font-size: 0.875rem;">
                {{ new Date(req.created_at).toLocaleString('fr-TN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }}
              </td>
              <td data-label="Demandeur" style="color: var(--text-primary);">
                @{{ req.requested_by_username }}
              </td>
              <td data-label="Ingrédient"><strong>{{ req.ingredient_name }}</strong></td>
              <td data-label="Quantité" style="font-weight: 600;">
                {{ parseFloat(req.quantity).toFixed(2) }} {{ req.ingredient_unit }}
              </td>
              <td data-label="Trajet" style="font-size: 0.875rem;">
                {{ req.source_department_name }} → {{ req.destination_department_name }}
              </td>
              <td data-label="Statut"><span :class="['badge', req.status === 'approved' ? 'badge-success' : req.status === 'rejected' ? 'badge-danger' : 'badge-warn']">{{ req.status === 'approved' ? 'Validé' : req.status === 'rejected' ? 'Refusé' : 'En attente' }}</span></td>
              <td data-label="Traité par" style="color: var(--text-secondary); font-size: 0.875rem;">
                {{ req.validated_by_username ? `@${req.validated_by_username}` : '-' }}
              </td>
              <td data-label="Actions" v-if="isAdminOrManager">
                <div
                  v-if="req.status === 'pending'"
                  style="display: flex; gap: 0.5rem;"
                >
                  <button
                    class="badge badge-success"
                    style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                    @click="handleValidateRequest(req.id)"
                  >
                    Valider
                  </button>
                  <button
                    class="badge badge-danger"
                    style="border: none; cursor: pointer; padding: 0.35rem 0.6rem;"
                    @click="handleRejectRequest(req.id)"
                  >
                    Refuser
                  </button>
                </div>
                <span
                  v-else
                  style="color: var(--text-muted); font-size: 0.85rem;"
                >Traité</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="totalRequestPages > 1"
          class="pagination"
        >
          <button
            class="touch-btn touch-btn-secondary"
            :disabled="requestPage <= 1"
            @click="requestPage--"
          >
            ←
          </button>
          <span style="color: var(--text-secondary); font-size: 0.9rem; padding: 0 0.75rem;">
            Page {{ requestPage }} / {{ totalRequestPages }}
          </span>
          <button
            class="touch-btn touch-btn-secondary"
            :disabled="requestPage >= totalRequestPages"
            @click="requestPage++"
          >
            →
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
