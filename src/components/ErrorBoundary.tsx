import { Component, ErrorInfo } from 'react';
import { logError } from '../utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  // Changing this resets a tripped boundary (e.g. pass the route path so a
  // crash on one page doesn't stick after navigating away).
  resetKey?: string | number;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetKey: string | number | undefined;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  // A new resetKey clears a tripped boundary without setState-in-update.
  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState) {
    if (state.resetKey !== props.resetKey) {
      return { hasError: false, error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError('ErrorBoundary', error);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="page" role="alert">
          <div className="empty-state">
            <h3>Something went wrong</h3>
            <p>{this.state.error?.message || 'An unexpected error occurred. Please try again.'}</p>
            <div className="empty-state-actions">
              <button className="empty-state-action" onClick={this.handleRetry}>Try Again</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
