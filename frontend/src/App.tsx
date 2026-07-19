import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Dashboard } from './views/Dashboard';
import { Inventory } from './views/Inventory';
import { LossTracker } from './views/LossTracker';
import { StockTransfer } from './views/StockTransfer';
import { Settings } from './views/Settings';

// ==========================================================================
// CLEAN FLAT SVG ICONS
// ==========================================================================

const IconDashboard = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);

const IconInventory = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const IconLosses = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconTransfers = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const IconSettings = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconLogout = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const MainAppContent: React.FC = () => {
  const { user, login, logout, isLoading, error, token, apiUrl } = useAuth();

  // Helper to get auth headers (JWT for frontend)
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };
  
  // Tab Switching state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'losses' | 'transfers' | 'settings'>('dashboard');

  // Datasets from API
  const [stocks, setStocks] = useState<any[]>([]);
  const [losses, setLosses] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);

  // Form inputs
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Real-time loss alert state
  interface LossAlert {
    id: number;
    ingredientName: string;
    quantity: number;
    unit: string;
    departmentName: string;
    reason: string;
    costLoss: number;
    opportunityLoss: number;
    timestamp: Date;
  }
  const [alerts, setAlerts] = useState<LossAlert[]>([]);
  const knownLossIds = useRef<Set<number>>(new Set());

  // Connection & sync states
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Monitor connection changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      syncOfflineActions();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const offlineBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.25rem 0.6rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '600',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    color: '#ef4444'
  };

  const onlineBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.25rem 0.6rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '600',
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    color: '#10b981'
  };

  // Detect and notify newly reported losses in real time (for Admin and Manager)
  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      return;
    }
    if (losses.length === 0) return;

    if (knownLossIds.current.size === 0) {
      // First load: just populate known loss IDs without displaying alerts
      losses.forEach(l => knownLossIds.current.add(l.id));
      return;
    }

    const newAlerts: LossAlert[] = [];
    losses.forEach(l => {
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
          timestamp: new Date(l.created_at || Date.now())
        });
      }
    });

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev]);

      // Dismiss each toast alert automatically after 15 seconds
      newAlerts.forEach(alert => {
        setTimeout(() => {
          setAlerts(prev => prev.filter(a => a.id !== alert.id));
        }, 15000);
      });
    }
  }, [losses, user]);

  const handleCloseAlert = (id: number) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const loadOfflineCache = () => {
    const cachedStocks = localStorage.getItem('mepos_stocks');
    const cachedLosses = localStorage.getItem('mepos_losses');
    const cachedDepts = localStorage.getItem('mepos_departments');
    const cachedIngs = localStorage.getItem('mepos_ingredients');
    const cachedRecipes = localStorage.getItem('mepos_recipes');

    if (cachedStocks) setStocks(JSON.parse(cachedStocks));
    if (cachedLosses) setLosses(JSON.parse(cachedLosses));
    if (cachedDepts) setDepartments(JSON.parse(cachedDepts));
    if (cachedIngs) setIngredients(JSON.parse(cachedIngs));
    if (cachedRecipes) setRecipes(JSON.parse(cachedRecipes));
  };

  const fetchData = async () => {
    if (!user) return;
    if (!navigator.onLine) {
      loadOfflineCache();
      setIsOffline(true);
      return;
    }

    try {
      const headers = getAuthHeaders();

      const [stocksRes, lossesRes, deptsRes, ingsRes, recipesRes] = await Promise.all([
        fetch(`${apiUrl}/stocks`, { headers }).then(r => r.json()),
        fetch(`${apiUrl}/losses`, { headers }).then(r => r.json()),
        fetch(`${apiUrl}/departments`, { headers }).then(r => r.json()),
        fetch(`${apiUrl}/ingredients`, { headers }).then(r => r.json()),
        fetch(`${apiUrl}/recipes`, { headers }).then(r => r.json())
      ]);

      if (stocksRes.status === 'success') {
        setStocks(stocksRes.data);
        localStorage.setItem('mepos_stocks', JSON.stringify(stocksRes.data));
      }
      if (lossesRes.status === 'success') {
        setLosses(lossesRes.data);
        localStorage.setItem('mepos_losses', JSON.stringify(lossesRes.data));
      }
      if (deptsRes.status === 'success') {
        setDepartments(deptsRes.data);
        localStorage.setItem('mepos_departments', JSON.stringify(deptsRes.data));
      }
      if (ingsRes.status === 'success') {
        setIngredients(ingsRes.data);
        localStorage.setItem('mepos_ingredients', JSON.stringify(ingsRes.data));
      }
      if (recipesRes.status === 'success') {
        setRecipes(recipesRes.data);
        localStorage.setItem('mepos_recipes', JSON.stringify(recipesRes.data));
      }

      setIsOffline(false);
      syncOfflineActions();
    } catch (err) {
      console.warn('Network error during fetchData, loading from cache:', err);
      loadOfflineCache();
      setIsOffline(true);
    }
  };

  const queueOfflineAction = (type: string, data: any) => {
    const action = {
      id: Date.now() + Math.random(),
      type,
      data,
      timestamp: new Date().toISOString()
    };

    const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]');
    queue.push(action);
    localStorage.setItem('mepos_offline_queue', JSON.stringify(queue));

    if (type === 'losses') {
      const ingredientName = ingredients.find(i => i.id === parseInt(data.ingredient_id))?.name || 'Ingrédient';
      const departmentName = departments.find(d => d.id === parseInt(data.department_id))?.name || 'Dépôt';
      const unit = data.unit || ingredients.find(i => i.id === parseInt(data.ingredient_id))?.unit_usage || 'units';

      const purchasePrice = stocks.find(s => s.ingredient_id === parseInt(data.ingredient_id))?.purchase_price_per_unit || '0';
      const costLoss = parseFloat(purchasePrice) * parseFloat(data.quantity);
      const oppLoss = costLoss * 2.5;

      const tempLoss = {
        id: action.id,
        ingredient_id: parseInt(data.ingredient_id),
        ingredient_name: ingredientName,
        quantity: data.quantity.toString(),
        unit: unit,
        department_id: parseInt(data.department_id),
        department_name: departmentName,
        loss_reason: data.loss_reason,
        cost_loss: costLoss.toString(),
        opportunity_loss: oppLoss.toString(),
        created_at: action.timestamp,
        is_offline: true
      };

      const newLosses = [tempLoss, ...losses];
      setLosses(newLosses);
      localStorage.setItem('mepos_losses', JSON.stringify(newLosses));

      const newStocks = stocks.map(s => {
        if (s.ingredient_id === parseInt(data.ingredient_id) && s.department_id === parseInt(data.department_id)) {
          const newQty = Math.max(0, parseFloat(s.quantity) - parseFloat(data.quantity));
          return { ...s, quantity: newQty.toString() };
        }
        return s;
      });
      setStocks(newStocks);
      localStorage.setItem('mepos_stocks', JSON.stringify(newStocks));
    }

    if (type === 'transfers') {
      const newStocks = stocks.map(s => {
        if (s.ingredient_id === parseInt(data.ingredient_id)) {
          if (s.department_id === parseInt(data.source_dept_id)) {
            const newQty = Math.max(0, parseFloat(s.quantity) - parseFloat(data.quantity));
            return { ...s, quantity: newQty.toString() };
          }
          if (s.department_id === parseInt(data.dest_dept_id)) {
            const newQty = parseFloat(s.quantity) + parseFloat(data.quantity);
            return { ...s, quantity: newQty.toString() };
          }
        }
        return s;
      });
      setStocks(newStocks);
      localStorage.setItem('mepos_stocks', JSON.stringify(newStocks));
    }

    if (type === 'adjustments') {
      const newStocks = stocks.map(s => {
        if (s.ingredient_id === parseInt(data.ingredient_id) && s.department_id === parseInt(data.department_id)) {
          let newQty = parseFloat(s.quantity);
          if (data.type === 'purchase') {
            newQty = Math.max(0, newQty + parseFloat(data.quantity));
          } else if (data.type === 'reconciliation') {
            newQty = Math.max(0, parseFloat(data.quantity));
          }
          return { ...s, quantity: newQty.toString() };
        }
        return s;
      });
      setStocks(newStocks);
      localStorage.setItem('mepos_stocks', JSON.stringify(newStocks));

      // Creer un mouvement local temporaire
      const ingredientName = ingredients.find(i => i.id === parseInt(data.ingredient_id))?.name || 'Ingrédient';
      const departmentName = departments.find(d => d.id === parseInt(data.department_id))?.name || 'Dépôt';
      const unit = ingredients.find(i => i.id === parseInt(data.ingredient_id))?.unit || 'units';

      const tempMovement = {
        id: action.id,
        department_name: departmentName,
        ingredient_name: ingredientName,
        quantity: data.quantity.toString(),
        unit: unit,
        type: data.type,
        reference_id: data.reference_id,
        created_at: action.timestamp,
        is_offline: true
      };

      const cachedMovements = JSON.parse(localStorage.getItem('mepos_movements') || '[]');
      const newMovements = [tempMovement, ...cachedMovements];
      localStorage.setItem('mepos_movements', JSON.stringify(newMovements));
    }

    return true;
  };

  const syncOfflineActions = async () => {
    const queue = JSON.parse(localStorage.getItem('mepos_offline_queue') || '[]');
    if (queue.length === 0) return;

    setIsSyncing(true);
    const headers = getAuthHeaders();

    const remainingQueue: any[] = [];
    let hasFailed = false;

    for (const action of queue) {
      if (hasFailed) {
        remainingQueue.push(action);
        continue;
      }

      try {
        let url = '';
        if (action.type === 'losses') url = `${apiUrl}/losses`;
        if (action.type === 'transfers') url = `${apiUrl}/transfers`;
        if (action.type === 'adjustments') url = `${apiUrl}/inventory/adjust`;

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(action.data)
        });
        const resJson = await response.json();
        
        if (resJson.status !== 'success') {
          console.error(`Sync failed for action ${action.id}:`, resJson);
          remainingQueue.push(action);
        }
      } catch (err) {
        console.warn(`Sync failed due to network error for action ${action.id}:`, err);
        hasFailed = true;
        remainingQueue.push(action);
      }
    }

    localStorage.setItem('mepos_offline_queue', JSON.stringify(remainingQueue));
    setIsSyncing(false);
    
    // Refresh to fetch final authoritative backend state
    if (!hasFailed) {
      try {
        const [stocksRes, lossesRes, movementsRes] = await Promise.all([
          fetch(`${apiUrl}/stocks`, { headers: getAuthHeaders() }).then(r => r.json()),
          fetch(`${apiUrl}/losses`, { headers: getAuthHeaders() }).then(r => r.json()),
          fetch(`${apiUrl}/movements`, { headers: getAuthHeaders() }).then(r => r.json())
        ]);
        if (stocksRes.status === 'success') {
          setStocks(stocksRes.data);
          localStorage.setItem('mepos_stocks', JSON.stringify(stocksRes.data));
        }
        if (lossesRes.status === 'success') {
          setLosses(lossesRes.data);
          localStorage.setItem('mepos_losses', JSON.stringify(lossesRes.data));
        }
        if (movementsRes.status === 'success') {
          localStorage.setItem('mepos_movements', JSON.stringify(movementsRes.data));
        }
      } catch (err) {
        console.error('Fetch post sync failed:', err);
      }
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
      const interval = setInterval(fetchData, 8000); // refresh every 8 seconds
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  const handleLossSubmit = async (lossData: any) => {
    if (isOffline || !navigator.onLine) {
      return queueOfflineAction('losses', lossData);
    }
    try {
      const response = await fetch(`${apiUrl}/losses`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(lossData)
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        fetchData();
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Network error on loss submit, queuing offline:', err);
      setIsOffline(true);
      return queueOfflineAction('losses', lossData);
    }
  };

  const handleTransferSubmit = async (transferData: any) => {
    if (isOffline || !navigator.onLine) {
      return queueOfflineAction('transfers', transferData);
    }
    try {
      const response = await fetch(`${apiUrl}/transfers`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(transferData)
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        fetchData();
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Network error on transfer submit, queuing offline:', err);
      setIsOffline(true);
      return queueOfflineAction('transfers', transferData);
    }
  };

  const handleAdjustSubmit = async (adjustData: any) => {
    if (isOffline || !navigator.onLine) {
      return queueOfflineAction('adjustments', adjustData);
    }
    try {
      const response = await fetch(`${apiUrl}/inventory/adjust`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(adjustData)
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        fetchData();
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Network error on adjust submit, queuing offline:', err);
      setIsOffline(true);
      return queueOfflineAction('adjustments', adjustData);
    }
  };

  // Login page layout
  if (!user) {
    return (
      <div className="login-wrapper">
        <div className="glass-panel login-card">
          <div className="login-header">
            <h1 className="brand-logo" style={{ fontSize: '2.25rem', justifyContent: 'center', marginBottom: '0.25rem' }}>
              <span className="brand-logo-dot" /> mePOS STOCK
            </h1>
            <p className="login-subtitle">Moteur de Recettes et Gestion de Stock</p>
          </div>

          {error && (
            <div className="alert-banner alert-banner-danger" style={{ fontSize: '0.875rem' }}>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label">Nom d'utilisateur</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Ex: admin, gerant, ou cuisinier"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required 
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Mot de passe</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required 
              />
            </div>

            <button type="submit" className="touch-btn" disabled={isLoading}>
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
            <p style={{ fontWeight: '700', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Comptes de test :</p>
            <ul style={{ paddingLeft: '1rem' }}>
              <li>Administrateur : <code>admin</code> / <code>admin123</code></li>
              <li>Gérant : <code>gerant</code> / <code>gerant123</code></li>
              <li>Cuisinier : <code>cuisinier</code> / <code>cuisinier123</code></li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const getRoleText = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrateur';
      case 'manager': return 'Gérant';
      case 'cook': return 'Cuisinier';
      default: return role;
    }
  };

  const toggleOfflineManual = () => {
    setIsOffline(prev => !prev);
  };

  return (
    <div className="app-container">
      {/* 1. LEFT SIDEBAR (Visible on Desktop / Tablets) */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-section" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span className="brand-logo">
                <span className="brand-logo-dot" /> mePOS STOCK
              </span>
              <span className="brand-badge">v1.0</span>
            </div>
            
            {/* Connection Status Badge */}
            <div onDoubleClick={toggleOfflineManual} style={{ cursor: 'pointer' }} title="Double-cliquer pour simuler hors-ligne">
              {isOffline ? (
                <div style={offlineBadgeStyle}>
                  <span className="status-dot-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                  <span>Hors ligne (Local)</span>
                </div>
              ) : (
                <div style={onlineBadgeStyle}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  <span>En ligne {isSyncing && '· Sync...'}</span>
                </div>
              )}
            </div>
          </div>

          <nav className="nav-links">
            <button 
              className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <IconDashboard />
              <span>Tableau de Bord</span>
            </button>
            
            <button 
              className={`nav-btn ${activeTab === 'inventory' ? 'active' : ''}`}
              onClick={() => setActiveTab('inventory')}
            >
              <IconInventory />
              <span>Inventaire</span>
            </button>
            
            <button 
              className={`nav-btn ${activeTab === 'losses' ? 'active' : ''}`}
              onClick={() => setActiveTab('losses')}
            >
              <IconLosses />
              <span>Pertes & Gâche</span>
            </button>

            <button 
              className={`nav-btn ${activeTab === 'transfers' ? 'active' : ''}`}
              onClick={() => setActiveTab('transfers')}
            >
              <IconTransfers />
              <span>Transfert Dépôt</span>
            </button>

            {user.role === 'admin' && (
              <button 
                className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <IconSettings />
                <span>Paramétrage</span>
              </button>
            )}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-badge">
              <span className="user-name">{user.first_name}</span>
              <span className={`user-role user-role-${user.role}`}>{getRoleText(user.role)}</span>
            </div>
            <button className="btn-logout" title="Se déconnecter" onClick={logout}>
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MOBILE TOP HEADER (Visible on Mobile only) */}
      <header className="mobile-header-bar">
        <div className="brand-section" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="brand-logo">
            <span className="brand-logo-dot" /> mePOS
          </span>
          {isOffline ? (
            <div style={{ ...offlineBadgeStyle, padding: '0.15rem 0.45rem', fontSize: '0.65rem' }}>
              <span className="status-dot-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', marginRight: '4px' }} />
              <span>Hors ligne</span>
            </div>
          ) : (
            <div style={{ ...onlineBadgeStyle, padding: '0.15rem 0.45rem', fontSize: '0.65rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', marginRight: '4px' }} />
              <span>En ligne</span>
            </div>
          )}
        </div>
        <div className="user-profile">
          <span className={`user-role user-role-${user.role}`} style={{ marginRight: '0.25rem' }}>
            {getRoleText(user.role)}
          </span>
          <button className="btn-logout" title="Se déconnecter" onClick={logout}>
            <IconLogout />
          </button>
        </div>
      </header>

      {/* 3. MAIN WORKSPACE */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <Dashboard 
            stocks={stocks} 
            losses={losses} 
            recipes={recipes} 
            departments={departments}
          />
        )}
        
        {activeTab === 'inventory' && (
          <Inventory 
            stocks={stocks} 
            departments={departments} 
            onRefresh={fetchData} 
          />
        )}

        {activeTab === 'losses' && (
          <LossTracker 
            losses={losses}
            stocks={stocks}
            departments={departments}
            ingredients={ingredients}
            onRefresh={fetchData}
            onSubmitLoss={handleLossSubmit}
          />
        )}

        {activeTab === 'transfers' && (
          <StockTransfer 
            stocks={stocks}
            departments={departments}
            ingredients={ingredients}
            onSubmitTransfer={handleTransferSubmit}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'settings' && user.role === 'admin' && (
          <Settings 
            ingredients={ingredients}
            recipes={recipes}
            onRefresh={fetchData}
            isOffline={isOffline}
            onSubmitAdjust={handleAdjustSubmit}
          />
        )}
      </main>

      {/* 4. MOBILE BOTTOM NAV (Visible on Mobile only) */}
      <nav className="mobile-bottom-nav">
        <button 
          className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <IconDashboard />
          <span>Dashboard</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          <IconInventory />
          <span>Stocks</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'losses' ? 'active' : ''}`}
          onClick={() => setActiveTab('losses')}
        >
          <IconLosses />
          <span>Pertes</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'transfers' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfers')}
        >
          <IconTransfers />
          <span>Transferts</span>
        </button>
        {user.role === 'admin' && (
          <button 
            className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <IconSettings />
            <span>Config</span>
          </button>
        )}
      </nav>

      {/* Real-time Loss Notification alerts container */}
      {user && (user.role === 'admin' || user.role === 'manager') && alerts.length > 0 && (
        <div className="notification-container">
          {alerts.map(alert => (
            <div key={alert.id} className="notification-toast">
              <div className="notification-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="notification-content">
                <div className="notification-title">
                  <span>⚠️ ALERTE : Perte Détectée</span>
                  <span className="notification-time">
                    {alert.timestamp.toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="notification-body">
                  Une perte de <strong>{alert.quantity.toFixed(2)} {alert.unit}</strong> de <strong>{alert.ingredientName}</strong> a été enregistrée pour : <strong>{alert.departmentName}</strong>.<br />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Motif : {alert.reason}</span>
                </div>
                {user.role === 'admin' && (
                  <div className="notification-financials">
                    <span style={{ color: 'var(--coral)', fontWeight: '600' }}>
                      Perte Sèche : -{alert.costLoss.toFixed(2)} TND
                    </span>
                    <span style={{ color: 'var(--amber)', fontWeight: '600' }}>
                      Manque à Gagner : -{alert.opportunityLoss.toFixed(2)} TND
                    </span>
                  </div>
                )}
              </div>
              <button className="notification-close-btn" onClick={() => handleCloseAlert(alert.id)} title="Fermer">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
};

export default App;
