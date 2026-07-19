import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface StockTransferProps {
  stocks: any[];
  departments: any[];
  ingredients: any[];
  onSubmitTransfer: (data: any) => Promise<boolean>;
  onRefresh?: () => void;
}

export const StockTransfer: React.FC<StockTransferProps> = ({
  stocks,
  departments,
  ingredients,
  onSubmitTransfer,
  onRefresh
}) => {
  const { user, apiKey, apiUrl } = useAuth();
  const isCook = user?.role === 'cook';
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  const centralDept = departments.find(d => 
    d.name.toLowerCase().includes('central') || 
    d.name.toLowerCase().includes('principal') || 
    d.name.toLowerCase().includes('main')
  ) || departments[0];

  const kitchenDept = departments.find(d => 
    d.name.toLowerCase().includes('cuisine') || 
    d.name.toLowerCase().includes('kitchen')
  ) || departments.find(d => d.id !== (centralDept ? centralDept.id : null)) || departments[0];

  const centralId = centralDept ? centralDept.id : 1;
  const kitchenId = kitchenDept ? kitchenDept.id : 2;

  const [srcDept, setSrcDept] = useState<string>(centralId.toString());
  const [destDept, setDestDept] = useState<string>(isCook ? kitchenId.toString() : '');

  useEffect(() => {
    if (departments.length > 0) {
      const central = departments.find(d => 
        d.name.toLowerCase().includes('central') || 
        d.name.toLowerCase().includes('principal') || 
        d.name.toLowerCase().includes('main')
      ) || departments[0];
      setSrcDept(central.id.toString());

      const kitchen = departments.find(d => 
        d.name.toLowerCase().includes('cuisine') || 
        d.name.toLowerCase().includes('kitchen')
      ) || departments.find(d => d.id !== central.id) || departments[0];
      setDestDept(isCook ? kitchen.id.toString() : '');
    }
  }, [departments, isCook]);
  const [selectedIng, setSelectedIng] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Transfer requests list state
  const [requests, setRequests] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRequests = async () => {
    try {
      const response = await fetch(`${apiUrl}/transfers/requests`, {
        headers: { 'x-api-key': apiKey }
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        // Cook only views their own department requests
        if (isCook) {
          setRequests(resJson.data.filter((r: any) => r.destination_department_id === kitchenId || r.source_department_id === kitchenId));
        } else {
          setRequests(resJson.data);
        }
      }
    } catch (err) {
      console.error('Error fetching transfer requests:', err);
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!srcDept || !destDept || !selectedIng || !quantity) {
      setErrorMsg("Veuillez remplir tous les champs.");
      return;
    }

    if (srcDept === destDept) {
      setErrorMsg("Le dépôt de départ et d'arrivée doivent être différents.");
      return;
    }

    const qtyVal = parseFloat(quantity);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      setErrorMsg("La quantité doit être supérieure à 0.");
      return;
    }

    // Check source department stock
    const srcStockRow = stocks.find(
      s => s.department_id === parseInt(srcDept, 10) && s.ingredient_id === parseInt(selectedIng, 10)
    );
    const availableSrcQty = srcStockRow ? parseFloat(srcStockRow.quantity) : 0;

    if (qtyVal > availableSrcQty) {
      setErrorMsg(`Stock insuffisant dans le dépôt de départ. Quantité disponible : ${availableSrcQty.toFixed(2)}.`);
      return;
    }

    setIsSubmitting(true);

    try {
      if (isCook) {
        // Cooks submit a digital request
        const response = await fetch(`${apiUrl}/transfers/requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({
            source_department_id: parseInt(srcDept, 10),
            destination_department_id: parseInt(destDept, 10),
            ingredient_id: parseInt(selectedIng, 10),
            quantity: qtyVal,
            requested_by: user?.id
          })
        });
        const resJson = await response.json();
        if (resJson.status === 'success') {
          setSuccessMsg("Demande de recharge soumise au gérant avec succès !");
          setQuantity('');
          setSelectedIng('');
          fetchRequests();
        } else {
          setErrorMsg(resJson.message || "Erreur lors de la soumission de la demande.");
        }
      } else {
        // Manager/Admin execute direct transfers immediately
        const success = await onSubmitTransfer({
          source_department_id: parseInt(srcDept, 10),
          destination_department_id: parseInt(destDept, 10),
          ingredient_id: parseInt(selectedIng, 10),
          quantity: qtyVal
        });

        if (success) {
          setSuccessMsg("Le transfert de stock direct a été effectué avec succès !");
          setQuantity('');
          setSelectedIng('');
          if (!isCook) setDestDept('');
          if (onRefresh) onRefresh();
          fetchRequests();
        } else {
          setErrorMsg("Une erreur s'est produite lors du transfert.");
        }
      }
    } catch (err) {
      setErrorMsg("Erreur réseau de communication.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValidateRequest = async (id: number) => {
    if (!window.confirm("Voulez-vous approuver cette demande de recharge et transférer les stocks ?")) return;
    try {
      const response = await fetch(`${apiUrl}/transfers/requests/${id}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ validated_by: user?.id })
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        alert("Demande approuvée avec succès ! Les stocks ont été mis à jour.");
        fetchRequests();
        if (onRefresh) onRefresh();
      } else {
        alert("Erreur : " + resJson.message);
      }
    } catch (err) {
      alert("Erreur de connexion.");
    }
  };

  const handleRejectRequest = async (id: number) => {
    if (!window.confirm("Voulez-vous rejeter cette demande de recharge ?")) return;
    try {
      const response = await fetch(`${apiUrl}/transfers/requests/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ validated_by: user?.id })
      });
      const resJson = await response.json();
      if (resJson.status === 'success') {
        alert("Demande rejetée.");
        fetchRequests();
      } else {
        alert("Erreur : " + resJson.message);
      }
    } catch (err) {
      alert("Erreur de connexion.");
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'approved': return 'badge-success';
      case 'rejected': return 'badge-danger';
      case 'pending':
      default: return 'badge-warn';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'approved': return 'Validé';
      case 'rejected': return 'Refusé';
      case 'pending':
      default: return 'En attente';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div className="view-title-section">
        <div>
          <h1 className="view-title">📦 Recharges & Transferts</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {isCook 
              ? "Demander le réapprovisionnement numérique de votre cuisine depuis le Dépôt Central."
              : "Valider les recharges de cuisine et gérer les transferts de stocks directs."
            }
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
        {/* Left panel: Transfer Form */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>
            {isCook ? "Faire une demande de recharge" : "Transfert Direct de Stock"}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {isCook 
              ? "Cette demande devra être approuvée par le gérant avant d'imputer le stock central."
              : "Transférer instantanément les stocks physiques sans demande de validation."
            }
          </p>

          {errorMsg && (
            <div className="alert-banner alert-banner-danger">
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="alert-banner" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--emerald)' }}>
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Source department selector */}
            <div className="form-group">
              <label className="form-label">Dépôt de départ (Source)</label>
              {isCook ? (
                <input 
                  type="text" 
                  className="form-input" 
                  value={centralDept ? centralDept.name : "Dépôt Central"} 
                  disabled 
                  readOnly 
                />
              ) : (
                <select 
                  className="form-select" 
                  value={srcDept} 
                  onChange={(e) => setSrcDept(e.target.value)}
                >
                  {departments
                    .filter(d => d.stock_type === 'isolated')
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))
                  }
                </select>
              )}
            </div>

            {/* Destination department selector */}
            <div className="form-group">
              <label className="form-label">Dépôt de destination (Cible) *</label>
              {isCook ? (
                <input 
                  type="text" 
                  className="form-input" 
                  value={kitchenDept ? kitchenDept.name : "Cuisine Centrale"} 
                  disabled 
                  readOnly 
                />
              ) : (
                <select 
                  className="form-select" 
                  value={destDept} 
                  onChange={(e) => setDestDept(e.target.value)}
                  required
                >
                  <option value="">-- Choisir la destination --</option>
                  {departments
                    .filter(d => d.stock_type === 'isolated' && d.id !== parseInt(srcDept, 10))
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))
                  }
                </select>
              )}
            </div>

            {/* Ingredient Selector */}
            <div className="form-group">
              <label className="form-label">Ingrédient à transférer *</label>
              <select 
                className="form-select" 
                value={selectedIng} 
                onChange={(e) => setSelectedIng(e.target.value)}
                required
              >
                <option value="">-- Sélectionner l'ingrédient --</option>
                {ingredients.map(ing => {
                  // Find source stock to display remaining quantity in option label
                  const currentStock = stocks.find(
                    s => s.department_id === parseInt(srcDept, 10) && s.ingredient_id === ing.id
                  );
                  const qtyStr = currentStock ? `${parseFloat(currentStock.quantity).toFixed(2)}` : '0.00';
                  
                  return (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} (Dispo : {qtyStr} {ing.unit})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Quantity to transfer */}
            <div className="form-group">
              <label className="form-label">Quantité à transférer *</label>
              <input 
                type="number" 
                step="any"
                className="form-input" 
                placeholder="Ex: 5.0" 
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="touch-btn" style={{ width: '100%', marginTop: '1rem' }} disabled={isSubmitting}>
              {isSubmitting ? "Envoi..." : isCook ? "Demander une recharge" : "Confirmer le transfert"}
            </button>
          </form>
        </div>

        {/* Right panel: Active stock distribution info */}
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>État des stocks isolés</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Distribution actuelle des stocks d'ingrédients physiques.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {ingredients.map(ing => {
              const centralStock = stocks.find(s => s.department_id === centralId && s.ingredient_id === ing.id);
              const kitchenStock = stocks.find(s => s.department_id === kitchenId && s.ingredient_id === ing.id);

              const cQty = centralStock ? parseFloat(centralStock.quantity) : 0;
              const kQty = kitchenStock ? parseFloat(kitchenStock.quantity) : 0;

              return (
                <div 
                  key={ing.id} 
                  style={{ 
                    padding: '1rem', 
                    background: 'rgba(255, 255, 255, 0.02)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: '12px' 
                  }}
                >
                  <strong style={{ fontSize: '1rem' }}>{ing.name}</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>{centralDept ? centralDept.name : "Dépôt Central"} :</span>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                        {ing.conversion_factor && parseFloat(ing.conversion_factor) > 1 ? (
                          <span>
                            {(cQty / parseFloat(ing.conversion_factor)).toFixed(2)} {ing.purchase_unit}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 'normal' }}>
                              ({cQty.toFixed(0)} {ing.unit})
                            </span>
                          </span>
                        ) : (
                          <span>{cQty.toFixed(2)} {ing.unit}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>{kitchenDept ? kitchenDept.name : "Cuisine Centrale"} :</span>
                      <div style={{ fontWeight: '600', color: 'var(--accent-primary)' }}>
                        {ing.conversion_factor && parseFloat(ing.conversion_factor) > 1 ? (
                          <span>
                            {(kQty / parseFloat(ing.conversion_factor)).toFixed(2)} {ing.purchase_unit}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 'normal' }}>
                              ({kQty.toFixed(0)} {ing.unit})
                            </span>
                          </span>
                        ) : (
                          <span>{kQty.toFixed(2)} {ing.unit}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Section: Digital requests tracker */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>📋 Suivi des Demandes de Recharge Numériques</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Registre des demandes de recharge en attente ou traitées.
        </p>

        <div className="table-wrapper">
          {requests.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
              Aucune demande de recharge enregistrée.
            </p>
          ) : (
            <table className="mepos-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Demandeur</th>
                  <th>Ingrédient</th>
                  <th>Quantité</th>
                  <th>Départ &rarr; Cible</th>
                  <th>Statut</th>
                  <th>Traité par</th>
                  {isAdminOrManager && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {requests.map(req => {
                  const dateStr = new Date(req.created_at).toLocaleString('fr-TN', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                  });
                  return (
                    <tr key={req.id}>
                      <td data-label="Date" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {dateStr}
                      </td>
                      <td data-label="Demandeur">
                        <span style={{ color: 'var(--text-primary)' }}>@{req.requested_by_username}</span>
                      </td>
                      <td data-label="Ingrédient">
                        <strong>{req.ingredient_name}</strong>
                      </td>
                      <td data-label="Quantité" style={{ fontWeight: '600' }}>
                        {parseFloat(req.quantity).toFixed(2)} {req.ingredient_unit}
                      </td>
                      <td data-label="Trajet" style={{ fontSize: '0.875rem' }}>
                        {req.source_department_name} &rarr; {req.destination_department_name}
                      </td>
                      <td data-label="Statut">
                        <span className={`badge ${getStatusBadgeClass(req.status)}`}>
                          {getStatusLabel(req.status)}
                        </span>
                      </td>
                      <td data-label="Traité par" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {req.validated_by_username ? `@${req.validated_by_username}` : '-'}
                      </td>
                      {isAdminOrManager && (
                        <td data-label="Actions">
                          {req.status === 'pending' ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button 
                                className="badge badge-success" 
                                style={{ border: 'none', cursor: 'pointer', padding: '0.35rem 0.6rem' }}
                                onClick={() => handleValidateRequest(req.id)}
                              >
                                Valider
                              </button>
                              <button 
                                className="badge badge-danger" 
                                style={{ border: 'none', cursor: 'pointer', padding: '0.35rem 0.6rem' }}
                                onClick={() => handleRejectRequest(req.id)}
                              >
                                Refuser
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Traité</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
};

