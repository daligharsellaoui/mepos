import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface SettingsProps {
  ingredients: any[];
  recipes: any[];
  onRefresh: () => void;
  isOffline?: boolean;
  onSubmitAdjust?: (adjustData: any) => Promise<boolean>;
}

export const Settings: React.FC<SettingsProps> = ({ 
  ingredients, 
  recipes, 
  onRefresh, 
  isOffline = false, 
  onSubmitAdjust 
}) => {
  const { token, apiUrl } = useAuth();
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  // Sub-tabs in Settings: 'ingredients' | 'recipes' | 'stocks' | 'users' | 'depts'
  const [subTab, setSubTab] = useState<'ingredients' | 'recipes' | 'stocks' | 'users' | 'depts'>('ingredients');

  // Department Form state
  const [deptId, setDeptId] = useState<number | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptStockType, setDeptStockType] = useState<'isolated' | 'inherited'>('isolated');
  const [deptDescription, setDeptDescription] = useState('');
  const [deptError, setDeptError] = useState<string | null>(null);
  const [deptSuccess, setDeptSuccess] = useState<string | null>(null);

  // Department Delete Transfer Modal state
  const [showDeleteTransferModal, setShowDeleteTransferModal] = useState(false);
  const [deptToPerformDelete, setDeptToPerformDelete] = useState<number | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Ingredient Form state
  const [ingName, setIngName] = useState('');
  const [ingUnit, setIngUnit] = useState('g');
  const [ingPurchaseUnit, setIngPurchaseUnit] = useState('paquet');
  const [ingPurchaseUnitPrice, setIngPurchaseUnitPrice] = useState('');
  const [ingConversionFactor, setIngConversionFactor] = useState('');
  const [ingAlertThreshold, setIngAlertThreshold] = useState('');
  const [ingError, setIngError] = useState<string | null>(null);
  const [ingSuccess, setIngSuccess] = useState<string | null>(null);

  // Recipe Form state
  const [recName, setRecName] = useState('');
  const [recSalePrice, setRecSalePrice] = useState('');
  const [recError, setRecError] = useState<string | null>(null);
  const [recSuccess, setRecSuccess] = useState<string | null>(null);

  // Fiche Technique Editor state
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [ficheIngredients, setFicheIngredients] = useState<Array<{ ingredient_id: number; quantity_needed: number }>>([]);
  const [selectedIngId, setSelectedIngId] = useState<string>('');
  const [ingQtyNeeded, setIngQtyNeeded] = useState<string>('');
  const [ficheError, setFicheError] = useState<string | null>(null);
  const [ficheSuccess, setFicheSuccess] = useState<string | null>(null);

  // Stock Adjustment Form state
  const [depts, setDepts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [adjDeptId, setAdjDeptId] = useState('');
  const [adjIngId, setAdjIngId] = useState('');
  const [adjQty, setAdjQty] = useState('');
  const [adjType, setAdjType] = useState<'reconciliation' | 'purchase' | 'decrease'>('purchase');
  const [adjRef, setAdjRef] = useState('');
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSuccess, setAdjSuccess] = useState<string | null>(null);

  // States for enhanced touch UI and history filtering
  const [ingSearch, setIngSearch] = useState('');
  const [isIngDropdownOpen, setIsIngDropdownOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'purchase_pos' | 'purchase_neg' | 'reconciliation'>('all');

  useEffect(() => {
    if (!adjIngId) {
      setIngSearch('');
    } else {
      const selectedIng = ingredients.find(ing => ing.id === parseInt(adjIngId, 10));
      if (selectedIng) {
        setIngSearch(selectedIng.name);
      }
    }
  }, [adjIngId, ingredients]);

  // User Accounts Form state
  const [users, setUsers] = useState<any[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('cook');
  const [userFirstName, setUserFirstName] = useState('');
  const [userLastName, setUserLastName] = useState('');
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // Dynamic preview helper for unit cost
  const getCalculatedBasePrice = () => {
    const price = parseFloat(ingPurchaseUnitPrice);
    const factor = parseFloat(ingConversionFactor);
    if (!isNaN(price) && !isNaN(factor) && factor > 0) {
      return (price / factor).toFixed(4);
    }
    return '0.0000';
  };

  // Fetch departments and movements for adjustments tab
  const fetchDeptsAndMovements = async () => {
    const cachedDepts = localStorage.getItem('mepos_departments');
    const cachedMovements = localStorage.getItem('mepos_movements');

    if (!isOffline && navigator.onLine) {
      try {
        const headers = getAuthHeaders();
        const [deptsRes, movRes] = await Promise.all([
          fetch(`${apiUrl}/departments`, { headers }).then(r => r.json()),
          fetch(`${apiUrl}/movements`, { headers }).then(r => r.json())
        ]);
        if (deptsRes.status === 'success') {
          setDepts(deptsRes.data);
          localStorage.setItem('mepos_departments', JSON.stringify(deptsRes.data));
        }
        if (movRes.status === 'success') {
          setMovements(movRes.data);
          localStorage.setItem('mepos_movements', JSON.stringify(movRes.data));
        }
        return;
      } catch (err) {
        console.error('Failed to load depts or movements:', err);
      }
    }

    // Fallback/offline
    if (cachedDepts) setDepts(JSON.parse(cachedDepts));
    if (cachedMovements) setMovements(JSON.parse(cachedMovements));
  };

  // Fetch user accounts
  const fetchUsers = async () => {
    const cachedUsers = localStorage.getItem('mepos_cached_users');

    if (!isOffline && navigator.onLine) {
      try {
        const response = await fetch(`${apiUrl}/auth/users`, {
          headers: getAuthHeaders()
        });
        const resJson = await response.json();
        if (resJson.status === 'success') {
          setUsers(resJson.data);
          localStorage.setItem('mepos_cached_users', JSON.stringify(resJson.data));
        }
        return;
      } catch (err) {
        console.error('Failed to load users:', err);
      }
    }

    // Fallback/offline
    if (cachedUsers) setUsers(JSON.parse(cachedUsers));
  };

  // Trigger loading based on active tab
  useEffect(() => {
    if (subTab === 'stocks' || subTab === 'depts') {
      fetchDeptsAndMovements();
    } else if (subTab === 'users') {
      fetchUsers();
    }
  }, [subTab]);

  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIngError(null);
    setIngSuccess(null);

    const priceVal = parseFloat(ingPurchaseUnitPrice);
    const factorVal = parseFloat(ingConversionFactor);
    const alertVal = parseFloat(ingAlertThreshold);

    if (!ingName || !ingUnit || !ingPurchaseUnit || isNaN(priceVal) || isNaN(factorVal) || factorVal <= 0) {
      setIngError("Veuillez remplir tous les champs obligatoires avec des valeurs valides.");
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/ingredients`, {
        method: 'POST',          headers: getAuthHeaders(),
          body: JSON.stringify({
          name: ingName,
          unit: ingUnit,
          purchase_unit: ingPurchaseUnit,
          purchase_unit_price: priceVal,
          conversion_factor: factorVal,
          alert_threshold: isNaN(alertVal) ? 0 : alertVal
        })
      });

      const resJson = await response.json();
      if (resJson.status === 'success') {
        setIngSuccess(`L'ingrédient '${ingName}' a été enregistré avec succès !`);
        setIngName('');
        setIngPurchaseUnitPrice('');
        setIngConversionFactor('');
        setIngAlertThreshold('');
        onRefresh();
      } else {
        setIngError(resJson.message || "Erreur de création de l'ingrédient.");
      }
    } catch (err) {
      setIngError("Impossible de se connecter à l'API.");
    }
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecError(null);
    setRecSuccess(null);

    const priceVal = parseFloat(recSalePrice);
    if (!recName || isNaN(priceVal) || priceVal < 0) {
      setRecError("Veuillez saisir un nom et un prix de vente valide.");
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/recipes`, {
        method: 'POST',          headers: getAuthHeaders(),
          body: JSON.stringify({
          name: recName,
          sale_price: priceVal
        })
      });

      const resJson = await response.json();
      if (resJson.status === 'success') {
        setRecSuccess(`La recette '${recName}' a été créée !`);
        setRecName('');
        setRecSalePrice('');
        onRefresh();
      } else {
        setRecError(resJson.message || "Erreur lors de la création.");
      }
    } catch (err) {
      setRecError("Impossible de contacter l'API.");
    }
  };

  const handleSelectRecipeForFiche = (recipeIdStr: string) => {
    setSelectedRecipeId(recipeIdStr);
    setFicheError(null);
    setFicheSuccess(null);

    if (!recipeIdStr) {
      setFicheIngredients([]);
      return;
    }

    const recipe = recipes.find(r => r.id === parseInt(recipeIdStr, 10));
    if (recipe && recipe.ingredients) {
      setFicheIngredients(
        recipe.ingredients.map((i: any) => ({
          ingredient_id: i.ingredient_id,
          quantity_needed: parseFloat(i.quantity_needed)
        }))
      );
    } else {
      setFicheIngredients([]);
    }
  };

  const handleAddIngredientToFiche = () => {
    setFicheError(null);
    if (!selectedIngId || !ingQtyNeeded) {
      setFicheError("Sélectionnez un ingrédient et saisissez une quantité.");
      return;
    }

    const ingId = parseInt(selectedIngId, 10);
    const qty = parseFloat(ingQtyNeeded);

    if (isNaN(qty) || qty <= 0) {
      setFicheError("La quantité doit être supérieure à 0.");
      return;
    }

    if (ficheIngredients.some(item => item.ingredient_id === ingId)) {
      setFicheError("Cet ingrédient est déjà présent dans la fiche technique.");
      return;
    }

    setFicheIngredients([...ficheIngredients, { ingredient_id: ingId, quantity_needed: qty }]);
    setSelectedIngId('');
    setIngQtyNeeded('');
  };

  const handleRemoveIngredientFromFiche = (ingId: number) => {
    setFicheIngredients(ficheIngredients.filter(item => item.ingredient_id !== ingId));
  };

  const handleSaveFiche = async () => {
    setFicheError(null);
    setFicheSuccess(null);

    if (!selectedRecipeId) {
      setFicheError("Veuillez sélectionner un produit.");
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/recipes/${selectedRecipeId}/ingredients`, {
        method: 'POST',          headers: getAuthHeaders(),
          body: JSON.stringify({
          ingredients: ficheIngredients
        })
      });

      const resJson = await response.json();
      if (resJson.status === 'success') {
        setFicheSuccess("Fiche technique mise à jour avec succès !");
        onRefresh();
      } else {
        setFicheError(resJson.message || "Erreur lors de la mise à jour de la fiche technique.");
      }
    } catch (err) {
      setFicheError("Impossible de contacter l'API.");
    }
  };

  // Stock Adjustment Submit
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjError(null);
    setAdjSuccess(null);

    const qtyVal = parseFloat(adjQty);
    if (!adjDeptId || !adjIngId || isNaN(qtyVal) || qtyVal < 0) {
      setAdjError("Veuillez remplir tous les champs obligatoires avec des valeurs valides.");
      return;
    }

    const adjustData = {
      department_id: parseInt(adjDeptId, 10),
      ingredient_id: parseInt(adjIngId, 10),
      quantity: adjType === 'decrease' ? -qtyVal : qtyVal,
      type: adjType === 'decrease' ? 'purchase' : adjType,
      reference_id: adjRef || (adjType === 'decrease' ? 'Retrait manuel' : undefined)
    };

    try {
      let success = false;
      if (onSubmitAdjust) {
        success = await onSubmitAdjust(adjustData);
      } else {
        const response = await fetch(`${apiUrl}/inventory/adjust`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify(adjustData)
        });
        const resJson = await response.json();
        success = resJson.status === 'success';
      }

      if (success) {
        setAdjSuccess(isOffline ? "Ajustement enregistré hors ligne (Sync en attente) !" : "Ajustement de stock enregistré avec succès !");
        setAdjQty('');
        setAdjRef('');
        fetchDeptsAndMovements();
        onRefresh();
      } else {
        setAdjError("Erreur lors de l'ajustement du stock.");
      }
    } catch (err) {
      setAdjError("Impossible de contacter l'API.");
    }
  };

  // User Submit (Create/Update)
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    setUserSuccess(null);

    if (!userUsername || !userRole) {
      setUserError("Le nom d'utilisateur et le rôle sont requis.");
      return;
    }

    if (!userId && !userPassword) {
      setUserError("Le mot de passe est obligatoire pour un nouveau compte.");
      return;
    }

    try {
      const method = userId ? 'PUT' : 'POST';
      const endpoint = userId ? `${apiUrl}/auth/users/${userId}` : `${apiUrl}/auth/users`;

      const response = await fetch(endpoint, {
        method,          headers: getAuthHeaders(),
          body: JSON.stringify({
          username: userUsername,
          password: userPassword || undefined,
          role: userRole,
          first_name: userFirstName,
          last_name: userLastName
        })
      });

      const resJson = await response.json();
      if (resJson.status === 'success') {
        setUserSuccess(userId ? "Compte utilisateur mis à jour avec succès !" : "Compte utilisateur créé avec succès !");
        setUserId(null);
        setUserUsername('');
        setUserPassword('');
        setUserRole('cook');
        setUserFirstName('');
        setUserLastName('');
        fetchUsers();
      } else {
        setUserError(resJson.message || "Erreur d'enregistrement.");
      }
    } catch (err) {
      setUserError("Impossible de contacter l'API.");
    }
  };

  const handleEditUser = (u: any) => {
    setUserId(u.id);
    setUserUsername(u.username);
    setUserPassword(u.password || '');
    setUserRole(u.role);
    setUserFirstName(u.first_name || '');
    setUserLastName(u.last_name || '');
    setUserError(null);
    setUserSuccess(null);
  };

  const handleDeleteUser = async (id: number) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce compte ?")) {
      return;
    }
    setUserError(null);
    setUserSuccess(null);

    try {
      const response = await fetch(`${apiUrl}/auth/users/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        setUserSuccess("Compte supprimé avec succès.");
        if (userId === id) {
          setUserId(null);
          setUserUsername('');
          setUserPassword('');
          setUserRole('cook');
          setUserFirstName('');
          setUserLastName('');
        }
        fetchUsers();
      } else {
        setUserError(resJson.message || "Erreur de suppression.");
      }
    } catch (err) {
      setUserError("Impossible de contacter l'API.");
    }
  };

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeptError(null);
    setDeptSuccess(null);

    if (!deptName || !deptStockType) {
      setDeptError("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    try {
      const method = deptId ? 'PUT' : 'POST';
      const endpoint = deptId ? `${apiUrl}/departments/${deptId}` : `${apiUrl}/departments`;

      const response = await fetch(endpoint, {
        method,          headers: getAuthHeaders(),
          body: JSON.stringify({
          name: deptName,
          stock_type: deptStockType,
          description: deptDescription
        })
      });

      const resJson = await response.json();
      if (resJson.status === 'success') {
        setDeptSuccess(deptId ? "Dépôt mis à jour avec succès !" : "Dépôt créé avec succès !");
        setDeptId(null);
        setDeptName('');
        setDeptStockType('isolated');
        setDeptDescription('');
        fetchDeptsAndMovements();
        onRefresh();
      } else {
        setDeptError(resJson.message || "Erreur d'enregistrement.");
      }
    } catch (err) {
      setDeptError("Impossible de contacter l'API.");
    }
  };

  const handleEditDept = (d: any) => {
    setDeptId(d.id);
    setDeptName(d.name);
    setDeptStockType(d.stock_type);
    setDeptDescription(d.description || '');
    setDeptError(null);
    setDeptSuccess(null);
  };

  const handleCancelEditDept = () => {
    setDeptId(null);
    setDeptName('');
    setDeptStockType('isolated');
    setDeptDescription('');
    setDeptError(null);
    setDeptSuccess(null);
  };

  const handleDeleteDept = async (id: number, transferToId: number | null = null) => {
    if (!transferToId) {
      if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce dépôt ?")) {
        return;
      }
    }
    setDeptError(null);
    setDeptSuccess(null);
    setModalError(null);

    try {
      const url = transferToId 
        ? `${apiUrl}/departments/${id}?transfer_to_id=${transferToId}`
        : `${apiUrl}/departments/${id}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        setDeptSuccess(resJson.message || "Dépôt supprimé avec succès.");
        if (deptId === id) {
          setDeptId(null);
          setDeptName('');
          setDeptStockType('isolated');
          setDeptDescription('');
        }
        setShowDeleteTransferModal(false);
        setDeptToPerformDelete(null);
        setTransferTargetId('');
        fetchDeptsAndMovements();
        onRefresh();
      } else if (resJson.status === 'requires_transfer') {
        setDeptToPerformDelete(id);
        setShowDeleteTransferModal(true);
        // Pre-select the first available department
        const availableDepts = depts.filter(d => d.id !== id);
        if (availableDepts.length > 0) {
          setTransferTargetId(availableDepts[0].id.toString());
        } else {
          setTransferTargetId('');
        }
      } else {
        if (transferToId) {
          setModalError(resJson.message || "Erreur lors du transfert de stock.");
        } else {
          setDeptError(resJson.message || "Erreur de suppression.");
        }
      }
    } catch (err) {
      if (transferToId) {
        setModalError("Impossible de contacter l'API pour le transfert.");
      } else {
        setDeptError("Impossible de contacter l'API.");
      }
    }
  };

  const translateRole = (role: string) => {
    if (role === 'admin') return 'Administrateur';
    if (role === 'manager') return 'Gérant';
    if (role === 'cook') return 'Cuisinier / Comptoir';
    return role;
  };

  return (
    <div>
      <div className="view-title-section">
        <div>
          <h1 className="view-title">⚙️ Paramétrage Système (Admin)</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Gestion des fiches techniques, matières premières, stocks manuels et comptes utilisateurs.
          </p>
        </div>
      </div>

      {/* Sub menu filters */}
      <div className="dept-filter-section">
        <div 
          className={`dept-pill ${subTab === 'ingredients' ? 'active' : ''}`}
          onClick={() => setSubTab('ingredients')}
        >
          Matières Premières
        </div>
        <div 
          className={`dept-pill ${subTab === 'recipes' ? 'active' : ''}`}
          onClick={() => setSubTab('recipes')}
        >
          Fiches Techniques (Produits)
        </div>
        <div 
          className={`dept-pill ${subTab === 'stocks' ? 'active' : ''}`}
          onClick={() => setSubTab('stocks')}
        >
          Ajustements & Mouvements
        </div>
        <div 
          className={`dept-pill ${subTab === 'users' ? 'active' : ''}`}
          onClick={() => setSubTab('users')}
        >
          Comptes Utilisateurs
        </div>
        <div 
          className={`dept-pill ${subTab === 'depts' ? 'active' : ''}`}
          onClick={() => setSubTab('depts')}
        >
          Gestion des Dépôts
        </div>
      </div>

      {/* 1. INGREDIENTS TAB */}
      {subTab === 'ingredients' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Left panel: Form */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Nouvel Ingrédient</h2>
            
            {isOffline && (
              <div className="alert-banner alert-banner-danger" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', marginBottom: '1.5rem' }}>
                Création désactivée hors ligne. Une connexion réseau est requise.
              </div>
            )}
            {ingError && <div className="alert-banner alert-banner-danger">{ingError}</div>}
            {ingSuccess && <div className="alert-banner" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--emerald)' }}>{ingSuccess}</div>}

            <form onSubmit={handleCreateIngredient}>
              <div className="form-group">
                <label className="form-label">Nom de l'ingrédient *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ex: Fromage Cheddar"
                  value={ingName} 
                  onChange={e => setIngName(e.target.value)} 
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Unité de Cuisine *</label>
                  <select className="form-select" value={ingUnit} onChange={e => setIngUnit(e.target.value)}>
                    <option value="g">gramme (g)</option>
                    <option value="ml">millilitre (ml)</option>
                    <option value="pcs">pièce (pcs)</option>
                    <option value="kg">kilogramme (kg)</option>
                    <option value="l">litre (l)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Unité d'Achat *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ex: carton, sac, boite"
                    value={ingPurchaseUnit} 
                    onChange={e => setIngPurchaseUnit(e.target.value)} 
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Capacité d'un Paquet *</label>
                  <input 
                    type="number" 
                    step="any"
                    className="form-input" 
                    placeholder="Ex: 5000 (si 5kg en g)"
                    value={ingConversionFactor} 
                    onChange={e => setIngConversionFactor(e.target.value)} 
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Prix du Paquet (TND) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    placeholder="Ex: 120.00"
                    value={ingPurchaseUnitPrice} 
                    onChange={e => setIngPurchaseUnitPrice(e.target.value)} 
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Seuil d'Alerte Bas (unité Cuisine)</label>
                <input 
                  type="number" 
                  step="any"
                  className="form-input" 
                  placeholder="Ex: 2000 (2kg)"
                  value={ingAlertThreshold} 
                  onChange={e => setIngAlertThreshold(e.target.value)} 
                />
              </div>

              <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Coût unitaire de base calculé :</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--indigo-light)', marginTop: '0.25rem' }}>
                  {getCalculatedBasePrice()} TND / {ingUnit}
                </div>
              </div>

              <button type="submit" className="touch-btn" style={{ width: '100%' }} disabled={isOffline}>
                Enregistrer l'ingrédient
              </button>
            </form>
          </div>

          {/* Right panel: Ingredients list */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Catalogue des Ingrédients</h2>
            <div className="table-wrapper">
              <table className="mepos-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Unité Achat</th>
                    <th>Capacité (Conversion)</th>
                    <th>Prix Colis</th>
                    <th>Coût Cuisine</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map(ing => (
                    <tr key={ing.id}>
                      <td><strong style={{ color: 'var(--text-primary)' }}>{ing.name}</strong></td>
                      <td><span className="badge badge-success">{ing.purchase_unit}</span></td>
                      <td>{parseFloat(ing.conversion_factor).toLocaleString()} {ing.unit}</td>
                      <td>{parseFloat(ing.purchase_unit_price).toFixed(2)} TND</td>
                      <td style={{ color: 'var(--indigo-light)', fontWeight: '600' }}>
                        {parseFloat(ing.purchase_price_per_unit).toFixed(4)} TND/{ing.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. RECIPES TAB */}
      {subTab === 'recipes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Left panel: Recipes configuration */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Create Recipe */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Nouveau Produit</h2>
              
              {isOffline && (
                <div className="alert-banner alert-banner-danger" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', marginBottom: '1.5rem' }}>
                  Création désactivée hors ligne. Une connexion réseau est requise.
                </div>
              )}
              {recError && <div className="alert-banner alert-banner-danger">{recError}</div>}
              {recSuccess && <div className="alert-banner" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--emerald)' }}>{recSuccess}</div>}

              <form onSubmit={handleCreateRecipe}>
                <div className="form-group">
                  <label className="form-label">Nom du Produit *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ex: Cheeseburger Simple"
                    value={recName} 
                    onChange={e => setRecName(e.target.value)} 
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Prix de Vente Publique (TND) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    placeholder="Ex: 15.00"
                    value={recSalePrice} 
                    onChange={e => setRecSalePrice(e.target.value)} 
                    required
                  />
                </div>

                <button type="submit" className="touch-btn" style={{ width: '100%', marginTop: '0.5rem' }} disabled={isOffline}>
                  Créer le produit
                </button>
              </form>
            </div>

            {/* List of Recipes */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Menu mePOS ({recipes.length} produits)</h2>
              <div className="table-wrapper">
                <table className="mepos-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Prix de Vente</th>
                      <th>Nb Ingrédients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipes.map(rec => (
                      <tr key={rec.id} style={{ cursor: 'pointer' }} onClick={() => handleSelectRecipeForFiche(rec.id.toString())}>
                        <td><strong style={{ color: 'var(--text-primary)' }}>{rec.name}</strong></td>
                        <td style={{ color: 'var(--emerald)', fontWeight: '600' }}>{parseFloat(rec.sale_price).toFixed(2)} TND</td>
                        <td>{rec.ingredients ? rec.ingredients.length : 0} réf(s)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right panel: Fiche Technique Editor */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Fiche Technique (Grammages)</h2>
            
            {isOffline && (
              <div className="alert-banner alert-banner-danger" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', marginBottom: '1.5rem' }}>
                Modification désactivée hors ligne. Une connexion réseau est requise.
              </div>
            )}
            {ficheError && <div className="alert-banner alert-banner-danger">{ficheError}</div>}
            {ficheSuccess && <div className="alert-banner" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--emerald)' }}>{ficheSuccess}</div>}

            <div className="form-group">
              <label className="form-label">Sélectionner un produit à configurer *</label>
              <select 
                className="form-select" 
                value={selectedRecipeId} 
                onChange={e => handleSelectRecipeForFiche(e.target.value)}
              >
                <option value="">-- Choisir un produit --</option>
                {recipes.map(rec => (
                  <option key={rec.id} value={rec.id}>{rec.name}</option>
                ))}
              </select>
            </div>

            {selectedRecipeId && (
              <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Add ingredient row to Fiche */}
                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '1rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Ajouter un ingrédient
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Ingrédient</label>
                      <select 
                        className="form-select" 
                        value={selectedIngId} 
                        onChange={e => setSelectedIngId(e.target.value)}
                      >
                        <option value="">-- Choisir --</option>
                        {ingredients.map(ing => (
                          <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Grammage requis (unité cuisine)</label>
                      <input 
                        type="number" 
                        step="any"
                        className="form-input" 
                        placeholder="Ex: 150 (g) ou 1 (pcs)"
                        value={ingQtyNeeded} 
                        onChange={e => setIngQtyNeeded(e.target.value)}
                      />
                    </div>

                    <button 
                      type="button" 
                      className="touch-btn touch-btn-secondary" 
                      onClick={handleAddIngredientToFiche}
                      disabled={isOffline}
                    >
                      + Insérer dans la fiche
                    </button>
                  </div>
                </div>

                {/* Assigned ingredients table */}
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Composition actuelle
                  </h3>
                  
                  {ficheIngredients.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Fiche technique vide pour l'instant.</p>
                  ) : (
                    <div className="table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      <table className="mepos-table">
                        <thead>
                          <tr>
                            <th>Ingrédient</th>
                            <th>Grammage Requis</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ficheIngredients.map(item => {
                            const ing = ingredients.find(i => i.id === item.ingredient_id);
                            return (
                              <tr key={item.ingredient_id}>
                                <td><strong style={{ color: 'var(--text-primary)' }}>{ing ? ing.name : 'Unknown'}</strong></td>
                                <td>{item.quantity_needed} {ing ? ing.unit : ''}</td>
                                <td>
                                  <button 
                                    type="button" 
                                    className="badge badge-danger" 
                                    style={{ border: 'none', cursor: 'pointer' }}
                                    onClick={() => handleRemoveIngredientFromFiche(item.ingredient_id)}
                                  >
                                    Retirer
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <button 
                  type="button" 
                  className="touch-btn" 
                  style={{ width: '100%', marginTop: '1rem' }}
                  onClick={handleSaveFiche}
                  disabled={isOffline}
                >
                  Sauvegarder la fiche technique
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. STOCKS ADJUSTMENTS & HISTORY TAB */}
      {subTab === 'stocks' && (() => {
        const filteredIngredients = ingredients.filter(ing => 
          ing.name.toLowerCase().includes(ingSearch.toLowerCase())
        );

        const filteredMovements = movements.filter(mov => {
          const query = historySearch.toLowerCase();
          const matchesSearch = 
            mov.ingredient_name.toLowerCase().includes(query) ||
            (mov.reference_id && mov.reference_id.toLowerCase().includes(query)) ||
            mov.department_name.toLowerCase().includes(query);

          if (!matchesSearch) return false;

          const qtyVal = parseFloat(mov.quantity);
          if (historyTypeFilter === 'all') return true;
          if (historyTypeFilter === 'purchase_pos') {
            return mov.type === 'purchase' && qtyVal >= 0;
          }
          if (historyTypeFilter === 'purchase_neg') {
            return mov.type === 'purchase' && qtyVal < 0;
          }
          if (historyTypeFilter === 'reconciliation') {
            return mov.type === 'reconciliation';
          }
          return true;
        });

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            {/* Left panel: Adjustment Form */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Modification de Stock</h2>
              
              {adjError && <div className="alert-banner alert-banner-danger">{adjError}</div>}
              {adjSuccess && <div className="alert-banner" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--emerald)' }}>{adjSuccess}</div>}

              <form onSubmit={handleAdjustStock}>
                {/* 1. DEPOT TOUCH CARDS */}
                <div className="form-group">
                  <label className="form-label">Dépôt / Département *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.25rem' }}>
                    {depts.map(d => {
                      const isSelected = adjDeptId === d.id.toString();
                      return (
                        <div
                          key={d.id}
                          onClick={() => setAdjDeptId(d.id.toString())}
                          style={{
                            padding: '0.8rem',
                            borderRadius: 'var(--radius-md)',
                            background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-input)',
                            border: `1px solid ${isSelected ? 'var(--indigo)' : 'var(--border-color)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                            boxShadow: isSelected ? '0 0 10px rgba(99, 102, 241, 0.15)' : 'none'
                          }}
                          className="touch-card"
                        >
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                            {d.stock_type === 'inherited' ? '🏪 ' : '📦 '} {d.name}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {d.stock_type === 'inherited' ? 'Hérité (Virtuel)' : 'Physique'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Fallback hidden select for HTML5 native validity if needed */}
                  <select 
                    style={{ display: 'none' }} 
                    value={adjDeptId} 
                    onChange={e => setAdjDeptId(e.target.value)}
                    required
                  >
                    <option value="">Select</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                {/* 2. SEARCHABLE INGREDIENT SELECT */}
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Ingrédient *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ width: '100%', paddingRight: '2.5rem' }}
                      placeholder="🔎 Taper pour rechercher..."
                      value={ingSearch}
                      onFocus={() => setIsIngDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsIngDropdownOpen(false), 250)}
                      onChange={e => {
                        setIngSearch(e.target.value);
                        setIsIngDropdownOpen(true);
                        const matchingIng = ingredients.find(ing => ing.name.toLowerCase() === e.target.value.toLowerCase());
                        if (matchingIng) {
                          setAdjIngId(matchingIng.id.toString());
                        } else {
                          setAdjIngId('');
                        }
                      }}
                      required
                    />
                    {ingSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdjIngId('');
                          setIngSearch('');
                        }}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '1.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {isIngDropdownOpen && (
                    <div className="glass-panel" style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 100,
                      maxHeight: '220px',
                      overflowY: 'auto',
                      marginTop: '0.25rem',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
                    }}>
                      {filteredIngredients.length === 0 ? (
                        <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          Aucun ingrédient trouvé
                        </div>
                      ) : (
                        filteredIngredients.map(ing => {
                          const isSelected = adjIngId === ing.id.toString();
                          return (
                            <div
                              key={ing.id}
                              onMouseDown={() => {
                                setAdjIngId(ing.id.toString());
                                setIngSearch(ing.name);
                                setIsIngDropdownOpen(false);
                              }}
                              style={{
                                padding: '0.75rem 1rem',
                                cursor: 'pointer',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                color: isSelected ? 'var(--indigo-light)' : 'var(--text-primary)'
                              }}
                              className="dropdown-item"
                            >
                              <span>{ing.name}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({ing.unit})</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                  {/* Fallback hidden select for HTML5 native validity */}
                  <select 
                    style={{ display: 'none' }} 
                    value={adjIngId} 
                    onChange={e => setAdjIngId(e.target.value)}
                    required
                  >
                    <option value="">Select</option>
                    {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                  </select>
                </div>

                {/* 3. SEGMENTED ADJUSTMENT TYPE */}
                <div className="form-group">
                  <label className="form-label">Type de Modification *</label>
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.25rem', 
                    background: 'var(--bg-input)', 
                    padding: '0.25rem', 
                    borderRadius: 'var(--radius-md)', 
                    border: '1px solid var(--border-color)',
                    marginTop: '0.25rem'
                  }}>
                    <button
                      type="button"
                      onClick={() => setAdjType('purchase')}
                      style={{
                        flex: 1,
                        padding: '0.65rem 0.25rem',
                        border: '1px solid transparent',
                        background: adjType === 'purchase' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                        borderColor: adjType === 'purchase' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                        color: adjType === 'purchase' ? 'var(--emerald)' : 'var(--text-secondary)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.15rem'
                      }}
                    >
                      ➕ Charger
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjType('decrease')}
                      style={{
                        flex: 1,
                        padding: '0.65rem 0.25rem',
                        border: '1px solid transparent',
                        background: adjType === 'decrease' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                        borderColor: adjType === 'decrease' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                        color: adjType === 'decrease' ? 'var(--coral)' : 'var(--text-secondary)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.15rem'
                      }}
                    >
                      🔻 Baisser
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjType('reconciliation')}
                      style={{
                        flex: 1,
                        padding: '0.65rem 0.25rem',
                        border: '1px solid transparent',
                        background: adjType === 'reconciliation' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                        borderColor: adjType === 'reconciliation' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                        color: adjType === 'reconciliation' ? 'var(--indigo-light)' : 'var(--text-secondary)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.15rem'
                      }}
                    >
                      📝 Correction
                    </button>
                  </div>
                </div>

                {/* 4. QUANTITY INPUT WITH TACTILE NUMPAD HELPERS */}
                <div className="form-group">
                  <label className="form-label">
                    {adjType === 'purchase' ? "Quantité à ajouter (unité cuisine) *" : 
                     adjType === 'decrease' ? "Quantité à soustraire (unité cuisine) *" : 
                     "Quantité physique réelle constatée *"}
                  </label>
                  <input 
                    type="number" 
                    step="any"
                    className="form-input" 
                    placeholder="Ex: 10 (si 10kg) ou 20 (buns)"
                    value={adjQty} 
                    onChange={e => setAdjQty(e.target.value)}
                    required
                  />

                  {/* Tactile helpers */}
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {[1, 2, 5, 10, 20, 50, 100].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            const current = parseFloat(adjQty || '0');
                            setAdjQty(isNaN(current) ? val.toString() : (current + val).toString());
                          }}
                          style={{
                            flex: '1 0 calc(25% - 0.4rem)',
                            minHeight: '38px',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.85rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          className="quick-add-btn"
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--indigo)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                        >
                          +{val}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setAdjQty('')}
                        style={{
                          flex: '1 0 calc(25% - 0.4rem)',
                          minHeight: '38px',
                          background: 'rgba(239, 68, 68, 0.05)',
                          border: '1px solid rgba(239, 68, 68, 0.15)',
                          color: 'var(--coral)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Effacer
                      </button>
                    </div>
                  </div>
                </div>

                {/* 5. NOTES */}
                <div className="form-group">
                  <label className="form-label">Note / Référence explicative</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ex: Arrivage fournisseur, Écart inventaire mai"
                    value={adjRef} 
                    onChange={e => setAdjRef(e.target.value)}
                  />
                </div>

                <button type="submit" className="touch-btn" style={{ width: '100%', marginTop: '1rem' }}>
                  Enregistrer la modification
                </button>
              </form>
            </div>

            {/* Right panel: History of Movements */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Historique des Changements</h2>

              {/* FILTERING CONTROLS FOR MOVEMENTS */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 200px', position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ width: '100%', minHeight: '38px', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    placeholder="🔍 Filtrer par ingrédient, dépôt, note..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.15rem' }}>
                  {[
                    { key: 'all', label: 'Tout' },
                    { key: 'purchase_pos', label: '⚙️ Chargements' },
                    { key: 'purchase_neg', label: '🔻 Retraits' },
                    { key: 'reconciliation', label: '📝 Corrections' }
                  ].map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setHistoryTypeFilter(f.key as any)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        background: historyTypeFilter === f.key ? 'var(--indigo)' : 'var(--bg-input)',
                        color: historyTypeFilter === f.key ? 'white' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s'
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="mepos-table">
                  <thead>
                    <tr>
                      <th>Date / Heure</th>
                      <th>Dépôt</th>
                      <th>Ingrédient</th>
                      <th>Quantité</th>
                      <th>Type</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMovements.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                          Aucun historique correspondant.
                        </td>
                      </tr>
                    ) : (
                      filteredMovements.map(mov => {
                        const qtyVal = parseFloat(mov.quantity);
                        const isPositive = qtyVal > 0;
                        const formattedQty = isPositive 
                          ? `+${qtyVal.toLocaleString()}` 
                          : qtyVal.toLocaleString();

                        let typeBadge = '';
                        if (mov.type === 'purchase') {
                          typeBadge = qtyVal >= 0 ? '⚙️ Chargement' : '🔻 Retrait';
                        }
                        else if (mov.type === 'reconciliation') typeBadge = '📝 Correction';
                        else if (mov.type === 'sale_deduction') typeBadge = '🍽️ Caisse (Vente)';
                        else if (mov.type === 'loss') typeBadge = '⚠️ Perte';
                        else if (mov.type === 'transfer_in') typeBadge = '📥 Recharge Reçue';
                        else if (mov.type === 'transfer_out') typeBadge = '📤 Recharge Envoyée';
                        else typeBadge = mov.type;

                        return (
                          <tr key={mov.id} style={{ background: mov.is_offline ? 'rgba(245, 158, 11, 0.02)' : 'transparent' }}>
                            <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {new Date(mov.created_at).toLocaleString('fr-FR', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                              })}
                              {mov.is_offline && (
                                <span style={{ 
                                  marginLeft: '0.5rem', 
                                  display: 'inline-block',
                                  padding: '0.15rem 0.35rem', 
                                  background: 'rgba(245, 158, 11, 0.1)', 
                                  border: '1px solid rgba(245, 158, 11, 0.25)', 
                                  color: '#f59e0b',
                                  borderRadius: '4px',
                                  fontSize: '0.65rem',
                                  fontWeight: '700'
                                }}>
                                  Sync en attente
                                </span>
                              )}
                            </td>
                            <td>{mov.department_name}</td>
                            <td><strong>{mov.ingredient_name}</strong></td>
                            <td style={{ 
                              color: isPositive ? 'var(--emerald)' : 'var(--coral)', 
                              fontWeight: '700',
                              whiteSpace: 'nowrap'
                            }}>
                              {formattedQty} {mov.unit}
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              {typeBadge}
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '150px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={mov.reference_id}>
                              {mov.reference_id}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. USER ACCOUNTS TAB */}
      {subTab === 'users' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Left panel: User Form */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>
              {userId ? "Modifier le Compte" : "Nouveau Compte Utilisateur"}
            </h2>
            
            {isOffline && (
              <div className="alert-banner alert-banner-danger" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', marginBottom: '1.5rem' }}>
                Gestion des comptes désactivée hors ligne. Une connexion réseau est requise.
              </div>
            )}
            {userError && <div className="alert-banner alert-banner-danger">{userError}</div>}
            {userSuccess && <div className="alert-banner" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--emerald)' }}>{userSuccess}</div>}

            <form onSubmit={handleUserSubmit}>
              <div className="form-group">
                <label className="form-label">Nom d'utilisateur (Identifiant de connexion) *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ex: gerant_pizzeria, chef_mario"
                  value={userUsername} 
                  onChange={e => setUserUsername(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  {userId ? "Nouveau Mot de Passe (laisser vide pour ne pas changer)" : "Mot de passe *"}
                </label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder={userId ? "Conserver le mot de passe actuel" : "Ex: pass123"}
                  value={userPassword} 
                  onChange={e => setUserPassword(e.target.value)}
                  required={!userId}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Rôle / Profil d'accès *</label>
                <select 
                  className="form-select" 
                  value={userRole} 
                  onChange={e => setUserRole(e.target.value)}
                  required
                >
                  <option value="admin">Administrateur (Accès complet)</option>
                  <option value="manager">Gérant (Quantités uniquement, prix masqués)</option>
                  <option value="cook">Cuisinier / Comptoir (Stock Cuisine locale uniquement)</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Prénom</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ex: Ahmed"
                    value={userFirstName} 
                    onChange={e => setUserFirstName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Nom de famille</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Ex: Ben Ali"
                    value={userLastName} 
                    onChange={e => setUserLastName(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="submit" className="touch-btn" style={{ flex: 1 }} disabled={isOffline}>
                  {userId ? "Sauvegarder" : "Créer le compte"}
                </button>
                {userId && (
                  <button 
                    type="button" 
                    className="touch-btn touch-btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setUserId(null);
                      setUserUsername('');
                      setUserPassword('');
                      setUserRole('cook');
                      setUserFirstName('');
                      setUserLastName('');
                      setUserError(null);
                      setUserSuccess(null);
                    }}
                  >
                    Annuler
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right panel: User list */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Comptes Utilisateurs Enregistrés</h2>
            <div className="table-wrapper">
              <table className="mepos-table">
                <thead>
                  <tr>
                    <th>Identifiant</th>
                    <th>Nom & Prénom</th>
                    <th>Rôle</th>
                    <th>Mot de passe</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td><strong style={{ color: 'var(--text-primary)' }}>{u.username}</strong></td>
                      <td>{u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Non renseigné</span>}</td>
                      <td>
                        <span className={`badge ${
                          u.role === 'admin' ? 'badge-danger' : u.role === 'manager' ? 'badge-success' : 'badge-warning'
                        }`} style={{ background: u.role === 'cook' ? 'rgba(245,158,11,0.1)' : undefined, color: u.role === 'cook' ? 'var(--amber)' : undefined, borderColor: u.role === 'cook' ? 'rgba(245,158,11,0.2)' : undefined }}>
                          {translateRole(u.role)}
                        </span>
                      </td>
                      <td>
                        <code style={{ color: 'var(--indigo-light)' }}>{u.password || '••••••••'}</code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            type="button" 
                            className="badge badge-success"
                            style={{ border: 'none', cursor: isOffline ? 'not-allowed' : 'pointer', padding: '0.25rem 0.5rem', opacity: isOffline ? 0.5 : 1 }}
                            onClick={() => handleEditUser(u)}
                            disabled={isOffline}
                          >
                            Éditer
                          </button>
                          {u.username !== 'admin' && (
                            <button 
                              type="button" 
                              className="badge badge-danger"
                              style={{ border: 'none', cursor: isOffline ? 'not-allowed' : 'pointer', padding: '0.25rem 0.5rem', opacity: isOffline ? 0.5 : 1 }}
                              onClick={() => handleDeleteUser(u.id)}
                              disabled={isOffline}
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. DEPARTMENTS TAB */}
      {subTab === 'depts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
          {/* Left panel: Department Form */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>
              {deptId ? "Modifier le Dépôt" : "Nouveau Dépôt"}
            </h2>
            
            {isOffline && (
              <div className="alert-banner alert-banner-danger" style={{ background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', marginBottom: '1.5rem' }}>
                Gestion des dépôts désactivée hors ligne. Une connexion réseau est requise.
              </div>
            )}
            {deptError && <div className="alert-banner alert-banner-danger">{deptError}</div>}
            {deptSuccess && <div className="alert-banner" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--emerald)' }}>{deptSuccess}</div>}

            <form onSubmit={handleDeptSubmit}>
              <div className="form-group">
                <label className="form-label">Nom du Dépôt *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ex: Cuisine Centrale, Dépôt Central..."
                  value={deptName} 
                  onChange={e => setDeptName(e.target.value)} 
                  required
                  disabled={isOffline}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Politique de Stock *</label>
                <select 
                  className="form-select" 
                  value={deptStockType} 
                  onChange={e => setDeptStockType(e.target.value as 'isolated' | 'inherited')}
                  disabled={isOffline}
                >
                  <option value="isolated">Stock Isolé (Propres stocks de matières premières)</option>
                  <option value="inherited">Stock Hérité (Hérite en direct du Dépôt Central)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Description facultative de la zone de stockage..."
                  value={deptDescription} 
                  onChange={e => setDeptDescription(e.target.value)}
                  disabled={isOffline}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="submit" className="touch-btn" style={{ flex: 1 }} disabled={isOffline}>
                  {deptId ? "Sauvegarder" : "Créer le dépôt"}
                </button>
                {deptId && (
                  <button 
                    type="button" 
                    className="touch-btn touch-btn-secondary"
                    style={{ flex: 1 }}
                    onClick={handleCancelEditDept}
                  >
                    Annuler
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right panel: Departments list */}
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Dépôts Existants</h2>
            
            <div className="table-wrapper">
              <table className="mepos-table">
                <thead>
                  <tr>
                    <th>Dépôt</th>
                    <th>Politique</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {depts.map(d => {
                    const isCentral = d.id === 1 || /central|principal|main/i.test(d.name);
                    return (
                      <tr key={d.id}>
                        <td><strong style={{ color: 'var(--text-primary)' }}>{d.name}</strong></td>
                        <td>
                          <span className={`badge ${
                            d.stock_type === 'inherited' ? 'badge-warn' : 'badge-success'
                          }`}>
                            {d.stock_type === 'inherited' ? 'Hérité' : 'Isolé'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {d.description || <span style={{ color: 'var(--text-muted)' }}>Sans description</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              type="button" 
                              className="badge badge-success"
                              style={{ border: 'none', cursor: isOffline ? 'not-allowed' : 'pointer', padding: '0.25rem 0.5rem', opacity: isOffline ? 0.5 : 1 }}
                              onClick={() => handleEditDept(d)}
                              disabled={isOffline}
                            >
                              Éditer
                            </button>
                            {!isCentral && (
                              <button 
                                type="button" 
                                className="badge badge-danger"
                                style={{ border: 'none', cursor: isOffline ? 'not-allowed' : 'pointer', padding: '0.25rem 0.5rem', opacity: isOffline ? 0.5 : 1 }}
                                onClick={() => handleDeleteDept(d.id)}
                                disabled={isOffline}
                              >
                                Supprimer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de transfert de stock pour suppression */}
      {showDeleteTransferModal && deptToPerformDelete !== null && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Transférer le stock existant</h2>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => {
                  setShowDeleteTransferModal(false);
                  setDeptToPerformDelete(null);
                  setTransferTargetId('');
                  setModalError(null);
                }}
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div className="alert-banner alert-banner-danger">
                <span>{modalError}</span>
              </div>
            )}

            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
              Ce dépôt contient du stock. Pour pouvoir le supprimer, veuillez affecter ou transférer tout son stock existant vers un autre dépôt :
            </p>

            <form onSubmit={(e) => {
              e.preventDefault();
              if (transferTargetId && deptToPerformDelete !== null) {
                handleDeleteDept(deptToPerformDelete, parseInt(transferTargetId, 10));
              }
            }}>
              <div className="form-group">
                <label className="form-label">Dépôt de destination *</label>
                <select 
                  className="form-select" 
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  required
                >
                  <option value="">-- Choisir le dépôt cible --</option>
                  {depts
                    .filter(d => d.id !== deptToPerformDelete)
                    .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.stock_type === 'inherited' ? 'Hérité' : 'Isolé'})
                      </option>
                    ))
                  }
                </select>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="touch-btn touch-btn-secondary" 
                  onClick={() => {
                    setShowDeleteTransferModal(false);
                    setDeptToPerformDelete(null);
                    setTransferTargetId('');
                    setModalError(null);
                  }}
                >
                  Annuler
                </button>
                <button type="submit" className="touch-btn touch-btn-danger">
                  Transférer &amp; Supprimer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
