import React from 'react';
import { agentHue } from './styles';

const AVATAR_MAP: Record<string, string> = {
  minion:   './avatars/guide-192.webp',
  scout:    './avatars/scout-192.webp',
  sage:     './avatars/forge-192.webp',
  quill:    './avatars/quill-192.webp',
  xalt:     './avatars/nexus-192.webp',
  xalt_tweet:       './avatars/xalt_tweet.webp',
  xalt_weibo:       './avatars/xalt_weibo.webp',
  xalt_xiaohongshu: './avatars/xalt_xiaohongshu.png',
  xalt_douyin:      './avatars/xalt_douyin.jpg',
  quill_zhihu:      './avatars/quill_zhihu.jpg',
  quill_toutiao:    './avatars/quill_toutiao.webp',
  quill_wechat_mp:  './avatars/quill_wechat_mp.webp',
  observer: './avatars/observer-192.png',
};

interface Props {
  id: string;
  name: string;
  size?: number;
  online?: boolean;
  active?: boolean;
}

export const AgentAvatar: React.FC<Props> = ({ id, name, size = 36, online, active }) => {
  const src = AVATAR_MAP[id] ?? (id.startsWith('xalt_') ? AVATAR_MAP['xalt'] : id.startsWith('quill_') ? AVATAR_MAP['quill'] : undefined);
  const hue = agentHue(id);
  const ch = (name || id).charAt(0).toUpperCase();
  const fs = Math.round(size * 0.38);
  const dot = Math.max(8, Math.round(size * 0.22));

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          className="rounded-full object-cover"
          style={{
            width: size,
            height: size,
            border: active ? '2px solid var(--color-primary)' : '2px solid transparent',
            transition: 'border-color 0.15s',
          }}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center select-none transition-all duration-150"
          style={{
            width: size,
            height: size,
            backgroundColor: `${hue}14`,
            border: `1.5px solid ${active ? `${hue}35` : `${hue}18`}`,
            color: hue,
            fontSize: fs,
            fontWeight: 700,
          }}
        >
          {ch}
        </div>
      )}
      {online !== undefined && (
        <div
          className="absolute rounded-full"
          style={{
            bottom: -1,
            right: -1,
            width: dot,
            height: dot,
            backgroundColor: online ? 'var(--color-success)' : 'var(--color-t4)',
            border: '2.5px solid var(--color-bg-panel)',
            boxShadow: '0 0 0 0.5px rgba(0,0,0,0.08)',
          }}
        />
      )}
    </div>
  );
};
