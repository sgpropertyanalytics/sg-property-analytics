import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

/**
 * RootErrorBoundary - Catches catastrophic errors that crash the entire app
 *
 * This is the LAST LINE OF DEFENSE against blank white pages.
 * Uses inline styles to work even if CSS fails to load.
 */
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console for debugging
    console.error('=== ROOT ERROR BOUNDARY - App Crashed ===');
    console.error('Error:', error?.message || error);
    console.error('Stack:', error?.stack);
    console.error('Component Stack:', errorInfo?.componentStack);
    console.error('===========================================');
  }

  handleReload = () => {
    // Clear any cached state that might cause the crash
    try {
      sessionStorage.clear();
    } catch {
      // Ignore storage errors
    }
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Inline styles - works even if CSS bundle fails to load
      const containerStyle = {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
      };

      const cardStyle = {
        maxWidth: '450px',
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        padding: '32px',
        textAlign: 'center',
      };

      const iconStyle = {
        width: '64px',
        height: '64px',
        margin: '0 auto 16px',
        backgroundColor: '#fee2e2',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      };

      const titleStyle = {
        fontSize: '20px',
        fontWeight: '600',
        color: '#1f2937',
        marginBottom: '8px',
      };

      const messageStyle = {
        fontSize: '14px',
        color: '#6b7280',
        marginBottom: '24px',
        lineHeight: '1.5',
      };

      const buttonContainerStyle = {
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        flexWrap: 'wrap',
      };

      const primaryButtonStyle = {
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: '500',
        color: 'white',
        backgroundColor: '#547792',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
      };

      const secondaryButtonStyle = {
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#547792',
        backgroundColor: '#EAE0CF',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
      };

      const errorDetailsStyle = {
        marginTop: '20px',
        padding: '12px',
        backgroundColor: '#fef2f2',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#991b1b',
        textAlign: 'left',
        wordBreak: 'break-word',
        maxHeight: '100px',
        overflow: 'auto',
      };

      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <div style={iconStyle}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 style={titleStyle}>Something went wrong</h1>
            <p style={messageStyle}>
              The application encountered an unexpected error.
              This has been logged for investigation.
              Please try refreshing the page.
            </p>
            <div style={buttonContainerStyle}>
              <button style={primaryButtonStyle} onClick={this.handleReload}>
                Refresh Page
              </button>
              <button style={secondaryButtonStyle} onClick={this.handleGoHome}>
                Go to Home
              </button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <div style={errorDetailsStyle}>
                <strong>Error:</strong> {this.state.error.toString()}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)

