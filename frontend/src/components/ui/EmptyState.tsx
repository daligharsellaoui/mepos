import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}) => {
  const DefaultIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    </svg>
  );

  return (
    <div className="empty-state" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: compact ? '2rem 1rem' : '4rem 2rem',
      textAlign: 'center',
      gap: '1rem',
      borderRadius: 'var(--radius-lg)',
      border: '1px dashed var(--border-color)',
      background: 'rgba(255,255,255,0.01)',
    }}>
      <div style={{ color: 'var(--text-muted)' }}>
        {icon || <DefaultIcon />}
      </div>
      <h3 style={{
        fontSize: compact ? '1rem' : '1.15rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        margin: 0,
      }}>
        {title}
      </h3>
      {description && (
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          maxWidth: '360px',
          lineHeight: 1.5,
          margin: 0,
        }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          className="touch-btn"
          onClick={onAction}
          style={{ marginTop: '0.5rem' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
