import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { T } from './styles';
import { ExternalLink, X } from 'lucide-react';

/**
 * Global external link confirmation modal.
 * Intercepts clicks on <a> tags with external URLs and shows a styled confirm dialog.
 */
export const ExternalLinkGuard: React.FC = () => {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.href;
      if (!href) return;
      // Only intercept external http(s) links
      if (!href.startsWith('http://') && !href.startsWith('https://')) return;
      // Don't intercept localhost (app itself)
      if (href.startsWith('http://localhost')) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingUrl(href);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  const handleConfirm = useCallback(() => {
    if (pendingUrl) {
      window.open(pendingUrl, '_blank');
    }
    setPendingUrl(null);
  }, [pendingUrl]);

  const handleCancel = useCallback(() => {
    setPendingUrl(null);
  }, []);

  useEffect(() => {
    if (!pendingUrl) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingUrl(null);
      if (e.key === 'Enter') { handleConfirm(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pendingUrl, handleConfirm]);

  if (!pendingUrl) return null;

  // Truncate display URL if very long
  const displayUrl = pendingUrl.length > 80 ? pendingUrl.slice(0, 77) + '...' : pendingUrl;
  const domain = (() => { try { return new URL(pendingUrl).hostname; } catch { return ''; } })();

  return ReactDOM.createPortal(
    <div
      onClick={handleCancel}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 420, backgroundColor: T.bg1, borderRadius: T.r16,
          boxShadow: T.sh3, border: `1px solid ${T.b1}`,
          overflow: 'hidden', animation: 'fadeUp 0.15s ease both',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${T.s16}px ${T.s20}px`, borderBottom: `1px solid ${T.b1}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: T.s8 }}>
            <ExternalLink size={16} strokeWidth={2} color={T.pri} />
            <span style={{ fontSize: T.fs15, fontWeight: T.w6, color: T.t1, fontFamily: T.sans }}>打开外部链接</span>
          </div>
          <div
            onClick={handleCancel}
            style={{ cursor: 'pointer', padding: 4, borderRadius: T.r4, display: 'flex' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.bg2; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={16} strokeWidth={2} color={T.t3} />
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: `${T.s16}px ${T.s20}px` }}>
          <div style={{ fontSize: T.fs13, color: T.t2, fontFamily: T.sans, lineHeight: 1.6, marginBottom: T.s12 }}>
            即将使用默认浏览器打开以下链接：
          </div>
          <div style={{
            padding: `${T.s10}px ${T.s12}px`, backgroundColor: T.bg0,
            borderRadius: T.r8, border: `1px solid ${T.b1}`,
          }}>
            <div style={{ fontSize: T.fs12, fontWeight: T.w6, color: T.pri, fontFamily: T.sans, wordBreak: 'break-all', lineHeight: 1.5 }}>
              {displayUrl}
            </div>
            {domain && (
              <div style={{ fontSize: T.fs11, color: T.t3, fontFamily: T.mono, marginTop: 4 }}>
                {domain}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: T.s8,
          padding: `${T.s12}px ${T.s20}px`, borderTop: `1px solid ${T.b1}`,
        }}>
          <button
            onClick={handleCancel}
            style={{
              padding: `${T.s6}px ${T.s16}px`, fontSize: T.fs13, fontFamily: T.sans,
              border: `1px solid ${T.b2}`, borderRadius: T.r8,
              backgroundColor: T.bg1, color: T.t2, cursor: 'pointer',
              fontWeight: T.w5 as any,
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.bg2; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.bg1; }}
          >取消</button>
          <button
            onClick={handleConfirm}
            style={{
              padding: `${T.s6}px ${T.s16}px`, fontSize: T.fs13, fontFamily: T.sans,
              border: 'none', borderRadius: T.r8,
              backgroundColor: T.pri, color: '#fff', cursor: 'pointer',
              fontWeight: T.w6 as any,
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#4338CA'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.pri as string; }}
          >打开链接</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
