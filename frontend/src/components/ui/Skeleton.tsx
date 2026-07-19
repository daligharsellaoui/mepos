import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  style?: React.CSSProperties;
  variant?: 'text' | 'rect' | 'circle';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  borderRadius,
  style,
  variant = 'text',
}) => {
  const radius = borderRadius || (variant === 'circle' ? '50%' : variant === 'text' ? '4px' : '8px');

  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
};

/** Pre-built skeleton layouts for common views */

export const MetricCardSkeleton: React.FC = () => (
  <div className="metric-card" style={{ gap: '1rem' }}>
    <Skeleton width="60%" height="0.75rem" />
    <Skeleton width="80%" height="2rem" borderRadius="6px" />
    <Skeleton width="40%" height="0.75rem" />
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="table-wrapper">
    <div style={{ padding: '1rem 1.25rem', display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border-color)' }}>
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} width={`${15 + i * 5}%`} height="0.8rem" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, idx) => (
      <div key={idx} style={{ padding: '1rem 1.25rem', display: 'flex', gap: '2rem', borderBottom: idx < rows - 1 ? '1px solid var(--border-color)' : 'none' }}>
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} width={`${15 + i * 5}%`} height="0.9rem" />
        ))}
      </div>
    ))}
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
    <div className="metrics-grid">
      {[1, 2, 3, 4].map(i => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
    <TableSkeleton rows={4} />
  </div>
);
