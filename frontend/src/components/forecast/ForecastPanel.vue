<script setup>
import { ref } from 'vue'
import EmptyState from '../base/EmptyState.vue'

const props = defineProps({
  forecast: {
    type: Object,
    default: null
  },
  isLoading: {
    type: Boolean,
    default: false
  }
})

// ─── Critical Stocks Card ───
const showAllCritical = ref(false)

function getCriticalIngredients() {
  if (!props.forecast) return []
  return props.forecast.ingredients.filter(i => i.is_critical)
}

function getDisplayedCritical() {
  const critical = getCriticalIngredients()
  return showAllCritical.value ? critical : critical.slice(0, 5)
}
</script>

<template>
  <!-- Loading state -->
  <div
    v-if="isLoading"
    style="display: flex; flex-direction: column; gap: 1.5rem;"
  >
    <div class="metrics-grid">
      <div
        v-for="i in 4"
        :key="i"
        class="glass-panel metric-card"
      >
        <div
          class="skeleton"
          style="width: 60%; height: 0.75rem; border-radius: 4px; margin-bottom: 0.5rem;"
        />
        <div
          class="skeleton"
          style="width: 40%; height: 2rem; border-radius: 6px;"
        />
      </div>
    </div>
    <div
      class="skeleton"
      style="width: 100%; height: 200px; border-radius: 14px;"
    />
  </div>

  <!-- No data state -->
  <EmptyState
    v-else-if="!forecast"
    title="Prévisions non disponibles"
    description="Les données de prévision seront disponibles après les premières synchronisations de ventes."
  />

  <!-- Main forecast view -->
  <div
    v-else
    style="display: flex; flex-direction: column; gap: 1.5rem;"
  >
    <!-- Section header -->
    <div
      class="view-title-section"
      style="margin-bottom: 0;"
    >
      <div>
        <h2 style="font-size: 1.4rem; font-weight: 800; margin: 0;">
          🔮 Prévisions & Analyse
        </h2>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem;">
          Généré le {{ new Date(forecast.generated_at).toLocaleString('fr-FR') }} — basé sur les {{ forecast.days_analyzed }} derniers jours
        </p>
      </div>
    </div>

    <!-- Metrics row -->
    <div
      class="metrics-grid"
      style="margin-top: 0.5rem;"
    >
      <div class="glass-panel metric-card">
        <span class="metric-title">Recettes Analysées</span>
        <span class="metric-value">
          {{ forecast.summary.total_recipes_analyzed }}
          <span class="metric-unit">recettes</span>
        </span>
        <span class="metric-desc">Sur les 7 derniers jours</span>
      </div>
      <div class="glass-panel metric-card">
        <span class="metric-title">Ingrédients Surveillés</span>
        <span class="metric-value">
          {{ forecast.summary.total_ingredients_analyzed }}
          <span class="metric-unit">références</span>
        </span>
        <span class="metric-desc">Tous départements</span>
      </div>
      <div class="glass-panel metric-card">
        <span class="metric-title">Critiques</span>
        <span
          class="metric-value"
          :style="{ color: forecast.summary.critical_ingredients > 0 ? 'var(--coral)' : 'var(--emerald)' }"
        >
          {{ forecast.summary.critical_ingredients }}
          <span class="metric-unit">ingrédient(s)</span>
        </span>
        <span class="metric-desc">Stock bas ou ≤ 3j d'épuisement</span>
      </div>
      <div class="glass-panel metric-card">
        <span class="metric-title">CA Journalier Estimé</span>
        <span
          class="metric-value"
          style="color: var(--emerald);"
        >
          {{ forecast.summary.estimated_daily_revenue.toFixed(0) }}
          <span class="metric-unit">TND/j</span>
        </span>
        <span class="metric-desc">Moyenne mobile 7 jours</span>
      </div>
    </div>

    <!-- Critical stocks alert -->
    <div
      v-if="getCriticalIngredients().length > 0"
      class="glass-panel"
      style="padding: 1.5rem; border-left: 4px solid var(--coral);"
    >
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div>
          <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--coral); margin: 0;">
            🚨 {{ getCriticalIngredients().length }} ingrédient(s) critique(s)
          </h3>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
            Stock bas ou épuisement imminent (≤ 3 jours)
          </p>
        </div>
        <div style="text-align: right; font-size: 0.8rem; color: var(--text-secondary);">
          <div>Coût réappro. estimé</div>
          <div style="font-weight: 700; color: var(--amber); font-size: 1rem;">
            {{ forecast.summary.total_reorder_cost.toFixed(2) }} TND
          </div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div
          v-for="ing in getDisplayedCritical()"
          :key="`${ing.department_id}-${ing.ingredient_id}`"
          style="padding: 0.85rem 1rem; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; gap: 1rem;"
          :style="{
            background: ing.days_until_depletion !== null && ing.days_until_depletion <= 1 ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.06)',
            border: `1px solid ${ing.days_until_depletion !== null && ing.days_until_depletion <= 1 ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)'}`
          }"
        >
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span
                style="font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                :style="{ color: ing.days_until_depletion !== null && ing.days_until_depletion <= 1 ? '#fca5a5' : '#fcd34d' }"
              >
                {{ ing.days_until_depletion !== null && ing.days_until_depletion <= 1 ? '🔴' : '🟡' }} {{ ing.ingredient_name }}
              </span>
              <span style="font-size: 0.7rem; color: var(--text-muted);">({{ ing.department_name }})</span>
            </div>
            <div style="display: flex; gap: 1rem; margin-top: 0.3rem; font-size: 0.78rem; color: var(--text-secondary); flex-wrap: wrap;">
              <span>Stock: <strong style="color: var(--text-primary);">{{ ing.current_stock.toFixed(2) }} {{ ing.unit }}</strong></span>
              <span>Utilisation/j: <strong>{{ ing.avg_daily_usage.toFixed(2) }} {{ ing.unit }}</strong></span>
              <span v-if="ing.days_until_depletion !== null">
                Épuisement: <strong :style="{ color: ing.days_until_depletion <= 1 ? 'var(--coral)' : 'var(--amber)' }">{{ ing.days_until_depletion }} jour{{ ing.days_until_depletion > 1 ? 's' : '' }}</strong>
              </span>
            </div>
          </div>
          <div
            v-if="ing.reorder_quantity > 0"
            style="text-align: right; flex-shrink: 0;"
          >
            <div style="font-size: 0.7rem; color: var(--text-muted);">
              Réappro. suggéré
            </div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--indigo-light); white-space: nowrap;">
              +{{ ing.reorder_quantity.toFixed(2) }} {{ ing.unit }}
            </div>
          </div>
        </div>
      </div>

      <button
        v-if="getCriticalIngredients().length > 5"
        class="touch-btn touch-btn-secondary"
        style="margin-top: 0.75rem; width: 100%; min-height: 36px; padding: 0.5rem; font-size: 0.85rem;"
        @click="showAllCritical = !showAllCritical"
      >
        {{ showAllCritical ? 'Réduire' : `Voir les ${getCriticalIngredients().length - 5} autres` }}
      </button>
    </div>

    <!-- Depletion Timeline + Reorder Suggestions Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 1.5rem;">
      <!-- Depletion Timeline -->
      <div
        class="glass-panel"
        style="padding: 1.5rem;"
      >
        <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
          📅 Échéancier d'Épuisement des Stocks
          <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); margin-left: auto;">
            Prochains {{ Math.min(10, forecast.ingredients.filter(i => i.days_until_depletion !== null).length) }} ingrédients
          </span>
        </h3>
        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div
            v-for="ing in forecast.ingredients
              .filter(i => i.days_until_depletion !== null)
              .sort((a, b) => (a.days_until_depletion || 999) - (b.days_until_depletion || 999))
              .slice(0, 10)"
            :key="`dep-${ing.department_id}-${ing.ingredient_id}`"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; font-size: 0.85rem;">
              <span
                style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                :style="{ color: (ing.days_until_depletion <= 1) ? '#fca5a5' : (ing.days_until_depletion <= 3) ? '#fcd34d' : 'var(--text-primary)' }"
              >
                {{ ing.ingredient_name }}
                <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 0.4rem;">({{ ing.department_name }})</span>
              </span>
              <span
                style="font-weight: 700; white-space: nowrap; margin-left: 0.5rem;"
                :style="{ color: (ing.days_until_depletion <= 1) ? 'var(--coral)' : (ing.days_until_depletion <= 3) ? 'var(--amber)' : 'var(--emerald)' }"
              >
                {{ ing.days_until_depletion }} jour{{ ing.days_until_depletion > 1 ? 's' : '' }}
              </span>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden;">
              <div
                style="height: 100%; border-radius: 3px; transition: width 0.5s ease;"
                :style="{
                  width: `${Math.max(2, Math.min(100, (ing.days_until_depletion / Math.max(...forecast.ingredients.filter(i => i.days_until_depletion !== null).map(i => i.days_until_depletion || 7), 7)) * 100))}%`,
                  background: (ing.days_until_depletion <= 1)
                    ? 'linear-gradient(90deg, var(--coral), #f87171)'
                    : (ing.days_until_depletion <= 3)
                      ? 'linear-gradient(90deg, var(--amber), #fbbf24)'
                      : 'linear-gradient(90deg, var(--emerald), #34d399)'
                }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Reorder Suggestions -->
      <div
        class="glass-panel"
        style="padding: 1.5rem;"
      >
        <template v-if="forecast.ingredients.filter(i => i.reorder_quantity > 0).length === 0">
          <EmptyState
            compact
            title="Aucun réapprovisionnement nécessaire"
            description="Tous les ingrédients ont un stock suffisant pour la semaine."
          />
        </template>
        <template v-else>
          <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            📋 Suggestions de Réapprovisionnement
            <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); margin-left: auto;">
              {{ forecast.ingredients.filter(i => i.reorder_quantity > 0).length }} ingrédient(s)
            </span>
          </h3>
          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            <div
              v-for="ing in forecast.ingredients
                .filter(i => i.reorder_quantity > 0)
                .sort((a, b) => b.reorder_quantity - a.reorder_quantity)
                .slice(0, 8)"
              :key="`reorder-${ing.department_id}-${ing.ingredient_id}`"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem; font-size: 0.85rem;">
                <span style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  {{ ing.ingredient_name }}
                  <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: 0.4rem;">({{ ing.department_name }})</span>
                </span>
                <span style="font-weight: 700; color: var(--indigo-light); white-space: nowrap; margin-left: 0.5rem;">
                  +{{ ing.reorder_quantity.toFixed(1) }} {{ ing.unit }}
                </span>
              </div>
              <div style="height: 5px; background: rgba(255,255,255,0.03); border-radius: 3px; overflow: hidden;">
                <div
                  style="height: 100%; border-radius: 3px; transition: width 0.5s ease;"
                  :style="{
                    width: `${Math.max(2, (ing.reorder_quantity / Math.max(...forecast.ingredients.filter(i => i.reorder_quantity > 0).map(i => i.reorder_quantity), 1)) * 100)}%`,
                    background: 'linear-gradient(90deg, var(--indigo), var(--indigo-light))'
                  }"
                />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Recipe Forecast -->
    <div
      class="glass-panel"
      style="padding: 1.5rem;"
    >
      <template v-if="forecast.recipes.length === 0">
        <EmptyState
          compact
          title="Aucune donnée de vente"
          description="Les prévisions seront disponibles après les premières ventes."
        />
      </template>
      <template v-else>
        <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
          📈 Prévisions de Vente par Recette
          <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); margin-left: auto;">
            Moy. 7 jours
          </span>
        </h3>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div
            v-for="rec in [...forecast.recipes].sort((a, b) => b.avg_daily_revenue - a.avg_daily_revenue).slice(0, 6)"
            :key="rec.recipe_id"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
              <span style="font-weight: 600; font-size: 0.9rem;">{{ rec.recipe_name }}</span>
              <div style="display: flex; gap: 1rem; align-items: center;">
                <span style="font-size: 0.78rem; color: var(--text-secondary);">
                  ~{{ rec.avg_daily_quantity.toFixed(1) }}/j
                </span>
                <span style="font-weight: 700; font-size: 0.9rem; color: var(--emerald);">
                  {{ rec.avg_daily_revenue.toFixed(1) }} TND/j
                </span>
              </div>
            </div>
            <div style="height: 6px; background: rgba(255,255,255,0.03); border-radius: 3px; overflow: hidden;">
              <div
                style="height: 100%; border-radius: 3px; transition: width 0.5s ease;"
                :style="{
                  width: `${Math.max(2, (rec.avg_daily_revenue / Math.max(...forecast.recipes.map(r => r.avg_daily_revenue), 1)) * 100)}%`,
                  background: 'linear-gradient(90deg, var(--emerald), #34d399)'
                }"
              />
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
