import React from 'react';
import type { User, TabRoute } from '../../types/api';

interface SidebarProps {
  user: User;
  activeTab: TabRoute;
  isOffline: boolean;
  isSyncing: boolean;
  onTabChange: (tab: TabRoute) => void;
  onLogout: () => void;
  onToggleOffline: () => void;
}

// SVG Icons (same as before)
const IconDashboard = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
  </svg>
);
const IconInventory = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const IconLosses = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconTransfers = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);
const IconSettings = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
const IconLogout = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const navItems: { tab: TabRoute; label: string; icon: React.FC; adminOnly?: boolean }[] = [
  { tab: 'dashboard', label: 'Tableau de Bord', icon: IconDashboard },
  { tab: 'inventory', label: 'Inventaire', icon: IconInventory },
  { tab: 'losses', label: 'Pertes & Gâche', icon: IconLosses },
  { tab: 'transfers', label: 'Transfert Dépôt', icon: IconTransfers },
  { tab: 'settings', label: 'Paramétrage', icon: IconSettings, adminOnly: true },
];

const getRoleText = (role: string) => {
  switch (role) {
    case 'admin': return 'Administrateur';
    case 'manager': return 'Gérant';
    case 'cook': return 'Cuisinier';
    default: return role;
  }
};

export const Sidebar: React.FC<SidebarProps> = ({
  user, activeTab, isOffline, isSyncing, onTabChange, onLogout, onToggleOffline
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand-section" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span className="brand-logo">
              <span className="brand-logo-dot" /> mePOS STOCK
            </span>
            <span className="brand-badge">v1.4</span>
          </div>
          <div onDoubleClick={onToggleOffline} style={{ cursor: 'pointer' }} title="Double-cliquer pour simuler hors-ligne">
            {isOffline ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' }}>
                <span className="status-dot-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                <span>Hors ligne (Local)</span>
              </div>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#10b981' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                <span>En ligne {isSyncing && '· Sync...'}</span>
              </div>
            )}
          </div>
        </div>

        <nav className="nav-links">
          {navItems
            .filter(item => !item.adminOnly || user.role === 'admin')
            .map(item => (
              <button
                key={item.tab}
                className={`nav-btn ${activeTab === item.tab ? 'active' : ''}`}
                onClick={() => onTabChange(item.tab)}
              >
                <item.icon />
                <span>{item.label}</span>
              </button>
            ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-badge">
            <span className="user-name">{user.first_name}</span>
            <span className={`user-role user-role-${user.role}`}>{getRoleText(user.role)}</span>
          </div>
          <button className="btn-logout" title="Se déconnecter" onClick={onLogout}>
            <IconLogout />
          </button>
        </div>
      </div>
    </aside>
  );
};
