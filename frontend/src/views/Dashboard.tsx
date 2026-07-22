import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Chart } from 'chart.js/auto';

import { ForecastPanel } from '../components/forecast/ForecastPanel';
import type { ForecastData } from '../types/api';

interface DashboardProps {
  stocks: any[];
  losses: any[];
  recipes: any[];
  departments: any[];
  forecast?: ForecastData | null;
  isForecastLoading?: boolean;
}

const getLossReasonLabel = (reason: string) => {
  const labels: Record<string, string> = {
    spoilage: '🗑️ Périmé / Avarié',
    theft: '🔒 Vol',
    preparation_error: '⚠️ Erreur prépa',
    overproduction: '📦 Surproduction',
    other: '📋 Autre',
  };
  return labels[reason] || reason;
};

// ============================================================
// COOK / COMPTOIR DASHBOARD — Vue opérationnelle cuisine
// ============================================================
const CookDashboard: React.FC<{ stocks: any[]; losses: any[]; recipes: any[]; departments: any[] }> = ({ stocks, losses, recipes, departments }) => {
  const { user } = useAuth();
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);

  // Find kitchen department dynamically
  const kitchenDept = departments.find(d => 
    d.name.toLowerCase().includes('cuisine') || 
    d.name.toLowerCase().includes('kitchen')
  ) || departments.find(d => d.stock_type === 'isolated' && d.id !== 1) || departments[0];

  const kitchenId = kitchenDept ? kitchenDept.id : 2;

  // Stocks du département cuisine
  const deptStocks = stocks.filter(s => s.department_id === kitchenId);
  const criticalStocks = deptStocks.filter(s => parseFloat(s.quantity) <= parseFloat(s.alert_threshold));

  // Pertes du jour (filtrées par date)
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLosses = losses.filter(l => l.created_at && l.created_at.startsWith(todayStr));

  const getStockPercent = (s: any) => {
    const qty = parseFloat(s.quantity);
    const threshold = parseFloat(s.alert_threshold);
    const max = threshold * 4; // on considère 4x le seuil = plein
    return Math.min(100, Math.max(0, (qty / max) * 100));
  };

  const getBarColor = (s: any) => {
    const pct = getStockPercent(s);
    if (pct <= 25) return 'var(--accent-danger)';
    if (pct <= 50) return 'var(--amber)';
    return 'var(--emerald)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="view-title-section">
        <div>
          <h1 className="view-title">👨‍🍳 Poste de Travail — {kitchenDept ? kitchenDept.name : "Cuisine"}</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Bonjour <strong>{user?.first_name}</strong> — Vue en temps réel de ton poste
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {criticalStocks.length > 0 && (
            <span className="badge badge-danger" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              🚨 {criticalStocks.length} stock(s) critique(s)
            </span>
          )}
          {todayLosses.length > 0 && (
            <span className="badge" style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', background: 'rgba(251,191,36,0.12)', color: 'var(--amber)', border: '1px solid rgba(251,191,36,0.25)' }}>
              ⚠️ {todayLosses.length} perte(s) aujourd'hui
            </span>
          )}
        </div>
      </div>

      {/* Alertes critiques en tête si présentes */}
      {criticalStocks.length > 0 && (
        <div style={{ padding: '1rem 1.25rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontWeight: '700', color: 'var(--accent-danger)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>🚨 APPROVISIONNEMENT URGENT REQUIS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {criticalStocks.map(s => (
              <span key={s.id} style={{ padding: '0.3rem 0.8rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', color: '#fca5a5' }}>
                {s.ingredient_name} — {parseFloat(s.quantity).toFixed(2)} {s.unit} restant
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Grille principale : stocks + recettes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>

        {/* PANEL STOCKS CUISINE */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📦 Stocks de la Cuisine
            <span style={{ fontSize: '0.75rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{deptStocks.length} réf(s)</span>
          </h2>

          {deptStocks.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Aucun stock disponible.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {deptStocks
                .sort((a, b) => getStockPercent(a) - getStockPercent(b)) // critiques en haut
                .map(s => {
                  const pct = getStockPercent(s);
                  const isCritical = parseFloat(s.quantity) <= parseFloat(s.alert_threshold);
                  return (
                    <div key={s.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.95rem', color: isCritical ? '#fca5a5' : 'var(--text-primary)' }}>
                          {isCritical && '🔴 '}{s.ingredient_name}
                        </span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          <strong style={{ color: isCritical ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
                            {parseFloat(s.quantity).toFixed(2)}
                          </strong> / {parseFloat(s.alert_threshold).toFixed(2)} {s.unit}
                        </span>
                      </div>
                      <div style={{ height: '7px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: getBarColor(s),
                          borderRadius: '4px',
                          transition: 'width 0.5s ease'
                        }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* PANEL MENU DU JOUR */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🍽️ Menu mePOS
            <span style={{ fontSize: '0.75rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{recipes.length} produit(s)</span>
          </h2>

          {recipes.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>Aucune recette configurée.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {recipes.map(rec => {
                const isSelected = selectedRecipe?.id === rec.id;
                const ings = rec.ingredients || [];
                return (
                  <div key={rec.id}>
                    <div
                      onClick={() => setSelectedRecipe(isSelected ? null : rec)}
                      style={{
                        padding: '0.75rem 1rem',
                        background: isSelected ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : 'var(--border-color)'}`,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{rec.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {ings.length} ingr.
                        </span>
                        <span style={{ fontSize: '0.75rem', color: isSelected ? 'var(--indigo-light)' : 'var(--text-muted)' }}>
                          {isSelected ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {/* Détail de la fiche technique */}
                    {isSelected && ings.length > 0 && (
                      <div style={{ marginTop: '0.4rem', padding: '0.75rem 1rem', background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Composition par portion :</div>
                        {ings.map((ing: any) => (
                          <div key={ing.ingredient_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                            <span>{ing.name || ing.ingredient_name || `#${ing.ingredient_id}`}</span>
                            <span style={{ fontWeight: '600', color: 'var(--indigo-light)' }}>
                              {parseFloat(ing.quantity_needed).toFixed(2)} {ing.unit || 'g'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {isSelected && ings.length === 0 && (
                      <div style={{ marginTop: '0.4rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border-color)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Aucun ingrédient configuré dans cette fiche.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION : Pertes du jour */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📋 Pertes Enregistrées — Aujourd'hui
          {todayLosses.length === 0 && (
            <span style={{ fontSize: '0.8rem', fontWeight: '400', color: 'var(--emerald)', marginLeft: 'auto' }}>✅ Aucune perte ce jour</span>
          )}
        </h2>
        {todayLosses.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Aucune perte déclarée ou détectée aujourd'hui.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {todayLosses.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '10px' }}>
                <div>
                  <strong style={{ fontSize: '0.95rem' }}>{l.ingredient_name}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                    {getLossReasonLabel(l.loss_reason)} · {l.department_name}
                  </div>
                </div>
                <span style={{ fontWeight: '700', color: 'var(--amber)', fontSize: '0.95rem' }}>
                  -{parseFloat(l.quantity).toFixed(2)} {l.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({ stocks, losses, recipes, departments, forecast, isForecastLoading }) => {
  const { user, token, apiUrl } = useAuth();
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };
  const isAdmin = user?.role === 'admin';
  const isCook = user?.role === 'cook';

  // Chart Canvas Refs & Instances
  const salesHistoryChartRef = useRef<HTMLCanvasElement | null>(null);
  const salesDistributionChartRef = useRef<HTMLCanvasElement | null>(null);
  const lossIngredientsChartRef = useRef<HTMLCanvasElement | null>(null);
  const lossReasonsChartRef = useRef<HTMLCanvasElement | null>(null);

  const salesHistoryInstance = useRef<any>(null);
  const salesDistributionInstance = useRef<any>(null);
  const lossIngredientsInstance = useRef<any>(null);
  const lossReasonsInstance = useRef<any>(null);

  const [salesHistory, setSalesHistory] = useState<any[]>([]);



  // Helper to get formatted date string (YYYY-MM-DD)
  const getFormattedDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getFormattedDate(new Date());
  const yesterdayStr = getFormattedDate(new Date(Date.now() - 24 * 3600 * 1000));
  const weekAgoStr = getFormattedDate(new Date(Date.now() - 7 * 24 * 3600 * 1000));

  // Date filtering state
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'week' | 'custom'>('today');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  // Shift/Hourly filtering state
  const [filterHours, setFilterHours] = useState(false);
  const [startHour, setStartHour] = useState('00:00');
  const [endHour, setEndHour] = useState('23:59');

  // Sales statistics state
  const [salesStats, setSalesStats] = useState<{
    total_revenue: number;
    total_items_sold: number;
    items: any[];
  }>({
    total_revenue: 0,
    total_items_sold: 0,
    items: []
  });

  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const fetchSalesStats = async () => {
    if (isCook) return;
    setIsLoadingStats(true);
    try {
      let url = `${apiUrl}/sales/stats?startDate=${startDate}&endDate=${endDate}`;
      if (filterHours) {
        url += `&startHour=${startHour}&endHour=${endHour}`;
      }
      const response = await fetch(url, {
        headers: getAuthHeaders()
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        setSalesStats(resJson.data);
      }
    } catch (err) {
      console.error('Error fetching sales stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Trigger fetch when start or end date/hour changes
  useEffect(() => {
    if (isCook) return;
    fetchSalesStats();
    const interval = setInterval(fetchSalesStats, 7000); // Poll every 7s
    return () => clearInterval(interval);
  }, [startDate, endDate, filterHours, startHour, endHour, isCook]);

  // Adjust dates based on period selection
  const handlePeriodChange = (newPeriod: 'today' | 'yesterday' | 'week' | 'custom') => {
    setPeriod(newPeriod);
    if (newPeriod === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (newPeriod === 'yesterday') {
      setStartDate(yesterdayStr);
      setEndDate(yesterdayStr);
    } else if (newPeriod === 'week') {
      setStartDate(weekAgoStr);
      setEndDate(todayStr);
    }
  };

  const fetchSalesHistory = async () => {
    try {
      const response = await fetch(`${apiUrl}/sales/history`, {
        headers: getAuthHeaders()
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        setSalesHistory(resJson.data);
      }
    } catch (err) {
      console.error('Error fetching sales history:', err);
    }
  };

  // Fetch sales history once on mount
  useEffect(() => {
    if (isAdmin) {
      fetchSalesHistory();
    }
  }, []);

  // Update and render all Chart.js instances
  useEffect(() => {
    if (!isAdmin) return;

    // 1. Line Chart: Sales History (CA)
    if (salesHistoryChartRef.current && salesHistory.length > 0) {
      if (salesHistoryInstance.current && salesHistoryInstance.current.ctx) {
        salesHistoryInstance.current.data.labels = salesHistory.map(h => {
          const parts = h.date.split('-');
          return parts.length === 3 ? `${parts[2]}/${parts[1]}` : h.date;
        });
        salesHistoryInstance.current.data.datasets[0].data = salesHistory.map(h => h.revenue);
        salesHistoryInstance.current.update();
      } else {
        const ctx = salesHistoryChartRef.current.getContext('2d');
        if (ctx) {
          salesHistoryInstance.current = new Chart(ctx, {
            type: 'line',
            data: {
              labels: salesHistory.map(h => {
                const parts = h.date.split('-');
                return parts.length === 3 ? `${parts[2]}/${parts[1]}` : h.date;
              }),
              datasets: [{
                label: "Chiffre d'Affaires",
                data: salesHistory.map(h => h.revenue),
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
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (context) => context.parsed.y !== null ? ` ${context.parsed.y.toFixed(2)} TND` : ''
                  }
                }
              },
              scales: {
                y: {
                  grid: { color: 'rgba(255, 255, 255, 0.04)' },
                  ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } }
                },
                x: {
                  grid: { display: false },
                  ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } }
                }
              }
            }
          });
        }
      }
    }

    // 2. Doughnut Chart: Sales Distribution (Active Period)
    if (salesDistributionChartRef.current && salesStats.items.length > 0) {
      const chartColors = [
        '#6366f1', // Indigo
        '#10b981', // Emerald
        '#f59e0b', // Amber
        '#ec4899', // Pink
        '#8b5cf6', // Violet
        '#3b82f6', // Sky Blue
        '#f43f5e', // Rose
        '#14b8a6', // Teal
        '#f97316', // Orange
        '#a855f7', // Light Purple
        '#06b6d4', // Cyan
        '#84cc16'  // Lime
      ];
      if (salesDistributionInstance.current && salesDistributionInstance.current.ctx) {
        salesDistributionInstance.current.data.labels = salesStats.items.map(i => i.recipe_name);
        salesDistributionInstance.current.data.datasets[0].data = salesStats.items.map(i => i.quantity);
        salesDistributionInstance.current.data.datasets[0].backgroundColor = chartColors;
        salesDistributionInstance.current.update();
      } else {
        const ctx = salesDistributionChartRef.current.getContext('2d');
        if (ctx) {
          salesDistributionInstance.current = new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: salesStats.items.map(i => i.recipe_name),
              datasets: [{
                data: salesStats.items.map(i => i.quantity),
                backgroundColor: chartColors,
                borderWidth: 2,
                borderColor: '#11131c'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: { 
                    color: '#f8fafc', 
                    font: { family: 'Outfit', size: 11 },
                    boxWidth: 12,
                    padding: 10
                  }
                }
              }
            }
          });
        }
      }
    }

    // 3. Bar Chart: Loss Cost per Ingredient (Top 5)
    if (lossIngredientsChartRef.current && losses.length > 0) {
      const ingLoss: Record<string, number> = {};
      losses.forEach(l => {
        ingLoss[l.ingredient_name] = (ingLoss[l.ingredient_name] || 0) + parseFloat(l.cost_loss);
      });
      const sorted = Object.keys(ingLoss)
        .map(name => ({ name, cost: ingLoss[name] }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5);

      if (lossIngredientsInstance.current && lossIngredientsInstance.current.ctx) {
        lossIngredientsInstance.current.data.labels = sorted.map(s => s.name);
        lossIngredientsInstance.current.data.datasets[0].data = sorted.map(s => s.cost);
        lossIngredientsInstance.current.update();
      } else {
        const ctx = lossIngredientsChartRef.current.getContext('2d');
        if (ctx) {
          lossIngredientsInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: sorted.map(s => s.name),
              datasets: [{
                label: 'Coût Perdu (TND)',
                data: sorted.map(s => s.cost),
                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                borderColor: '#ef4444',
                borderWidth: 1.5,
                borderRadius: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                y: {
                  grid: { color: 'rgba(255, 255, 255, 0.04)' },
                  ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 11 } }
                },
                x: {
                  grid: { display: false },
                  ticks: { color: '#94a3b8', font: { family: 'Outfit', size: 10 } }
                }
              }
            }
          });
        }
      }
    }

    // 4. Pie Chart: Loss Cost by Reason
    if (lossReasonsChartRef.current && losses.length > 0) {
      const reasonLoss: Record<string, number> = {};
      losses.forEach(l => {
        const reasonLabel = getLossReasonLabel(l.loss_reason);
        reasonLoss[reasonLabel] = (reasonLoss[reasonLabel] || 0) + parseFloat(l.cost_loss);
      });

      if (lossReasonsInstance.current && lossReasonsInstance.current.ctx) {
        lossReasonsInstance.current.data.labels = Object.keys(reasonLoss);
        lossReasonsInstance.current.data.datasets[0].data = Object.values(reasonLoss);
        lossReasonsInstance.current.update();
      } else {
        const ctx = lossReasonsChartRef.current.getContext('2d');
        if (ctx) {
          lossReasonsInstance.current = new Chart(ctx, {
            type: 'pie',
            data: {
              labels: Object.keys(reasonLoss),
              datasets: [{
                data: Object.values(reasonLoss),
                backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6'],
                borderWidth: 2,
                borderColor: '#11131c'
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: { 
                    color: '#f8fafc', 
                    font: { family: 'Outfit', size: 11 },
                    boxWidth: 12,
                    padding: 10
                  }
                }
              }
            }
          });
        }
      }
    }
  }, [salesHistory, salesStats, losses]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (salesHistoryInstance.current) {
        salesHistoryInstance.current.destroy();
        salesHistoryInstance.current = null;
      }
      if (salesDistributionInstance.current) {
        salesDistributionInstance.current.destroy();
        salesDistributionInstance.current = null;
      }
      if (lossIngredientsInstance.current) {
        lossIngredientsInstance.current.destroy();
        lossIngredientsInstance.current = null;
      }
      if (lossReasonsInstance.current) {
        lossReasonsInstance.current.destroy();
        lossReasonsInstance.current = null;
      }
    };
  }, []);

  // Vue dédiée cuisinier/comptoir
  if (isCook) {
    return <CookDashboard stocks={stocks} losses={losses} recipes={recipes} departments={departments} />;
  }

  // Admin/Manager: all departments
  const filteredStocks = stocks;
  const lowStockAlerts = filteredStocks.filter(s => parseFloat(s.quantity) <= parseFloat(s.alert_threshold));
  
  // Financial Calculations (Admin only)
  const totalPurchaseValue = stocks.reduce((acc, s) => {
    return acc + (parseFloat(s.quantity) * parseFloat(s.purchase_price_per_unit));
  }, 0);

  const totalLossCost = losses.reduce((acc, l) => acc + parseFloat(l.cost_loss), 0);
  const totalOpportunityLoss = losses.reduce((acc, l) => acc + parseFloat(l.opportunity_loss), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="view-title-section">
        <div>
          <h1 className="view-title">Tableau de bord</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Bienvenue, {user?.first_name} {user?.last_name} ({user?.role.toUpperCase()})
          </p>
        </div>
      </div>

      {/* Forecast Section (Admin only) */}
      {isAdmin && (
        <ForecastPanel forecast={forecast || null} isLoading={isForecastLoading || false} />
      )}

      {/* Divider between forecast and dashboard */}
      {isAdmin && forecast && (
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.5rem 0' }} />
      )}

      <div className="metrics-grid">
        {/* Metric 1: Low stock alerts count */}
        <div className="glass-panel metric-card">
          <span className="metric-title">Alertes Stock Bas</span>
          <span className="metric-value" style={{ color: lowStockAlerts.length > 0 ? 'var(--accent-danger)' : 'var(--accent-primary)' }}>
            {lowStockAlerts.length}
            <span className="metric-unit">ingrédient(s)</span>
          </span>
          <span className="metric-desc">Sous le seuil d'alerte critique</span>
        </div>

        {/* Metric 2: Total recipes registered */}
        <div className="glass-panel metric-card">
          <span className="metric-title">Fiches Recettes</span>
          <span className="metric-value">
            {recipes.length}
            <span className="metric-unit">recettes</span>
          </span>
          <span className="metric-desc">Actives au menu de mePOS</span>
        </div>

        {/* Metric 3: Stocks value or total ingredients count */}
        {isAdmin ? (
          <div className="glass-panel metric-card">
            <span className="metric-title">Valeur Stock Central</span>
            <span className="metric-value" style={{ color: 'var(--accent-info)' }}>
              {totalPurchaseValue.toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="metric-unit"> TND</span>
            </span>
            <span className="metric-desc">Coût d'achat total des matières premières</span>
          </div>
        ) : (
          <div className="glass-panel metric-card">
            <span className="metric-title">Matières Stockées</span>
            <span className="metric-value">
              {filteredStocks.length}
              <span className="metric-unit">références</span>
            </span>
            <span className="metric-desc">Total d'ingrédients suivis en cuisine</span>
          </div>
        )}

        {/* Metric 4: Loss indicators (Financial or Quantitative) */}
        {isAdmin ? (
          <div className="glass-panel metric-card">
            <span className="metric-title">Perte Sèche & Manque à Gagner</span>
            <span className="metric-value" style={{ color: 'var(--accent-danger)' }}>
              {totalLossCost.toFixed(2)}
              <span className="metric-unit"> TND</span>
            </span>
            <span className="metric-desc" style={{ color: '#fca5a5' }}>
              Opportunités perdues : <strong>{totalOpportunityLoss.toFixed(2)} TND</strong>
            </span>
          </div>
        ) : (
          <div className="glass-panel metric-card">
            <span className="metric-title">Déclarations de Pertes</span>
            <span className="metric-value" style={{ color: 'var(--accent-warn)' }}>
              {losses.length}
              <span className="metric-unit">incidents</span>
            </span>
            <span className="metric-desc">Ingrédients déclarés jetés / abîmés</span>
          </div>
        )}
      </div>

      {/* 📈 SECTION GRAPHIQUES DECISIONNELS (ADMIN ONLY) */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Chart 1: Evolution CA */}
          <div className="glass-panel" style={{ padding: '1.5rem', height: '340px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700' }}>
              📈 Évolution du Chiffre d'Affaires (7 derniers jours)
            </h3>
            <div style={{ height: '230px', position: 'relative', width: '100%', minHeight: 0 }}>
              <canvas ref={salesHistoryChartRef} />
            </div>
          </div>

          {/* Chart 2: Repartition Ventes */}
          <div className="glass-panel" style={{ padding: '1.5rem', height: '340px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontWeight: '700' }}>
              🍕 Répartition des Ventes par Produit (Période active)
            </h3>
            <div style={{ height: '230px', position: 'relative', width: '100%', minHeight: 0 }}>
              <canvas ref={salesDistributionChartRef} />
            </div>
          </div>

          {/* Chart 3: Top Ingrédients Gâchés */}
          <div className="glass-panel" style={{ padding: '1.5rem', height: '340px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontWeight: '700' }}>
              🗑️ Coût Financier Perdu par Ingrédient (Top 5)
            </h3>
            <div style={{ height: '230px', position: 'relative', width: '100%', minHeight: 0 }}>
              <canvas ref={lossIngredientsChartRef} />
            </div>
          </div>

          {/* Chart 4: Motif des pertes */}
          <div className="glass-panel" style={{ padding: '1.5rem', height: '340px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontWeight: '700' }}>
              🎯 Répartition Financière des Pertes par Motif
            </h3>
            <div style={{ height: '230px', position: 'relative', width: '100%', minHeight: 0 }}>
              <canvas ref={lossReasonsChartRef} />
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Left widget: Critical Stocks list */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Alertes de Stock Critique
          </h2>
          {lowStockAlerts.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Aucune alerte de stock à signaler.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {lowStockAlerts.map(alert => (
                <div 
                  key={alert.id} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '0.75rem',
                    background: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.15)',
                    borderRadius: '8px'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>{alert.ingredient_name}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Département: {alert.department_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="badge badge-danger" style={{ fontSize: '0.8rem' }}>
                      {parseFloat(alert.quantity).toFixed(2)} / {parseFloat(alert.alert_threshold).toFixed(2)} {alert.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right widget: Loss logs overview */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Pertes Récentes Déclarées
          </h2>
          {losses.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Aucune perte déclarée récemment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {losses.slice(0, 4).map(loss => (
                <div 
                  key={loss.id} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '0.75rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.95rem' }}>{loss.ingredient_name}</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Qté: {parseFloat(loss.quantity).toFixed(2)} {loss.unit} | Motif: {loss.loss_reason}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.9rem', color: 'var(--accent-danger)', fontWeight: '600' }}>
                    {isAdmin ? `-${parseFloat(loss.cost_loss).toFixed(2)} TND` : '*** TND'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SALES STATISTICS SECTION */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem' }}>
              📊 Statistiques des Produits Vendus {isLoadingStats && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal', marginLeft: '0.5rem' }}>(Mise à jour...)</span>}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Visualisez les performances de vente de mePOS sur la période sélectionnée.
            </p>
          </div>

          {/* Period selector */}
          <div className="dept-filter-section" style={{ margin: 0 }}>
            <div className={`dept-pill ${period === 'today' ? 'active' : ''}`} onClick={() => handlePeriodChange('today')}>
              Aujourd'hui
            </div>
            <div className={`dept-pill ${period === 'yesterday' ? 'active' : ''}`} onClick={() => handlePeriodChange('yesterday')}>
              Hier
            </div>
            <div className={`dept-pill ${period === 'week' ? 'active' : ''}`} onClick={() => handlePeriodChange('week')}>
              7 derniers jours
            </div>
            <div className={`dept-pill ${period === 'custom' ? 'active' : ''}`} onClick={() => handlePeriodChange('custom')}>
              Personnalisé
            </div>
          </div>
        </div>

        {/* Filter controls panel (Custom dates and Shift hours) */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '1rem', 
          marginBottom: '1.5rem', 
          background: 'rgba(255,255,255,0.01)', 
          padding: '1.25rem', 
          borderRadius: '12px', 
          border: '1px solid var(--border-color)' 
        }}>
          {/* Row 1: Custom Dates if selected */}
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', borderBottom: filterHours ? '1px solid var(--border-color)' : 'none', paddingBottom: filterHours ? '1rem' : 0, marginBottom: filterHours ? '0.5rem' : 0 }}>
              <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <span className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Date Début :</span>
                <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ minHeight: '38px', padding: '0.4rem 0.8rem' }} />
              </div>
              <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <span className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Date Fin :</span>
                <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ minHeight: '38px', padding: '0.4rem 0.8rem' }} />
              </div>
              <button className="touch-btn touch-btn-secondary" style={{ minHeight: '38px', padding: '0.5rem 1rem', fontSize: '0.875rem' }} onClick={fetchSalesStats}>
                Filtrer
              </button>
            </div>
          )}

          {/* Row 2: Shift / Hourly Filter */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.925rem', fontWeight: '500', userSelect: 'none' }}>
              <input 
                type="checkbox" 
                checked={filterHours} 
                onChange={e => setFilterHours(e.target.checked)} 
                style={{ 
                  width: '18px', 
                  height: '18px', 
                  accentColor: 'var(--indigo)', 
                  cursor: 'pointer' 
                }} 
              />
              <span>Filtrer par heures (Shifts / Services)</span>
            </label>

            {filterHours && (
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Heure Début :</span>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={startHour} 
                    onChange={e => setStartHour(e.target.value)} 
                    style={{ minHeight: '38px', padding: '0.4rem 0.8rem' }}
                  />
                </div>
                <div className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Heure Fin :</span>
                  <input 
                    type="time" 
                    className="form-input" 
                    value={endHour} 
                    onChange={e => setEndHour(e.target.value)} 
                    style={{ minHeight: '38px', padding: '0.4rem 0.8rem' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats KPIs row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ padding: '1.25rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Chiffre d'Affaires de la période</span>
            <span style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--emerald)', marginTop: '0.5rem' }}>
              {isAdmin 
                ? `${salesStats.total_revenue.toLocaleString('fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND` 
                : '*** TND'
              }
            </span>
          </div>

          <div style={{ padding: '1.25rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '12px', display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total Produits Vendus</span>
            <span style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--indigo-light)', marginTop: '0.5rem' }}>
              {salesStats.total_items_sold.toLocaleString()}
              <span style={{ fontSize: '1rem', fontWeight: '400', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}> unité(s)</span>
            </span>
          </div>
        </div>

        {/* List of items sold with visually premium progress bar */}
        {salesStats.items.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
            Aucune vente enregistrée pour cette période.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            
            {/* Left: Top sales visualizer */}
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem' }}>🏆 Top Ventes (Volumes)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {salesStats.items
                  .sort((a, b) => b.quantity - a.quantity)
                  .map(item => {
                    const ratio = salesStats.total_items_sold > 0 
                      ? (item.quantity / salesStats.total_items_sold) * 100 
                      : 0;

                    return (
                      <div key={item.recipe_id} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
                          <span style={{ fontWeight: '600' }}>{item.recipe_name}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            <strong>{item.quantity}</strong> sold ({ratio.toFixed(0)}%)
                          </span>
                        </div>
                        {/* Progress Bar */}
                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div 
                            style={{ 
                              height: '100%', 
                              width: `${ratio}%`, 
                              background: 'linear-gradient(90deg, var(--indigo) 0%, var(--indigo-light) 100%)', 
                              borderRadius: '4px',
                              transition: 'width 0.4s ease-out'
                            }} 
                          />
                        </div>
                      </div>
                    );
                })}
              </div>
            </div>

            {/* Right: Detailed Table */}
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem' }}>📝 Rapport de Vente Détaillé</h3>
              <div className="table-wrapper" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table className="mepos-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Quantité</th>
                      <th>Prix Unitaire</th>
                      <th>Chiffre d'Affaires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesStats.items.map(item => (
                      <tr key={item.recipe_id}>
                        <td><strong>{item.recipe_name}</strong></td>
                        <td style={{ fontWeight: '600' }}>{item.quantity} pcs</td>
                        <td>{parseFloat(item.unit_price).toFixed(2)} TND</td>
                        <td style={{ color: 'var(--emerald)', fontWeight: '600' }}>
                          {isAdmin 
                            ? `${parseFloat(item.total_revenue).toFixed(2)} TND` 
                            : '*** TND'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
};

