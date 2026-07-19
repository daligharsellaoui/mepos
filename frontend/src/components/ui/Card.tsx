import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: string;
  hoverable?: boolean;
  onClick?: () => void;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding,
  hoverable = false,
  onClick,
  title,
  subtitle,
  actions,
  style,
}) => {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      className={`metric-card card-hover ${hoverable ? 'card-hoverable' : ''} ${className}`}
      onClick={onClick}
      style={{
        padding: padding || '1.5rem',
        cursor: onClick ? 'pointer' : undefined,
        textAlign: onClick ? 'left' : undefined,
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-card)',
        transition: 'all 0.2s ease',
        ...style,
      }}
    >
      {(title || subtitle || actions) && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: children ? '1rem' : 0,
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            {title && (
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      {children}
    </Component>
  );
};
