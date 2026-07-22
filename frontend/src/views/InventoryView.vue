<script setup>
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import InventoryHistoryModal from '../components/base/InventoryHistoryModal.vue'
import StockAdjustModal from '../components/base/StockAdjustModal.vue'
import StockTransferModal from '../components/base/StockTransferModal.vue'

const auth = useAuthStore()
const app = useAppStore()

const isAdmin = computed(() => auth.isAdmin)
const isCook = computed(() => auth.isCook)

const showHistoryModal = ref(false)
const showAdjustModal = ref(false)
const showTransferModal = ref(false)
const selectedStock = ref(null)

function openHistory(stock) {
  selectedStock.value = stock
  showHistoryModal.value = true
}

function openAdjust(stock) {
  selectedStock.value = stock
  showAdjustModal.value = true
}

function openTransfer(stock) {
  selectedStock.value = stock
  showTransferModal.value = true
}

function onModalSaved() {
  app.fetchData(auth.user)
}

function findKitchenDept() {
  return app.departments.find(d =>
    d.name.toLowerCase().includes('cuisine') ||
    d.name.toLowerCase().includes('kitchen')
  ) || app.departments.find(d => d.stock_type === 'isolated' && d.id !== 1) || app.departments[0]
}

const kitchenDept = computed(() => findKitchenDept())
const kitchenId = computed(() => kitchenDept.value ? kitchenDept.value.id : 2)

const defaultDeptId = computed(() => isCook.value ? kitchenId.value : 0)
const selectedDept = ref(defaultDeptId.value)

watch(() => app.departments, () => {
  if (isCook.value && kitchenDept.value) {
    selectedDept.value = kitchenDept.value.id
  }
}, { immediate: true })

const filteredStocks = computed(() =>
  app.stocks.filter(stock => {
    if (isCook.value) return stock.department_id === kitchenId.value
    if (selectedDept.value === 0) return true
    return stock.department_id === selectedDept.value
  })
)

const stockPage = ref(1)
const stockPerPage = ref(10)

const paginatedStocks = computed(() => {
  const start = (stockPage.value - 1) * stockPerPage.value
  return filteredStocks.value.slice(start, start + stockPerPage.value)
})

const totalStockPages = computed(() => Math.max(1, Math.ceil(filteredStocks.value.length / stockPerPage.value)))

watch([filteredStocks, selectedDept], () => { stockPage.value = 1 })
</script>

