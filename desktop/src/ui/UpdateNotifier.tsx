import React, { useEffect, useState, useCallback } from 'react';
import { X, Download, RefreshCw } from 'lucide-react';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'downloading'; percent: number }
  | { phase: 'ready'; version: string; releaseNotes?: string };

const api = (window as any).electronAPI as {
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes?: string }) => void) => void;
  onUpdateProgress: (cb: (p: { percent: number }) => void) => void;
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => void;
  installUpdate: () => void;
} | undefined;

const box: React.CSSProperties = {
  position: 'fixed', bottom: 16, right: 16, zIndex: 10000, width: 320,
  borderRadius: 12, border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-card)', boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
  padding: 16,
};

export const UpdateNotifier: React.FC = () => {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.onUpdateAvailable(() => setState({ phase: 'downloading', percent: 0 }));
    api.onUpdateProgress((p) => setState({ phase: 'downloading', percent: Math.round(p.percent) }));
    api.onUpdateDownloaded((info) => setState({ phase: 'ready', version: info.version }));
  }, []);

  const handleInstall = useCallback(() => { api?.installUpdate(); }, []);

  if (!api || state.phase === 'idle' || dismissed) return null;

  return (
    <div style={box}>
      {state.phase === 'downloading' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500, color: 'var(--color-t1)' }}>
              <Download size={16} />
              正在下载更新...
            </div>
            <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-t3)', padding: 2 }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ height: 6, borderRadius: 3, backgroundColor: 'var(--color-bg-hover)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, backgroundColor: 'var(--color-primary)', transition: 'width 0.3s', width: `${state.percent}%` }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-t2)', textAlign: 'right', marginTop: 4 }}>{state.percent}%</div>
        </div>
      )}
      {state.phase === 'ready' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-t1)' }}>
              新版本 {state.version} 已就绪
            </span>
            <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-t3)', padding: 2 }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleInstall}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 8, border: 'none',
                backgroundColor: 'var(--color-primary)', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} />
              立即安装
            </button>
            <button
              onClick={() => setDismissed(true)}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 14,
                backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-t2)',
                border: '1px solid var(--color-border)', cursor: 'pointer',
              }}
            >
              稍后
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
