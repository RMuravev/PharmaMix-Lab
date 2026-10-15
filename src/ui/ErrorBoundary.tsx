import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global Error Boundary for the PharmaMix Lab application.
 * Catches rendering errors in the component tree and displays a graceful fallback.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in PharmaMix Lab:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-container" style={{
          padding: '40px',
          margin: '20px',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
          border: '1px solid #fee2e2',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h2 style={{ color: '#991b1b', marginBottom: '12px' }}>Произошла непредвиденная ошибка</h2>
          <p style={{ color: '#4b5563', marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
            Приложение столкнулось с проблемой, которую не удалось обработать автоматически.
            Пожалуйста, попробуйте обновить страницу.
          </p>
          <div style={{ 
            background: '#f9fafb', 
            padding: '16px', 
            borderRadius: '8px', 
            textAlign: 'left',
            marginBottom: '24px',
            fontSize: '13px',
            fontFamily: 'monospace',
            overflow: 'auto',
            maxHeight: '150px',
            border: '1px solid #e5e7eb'
          }}>
            <strong style={{ color: '#ef4444' }}>{this.state.error?.name}:</strong> {this.state.error?.message}
          </div>
          <button 
            onClick={this.handleReset}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            Обновить и восстановить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
