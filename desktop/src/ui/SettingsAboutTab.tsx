import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CheckCircle, ExternalLink } from 'lucide-react';

const electronAPI = (window as any).electronAPI as {
  getAppVersion: () => Promise<string>;
  checkForUpdate: () => Promise<any>;
} | undefined;

export const SettingsAboutTab: React.FC = () => {
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  useEffect(() => {
    if (electronAPI) {
      electronAPI.getAppVersion().then(setVersion);
    } else {
      // dev mode fallback: read from Vite env or hardcoded package.json version
      setVersion(__APP_VERSION__);
    }
  }, []);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const result = await electronAPI?.checkForUpdate();
      if (result?.updateInfo?.version && result.updateInfo.version !== version) {
        setCheckResult(`发现新版本 ${result.updateInfo.version}，正在下载...`);
      } else {
        setCheckResult('当前已是最新版本');
      }
    } catch {
      setCheckResult('auto-update-failed');
    } finally {
      setChecking(false);
    }
  }, [version]);

  return (
    <div style={{ padding: 24, maxWidth: 480 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-t1)', marginBottom: 24 }}>关于 OneTeam</h2>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: 14, color: 'var(--color-t2)' }}>当前版本</span>
        <span style={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--color-t1)' }}>v{version || '...'}</span>
      </div>

      <div style={{ paddingTop: 16 }}>
        <button
          onClick={handleCheck}
          disabled={checking}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10, border: 'none',
            backgroundColor: 'var(--color-primary)', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: checking ? 'default' : 'pointer',
            opacity: checking ? 0.6 : 1, transition: 'opacity 0.15s',
          }}
        >
          {checking ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <CheckCircle size={14} />
          )}
          {checking ? '检查中...' : '检查更新'}
        </button>
        {checkResult && checkResult !== 'auto-update-failed' && (
          <p style={{ marginTop: 12, fontSize: 14, color: 'var(--color-t2)' }}>{checkResult}</p>
        )}
        {checkResult === 'auto-update-failed' && (
          <div style={{ marginTop: 12, fontSize: 14, color: 'var(--color-t2)' }}>
            <p>自动检查失败，请前往 GitHub 手动下载最新版本：</p>
            <a
              href="https://github.com/goodpostidea-tech/oneteam/releases"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, color: 'var(--color-primary)', textDecoration: 'none' }}
            >
              <ExternalLink size={14} />
              github.com/goodpostidea-tech/oneteam/releases
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
