'use client';

import { Component, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// ═══════════════════════════════════════════════
// τροφή (Trophē) — App-Wide Error Boundary
// Catches runtime errors, shows branded error screen
// Light + dark mode via CSS variables
// ═══════════════════════════════════════════════

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

function GoHomeButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.replace('/')}
      className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
      style={{
        background: 'transparent',
        color: 'var(--t3,#a8a29e)',
        border: '1px solid rgba(128,128,128,.2)',
      }}
    >
      Go Home
    </button>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ errorInfo: info });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false, copied: false });
  };

  handleCopy = () => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.message ?? 'Unknown'}`,
      `Stack: ${error?.stack ?? ''}`,
      `Component: ${errorInfo?.componentStack ?? ''}`,
    ].join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails, copied } = this.state;

      // Try to extract component name from componentStack
      const componentMatch = errorInfo?.componentStack?.match(/^\s+at (\w+)/m);
      const componentName = componentMatch ? componentMatch[1] : null;

      return (
        <div
          className="min-h-screen flex items-center justify-center p-6"
          style={{ background: 'var(--bg,#0a0a0a)' }}
        >
          <div
            className="max-w-sm w-full text-center"
            style={{
              background: 'var(--surface,rgba(26,26,26,0.8))',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(128,128,128,.1)',
              borderRadius: '20px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              padding: '2.5rem 2rem',
            }}
          >
            {/* Logo */}
            <div
              className="text-3xl font-bold mb-1"
              style={{ fontFamily: 'var(--font-serif,Georgia,serif)', color: '#D4A853' }}
            >
              &#x03C4;&#x03C1;&#x03BF;&#x03C6;&#x03AE;
            </div>
            <p style={{ color: 'var(--t4)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 28 }}>
              Precision Nutrition Coaching
            </p>

            {/* Error icon */}
            <div style={{ marginBottom: 16 }}>
              <svg
                width="44" height="44" viewBox="0 0 24 24" fill="none"
                stroke="var(--err,#ef4444)" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ margin: '0 auto', opacity: 0.7 }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1,#FAFAF9)', marginBottom: 6 }}>
              Something went wrong
            </h1>

            {/* Error name + component */}
            {error && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--err,#ef4444)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                  {error.name}: {error.message.slice(0, 80)}{error.message.length > 80 ? '…' : ''}
                </p>
                {componentName && (
                  <p style={{ fontSize: 10, color: 'var(--t4)', fontFamily: 'var(--font-mono)' }}>
                    in &lt;{componentName}&gt;
                  </p>
                )}
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>
              Your data is safe. Try again or go home.
            </p>

            {/* Collapsible stack trace */}
            {error && (
              <div style={{ marginBottom: 20, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <button
                    onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                    style={{
                      fontSize: 11, color: 'var(--t4)', background: 'none', border: 'none',
                      cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2,
                      padding: 0,
                    }}
                  >
                    {showDetails ? 'Hide stack trace' : 'Show stack trace'}
                  </button>
                  {showDetails && (
                    <button
                      onClick={this.handleCopy}
                      style={{
                        fontSize: 10, color: copied ? 'var(--ok,#65D387)' : 'var(--t4)',
                        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
                        borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      }}
                    >
                      {copied ? 'Copied!' : 'Copy error'}
                    </button>
                  )}
                </div>

                {showDetails && (
                  <pre
                    style={{
                      fontSize: 10, color: 'var(--err)', opacity: 0.7,
                      background: 'rgba(239,68,68,.06)',
                      border: '1px solid rgba(239,68,68,.12)',
                      borderRadius: 10, padding: '10px 12px',
                      overflowX: 'auto', maxHeight: 140,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                      textAlign: 'left', margin: 0,
                    }}
                  >
                    {error.stack ?? error.message}
                    {errorInfo?.componentStack && (
                      <>
                        {'\n\nComponent trace:'}
                        {errorInfo.componentStack}
                      </>
                    )}
                  </pre>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <GoHomeButton />
              <button
                onClick={this.handleRetry}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #B8923E, #D4A853)',
                  color: '#0a0a0a', border: 'none',
                }}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
