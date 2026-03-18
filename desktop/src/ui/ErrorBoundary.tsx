import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 捕获子组件渲染错误，避免白屏；展示友好错误信息
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-bg-panel">
          <div className="max-w-md w-full p-6 rounded-xl bg-warning-bg border border-warning/30">
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle size={24} className="text-warning flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-t1 mb-1">页面出错</h2>
                <p className="text-sm text-t3 leading-relaxed">
                  {this.state.error.message}
                </p>
                <button
                  onClick={() => this.setState({ hasError: false, error: null })}
                  className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-bg-hover text-t1 hover:bg-bg-inset transition-colors"
                >
                  重试
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
