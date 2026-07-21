<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { api } from '../api'
import { Chart, registerables } from 'chart.js'
import PageContainer from '../components/base/PageContainer.vue'
import EmptyState from '../components/base/EmptyState.vue'

Chart.register(...registerables)

const router = useRouter()
const auth = useAuthStore()
const app = useAppStore()

const isAdmin = computed(() => auth.isAdmin)
const isManager = computed(() => auth.isManager)
const isCook = computed(() => auth.isCook)
const canViewFinance = computed(() => isAdmin.value || isManager.value)

// Chart refs
const salesHistoryChartRef = ref(null)
const salesDistributionChartRef = ref(null)
const lossIngredientsChartRef = ref(null)
const lossReasonsChartRef = ref(null)

let salesHistoryInstance = null
let salesDistributionInstance = null
let lossIngredientsInstance = null
let lossReasonsInstance = null

// Sales data
const salesHistory = ref([])
const salesStats = ref({ total_revenue: 0, total_items_sold: 0, items: [] })
const isLoadingStats = ref(false)

// Date filtering
const todayStr = new Date().toISOString().split('T')[0]
const yesterdayStr = new Date(Date.now() - 24 * 3600 * 1000).toISOString().split('T')[0]
const weekAgoStr = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0]

const period = ref('today')
const startDate = ref(todayStr)
const endDate = ref(todayStr)
const filterHours = ref(false)
const startHour = ref('00:00')
const endHour = ref('23:59')
const showAdvancedFilters = ref(false)

// Cook search
const cookMenuSearch = ref('')

function findKitchenDept() {
  return app.departments.find(d =>
    d.name.toLowerCase().includes('cuisine') ||
    d.name.toLowerCase().includes('kitchen')
  ) || app.departments.find(d => d.stock_type === 'isolated' && d.id !== 1) || app.departments[0]
}

const kitchenDept = computed(() => findKitchenDept())
const kitchenId = computed(() => kitchenDept.value ? kitchenDept.value.id : 2)

const cookDeptStocks = computed(() => app.stocks.filter(s => s.department_id === kitchenId.value))
const criticalCookStocks = computed(() =>
  cookDeptStocks.value.filter(s => parseFloat(s.quantity) <= parseFloat(s.alert_threshold))
)
const todayStripped = new Date().toISOString().split('T')[0]
const todayLosses = computed(() =>
  app.losses.filter(l => l.created_at && l.created_at.startsWith(todayStripped))
)

const selectedRecipe = ref(null)

const filteredCookMenu = computed(() => {
  if (!cookMenuSearch.value) return app.recipes
  const q = cookMenuSearch.value.toLowerCase()
  return app.recipes.filter(r => r.name.toLowerCase().includes(q))
})

function getLossReasonLabel(reason) {
  const labels = {
    spoilage: 'Périmé / Avarié',
    theft: 'Vol',
    preparation_error: 'Erreur prépa',
    overproduction: 'Surproduction',
    other: 'Autre'
  }
  return labels[reason] || reason
}

function getLossReasonBadge(reason) {
  const classes = {
    spoilage: 'badge-danger',
    theft: 'badge-warn',
    preparation_error: 'badge-info',
    overproduction: 'badge-success',
    other: 'badge'
  }
  return classes[reason] || 'badge'
}

function getStockPercent(s) {
  const qty = parseFloat(s.quantity)
  const threshold = parseFloat(s.alert_threshold)
  const max = threshold * 4
  return Math.min(100, Math.max(0, (qty / max) * 100))
}

function getBarColor(s) {
  const pct = getStockPercent(s)
  if (pct <= 25) return '#ef4444'
  if (pct <= 50) return '#f59e0b'
  return '#10b981'
}

async function fetchSalesStats() {
  if (isCook.value) return
  isLoadingStats.value = true
  try {
    const params = { startDate: startDate.value, endDate: endDate.value }
    if (filterHours.value) {
      params.startHour = startHour.value
      params.endHour = endHour.value
    }
    const { data: res } = await api.getSalesStats(params)
    if (res.status === 'success') {
      salesStats.value = res.data
    }
  } catch (err) {
    console.error('Error fetching sales stats:', err)
  } finally {
    isLoadingStats.value = false
  }
}

async function fetchSalesHistory() {
  try {
    const { data: res } = await api.getSalesHistory()
    if (res.status === 'success') {
      salesHistory.value = res.data
    }
  } catch (err) {
    console.error('Error fetching sales history:', err)
  }
}

