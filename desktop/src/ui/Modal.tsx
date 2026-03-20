import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { T } from './styles';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  maxHeight?: string | number;
}

export const Modal: React.FC<Props> = ({ title, onClose, children, width = 480, maxHeight }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      className="fixed left-0 right-0 bottom-0 z-[100] flex items-start justify-center overflow-y-auto"
      style={{
        top: 0,
        backgroundColor: 'rgba(0,0,0,0.32)',
        padding: '80px 0 40px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex flex-col overflow-hidden animate-fade-up rounded-2xl shadow-lg"
        style={{
          width,
          maxHeight: maxHeight ?? 'calc(100vh - 120px)',
          flexShrink: 0,
          backgroundColor: 'var(--color-bg-panel)',
        }}
      >
        {/* Header */}
        <div className="flex items-center px-6 py-5 border-b border-border-2">
          <span className="flex-1 text-xl font-semibold text-t1 tracking-tight">{title}</span>
          <button
            onClick={onClose}
            className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center border-none',
              'bg-transparent text-t3 cursor-pointer transition-colors duration-100',
              'hover:bg-bg-hover',
            )}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Shared form field styles (inline fallback for non-Tailwind consumers) ───
export const fieldLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--color-t1)',
  fontFamily: T.sans, marginBottom: 6, display: 'block',
};

export const fieldInput: React.CSSProperties = {
  width: '100%', padding: '10px 14px',
  borderRadius: 10, border: '1px solid var(--color-border-1)',
  backgroundColor: 'var(--color-bg-hover)',
  fontSize: 14, fontFamily: T.sans, color: 'var(--color-t1)',
  outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s', boxSizing: 'border-box',
};

export const fieldSelect: React.CSSProperties = {
  ...fieldInput,
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%238e8e93' stroke-width='2'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 36,
};

export const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 10,
  backgroundColor: 'var(--color-primary)',
  border: 'none', color: '#FFFFFF',
  fontSize: 14, fontWeight: 600, fontFamily: T.sans,
  cursor: 'pointer', transition: 'opacity 0.15s',
};

export const btnSecondary: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 10,
  backgroundColor: 'var(--color-bg-hover)',
  border: 'none',
  color: 'var(--color-t1)',
  fontSize: 14, fontWeight: 500, fontFamily: T.sans,
  cursor: 'pointer', transition: 'background-color 0.1s',
};

/** Primary action button */
export const PrimaryBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...props }) => (
  <button
    {...props}
    className={cn(
      'px-5 py-2.5 rounded-xl border-none font-semibold text-md text-white cursor-pointer transition-opacity duration-100',
      'hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed',
      className,
    )}
    style={{ backgroundColor: 'var(--color-primary)' }}
  >
    {children}
  </button>
);

/** Secondary action button */
export const SecondaryBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, ...props }) => (
  <button
    {...props}
    className={cn(
      'px-5 py-2.5 rounded-xl border-none font-medium text-md text-t1',
      'bg-bg-hover cursor-pointer transition-colors duration-100',
      'hover:bg-bg-inset disabled:opacity-50 disabled:cursor-not-allowed',
      className,
    )}
  >
    {children}
  </button>
);

/** Confirm dialog — replaces window.confirm with a styled modal */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, description, confirmLabel = '确认', danger = true, onConfirm, onCancel }) => {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0,0,0,0.36)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex flex-col rounded-2xl shadow-lg animate-fade-up"
        style={{ width: 380, backgroundColor: 'var(--color-bg-panel)' }}
      >
        <div className="flex flex-col items-center pt-7 pb-2 px-6">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
            style={{
              background: danger ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)',
            }}
          >
            <AlertTriangle
              size={20}
              strokeWidth={2}
              style={{ color: danger ? 'var(--color-danger)' : 'var(--color-warning)' }}
            />
          </div>
          <div className="text-base font-semibold text-t1 text-center">{title}</div>
          <div className="text-sm text-t3 text-center mt-1.5 leading-relaxed">{description}</div>
        </div>
        <div className="flex gap-3 px-6 pt-4 pb-6">
          <button
            onClick={onCancel}
            className={cn(
              'flex-1 py-2.5 rounded-xl border-none font-medium text-sm text-t1',
              'bg-bg-hover cursor-pointer transition-colors duration-100 hover:bg-bg-inset',
            )}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl border-none font-semibold text-sm text-white cursor-pointer transition-opacity duration-100 hover:opacity-85"
            style={{ backgroundColor: danger ? 'var(--color-danger)' : 'var(--color-primary)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Hook for easy ConfirmDialog usage */
export function useConfirm() {
  const [state, setState] = useState<{
    title: string; description: React.ReactNode; confirmLabel?: string; danger?: boolean;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback((opts: { title: string; description: React.ReactNode; confirmLabel?: string; danger?: boolean }) => {
    return new Promise<boolean>(resolve => {
      setState({ ...opts, resolve });
    });
  }, []);

  const dialog = state ? (
    <ConfirmDialog
      open
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      danger={state.danger}
      onConfirm={() => { state.resolve(true); setState(null); }}
      onCancel={() => { state.resolve(false); setState(null); }}
    />
  ) : null;

  return { confirm, dialog };
}
