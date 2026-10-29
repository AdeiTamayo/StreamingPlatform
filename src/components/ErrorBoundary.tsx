import { Component, ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';
import { logError } from '../utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  // Changing this resets a tripped boundary (e.g. pass the route path so a
  // crash on one page doesn't stick after navigating away).
  resetKey?: string | number;
  // Called before the retry re-render. React.lazy memoizes a rejected import,
  // so re-rendering the same component type re-throws instantly; the owner
  // must hand us fresh component types (e.g. recreate the route's lazy
  // elements) for the retry to actually reload anything.
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetKey: string | number | undefined;
}

// Functional child so the fallback re-renders when the language changes; the
// boundary itself is a class and cannot use hooks.
function ErrorFallback({ onRetry, onReload }: { onRetry: () => void; onReload: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="page" role="alert">
      <div className="empty-state">
        <h3>{t('errors.somethingWentWrong')}</h3>
        <p>{t('errors.unexpected')}</p>
        <div className="empty-state-actions">
          <button className="empty-state-action" onClick={onRetry}>{t('common.tryAgain')}</button>
          <a className="empty-state-action" href="/">{t('common.goHome')}</a>
          <button className="empty-state-action" onClick={onReload}>{t('common.reload')}</button>
        </div>
      </div>
    </div>
  );
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
    this.props.onRetry?.();
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorFallback onRetry={this.handleRetry} onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}
