<script setup>
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'

const auth = useAuthStore()
const app = useAppStore()

const isAdmin = computed(() => auth.isAdmin)
const isCook = computed(() => auth.isCook)

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
const stockPerPage = ref(8)

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
      <button
        class="touch-btn touch-btn-secondary"
        @click="app.fetchData(auth.user)"
      >
        Actualiser
      </button>
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
              {{ isAdmin ? `${parseFloat(stock.purchase_price_per_unit).toFixed(2)} TND / ${stock.unit}` : '*** TND' }}
            </td>
            <td
              data-label="Valeur"
              style="font-weight: 600; color: var(--blue);"
            >
              {{ isAdmin ? `${(parseFloat(stock.quantity) * parseFloat(stock.purchase_price_per_unit)).toFixed(2)} TND` : '*** TND' }}
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
</template>
