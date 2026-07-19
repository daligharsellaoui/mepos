import React from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  children: React.ReactNode;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

const variantStyles: Record<string, React.CSSProperties> = {
  success: { background: 'rgba(16, 185, 129, 0.1)', color: 'var(--emerald)', border: '1px solid rgba(16, 185, 129, 0.15)' },
  warning: { background: 'rgba(245, 158, 11, 0.1)', color: 'var(--amber)', border: '1px solid rgba(245, 158, 11, 0.15)' },
  danger: { background: 'rgba(239, 68, 68, 0.1)', color: 'var(--coral)', border: '1px solid rgba(239, 68, 68, 0.15)' },
  info: { background: 'rgba(59, 130, 246, 0.1)', color: 'var(--blue)', border: '1px solid rgba(59, 130, 246, 0.15)' },
  neutral: { background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' },
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'neutral', children, size = 'md', style }) => {
  return (
    <span
      className="badge"
      style={{
        ...variantStyles[variant],
        padding: size === 'sm' ? '0.15rem 0.45rem' : '0.25rem 0.65rem',
        fontSize: size === 'sm' ? '0.65rem' : '0.7rem',
        ...style,
      }}
    >
      {children}
    </span>
  );
};