function handlePeriodChange(newPeriod) {
  period.value = newPeriod
  if (newPeriod === 'today') {
    startDate.value = todayStr
    endDate.value = todayStr
  } else if (newPeriod === 'yesterday') {
    startDate.value = yesterdayStr
    endDate.value = yesterdayStr
  } else if (newPeriod === 'week') {
    startDate.value = weekAgoStr
    endDate.value = todayStr
  }
}

const totalPurchaseValue = computed(() =>
  app.stocks.reduce((acc, s) => acc + (parseFloat(s.quantity) * parseFloat(s.purchase_price_per_unit)), 0)
)
const totalLossCost = computed(() =>
  app.losses.reduce((acc, l) => acc + parseFloat(l.cost_loss), 0)
)
const totalOpportunityLoss = computed(() =>
  app.losses.reduce((acc, l) => acc + parseFloat(l.opportunity_loss), 0)
)

// Skeleton helpers
const skeletonItems = [1, 2, 3, 4, 5]

function renderCharts() {
  if (!isAdmin.value) return

  if (salesHistoryChartRef.value && salesHistory.value.length > 0) {
    if (salesHistoryInstance) {
      salesHistoryInstance.data.labels = salesHistory.value.map(h => {
        const parts = h.date.split('-')
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : h.date
      })
      salesHistoryInstance.data.datasets[0].data = salesHistory.value.map(h => h.revenue)
      salesHistoryInstance.update()
    } else {
      const ctx = salesHistoryChartRef.value.getContext('2d')
      salesHistoryInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: salesHistory.value.map(h => {
            const parts = h.date.split('-')
            return parts.length === 3 ? `${parts[2]}/${parts[1]}` : h.date
          }),
          datasets: [{
            label: "Chiffre d'Affaires",
            data: salesHistory.value.map(h => h.revenue),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#6366f1',
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8' } },
            x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
          }
        }
      })
    }
  }

  if (salesDistributionChartRef.value && salesStats.value.items.length > 0) {
    const chartColors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#f43f5e', '#14b8a6', '#f97316', '#a855f7', '#06b6d4', '#84cc16']
    if (salesDistributionInstance) {
      salesDistributionInstance.data.labels = salesStats.value.items.map(i => i.recipe_name)
      salesDistributionInstance.data.datasets[0].data = salesStats.value.items.map(i => i.quantity)
      salesDistributionInstance.data.datasets[0].backgroundColor = chartColors
      salesDistributionInstance.update()
    } else {
      const ctx = salesDistributionChartRef.value.getContext('2d')
      salesDistributionInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: salesStats.value.items.map(i => i.recipe_name),
          datasets: [{ data: salesStats.value.items.map(i => i.quantity), backgroundColor: chartColors, borderWidth: 2, borderColor: '#11131c' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc', font: { size: 11 }, boxWidth: 12, padding: 10 } } } }
      })
    }
  }

  if (lossIngredientsChartRef.value && app.losses.length > 0) {
    const ingLoss = {}
    app.losses.forEach(l => {
      ingLoss[l.ingredient_name] = (ingLoss[l.ingredient_name] || 0) + parseFloat(l.cost_loss)
    })
    const sorted = Object.keys(ingLoss).map(name => ({ name, cost: ingLoss[name] })).sort((a, b) => b.cost - a.cost).slice(0, 5)
    if (lossIngredientsInstance) {
      lossIngredientsInstance.data.labels = sorted.map(s => s.name)
      lossIngredientsInstance.data.datasets[0].data = sorted.map(s => s.cost)
      lossIngredientsInstance.update()
    } else {
      const ctx = lossIngredientsChartRef.value.getContext('2d')
      lossIngredientsInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: sorted.map(s => s.name),
          datasets: [{ label: 'Coût Perdu (TND)', data: sorted.map(s => s.cost), backgroundColor: 'rgba(239,68,68,0.7)', borderColor: '#ef4444', borderWidth: 1.5, borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } } }
      })
    }
  }

  if (lossReasonsChartRef.value && app.losses.length > 0) {
    const reasonLoss = {}
    app.losses.forEach(l => {
      const label = getLossReasonLabel(l.loss_reason)
      reasonLoss[label] = (reasonLoss[label] || 0) + parseFloat(l.cost_loss)
    })
    if (lossReasonsInstance) {
      lossReasonsInstance.data.labels = Object.keys(reasonLoss)
      lossReasonsInstance.data.datasets[0].data = Object.values(reasonLoss)
      lossReasonsInstance.update()
    } else {
      const ctx = lossReasonsChartRef.value.getContext('2d')
      lossReasonsInstance = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: Object.keys(reasonLoss),
          datasets: [{ data: Object.values(reasonLoss), backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'], borderWidth: 2, borderColor: '#11131c' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#f8fafc', font: { size: 11 }, boxWidth: 12, padding: 10 } } } }
      })
    }
  }
}

