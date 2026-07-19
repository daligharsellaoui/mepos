import React, { useState } from 'react';

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, isLoading, error }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(username, password);
  };

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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
};
