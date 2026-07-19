import React from 'react';
import type { User, TabRoute, LossAlert } from '../../types/api';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

interface AppShellProps {
  user: User;
  activeTab: TabRoute;
  isOffline: boolean;
  isSyncing: boolean;
  alerts: LossAlert[];
  children: React.ReactNode;
  onTabChange: (tab: TabRoute) => void;
  onLogout: () => void;
  onToggleOffline: () => void;
  onCloseAlert: (id: number) => void;
}

const getRoleText = (role: string) => {
  switch (role) {
    case 'admin': return 'Administrateur';
    case 'manager': return 'Gérant';
    case 'cook': return 'Cuisinier';
    default: return role;
  }
};

export const AppShell: React.FC<AppShellProps> = ({
  user, activeTab, isOffline, isSyncing, alerts,
  children, onTabChange, onLogout, onToggleOffline, onCloseAlert
}) => {
  return (
    <div className="app-container">
      <Sidebar
        user={user}
        activeTab={activeTab}
        isOffline={isOffline}
        isSyncing={isSyncing}
        onTabChange={onTabChange}
        onLogout={onLogout}
        onToggleOffline={onToggleOffline}
      />

      {/* Mobile Top Header */}
      <header className="mobile-header-bar">
        <div className="brand-section" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="brand-logo">
            <span className="brand-logo-dot" /> mePOS
          </span>
          {isOffline ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.15rem 0.45rem', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '600', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' }}>
              <span className="status-dot-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              <span>Hors ligne</span>
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.15rem 0.45rem', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '600', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#10b981' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span>En ligne</span>
            </div>
          )}
        </div>
        <div className="user-profile">
          <span className={`user-role user-role-${user.role}`} style={{ marginRight: '0.25rem' }}>
            {getRoleText(user.role)}
          </span>
          <button className="btn-logout" title="Se déconnecter" onClick={onLogout}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="page-enter" key={activeTab}>
          {children}
        </div>
      </main>

      <MobileNav user={user} activeTab={activeTab} onTabChange={onTabChange} />

      {/* Real-time Loss Notifications */}
      {alerts.length > 0 && (
        <div className="notification-container">
          {alerts.map(alert => (
            <div key={alert.id} className="notification-toast">
              <div className="notification-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
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
              <button className="notification-close-btn" onClick={() => onCloseAlert(alert.id)} title="Fermer">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
