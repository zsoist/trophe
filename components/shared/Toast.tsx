'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

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
  success: {
    icon: CheckCircle2,
    bg: 'rgba(22, 101, 52, 0.15)',
    border: 'rgba(34, 197, 94, 0.3)',
    text: '#4ade80',
    bar: '#22c55e',
  },
  error: {
    icon: AlertCircle,
    bg: 'rgba(127, 29, 29, 0.15)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#f87171',
    bar: '#ef4444',
  },
  info: {
    icon: Info,
    bg: 'rgba(120, 90, 40, 0.15)',
    border: 'rgba(212, 168, 83, 0.3)',
    text: '#D4A853',
    bar: '#D4A853',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const config = toastConfig[toast.type];
  const Icon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="relative overflow-hidden rounded-2xl backdrop-blur-xl pointer-events-auto"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon size={18} style={{ color: config.text, flexShrink: 0 }} />
        <span className="text-sm font-medium text-stone-100 flex-1">{toast.message}</span>
        <button
          onClick={() => onDismiss(toast.id)}
          className="text-stone-500 hover:text-stone-300 transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      {/* Progress bar */}
      <motion.div
        className="h-[2px] rounded-full"
        style={{ background: config.bar }}
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: toast.duration / 1000, ease: 'linear' }}
      />
    </motion.div>
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
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[min(90vw,400px)] pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
