import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          margin: '1rem'
        }}>
          <h2 style={{ color: 'var(--coral)', marginBottom: '0.5rem' }}>Une erreur est survenue</h2>
          <p style={{ fontSize: '0.875rem' }}>{this.state.error?.message || 'Erreur inconnue'}</p>
          <button
            onClick={() => window.location.reload()}
            className="touch-btn"
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', fontSize: '0.875rem' }}
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
