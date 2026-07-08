import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 bg-red-900/20 border border-red-500/50 rounded-lg backdrop-blur-md">
          <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Error en {this.props.fallbackName || 'componente'}</h2>
          <p className="text-red-200 text-sm mb-4 text-center">
            El sistema de contención ha aislado un fallo crítico para proteger el núcleo.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-sm font-medium"
          >
            Reintentar Reinicio
          </button>
          {this.state.error && (
            <details className="mt-4 w-full">
              <summary className="text-xs text-red-400 cursor-pointer">Ver reporte técnico</summary>
              <pre className="mt-2 p-2 bg-black/50 text-[10px] text-red-300 overflow-auto max-h-32 custom-scrollbar">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