<template>
  <div>
    <div class="view-title-section">
      <div>
        <h1 class="view-title">
          📦 État des Stocks
        </h1>
        <p style="color: var(--text-secondary); margin-top: 0.25rem;">
          Suivi des quantités d'ingrédients disponibles en temps réel.
        </p>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <button
          v-if="isAdmin"
          class="touch-btn"
          @click="showAdjustModal = true; selectedStock = null"
        >
          + Nouvel Ajustement
        </button>
      </div>
    </div>

    <div
      v-if="!isCook"
      class="dept-filter-section"
    >
      <div
        :class="['dept-pill', { active: selectedDept === 0 }]"
        @click="selectedDept = 0"
      >
        Tous les Dépôts
      </div>
      <div
        v-for="dept in app.departments"
        :key="dept.id"
        :class="['dept-pill', { active: selectedDept === dept.id }]"
        @click="selectedDept = dept.id"
      >
        {{ dept.name }} ({{ dept.stock_type === 'inherited' ? 'Hérité' : 'Isolé' }})
      </div>
    </div>

    <div
      v-if="isCook"
      style="margin-bottom: 1rem;"
    >
      <span
        class="badge badge-success"
        style="font-size: 0.9rem; padding: 0.5rem 1rem;"
      >Zone Cuisine Centrale Uniquement</span>
    </div>

    <div class="glass-panel table-wrapper">
      <div
        v-if="filteredStocks.length === 0"
        style="padding: 2rem; text-align: center; color: var(--text-secondary);"
      >
        Aucun ingrédient répertorié pour ce dépôt.
      </div>
      <table
        v-else
        class="mepos-table"
      >
        <thead>
          <tr>
            <th>Ingrédient</th>
            <th>Dépôt / Zone</th>
            <th>Politique</th>
            <th>Quantité Disponible</th>
            <th>Seuil d'Alerte</th>
            <th>Statut</th>
            <th>Prix d'Achat</th>
            <th>Valeur Estimée</th>
            <th v-if="isAdmin">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="stock in paginatedStocks"
            :key="stock.id"
          >
            <td data-label="Ingrédient">
              <strong style="color: var(--text-primary);">{{ stock.ingredient_name }}</strong>
            </td>
            <td data-label="Dépôt">
              {{ stock.department_name }}
            </td>
            <td data-label="Politique">
              <span :class="['badge', stock.stock_type === 'inherited' ? 'badge-warn' : 'badge-success']">
                {{ stock.stock_type === 'inherited' ? 'Hérité' : 'Isolé' }}
              </span>
            </td>
            <td
              data-label="Quantité"
              style="font-size: 1.05rem; font-weight: 600;"
            >
              {{ stock.conversion_factor && parseFloat(stock.conversion_factor) > 1
                ? `${(parseFloat(stock.quantity) / parseFloat(stock.conversion_factor)).toFixed(2)} ${stock.purchase_unit}`
                : `${parseFloat(stock.quantity).toFixed(2)} ${stock.unit}` }}
            </td>
            <td
              data-label="Seuil"
              style="color: var(--text-secondary);"
            >
              {{ stock.conversion_factor && parseFloat(stock.conversion_factor) > 1
                ? `${(parseFloat(stock.alert_threshold) / parseFloat(stock.conversion_factor)).toFixed(2)} ${stock.purchase_unit}`
                : `${parseFloat(stock.alert_threshold).toFixed(2)} ${stock.unit}` }}
            </td>
            <td data-label="Statut">
              <span :class="['badge', parseFloat(stock.quantity) <= parseFloat(stock.alert_threshold) ? 'badge-danger' : 'badge-success']">
                {{ parseFloat(stock.quantity) <= parseFloat(stock.alert_threshold) ? 'Critique' : 'Normal' }}
              </span>
            </td>
            <td
              data-label="Prix"
              style="color: var(--text-secondary);"
            >
              {{ isAdmin ? `${parseFloat(stock.purchase_price_per_unit).toFixed(3)} TND / ${stock.unit}` : '*** TND' }}
            </td>
            <td
              data-label="Valeur"
              style="font-weight: 600; color: var(--blue);"
            >
              {{ isAdmin ? `${(parseFloat(stock.quantity) * parseFloat(stock.purchase_price_per_unit)).toFixed(3)} TND` : '*** TND' }}
            </td>
            <td v-if="isAdmin" data-label="Actions">
              <div style="display: flex; gap: 0.35rem; flex-wrap: nowrap;">
                <button class="touch-btn touch-btn-sm touch-btn-secondary" title="Historique" @click="openHistory(stock)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </button>
                <button class="touch-btn touch-btn-sm touch-btn-secondary" title="Ajuster" @click="openAdjust(stock)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </button>
                <button class="touch-btn touch-btn-sm touch-btn-secondary" title="Transférer" @click="openTransfer(stock)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div
        v-if="totalStockPages > 1"
        class="pagination"
      >
        <button
          class="touch-btn touch-btn-secondary"
          :disabled="stockPage <= 1"
          @click="stockPage--"
        >
          ←
        </button>
        <span style="color: var(--text-secondary); font-size: 0.9rem; padding: 0 0.75rem;">
          Page {{ stockPage }} / {{ totalStockPages }}
        </span>
        <button
          class="touch-btn touch-btn-secondary"
          :disabled="stockPage >= totalStockPages"
          @click="stockPage++"
        >
          →
        </button>
      </div>
    </div>
  </div>

  <InventoryHistoryModal
    :is-open="showHistoryModal"
    :ingredient="selectedStock ? { id: selectedStock.ingredient_id, name: selectedStock.ingredient_name } : null"
    @close="showHistoryModal = false"
  />

  <StockAdjustModal
    :is-open="showAdjustModal"
    :stock="selectedStock"
    :departments="app.departments"
    :ingredients="app.ingredients"
    @close="showAdjustModal = false; selectedStock = null"
    @saved="onModalSaved"
  />

  <StockTransferModal
    :is-open="showTransferModal"
    :stock="selectedStock"
    :departments="app.departments"
    @close="showTransferModal = false; selectedStock = null"
    @saved="onModalSaved"
  />
</template>
