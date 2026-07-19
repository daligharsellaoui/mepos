import React, { useState } from 'react';
import type { IngredientForecast, RecipeForecast, ForecastSummary, ForecastData } from '../../types/api';
import { EmptyState } from '../ui/EmptyState';

interface ForecastPanelProps {
  forecast: ForecastData | null;
  isLoading: boolean;
}

// ────────────────────────────────────────────
// CRITICAL STOCK CARDS
// ────────────────────────────────────────────

const CriticalStocksCard: React.FC<{ ingredients: IngredientForecast[]; summary: ForecastSummary }> = ({ ingredients, summary }) => {
  const critical = ingredients.filter(i => i.is_critical);
  const [showAll, setShowAll] = useState(false);
  const display = showAll ? critical : critical.slice(0, 5);

  if (critical.length === 0) return null;

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--coral)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--coral)', margin: 0 }}>
            🚨 {critical.length} ingrédient(s) critique(s)
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Stock bas ou épuisement imminent (≤ 3 jours)
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <div>Coût réappro. estimé</div>
          <div style={{ fontWeight: 700, color: 'var(--amber)', fontSize: '1rem' }}>{summary.total_reorder_cost.toFixed(2)} TND</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {display.map(ing => {
          const depletionDays = ing.days_until_depletion;
          const isUrgent = depletionDays !== null && depletionDays <= 1;
          const isWarning = depletionDays !== null && depletionDays <= 3;

          return (
            <div
              key={`${ing.department_id}-${ing.ingredient_id}`}
              style={{
                padding: '0.85rem 1rem',
                background: isUrgent ? 'rgba(239,68,68,0.08)' : 'rgba(251,191,36,0.06)',
                border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.2)' : 'rgba(251,191,36,0.15)'}`,
                borderRadius: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: isUrgent ? '#fca5a5' : '#fcd34d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isUrgent ? '🔴' : '🟡'} {ing.ingredient_name}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({ing.department_name})</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', fontSize: '0.78rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                  <span>Stock: <strong style={{ color: 'var(--text-primary)' }}>{ing.current_stock.toFixed(2)} {ing.unit}</strong></span>
                  <span>Utilisation/j: <strong>{ing.avg_daily_usage.toFixed(2)} {ing.unit}</strong></span>
                  {depletionDays !== null && (
                    <span>Épuisement: <strong style={{ color: isUrgent ? 'var(--coral)' : 'var(--amber)' }}>{depletionDays} jour{depletionDays > 1 ? 's' : ''}</strong></span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {ing.reorder_quantity > 0 && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Réappro. suggéré</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--indigo-light)', whiteSpace: 'nowrap' }}>
                      +{ing.reorder_quantity.toFixed(2)} {ing.unit}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {critical.length > 5 && (
        <button
          className="touch-btn touch-btn-secondary"
          style={{ marginTop: '0.75rem', width: '100%', minHeight: '36px', padding: '0.5rem', fontSize: '0.85rem' }}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? `Réduire` : `Voir les ${critical.length - 5} autres`}
        </button>
      )}
    </div>
  );
};

// ────────────────────────────────────────────
// DEPLETION TIMELINE
// ────────────────────────────────────────────

const DepletionTimeline: React.FC<{ ingredients: IngredientForecast[] }> = ({ ingredients }) => {
  const items = ingredients
    .filter(i => i.days_until_depletion !== null)
    .sort((a, b) => (a.days_until_depletion || 999) - (b.days_until_depletion || 999))
    .slice(0, 10);

  if (items.length === 0) return null;

  const maxDays = Math.max(...items.map(i => i.days_until_depletion || 7), 7);

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📅 Échéancier d'Épuisement des Stocks
        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          Prochains {items.length} ingrédients
        </span>
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {items.map(ing => {
          const days = ing.days_until_depletion || 0;
          const pct = Math.max(2, Math.min(100, (days / maxDays) * 100));
          const isUrgent = days <= 1;
          const isWarning = days <= 3;

          return (
            <div key={`dep-${ing.department_id}-${ing.ingredient_id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 600, color: isUrgent ? '#fca5a5' : isWarning ? '#fcd34d' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ing.ingredient_name}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>({ing.department_name})</span>
                </span>
                <span style={{ fontWeight: 700, color: isUrgent ? 'var(--coral)' : isWarning ? 'var(--amber)' : 'var(--emerald)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                  {days} jour{days > 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: isUrgent
                      ? 'linear-gradient(90deg, var(--coral), #f87171)'
                      : isWarning
                        ? 'linear-gradient(90deg, var(--amber), #fbbf24)'
                        : 'linear-gradient(90deg, var(--emerald), #34d399)',
                    borderRadius: '3px',
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// REORDER SUGGESTIONS
// ────────────────────────────────────────────

const ReorderSuggestions: React.FC<{ ingredients: IngredientForecast[] }> = ({ ingredients }) => {
  const items = ingredients
    .filter(i => i.reorder_quantity > 0)
    .sort((a, b) => b.reorder_quantity - a.reorder_quantity)
    .slice(0, 8);

  if (items.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <EmptyState
          compact
          title="Aucun réapprovisionnement nécessaire"
          description="Tous les ingrédients ont un stock suffisant pour la semaine."
        />
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📋 Suggestions de Réapprovisionnement
        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {items.length} ingrédient(s)
        </span>
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {items.map(ing => {
          const maxQty = Math.max(...items.map(i => i.reorder_quantity), 1);
          const pct = (ing.reorder_quantity / maxQty) * 100;

          return (
            <div key={`reorder-${ing.department_id}-${ing.ingredient_id}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ing.ingredient_name}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>({ing.department_name})</span>
                </span>
                <span style={{ fontWeight: 700, color: 'var(--indigo-light)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
                  +{ing.reorder_quantity.toFixed(1)} {ing.unit}
                </span>
              </div>
              <div style={{ height: '5px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(2, pct)}%`,
                    background: 'linear-gradient(90deg, var(--indigo), var(--indigo-light))',
                    borderRadius: '3px',
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// RECIPE FORECAST (TOP PERFORMERS)
// ────────────────────────────────────────────

const RecipeForecastCard: React.FC<{ recipes: RecipeForecast[] }> = ({ recipes }) => {
  if (recipes.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <EmptyState
          compact
          title="Aucune donnée de vente"
          description="Les prévisions seront disponibles après les premières ventes."
        />
      </div>
    );
  }

  const topRecipes = [...recipes].sort((a, b) => b.avg_daily_revenue - a.avg_daily_revenue).slice(0, 6);

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📈 Prévisions de Vente par Recette
        <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          Moy. 7 jours
        </span>
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {topRecipes.map(rec => {
          const maxRevenue = Math.max(...topRecipes.map(r => r.avg_daily_revenue), 1);
          const pct = (rec.avg_daily_revenue / maxRevenue) * 100;

          return (
            <div key={rec.recipe_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{rec.recipe_name}</span>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    ~{rec.avg_daily_quantity.toFixed(1)}/j
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--emerald)' }}>
                    {rec.avg_daily_revenue.toFixed(1)} TND/j
                  </span>
                </div>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(2, pct)}%`,
                    background: 'linear-gradient(90deg, var(--emerald), #34d399)',
                    borderRadius: '3px',
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// FORECAST METRICS ROW
// ────────────────────────────────────────────

const ForecastMetrics: React.FC<{ forecast: ForecastData }> = ({ forecast }) => {
  const { summary } = forecast;

  return (
    <div className="metrics-grid" style={{ marginTop: '0.5rem' }}>
      <div className="glass-panel metric-card">
        <span className="metric-title">Recettes Analysées</span>
        <span className="metric-value">
          {summary.total_recipes_analyzed}
          <span className="metric-unit">recettes</span>
        </span>
        <span className="metric-desc">Sur les 7 derniers jours</span>
      </div>

      <div className="glass-panel metric-card">
        <span className="metric-title">Ingrédients Surveillés</span>
        <span className="metric-value">
          {summary.total_ingredients_analyzed}
          <span className="metric-unit">références</span>
        </span>
        <span className="metric-desc">Tous départements</span>
      </div>

      <div className="glass-panel metric-card">
        <span className="metric-title">Critiques</span>
        <span className="metric-value" style={{ color: summary.critical_ingredients > 0 ? 'var(--coral)' : 'var(--emerald)' }}>
          {summary.critical_ingredients}
          <span className="metric-unit">ingrédient(s)</span>
        </span>
        <span className="metric-desc">Stock bas ou ≤ 3j d'épuisement</span>
      </div>

      <div className="glass-panel metric-card">
        <span className="metric-title">CA Journalier Estimé</span>
        <span className="metric-value" style={{ color: 'var(--emerald)' }}>
          {summary.estimated_daily_revenue.toFixed(0)}
          <span className="metric-unit">TND/j</span>
        </span>
        <span className="metric-desc">Moyenne mobile 7 jours</span>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────
// MAIN FORECAST PANEL (composed)
// ────────────────────────────────────────────

export const ForecastLoading: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
    <div className="metrics-grid">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="glass-panel metric-card">
          <div className="skeleton" style={{ width: '60%', height: '0.75rem', borderRadius: '4px', marginBottom: '0.5rem' }} />
          <div className="skeleton" style={{ width: '40%', height: '2rem', borderRadius: '6px' }} />
        </div>
      ))}
    </div>
    <div className="skeleton" style={{ width: '100%', height: '200px', borderRadius: '14px' }} />
  </div>
);

export const ForecastPanel: React.FC<ForecastPanelProps> = ({ forecast, isLoading }) => {
  if (isLoading) {
    return <ForecastLoading />;
  }

  if (!forecast) {
    return (
      <EmptyState
        title="Prévisions non disponibles"
        description="Les données de prévision seront disponibles après les premières synchronisations de ventes."
      />
    );
  }

  const { ingredients, recipes, summary } = forecast;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Section header */}
      <div className="view-title-section" style={{ marginBottom: 0 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            🔮 Prévisions & Analyse
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Généré le {new Date(forecast.generated_at).toLocaleString('fr-FR')} — basé sur les {forecast.days_analyzed} derniers jours
          </p>
        </div>
      </div>

      {/* Metrics row */}
      <ForecastMetrics forecast={forecast} />

      {/* Critical stocks alert banner */}
      <CriticalStocksCard ingredients={ingredients} summary={summary} />

      {/* Grid: depletion + reorder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem' }}>
        <DepletionTimeline ingredients={ingredients} />
        <ReorderSuggestions ingredients={ingredients} />
      </div>

      {/* Recipe forecast */}
      <RecipeForecastCard recipes={recipes} />
    </div>
  );
};
