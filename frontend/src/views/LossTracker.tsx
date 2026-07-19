import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface LossTrackerProps {
  losses: any[];
  stocks: any[];
  departments: any[];
  ingredients: any[];
  onRefresh: () => void;
  onSubmitLoss: (data: any) => Promise<boolean>;
}

export const LossTracker: React.FC<LossTrackerProps> = ({ 
  losses, 
  stocks, 
  departments, 
  ingredients, 
  onRefresh, 
  onSubmitLoss 
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isCook = user?.role === 'cook';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const kitchenDept = departments.find(d => 
    d.name.toLowerCase().includes('cuisine') || 
    d.name.toLowerCase().includes('kitchen')
  ) || departments.find(d => d.stock_type === 'isolated' && d.id !== 1) || departments[0];

  const kitchenDeptIdStr = kitchenDept ? kitchenDept.id.toString() : '2';

  const [selectedDept, setSelectedDept] = useState<string>(isCook ? kitchenDeptIdStr : '');

  React.useEffect(() => {
    if (departments.length > 0 && isCook) {
      const kitchen = departments.find(d => 
        d.name.toLowerCase().includes('cuisine') || 
        d.name.toLowerCase().includes('kitchen')
      ) || departments.find(d => d.stock_type === 'isolated' && d.id !== 1) || departments[0];
      setSelectedDept(kitchen ? kitchen.id.toString() : '');
    }
  }, [departments, isCook]);
  const [selectedIng, setSelectedIng] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('spoilage');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedDept || !selectedIng || !quantity) {
      setErrorMsg("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    const qtyVal = parseFloat(quantity);
    if (isNaN(qtyVal) || qtyVal <= 0) {
      setErrorMsg("La quantité doit être supérieure à 0.");
      return;
    }

    // Check if department has enough stock (warning only)
    const stockRow = stocks.find(
      s => s.department_id === parseInt(selectedDept, 10) && s.ingredient_id === parseInt(selectedIng, 10)
    );
    const availableQty = stockRow ? parseFloat(stockRow.quantity) : 0;
    
    if (qtyVal > availableQty) {
      const confirmProceed = window.confirm(
        `Attention: Le stock disponible est de ${availableQty.toFixed(2)}. Le stock deviendra négatif après cette déclaration. Voulez-vous continuer ?`
      );
      if (!confirmProceed) return;
    }

    const success = await onSubmitLoss({
      department_id: parseInt(selectedDept, 10),
      ingredient_id: parseInt(selectedIng, 10),
      quantity: qtyVal,
      loss_reason: reason,
      reported_by: user?.id
    });

    if (success) {
      // Reset form
      setQuantity('');
      setSelectedIng('');
      if (!isCook) setSelectedDept('');
      setIsModalOpen(false);
    } else {
      setErrorMsg("Erreur lors de la déclaration de la perte. Réessayez.");
    }
  };

  // Maps reason key to French display label
  const getReasonLabel = (r: string) => {
    switch(r) {
      case 'spoilage': return 'Périmé / Gâté';
      case 'theft': return 'Vol / Disparition';
      case 'preparation_error': return 'Erreur de Préparation';
      default: return r;
    }
  };

  return (
    <div>
      <div className="view-title-section">
        <div>
          <h1 className="view-title">Registre des Pertes</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Déclarer et suivre le gaspillage et les freintes de matières premières.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="touch-btn touch-btn-secondary" onClick={onRefresh}>
            Actualiser
          </button>
          <button className="touch-btn" onClick={() => setIsModalOpen(true)}>
            + Déclarer une perte
          </button>
        </div>
      </div>

      {/* Audit Logs list */}
      <div className="glass-panel table-wrapper">
        {losses.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Aucune perte déclarée.
          </div>
        ) : (
          <table className="mepos-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Ingrédient</th>
                <th>Dépôt</th>
                <th>Quantité Perdue</th>
                <th>Motif</th>
                <th>Déclaré par</th>
                <th>Perte Sèche (Achat)</th>
                <th>Manque à Gagner (Vente)</th>
              </tr>
            </thead>
            <tbody>
              {losses.map(loss => {
                const date = new Date(loss.created_at).toLocaleString('fr-TN', {
                  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
                });
                const qty = parseFloat(loss.quantity);
                const cost = parseFloat(loss.cost_loss);
                const opp = parseFloat(loss.opportunity_loss);

                return (
                  <tr key={loss.id} style={{ background: loss.is_offline ? 'rgba(245, 158, 11, 0.02)' : 'transparent' }}>
                    <td data-label="Date" style={{ color: 'var(--text-secondary)' }}>{date}</td>
                    <td data-label="Ingrédient">
                      <strong style={{ color: 'var(--text-primary)' }}>{loss.ingredient_name}</strong>
                      {loss.is_offline && (
                        <span style={{ 
                          fontSize: '0.7rem', 
                          color: '#f59e0b', 
                          background: 'rgba(245, 158, 11, 0.1)', 
                          border: '1px solid rgba(245, 158, 11, 0.25)', 
                          padding: '0.1rem 0.4rem', 
                          borderRadius: '8px', 
                          marginLeft: '0.5rem',
                          fontWeight: '600',
                          whiteSpace: 'nowrap'
                        }}>
                          Sync en attente
                        </span>
                      )}
                    </td>
                    <td data-label="Dépôt">{loss.department_name}</td>
                    <td data-label="Quantité Perdue" style={{ color: 'var(--accent-danger)', fontWeight: '600' }}>
                      -{qty.toFixed(2)} {loss.unit}
                    </td>
                    <td data-label="Motif">
                      <span className={`badge ${loss.loss_reason === 'theft' ? 'badge-danger' : 'badge-warn'}`}>
                        {getReasonLabel(loss.loss_reason)}
                      </span>
                    </td>
                    <td data-label="Déclaré par" style={{ color: 'var(--text-secondary)' }}>@{loss.reported_by_username || 'système'}</td>
                    <td data-label="Perte Sèche" style={{ fontWeight: '600', color: 'var(--accent-danger)' }}>
                      {isAdmin ? `${cost.toFixed(2)} TND` : '*** TND'}
                    </td>
                    <td data-label="Manque à Gagner" style={{ fontWeight: '600', color: '#fca5a5' }}>
                      {isAdmin ? `${opp.toFixed(2)} TND` : '*** TND'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Dialog for declaring loss */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Déclarer un gaspillage</h2>
              <button className="btn-close" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            
            {errorMsg && (
              <div className="alert-banner alert-banner-danger">
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Department Selector */}
              <div className="form-group">
                <label className="form-label">Dépôt concerné *</label>
                {isCook ? (
                  <input 
                    type="text" 
                    className="form-input" 
                    value={kitchenDept ? kitchenDept.name : "Cuisine Centrale"} 
                    readOnly 
                    disabled 
                  />
                ) : (
                  <select 
                    className="form-select" 
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    required
                  >
                    <option value="">-- Sélectionner un Dépôt --</option>
                    {departments
                      .filter(d => d.stock_type === 'isolated') // Only isolated stock zones have physical inventory to lose
                      .map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Ingredient Selector */}
              <div className="form-group">
                <label className="form-label">Matière première perdue *</label>
                <select 
                  className="form-select" 
                  value={selectedIng}
                  onChange={(e) => setSelectedIng(e.target.value)}
                  required
                >
                  <option value="">-- Sélectionner l'ingrédient --</option>
                  {ingredients.map(ing => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity input */}
              <div className="form-group">
                <label className="form-label">Quantité jetée *</label>
                <input 
                  type="number" 
                  step="any"
                  className="form-input" 
                  placeholder="Ex: 1.50" 
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              {/* Loss reason */}
              <div className="form-group">
                <label className="form-label">Raison de la perte *</label>
                <select 
                  className="form-select" 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                >
                  <option value="spoilage">Périmé / Gâté</option>
                  <option value="preparation_error">Erreur de préparation / Jet de cuisine</option>
                  <option value="theft">Vol / Écart d'inventaire</option>
                </select>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  className="touch-btn touch-btn-secondary" 
                  onClick={() => setIsModalOpen(false)}
                >
                  Annuler
                </button>
                <button type="submit" className="touch-btn touch-btn-danger">
                  Valider la perte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
