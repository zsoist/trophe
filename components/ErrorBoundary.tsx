'use client';

import { Component, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// ═══════════════════════════════════════════════
// τροφή (Trophē) — App-Wide Error Boundary
// Catches runtime errors, shows branded error screen
// ═══════════════════════════════════════════════

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

function GoHomeButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.replace('/')}
      className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
      style={{
        background: 'transparent',
        color: '#a8a29e',
        border: '1px solid #2a2a2a',
      }}
    >
      Go Home
    </button>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-950 flex items-center justify-center p-6">
          <div
            className="max-w-sm w-full text-center"
            style={{
              background: 'rgba(26, 26, 26, 0.7)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '20px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              padding: '2.5rem 2rem',
            }}
          >
            {/* Logo */}
            <div
              className="text-4xl font-bold mb-2"
              style={{ fontFamily: 'var(--font-serif, Georgia, serif)', color: '#D4A853' }}
            >
              &#x03C4;&#x03C1;&#x03BF;&#x03C6;&#x03AE;
            </div>
            <p className="text-stone-600 text-xs mb-8 tracking-wider uppercase">
              Precision Nutrition Coaching
            </p>

            {/* Error icon */}
            <div className="mb-4">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto opacity-60"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h1 className="text-xl font-semibold text-stone-100 mb-2">
              Something went wrong
            </h1>
            <p className="text-stone-500 text-sm mb-6">
              An unexpected error occurred. Your data is safe.
            </p>

            {/* Error details (collapsible) */}
            {this.state.error && (
              <div className="mb-6">
                <button
                  onClick={() =>
                    this.setState((s) => ({ showDetails: !s.showDetails }))
                  }
                  className="text-xs text-stone-600 hover:text-stone-400 transition-colors underline underline-offset-2"
                >
                  {this.state.showDetails ? 'Hide details' : 'Show details'}
                </button>
                {this.state.showDetails && (
                  <pre
                    className="mt-3 text-left text-[11px] text-red-400/70 overflow-auto max-h-32 p-3 rounded-xl"
                    style={{
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.1)',
                    }}
                  >
                    {this.state.error.message}
                  </pre>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <GoHomeButton />
              <button
                onClick={this.handleRetry}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: 'linear-gradient(135deg, #B8923E, #D4A853)',
                  color: '#0a0a0a',
                  border: 'none',
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
