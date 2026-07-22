import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface InventoryProps {
  stocks: any[];
  departments: any[];
  onRefresh: () => void;
}

export const Inventory: React.FC<InventoryProps> = ({ stocks, departments, onRefresh }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isCook = user?.role === 'cook';

  // Cook is locked to the kitchen department dynamically
  const kitchenDept = departments.find(d => 
    d.name.toLowerCase().includes('cuisine') || 
    d.name.toLowerCase().includes('kitchen')
  ) || departments.find(d => d.stock_type === 'isolated' && d.id !== 1) || departments[0];

  const kitchenId = kitchenDept ? kitchenDept.id : 2;

  const defaultDeptId = isCook ? kitchenId : 0; // 0 represents "All Departments"
  const [selectedDept, setSelectedDept] = useState<number>(defaultDeptId);

  React.useEffect(() => {
    if (isCook && kitchenDept) {
      setSelectedDept(kitchenDept.id);
    }
  }, [departments, isCook]);

  // Filter stocks based on department selection
  const filteredStocks = stocks.filter(stock => {
    if (isCook) {
      return stock.department_id === kitchenId;
    }
    if (selectedDept === 0) {
      return true; // Show all
    }
    return stock.department_id === selectedDept;
  });

  return (
    <div>
      <div className="view-title-section">
        <div>
          <h1 className="view-title">État des Stocks</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Suivi des quantités d'ingrédients disponibles en temps réel.
          </p>
        </div>
        <button className="touch-btn touch-btn-secondary" onClick={onRefresh}>
          Actualiser
        </button>
      </div>

      {/* Department filtering bar */}
      {!isCook && (
        <div className="dept-filter-section">
          <div 
            className={`dept-pill ${selectedDept === 0 ? 'active' : ''}`}
            onClick={() => setSelectedDept(0)}
          >
            Tous les Dépôts
          </div>
          {departments.map(dept => (
            <div 
              key={dept.id} 
              className={`dept-pill ${selectedDept === dept.id ? 'active' : ''}`}
              onClick={() => setSelectedDept(dept.id)}
            >
              {dept.name} ({dept.stock_type === 'inherited' ? 'Hérité' : 'Isolé'})
            </div>
          ))}
        </div>
      )}

      {isCook && (
        <div style={{ marginBottom: '1rem' }}>
          <span className="badge badge-success" style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>
            Zone Cuisine Centrale Uniquement
          </span>
        </div>
      )}

      {/* Stocks Table */}
      <div className="glass-panel table-wrapper">
        {filteredStocks.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Aucun ingrédient répertorié pour ce dépôt.
          </div>
        ) : (
          <table className="mepos-table">
            <thead>
              <tr>
                <th>Ingrédient</th>
                <th>Dépôt / Zone</th>
                <th>Politique de Stock</th>
                <th>Quantité Disponible</th>
                <th>Seuil d'Alerte</th>
                <th>Statut</th>
                <th>Prix d'Achat</th>
                <th>Valeur Estimée</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.map(stock => {
                const qty = parseFloat(stock.quantity);
                const threshold = parseFloat(stock.alert_threshold);
                const isCritical = qty <= threshold;
                const price = parseFloat(stock.purchase_price_per_unit);
                const value = qty * price;

                return (
                  <tr key={stock.id}>
                    <td data-label="Ingrédient">
                      <strong style={{ color: 'var(--text-primary)' }}>{stock.ingredient_name}</strong>
                    </td>
                    <td data-label="Dépôt / Zone">{stock.department_name}</td>
                    <td data-label="Politique">
                      <span className={`badge ${stock.stock_type === 'inherited' ? 'badge-warn' : 'badge-success'}`}>
                        {stock.stock_type === 'inherited' ? 'Hérité du dépôt' : 'Stock Isolé'}
                      </span>
                    </td>
                    <td data-label="Quantité" style={{ fontSize: '1.05rem', fontWeight: '600' }}>
                      {stock.conversion_factor && parseFloat(stock.conversion_factor) > 1 ? (
                        <span>
                          {(qty / parseFloat(stock.conversion_factor)).toFixed(2)} {stock.purchase_unit}
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 'normal' }}>
                            ({qty.toFixed(0)} {stock.unit})
                          </span>
                        </span>
                      ) : (
                        <span>{qty.toFixed(2)} {stock.unit}</span>
                      )}
                    </td>
                    <td data-label="Seuil d'Alerte" style={{ color: 'var(--text-secondary)' }}>
                      {stock.conversion_factor && parseFloat(stock.conversion_factor) > 1 ? (
                        <span>
                          {(threshold / parseFloat(stock.conversion_factor)).toFixed(2)} {stock.purchase_unit}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>
                            ({threshold.toFixed(0)} {stock.unit})
                          </span>
                        </span>
                      ) : (
                        <span>{threshold.toFixed(2)} {stock.unit}</span>
                      )}
                    </td>
                    <td data-label="Statut">
                      <span className={`badge ${isCritical ? 'badge-danger' : 'badge-success'}`}>
                        {isCritical ? 'Critique (Réassort)' : 'Normal'}
                      </span>
                    </td>
                    <td data-label="Prix d'Achat" style={{ color: 'var(--text-secondary)' }}>
                      {isAdmin ? `${price.toFixed(2)} TND / ${stock.unit}` : '*** TND'}
                    </td>
                    <td data-label="Valeur Estimée" style={{ fontWeight: '600', color: 'var(--accent-info)' }}>
                      {isAdmin ? `${value.toFixed(2)} TND` : '*** TND'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
