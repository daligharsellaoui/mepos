import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { api } from './services/api';
import type { TabRoute, LossAlert } from './types/api';

// Lazy-loaded views for code splitting
const Dashboard = lazy(() => import('./views/Dashboard').then(m => ({ default: m.Dashboard })));
const Inventory = lazy(() => import('./views/Inventory').then(m => ({ default: m.Inventory })));
const LossTracker = lazy(() => import('./views/LossTracker').then(m => ({ default: m.LossTracker })));
const StockTransfer = lazy(() => import('./views/StockTransfer').then(m => ({ default: m.StockTransfer })));
const Settings = lazy(() => import('./views/Settings').then(m => ({ default: m.Settings })));

const PageLoader: React.FC = () => (
  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
    Chargement...
  </div>
);

// ======================================================
// MAIN APP CONTENT
// ======================================================

const MainAppContent: React.FC = () => {
  const { user, login, logout, isLoading, error, token } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabRoute>('dashboard');

  // Data from API
  const [stocks, setStocks] = useState<any[]>([]);
  const [losses, setLosses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);

  // Offline & sync
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Loss alerts
  const [alerts, setAlerts] = useState<LossAlert[]>([]);
  const knownLossIds = useRef<Set<number>>(new Set());

  // Network status
  useEffect(() => {
    const handleOnline = () => { setIsOffline(false); syncOfflineActions(); };
    const handleOffline = () => { setIsOffline(true); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Detect new losses for real-time alerts
  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) return;
    if (losses.length === 0) return;

    if (knownLossIds.current.size === 0) {
      losses.forEach((l: any) => knownLossIds.current.add(l.id));
      return;
    }

    const newAlerts: LossAlert[] = [];
    losses.forEach((l: any) => {
      if (!knownLossIds.current.has(l.id)) {
        knownLossIds.current.add(l.id);
        newAlerts.push({
          id: l.id,
          ingredientName: l.ingredient_name || 'Inconnu',
          quantity: parseFloat(l.quantity),
          unit: l.unit || 'g',
          departmentName: l.department_name || 'Dépôt',
          reason: l.loss_reason,
          costLoss: parseFloat(l.cost_loss),
          opportunityLoss: parseFloat(l.opportunity_loss),
          timestamp: new Date(l.created_at || Date.now()),
        });
      }
    });

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev]);
      newAlerts.forEach(alert => {
        setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== alert.id)), 15000);
      });
    }
  }, [losses, user]);

  const handleCloseAlert = (id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // ======================================================
  // DATA FETCHING
  // ======================================================

  const loadOfflineCache = () => {
    const load = (key: string, setter: (d: any) => void) => {
      const cached = localStorage.getItem(key);
      if (cached) setter(JSON.parse(cached));
    };
    load('mepos_stocks', setStocks);
    load('mepos_losses', setLosses);
    load('mepos_departments', setDepartments);
    load('mepos_ingredients', setIngredients);
    load('mepos_recipes', setRecipes);
  };

  const saveToCache = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const fetchData = async () => {
    if (!user) return;
    if (!navigator.onLine) {
      loadOfflineCache();
      setIsOffline(true);
      return;
    }

    try {
      const [stocksRes, lossesRes, deptsRes, ingsRes, recipesRes] = await Promise.all([
        api.getStocks(),
        api.getLosses(),
        api.getDepartments(),
        api.getIngredients(),
        api.getRecipes(),
      ]);

      if (stocksRes.status === 'success') { setStocks(stocksRes.data as any[]); saveToCache('mepos_stocks', stocksRes.data); }
      if (lossesRes.status === 'success') { setLosses(lossesRes.data as any[]); saveToCache('mepos_losses', lossesRes.data); }
      if (deptsRes.status === 'success') { setDepartments(deptsRes.data as any[]); saveToCache('mepos_departments', deptsRes.data); }
      if (ingsRes.status === 'success') { setIngredients(ingsRes.data as any[]); saveToCache('mepos_ingredients', ingsRes.data); }
      if (recipesRes.status === 'success') { setRecipes(recipesRes.data as any[]); saveToCache('mepos_recipes', recipesRes.data); }

      setIsOffline(false);
      syncOfflineActions();
    } catch (err) {
      console.warn('Network error:', err);
      loadOfflineCache();
      setIsOffline(true);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
      const interval = setInterval(fetchData, 8000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // ======================================================
  // OFFLINE QUEUE
  // ======================================================

  const queueOfflineAction = (type: string, data: any) => {
    const action = { id: Date.now() + Math.random(), type, data, timestamp: new Date().toISOString() };
    const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]');
    queue.push(action);
    localStorage.setItem('mepos_offline_queue', JSON.stringify(queue));

    // Optimistic update for losses
    if (type === 'losses') {
      const ing = ingredients.find((i: any) => i.id === parseInt(data.ingredient_id));
      const dept = departments.find((d: any) => d.id === parseInt(data.department_id));
      const pPrice = stocks.find((s: any) => s.ingredient_id === parseInt(data.ingredient_id))?.purchase_price_per_unit || '0';
      const costLoss = parseFloat(pPrice) * parseFloat(data.quantity);
      const tempLoss = {
        id: action.id, ingredient_id: parseInt(data.ingredient_id),
        ingredient_name: ing?.name || 'Ingrédient', quantity: data.quantity,
        unit: data.unit || ing?.unit || 'g',
        department_id: parseInt(data.department_id), department_name: dept?.name || 'Dépôt',
        loss_reason: data.loss_reason, cost_loss: costLoss.toString(),
        opportunity_loss: (costLoss * 2.5).toString(), created_at: action.timestamp, is_offline: true
      };
      setLosses(prev => [tempLoss, ...prev]);

      const newStocks = stocks.map((s: any) => {
        if (s.ingredient_id === parseInt(data.ingredient_id) && s.department_id === parseInt(data.department_id)) {
          return { ...s, quantity: Math.max(0, parseFloat(s.quantity) - parseFloat(data.quantity)).toString() };
        }
        return s;
      });
      setStocks(newStocks);
    }

    if (type === 'transfers') {
      setStocks((prev: any[]) => prev.map((s: any) => {
        if (s.ingredient_id === parseInt(data.ingredient_id)) {
          if (s.department_id === parseInt(data.source_dept_id)) {
            return { ...s, quantity: Math.max(0, parseFloat(s.quantity) - parseFloat(data.quantity)).toString() };
          }
          if (s.department_id === parseInt(data.dest_dept_id)) {
            return { ...s, quantity: (parseFloat(s.quantity) + parseFloat(data.quantity)).toString() };
          }
        }
        return s;
      }));
    }

    if (type === 'adjustments') {
      setStocks((prev: any[]) => prev.map((s: any) => {
        if (s.ingredient_id === parseInt(data.ingredient_id) && s.department_id === parseInt(data.department_id)) {
          let newQty = parseFloat(s.quantity);
          if (data.type === 'purchase') newQty = Math.max(0, newQty + parseFloat(data.quantity));
          else if (data.type === 'reconciliation') newQty = Math.max(0, parseFloat(data.quantity));
          return { ...s, quantity: newQty.toString() };
        }
        return s;
      }));
    }
  };

  const syncOfflineActions = async () => {
    const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]');
    if (queue.length === 0) return;
    setIsSyncing(true);

    const remaining: any[] = [];
    let hasFailed = false;

    for (const action of queue) {
      if (hasFailed) { remaining.push(action); continue; }
      try {
        let url = '';
        if (action.type === 'losses') url = '/losses';
        if (action.type === 'transfers') url = '/transfers';
        if (action.type === 'adjustments') url = '/inventory/adjust';

        const fetcher = () => action.type === 'losses' ? api.createLoss(action.data)
          : action.type === 'transfers' ? api.transferStock(action.data)
          : api.adjustStock(action.data);

        const res = await fetcher();
        if (res.status !== 'success') remaining.push(action);
      } catch {
        hasFailed = true;
        remaining.push(action);
      }
    }

    localStorage.setItem('mepos_offline_queue', JSON.stringify(remaining));
    setIsSyncing(false);
    if (!hasFailed) fetchData();
  };

  // ======================================================
  // ACTION HANDLERS
  // ======================================================

  const handleLossSubmit = async (lossData: any) => {
    if (isOffline || !navigator.onLine) return queueOfflineAction('losses', lossData);
    try {
      const res = await api.createLoss(lossData);
      if (res.status === 'success') { fetchData(); return true; }
      return false;
    } catch {
      setIsOffline(true);
      return queueOfflineAction('losses', lossData);
    }
  };

  const handleTransferSubmit = async (transferData: any) => {
    if (isOffline || !navigator.onLine) return queueOfflineAction('transfers', transferData);
    try {
      const res = await api.transferStock(transferData);
      if (res.status === 'success') { fetchData(); return true; }
      return false;
    } catch {
      setIsOffline(true);
      return queueOfflineAction('transfers', transferData);
    }
  };

  const handleAdjustSubmit = async (adjustData: any) => {
    if (isOffline || !navigator.onLine) return queueOfflineAction('adjustments', adjustData);
    try {
      const res = await api.adjustStock(adjustData);
      if (res.status === 'success') { fetchData(); return true; }
      return false;
    } catch {
      setIsOffline(true);
      return queueOfflineAction('adjustments', adjustData);
    }
  };

  const toggleOfflineManual = () => setIsOffline(prev => !prev);

  // ======================================================
  // RENDER
  // ======================================================

  if (!user) {
    return <LoginPage onLogin={login} isLoading={isLoading} error={error} />;
  }

  const renderActiveView = () => {
    const viewProps = {
      dashboard: <Dashboard stocks={stocks} losses={losses} recipes={recipes} departments={departments} />,
      inventory: <Inventory stocks={stocks} departments={departments} onRefresh={fetchData} />,
      losses: (
        <LossTracker
          losses={losses} stocks={stocks} departments={departments}
          ingredients={ingredients} onRefresh={fetchData} onSubmitLoss={handleLossSubmit}
        />
      ),
      transfers: (
        <StockTransfer
          stocks={stocks} departments={departments} ingredients={ingredients}
          onSubmitTransfer={handleTransferSubmit} onRefresh={fetchData}
        />
      ),
      settings: (
        <Settings
          ingredients={ingredients} recipes={recipes} onRefresh={fetchData}
          isOffline={isOffline} onSubmitAdjust={handleAdjustSubmit}
        />
      ),
    };

    return viewProps[activeTab] || viewProps.dashboard;
  };

  return (
    <ErrorBoundary>
      <AppShell
        user={user}
        activeTab={activeTab}
        isOffline={isOffline}
        isSyncing={isSyncing}
        alerts={alerts}
        onTabChange={setActiveTab}
        onLogout={logout}
        onToggleOffline={toggleOfflineManual}
        onCloseAlert={handleCloseAlert}
      >
        <Suspense fallback={<PageLoader />}>
          {renderActiveView()}
        </Suspense>
      </AppShell>
    </ErrorBoundary>
  );
};

// ======================================================
// APP ENTRY
// ======================================================

const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
};

export default App;