let statsInterval = null

onMounted(() => {
  if (!isCook.value) {
    fetchSalesStats()
    statsInterval = setInterval(fetchSalesStats, 7000)
  }
  if (isAdmin.value) {
    fetchSalesHistory()
  }
  nextTick(() => renderCharts())
})

onUnmounted(() => {
  if (statsInterval) clearInterval(statsInterval)
  if (salesHistoryInstance) { salesHistoryInstance.destroy(); salesHistoryInstance = null }
  if (salesDistributionInstance) { salesDistributionInstance.destroy(); salesDistributionInstance = null }
  if (lossIngredientsInstance) { lossIngredientsInstance.destroy(); lossIngredientsInstance = null }
  if (lossReasonsInstance) { lossReasonsInstance.destroy(); lossReasonsInstance = null }
})

watch([salesHistory, salesStats, app.losses], () => { nextTick(() => renderCharts()) }, { deep: true })
</script>

<template>
  <!-- ═══════════════════ COOK DASHBOARD ═══════════════════ -->
  <div
    v-if="isCook"
    style="display: flex; flex-direction: column; gap: 1.5rem;"
  >
    <PageContainer
      :title="`Poste de Travail — ${kitchenDept?.name || 'Cuisine'}`"
      :subtitle="`Bonjour ${auth.user?.first_name} — Vue en temps réel de ton poste`"
    >
      <template #actions>
        <span
          v-if="criticalCookStocks.length > 0"
          class="badge badge-danger"
          style="padding: 0.4rem 0.9rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem;"
        >
          🚨 {{ criticalCookStocks.length }} stock(s) critique(s)
        </span>
        <span
          v-if="todayLosses.length > 0"
          class="badge"
          style="padding: 0.4rem 0.9rem; font-size: 0.85rem; background: rgba(251,191,36,0.12); color: var(--amber); border: 1px solid rgba(251,191,36,0.25);"
        >
          ⚠️ {{ todayLosses.length }} perte(s) aujourd'hui
        </span>
        <button
          class="touch-btn touch-btn-secondary"
          style="padding: 0.4rem 1rem; min-height: 36px; font-size: 0.85rem;"
          @click="router.push('/losses')"
        >
          + Déclarer perte
        </button>
      </template>
    </PageContainer>

    <div
      v-if="criticalCookStocks.length > 0"
      style="padding: 1rem 1.25rem; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 12px; display: flex; flex-direction: column; gap: 0.5rem;"
    >
      <div style="font-weight: 700; color: #ef4444; font-size: 0.9rem; margin-bottom: 0.25rem;">
        🚨 APPROVISIONNEMENT URGENT REQUIS
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
        <span
          v-for="s in criticalCookStocks"
          :key="s.id"
          style="padding: 0.3rem 0.8rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 20px; font-size: 0.85rem; font-weight: 600; color: #fca5a5;"
        >
          {{ s.ingredient_name }} — {{ parseFloat(s.quantity).toFixed(2) }} {{ s.unit }} restant
        </span>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem;">
      <div
        class="glass-panel"
        style="padding: 1.5rem;"
      >
        <h2 style="font-size: 1.1rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
          Stock de la Cuisine
          <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); margin-left: auto;">{{ cookDeptStocks.length }} réf(s)</span>
        </h2>
        <div class="panel-content-scroll">
          <div
            v-if="cookDeptStocks.length === 0"
            class="empty-state"
            style="padding: 2rem 0; text-align: center; color: var(--text-secondary);"
          >
            Aucun stock disponible dans ce dépôt.
          </div>
          <div
            v-else
            style="display: flex; flex-direction: column; gap: 1rem;"
          >
          <div
            v-for="s in [...cookDeptStocks].sort((a, b) => getStockPercent(a) - getStockPercent(b))"
            :key="s.id"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <span :style="{ fontWeight: '600', fontSize: '0.95rem', color: parseFloat(s.quantity) <= parseFloat(s.alert_threshold) ? '#fca5a5' : 'var(--text-primary)' }">
                {{ parseFloat(s.quantity) <= parseFloat(s.alert_threshold) ? '🔴 ' : '' }}{{ s.ingredient_name }}
              </span>
              <span style="font-size: 0.82rem; color: var(--text-secondary);">
                <strong :style="{ color: parseFloat(s.quantity) <= parseFloat(s.alert_threshold) ? '#ef4444' : 'var(--text-primary)' }">{{ parseFloat(s.quantity).toFixed(2) }}</strong> / {{ parseFloat(s.alert_threshold).toFixed(2) }} {{ s.unit }}
              </span>
            </div>
            <div style="height: 7px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden;">
              <div :style="{ height: '100%', width: getStockPercent(s) + '%', background: getBarColor(s), borderRadius: '4px', transition: 'width 0.5s ease' }" />
            </div>
          </div>
        </div>
        </div>
      </div>

      <div
        class="glass-panel"
        style="padding: 1.5rem;"
      >
        <h2 style="font-size: 1.1rem; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
          Menu mePOS
          <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); margin-left: auto;">{{ app.recipes.length }} produit(s)</span>
        </h2>
        <input
          v-model="cookMenuSearch"
          class="form-input"
          placeholder="Rechercher un produit..."
          style="width: 100%; margin-bottom: 1rem;"
        >
        <div class="panel-content-scroll">
          <div
            v-if="filteredCookMenu.length === 0"
            class="empty-state"
            style="padding: 2rem 0; text-align: center; color: var(--text-secondary);"
          >
            {{ cookMenuSearch ? 'Aucun produit trouvé.' : 'Aucune recette configurée.' }}
          </div>
          <div
            v-else
            style="display: flex; flex-direction: column; gap: 0.6rem;"
          >
            <div
              v-for="rec in filteredCookMenu"
              :key="rec.id"
            >
              <div
                :style="{ padding: '0.75rem 1rem', background: selectedRecipe?.id === rec.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selectedRecipe?.id === rec.id ? 'rgba(99,102,241,0.4)' : 'var(--border-color)'}`, borderRadius: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s ease' }"
                @click="selectedRecipe = selectedRecipe?.id === rec.id ? null : rec"
              >
                <span style="font-weight: 600; font-size: 0.95rem;">{{ rec.name }}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="font-size: 0.78rem; color: var(--text-secondary);">{{ rec.ingredients?.length || 0 }} ingr.</span>
                  <span :style="{ fontSize: '0.75rem', color: selectedRecipe?.id === rec.id ? 'var(--indigo-light)' : 'var(--text-muted)' }">{{ selectedRecipe?.id === rec.id ? '▲' : '▼' }}</span>
                </div>
              </div>
              <div
                v-if="selectedRecipe?.id === rec.id && rec.ingredients?.length > 0"
                style="margin-top: 0.4rem; padding: 0.75rem 1rem; background: rgba(99,102,241,0.04); border: 1px solid rgba(99,102,241,0.15); border-radius: 8px; display: flex; flex-direction: column; gap: 0.4rem;"
              >
                <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 0.25rem;">
                  Composition par portion :
                </div>
                <div
                  v-for="ing in rec.ingredients"
                  :key="ing.ingredient_id"
                  style="display: flex; justify-content: space-between; font-size: 0.88rem;"
                >
                  <span>{{ ing.name || ing.ingredient_name || `#${ing.ingredient_id}` }}</span>
                  <span style="font-weight: 600; color: var(--indigo-light);">{{ parseFloat(ing.quantity_needed).toFixed(2) }} {{ ing.unit || 'g' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

      <div
        class="glass-panel"
        style="padding: 1.5rem;"
      >
        <h2 style="font-size: 1.1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          Pertes Enregistrées — Aujourd'hui
      </h2>
      <div class="panel-content-scroll">
        <div
          v-if="todayLosses.length === 0"
          class="empty-state"
          style="padding: 2rem; text-align: center;"
        >
          <p style="color: var(--emerald); font-weight: 600; font-size: 1rem;">✅ Aucune perte déclarée aujourd'hui</p>
          <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem;">Les pertes détectées apparaîtront ici automatiquement.</p>
        </div>
        <div
          v-else
          style="display: flex; flex-direction: column; gap: 0.6rem;"
        >
          <div
            v-for="l in todayLosses"
            :key="l.id"
            style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: rgba(251,191,36,0.04); border: 1px solid rgba(251,191,36,0.15); border-radius: 10px;"
          >
            <div>
              <strong style="font-size: 0.95rem;">{{ l.ingredient_name }}</strong>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.1rem;">
                <span :class="['badge', getLossReasonBadge(l.loss_reason)]" style="margin-right: 0.4rem;">{{ getLossReasonLabel(l.loss_reason) }}</span>
                {{ l.department_name }}
              </div>
            </div>
            <span style="font-weight: 700; color: var(--amber); font-size: 0.95rem;">-{{ parseFloat(l.quantity).toFixed(2) }} {{ l.unit }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════ ADMIN / MANAGER DASHBOARD ═══════════════════ -->
  <div
    v-else
    style="display: flex; flex-direction: column; gap: 1.5rem;"
  >
    <PageContainer
      title="Tableau de bord"
      :subtitle="`Bienvenue, ${auth.user?.first_name} ${auth.user?.last_name} (${auth.user?.role === 'admin' ? 'Administrateur' : 'Gérant'})`"
    >
      <template #actions>
        <button
          class="touch-btn touch-btn-secondary"
          style="padding: 0.4rem 1rem; min-height: 36px; font-size: 0.85rem;"
          @click="router.push('/losses')"
        >
          + Déclarer perte
        </button>
        <button
          class="touch-btn touch-btn-secondary"
          style="padding: 0.4rem 1rem; min-height: 36px; font-size: 0.85rem;"
          @click="router.push('/transfers')"
        >
          Transfert
        </button>
        <button
          class="touch-btn touch-btn-secondary"
          style="padding: 0.4rem 1rem; min-height: 36px; font-size: 0.85rem;"
          @click="app.fetchData(auth.user)"
        >
          Actualiser
        </button>
      </template>
    </PageContainer>

    <!-- Metrics with skeleton loading -->
    <div class="metrics-grid">
      <div class="glass-panel metric-card">
        <span class="metric-title">Alertes Stock Bas</span>
        <span
          class="metric-value"
          :style="{ color: app.lowStockAlerts.length > 0 ? '#ef4444' : 'var(--indigo)' }"
        >
          <span v-if="app.stocks.length === 0 && !app.isOffline">
            <span class="skeleton" style="width: 60px; height: 2rem; border-radius: 4px; display: inline-block;" />
          </span>
          <span v-else>
            {{ app.lowStockAlerts.length }} <span class="metric-unit">ingrédient(s)</span>
          </span>
        </span>
        <span class="metric-desc">Sous le seuil d'alerte critique</span>
      </div>
      <div class="glass-panel metric-card">
        <span class="metric-title">Fiches Recettes</span>
        <span class="metric-value">
          <span v-if="app.recipes.length === 0 && !app.isOffline">
            <span class="skeleton" style="width: 60px; height: 2rem; border-radius: 4px; display: inline-block;" />
          </span>
          <span v-else>
            {{ app.recipes.length }} <span class="metric-unit">recettes</span>
          </span>
        </span>
        <span class="metric-desc">Actives au menu de mePOS</span>
      </div>
      <div class="glass-panel metric-card">
        <span class="metric-title">{{ canViewFinance ? 'Valeur Stock Central' : 'Matières Stockées' }}</span>
        <span class="metric-value" :style="{ color: canViewFinance ? 'var(--blue)' : undefined }">
          <span v-if="app.stocks.length === 0 && !app.isOffline">
            <span class="skeleton" style="width: 80px; height: 2rem; border-radius: 4px; display: inline-block;" />
          </span>
          <span v-else-if="canViewFinance">
            {{ totalPurchaseValue.toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }} <span class="metric-unit"> TND</span>
          </span>
          <span v-else>{{ app.stocks.length }} <span class="metric-unit">références</span></span>
        </span>
        <span class="metric-desc">{{ canViewFinance ? "Coût d'achat total des matières premières" : "Total d'ingrédients suivis en cuisine" }}</span>
      </div>
      <div class="glass-panel metric-card">
        <span class="metric-title">{{ canViewFinance ? 'Perte Sèche & Manque à Gagner' : 'Déclarations de Pertes' }}</span>
        <span
          class="metric-value"
          :style="{ color: canViewFinance ? '#ef4444' : 'var(--amber)' }"
        >
          <span v-if="app.losses.length === 0 && !app.isOffline">
            <span class="skeleton" style="width: 80px; height: 2rem; border-radius: 4px; display: inline-block;" />
          </span>
          <span v-else-if="canViewFinance">
            {{ totalLossCost.toFixed(2) }} <span class="metric-unit"> TND</span>
          </span>
          <span v-else>{{ app.losses.length }} <span class="metric-unit">incidents</span></span>
        </span>
        <span
          v-if="canViewFinance"
          class="metric-desc"
          style="color: #fca5a5;"
        >Opportunités perdues : <strong>{{ totalOpportunityLoss.toFixed(2) }} TND</strong></span>
        <span
          v-else
          class="metric-desc"
        >Ingrédients déclarés jetés / abîmés</span>
      </div>
    </div>

    <!-- Charts (Admin only) -->
    <div
      v-if="isAdmin"
      style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;"
    >
      <div
        class="glass-panel"
        style="padding: 1.5rem; height: 340px; display: flex; flex-direction: column;"
      >
        <h3 style="font-size: 1.05rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; font-weight: 700;">
          Évolution du CA (7 derniers jours)
        </h3>
        <div
          v-if="salesHistory.length === 0 && !app.isOffline"
          class="empty-state"
          style="height: 230px; display: flex; align-items: center; justify-content: center;"
        >
          <p style="color: var(--text-secondary); text-align: center; font-size: 0.85rem;">
            Aucune donnée de vente disponible pour la période.
          </p>
        </div>
        <div
          v-else
          style="height: 230px; position: relative; width: 100%; min-height: 0;"
        >
          <canvas ref="salesHistoryChartRef" />
        </div>
      </div>
      <div
        class="glass-panel"
        style="padding: 1.5rem; height: 340px; display: flex; flex-direction: column;"
      >
        <h3 style="font-size: 1.05rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; font-weight: 700;">
          Répartition des Ventes
        </h3>
        <div
          v-if="salesStats.items?.length === 0 && !isLoadingStats"
          class="empty-state"
          style="height: 230px; display: flex; align-items: center; justify-content: center;"
        >
          <p style="color: var(--text-secondary); text-align: center; font-size: 0.85rem;">
            Aucune vente enregistrée pour cette période.
          </p>
        </div>
        <div
          v-else
          style="height: 230px; position: relative; width: 100%; min-height: 0;"
        >
          <canvas ref="salesDistributionChartRef" />
        </div>
      </div>
      <div
        class="glass-panel"
        style="padding: 1.5rem; height: 340px; display: flex; flex-direction: column;"
      >
        <h3 style="font-size: 1.05rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; font-weight: 700;">
          Coût Perdu par Ingrédient
        </h3>
        <div
          v-if="app.losses.length === 0"
          class="empty-state"
          style="height: 230px; display: flex; align-items: center; justify-content: center;"
        >
          <p style="color: var(--text-secondary); text-align: center; font-size: 0.85rem;">
            Aucune perte déclarée. Les données apparaîtront ici.
          </p>
        </div>
        <div
          v-else
          style="height: 230px; position: relative; width: 100%; min-height: 0;"
        >
          <canvas ref="lossIngredientsChartRef" />
        </div>
      </div>
      <div
        class="glass-panel"
        style="padding: 1.5rem; height: 340px; display: flex; flex-direction: column;"
      >
        <h3 style="font-size: 1.05rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; font-weight: 700;">
          Pertes par Motif
        </h3>
        <div
          v-if="app.losses.length === 0"
          class="empty-state"
          style="height: 230px; display: flex; align-items: center; justify-content: center;"
        >
          <p style="color: var(--text-secondary); text-align: center; font-size: 0.85rem;">
            Aucune perte déclarée. Les données apparaîtront ici.
          </p>
        </div>
        <div
          v-else
          style="height: 230px; position: relative; width: 100%; min-height: 0;"
        >
          <canvas ref="lossReasonsChartRef" />
        </div>
      </div>
    </div>

    <!-- Critical Stocks + Recent Losses -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
      <div
        class="glass-panel"
        style="padding: 1.5rem;"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem;">
          <h2 style="font-size: 1.2rem; margin: 0;">
            Alertes de Stock
          </h2>
          <button
            class="touch-btn touch-btn-secondary"
            style="padding: 0.3rem 0.8rem; min-height: 32px; font-size: 0.78rem;"
            @click="router.push('/inventory')"
          >
            Voir l'inventaire
          </button>
        </div>
        <div class="panel-content-scroll">
          <div
            v-if="app.lowStockAlerts.length === 0"
            class="empty-state"
            style="padding: 2rem 0; text-align: center; color: var(--text-secondary);"
          >
            Aucune alerte de stock à signaler.
          </div>
          <div
            v-else
            style="display: flex; flex-direction: column; gap: 0.75rem;"
          >
            <div
              v-for="alert in app.lowStockAlerts"
              :key="alert.id"
              style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.15); border-radius: 8px;"
            >
              <div>
                <strong style="font-size: 0.95rem;">{{ alert.ingredient_name }}</strong>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                  {{ alert.department_name }}
                </div>
              </div>
              <span
                class="badge badge-danger"
                style="font-size: 0.8rem;"
              >{{ parseFloat(alert.quantity).toFixed(2) }} / {{ parseFloat(alert.alert_threshold).toFixed(2) }} {{ alert.unit }}</span>
            </div>
          </div>
        </div>
      </div>
      <div
        class="glass-panel"
        style="padding: 1.5rem;"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 1rem;">
          <h2 style="font-size: 1.2rem; margin: 0;">
            Pertes Récentes
          </h2>
          <button
            class="touch-btn touch-btn-secondary"
            style="padding: 0.3rem 0.8rem; min-height: 32px; font-size: 0.78rem;"
            @click="router.push('/losses')"
          >
            Voir tout
          </button>
        </div>
        <div class="panel-content-scroll">
          <div
            v-if="app.losses.length === 0"
            class="empty-state"
            style="padding: 2rem 0; text-align: center; color: var(--text-secondary);"
          >
            Aucune perte déclarée récemment.
          </div>
          <div
            v-else
            style="display: flex; flex-direction: column; gap: 0.75rem;"
          >
            <div
              v-for="loss in app.losses.slice(0, 4)"
              :key="loss.id"
              style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px;"
            >
              <div>
                <strong style="font-size: 0.95rem;">{{ loss.ingredient_name }}</strong>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                  Quantité: {{ parseFloat(loss.quantity).toFixed(2) }} {{ loss.unit }} |
                  <span :class="['badge', getLossReasonBadge(loss.loss_reason)]" style="margin-left: 0.25rem;">{{ getLossReasonLabel(loss.loss_reason) }}</span>
                </div>
              </div>
              <div style="text-align: right; font-size: 0.9rem; color: #ef4444; font-weight: 600;">
                {{ canViewFinance ? `-${parseFloat(loss.cost_loss).toFixed(2)} TND` : '*** TND' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sales Statistics -->
    <div
      class="glass-panel"
      style="padding: 2rem;"
    >
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h2 style="font-size: 1.4rem;">
            Statistiques des Ventes
          </h2>
          <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.25rem;">
            Visualisez les performances de vente par période.
          </p>
        </div>
        <div
          class="dept-filter-section"
          style="margin: 0;"
        >
          <div
            v-for="p in ['today', 'yesterday', 'week', 'custom']"
            :key="p"
            :class="['dept-pill', { active: period === p }]"
            @click="handlePeriodChange(p)"
          >
            {{ p === 'today' ? 'Aujourd\'hui' : p === 'yesterday' ? 'Hier' : p === 'week' ? '7 jours' : 'Personnalisé' }}
          </div>
        </div>
      </div>

      <!-- Filters (collapsible) -->
      <div
        v-if="period === 'custom' || filterHours"
        style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; background: rgba(255,255,255,0.01); padding: 1.25rem; border-radius: 12px; border: 1px solid var(--border-color);"
      >
        <div
          v-if="period === 'custom'"
          style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;"
        >
          <div
            class="form-group"
            style="margin: 0; display: flex; flex-direction: row; align-items: center; gap: 0.5rem;"
          >
            <span
              class="form-label"
              style="margin-bottom: 0;"
            >Du :</span>
            <input
              v-model="startDate"
              type="date"
              class="form-input"
              style="min-height: 38px; padding: 0.4rem 0.8rem;"
            >
          </div>
          <div
            class="form-group"
            style="margin: 0; display: flex; flex-direction: row; align-items: center; gap: 0.5rem;"
          >
            <span
              class="form-label"
              style="margin-bottom: 0;"
            >Au :</span>
            <input
              v-model="endDate"
              type="date"
              class="form-input"
              style="min-height: 38px; padding: 0.4rem 0.8rem;"
            >
          </div>
          <button
            class="touch-btn"
            style="min-height: 38px; padding: 0.4rem 1.2rem;"
            @click="fetchSalesStats"
          >
            Appliquer
          </button>
        </div>
        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 1.5rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.925rem; font-weight: 500;">
            <input
              v-model="filterHours"
              type="checkbox"
              style="width: 18px; height: 18px; accent-color: var(--indigo);"
            >
            <span>Filtrer par heures</span>
          </label>
          <div
            v-if="filterHours"
            style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;"
          >
            <div
              class="form-group"
              style="margin: 0; display: flex; flex-direction: row; align-items: center; gap: 0.5rem;"
            >
              <span
                class="form-label"
                style="margin-bottom: 0;"
              >Début :</span>
              <input
                v-model="startHour"
                type="time"
                class="form-input"
                style="min-height: 38px; padding: 0.4rem 0.8rem;"
              >
            </div>
            <div
              class="form-group"
              style="margin: 0; display: flex; flex-direction: row; align-items: center; gap: 0.5rem;"
            >
              <span
                class="form-label"
                style="margin-bottom: 0;"
              >Fin :</span>
              <input
                v-model="endHour"
                type="time"
                class="form-input"
                style="min-height: 38px; padding: 0.4rem 0.8rem;"
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Stats KPIs -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div style="padding: 1.25rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px;">
          <span style="color: var(--text-secondary); font-size: 0.85rem;">Chiffre d'Affaires</span>
          <span style="font-size: 1.8rem; font-weight: 800; color: var(--emerald); margin-top: 0.5rem; display: block;">
            <span v-if="isLoadingStats">
              <span class="skeleton" style="width: 120px; height: 2rem; border-radius: 4px; display: inline-block;" />
            </span>
            <span v-else-if="canViewFinance">
              {{ salesStats.total_revenue?.toLocaleString('fr-TN', { minimumFractionDigits: 2 }) }} TND
            </span>
            <span v-else>*** TND</span>
          </span>
        </div>
        <div style="padding: 1.25rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px;">
          <span style="color: var(--text-secondary); font-size: 0.85rem;">Produits Vendus</span>
          <span style="font-size: 1.8rem; font-weight: 800; color: var(--indigo-light); margin-top: 0.5rem; display: block;">
            <span v-if="isLoadingStats">
              <span class="skeleton" style="width: 80px; height: 2rem; border-radius: 4px; display: inline-block;" />
            </span>
            <span v-else>
              {{ salesStats.total_items_sold?.toLocaleString() }} <span style="font-size: 1rem; font-weight: 400; color: var(--text-secondary);"> unité(s)</span>
            </span>
          </span>
        </div>
      </div>

      <!-- Items sold -->
      <div
        v-if="isLoadingStats"
        style="padding: 2rem; text-align: center; color: var(--text-secondary);"
      >
        Chargement des données de vente...
      </div>
      <div
        v-else-if="salesStats.items?.length === 0"
        class="empty-state"
        style="padding: 3rem; text-align: center; color: var(--text-secondary); border: 1px dashed var(--border-color); border-radius: 12px;"
      >
        Aucune vente enregistrée pour la période sélectionnée.
      </div>
      <div
        v-else
        style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;"
      >
        <div>
          <h3 style="font-size: 1.1rem; margin-bottom: 1.25rem;">
            Top Ventes (par volume)
          </h3>
          <div style="display: flex; flex-direction: column; gap: 1.25rem; max-height: 360px; overflow-y: auto; padding-right: 0.25rem;">
            <div
              v-for="item in [...(salesStats.items || [])].sort((a, b) => b.quantity - a.quantity)"
              :key="item.recipe_id"
              style="display: flex; flex-direction: column; gap: 0.35rem;"
            >
              <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                <span style="font-weight: 600;">{{ item.recipe_name }}</span>
                <span style="color: var(--text-secondary);"><strong>{{ item.quantity }}</strong> vendus</span>
              </div>
              <div style="height: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; overflow: hidden;">
                <div :style="{ height: '100%', width: (salesStats.total_items_sold > 0 ? (item.quantity / salesStats.total_items_sold * 100) : 0) + '%', background: 'linear-gradient(90deg, var(--indigo) 0%, var(--indigo-light) 100%)', borderRadius: '4px', transition: 'width 0.4s ease-out' }" />
              </div>
            </div>
          </div>
        </div>
        <div>
          <h3 style="font-size: 1.1rem; margin-bottom: 1.25rem;">
            Rapport Détaillé
          </h3>
          <div
            class="table-wrapper"
            style="max-height: 350px; overflow-y: auto;"
          >
            <table class="mepos-table">
              <thead>
                <tr><th>Produit</th><th>Quantité</th><th>Prix Unitaire</th><th>CA</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in salesStats.items"
                  :key="item.recipe_id"
                >
                  <td><strong>{{ item.recipe_name }}</strong></td>
                  <td style="font-weight: 600;">
                    {{ item.quantity }}
                  </td>
                  <td>{{ parseFloat(item.unit_price).toFixed(2) }} TND</td>
                  <td style="color: var(--emerald); font-weight: 600;">
                    {{ canViewFinance ? `${parseFloat(item.total_revenue).toFixed(2)} TND` : '*** TND' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
