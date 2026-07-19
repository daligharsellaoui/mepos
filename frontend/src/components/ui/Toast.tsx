import React, { useEffect, useState, useRef } from 'react';

export interface ToastItem {
  id: string | number;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps extends ToastItem {
  onClose: (id: string | number) => void;
}

const typeConfig = {
  success: { icon: '✓', color: 'var(--emerald)', border: 'rgba(16, 185, 129, 0.2)' },
  error: { icon: '✕', color: 'var(--coral)', border: 'rgba(239, 68, 68, 0.2)' },
  warning: { icon: '⚠', color: 'var(--amber)', border: 'rgba(245, 158, 11, 0.2)' },
  info: { icon: 'ℹ', color: 'var(--blue)', border: 'rgba(59, 130, 246, 0.2)' },
};

export const Toast: React.FC<ToastProps> = ({ id, type, title, message, duration = 5000, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cfg = typeConfig[type];

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onCloseRef.current(id), 300);
    }, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 300);
  };

  return (
    <div
      className={`notification-toast ${isExiting ? 'fade-out' : ''}`}
      style={{ borderLeft: `4px solid ${cfg.color}`, borderColor: cfg.border }}
    >
      <div className="notification-icon" style={{ background: `${cfg.color}15`, color: cfg.color }}>
        <span style={{ fontWeight: 800, fontSize: '0.8rem' }}>{cfg.icon}</span>
      </div>
      <div className="notification-content">
        <div className="notification-title" style={{ fontSize: '0.85rem' }}>{title}</div>
        {message && <div className="notification-body" style={{ fontSize: '0.8rem' }}>{message}</div>}
      </div>
      <button className="notification-close-btn" onClick={handleClose} aria-label="Fermer">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<{ toasts: ToastItem[]; onClose: (id: string | number) => void }> = ({ toasts, onClose }) => {
  if (!toasts.length) return null;
  return (
    <div className="notification-container" style={{ position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 10000, display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '420px', pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <Toast {...t} onClose={onClose} />
        </div>
      ))}
    </div>
  );
};
