'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

// PERF: this provider wraps EVERY page — importing framer-motion here put ~42KB
// (gzip) of motion runtime in the global first-load bundle. The enter animation
// and progress bar are pure CSS now (see .toast-in / .toast-bar in globals.css).

// ═══════════════════════════════════════════════
// Toast Types & Context
// ═══════════════════════════════════════════════

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ═══════════════════════════════════════════════
// Toast Item
// ═══════════════════════════════════════════════

const toastConfig: Record<ToastType, { icon: typeof CheckCircle2; bg: string; border: string; text: string; bar: string }> = {
  success: { icon: CheckCircle2, bg: 'var(--status-success-bg)', border: 'var(--status-success-border)', text: 'var(--status-success-fg)', bar: 'var(--status-success-fg)' },
  error: { icon: AlertCircle, bg: 'var(--status-danger-bg)', border: 'var(--status-danger-border)', text: 'var(--status-danger-fg)', bar: 'var(--status-danger-fg)' },
  info: { icon: Info, bg: 'var(--status-info-bg)', border: 'var(--status-info-border)', text: 'var(--status-info-fg)', bar: 'var(--status-info-fg)' },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const config = toastConfig[toast.type];
  const Icon = config.icon;

  return (
    <div
      className="toast-in relative overflow-hidden rounded-2xl backdrop-blur-xl pointer-events-auto"
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        boxShadow: 'var(--shadow-medium)',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon size={18} style={{ color: config.text, flexShrink: 0 }} />
        <span className="text-sm font-medium text-[var(--content-primary)] flex-1">{toast.message}</span>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="min-h-11 min-w-11 -my-2 inline-flex items-center justify-center text-[var(--content-muted)] hover:text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      {/* Progress bar — CSS animation, duration driven inline */}
      <div
        className="toast-bar h-[2px] rounded-full"
        style={{ background: config.bar, animationDuration: `${toast.duration}ms` }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════
// Toast Provider
// ═══════════════════════════════════════════════

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const contextValue: ToastContextType = {
    toast: addToast,
    success: useCallback((msg: string) => addToast(msg, 'success'), [addToast]),
    error: useCallback((msg: string) => addToast(msg, 'error'), [addToast]),
    info: useCallback((msg: string) => addToast(msg, 'info'), [addToast]),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast container - fixed at top center */}
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[var(--z-toast,70)] flex flex-col gap-2 w-[min(90vw,400px)] pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
