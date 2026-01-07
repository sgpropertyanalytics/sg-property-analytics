import React from 'react';

/**
 * ErrorBoundary - Catches JavaScript errors and displays fallback UI
 *
 * Prevents blank white page crashes by catching errors in child components
 * and displaying a user-friendly error message with recovery options.
 *
 * Usage:
 * - Wrap around individual charts/components for granular error handling
 * - Wrap around page content for page-level error recovery
 * - Use with custom fallback for different error UIs
 *
 * @example
 * <ErrorBoundary name="Market Pulse Chart">
 *   <TimeTrendChart />
 * </ErrorBoundary>
 *
 * @example
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <ComplexComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so next render shows fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log detailed error information for debugging
    console.error('=== ErrorBoundary caught an error ===');
    console.error('Component:', this.props.name || 'Unknown');
    console.error('Error:', error?.message || error);
    console.error('Error name:', error?.name);
    if (error?.stack) {
      console.error('Stack trace:', error.stack);
    }
    if (errorInfo?.componentStack) {
      console.error('Component stack:', errorInfo.componentStack);
    }
    console.error('=== End of error details ===');
    this.setState({ errorInfo });

    // Optional: Report to error tracking service
    // reportErrorToService(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      const componentName = this.props.name || 'Component';
      const isCompact = this.props.compact;

      if (isCompact) {
        // Compact error UI for individual chart failures
        return (
          <div className="flex items-center justify-center p-4 bg-brand-sand/30 rounded-lg border border-brand-sky/30">
            <div className="text-center">
              <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-brand-blue/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm text-brand-blue mb-2">Failed to load {componentName}</p>
              <button
                onClick={this.handleRetry}
                className="px-3 py-1 text-xs font-medium text-white bg-brand-blue rounded-md hover:bg-brand-navy transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        );
      }

      // Full error UI for page-level failures
      return (
        <div className="min-h-[300px] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-brand-sky/50 shadow-sm p-6">
            {/* Error icon */}
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rose-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Error message */}
            <h3 className="text-lg font-semibold text-brand-navy text-center mb-2">
              Something went wrong
            </h3>
            <p className="text-sm text-brand-blue text-center mb-4">
              {componentName} encountered an error. This has been logged for investigation.
            </p>

            {/* Error details (development only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-4 p-3 bg-brand-sand/30 rounded-lg text-xs">
                <summary className="cursor-pointer text-brand-blue font-medium">
                  Error Details
                </summary>
                <pre className="mt-2 text-rose-600 overflow-auto max-h-32">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-blue rounded-lg hover:bg-brand-navy transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleRefresh}
                className="px-4 py-2 text-sm font-medium text-brand-blue bg-brand-sand/50 rounded-lg hover:bg-brand-sand transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component for wrapping functional components with error boundary
 *
 * @example
 * const SafeChart = withErrorBoundary(TimeTrendChart, { name: 'Time Trend Chart', compact: true });
 */
export function withErrorBoundary(Component, errorBoundaryProps = {}) {
  return function WrappedComponent(props) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;
