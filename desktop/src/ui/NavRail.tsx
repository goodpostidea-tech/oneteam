import React from 'react';
import type { LucideIcon } from 'lucide-react';
import type { NavKey } from '../types';
import { cn } from '../lib/utils';
import {
  GitBranch, Bot, MessageCircle, Radio,
  Settings, Send, Lightbulb, Palette, Activity,
} from 'lucide-react';

interface Props {
  active: NavKey;
  onNav: (key: NavKey) => void;
  counts: Record<NavKey, number>;
  pendingProposals?: number;
  outboxDraftCount?: number;
}

interface NavItem {
  key: NavKey;
  Icon: LucideIcon;
  label: string;
  pinBottom?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'pipeline',   Icon: GitBranch,     label: '工作台' },
  { key: 'agents',     Icon: Bot,           label: '智能体' },
  { key: 'roundtable', Icon: MessageCircle, label: '会议' },
  { key: 'signal',     Icon: Activity,       label: '动态' },
  { key: 'outbox',     Icon: Send,          label: '发件箱' },
  { key: 'materials',  Icon: Lightbulb,     label: '素材箱' },
  { key: 'theme',      Icon: Palette,       label: '外观', pinBottom: true },
  { key: 'settings',   Icon: Settings,      label: '设置' },
];

export const NavRail: React.FC<Props> = React.memo(({
  active,
  onNav,
  outboxDraftCount = 0,
}) => (
  <nav
    className="flex flex-col flex-shrink-0 select-none"
    style={{
      width: 200,
      backgroundColor: 'var(--color-sidebar)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderRight: '1px solid var(--color-border-2)',
      // @ts-ignore — Electron title bar drag
      WebkitAppRegion: 'drag',
    }}
  >
    {/* Electron title bar spacer + logo */}
    <div className="h-[52px] flex-shrink-0 flex items-end px-4 pb-2">
      <div
        className="relative w-7 h-7 flex-shrink-0"
        style={{
          // @ts-ignore
          WebkitAppRegion: 'no-drag',
        }}
      >
        <div className="absolute inset-0 rounded-lg animate-logo-breathe" />
        <img
          src="/logo.png"
          alt="OneTeam"
          className="relative w-7 h-7 rounded-lg object-contain"
        />
      </div>
    </div>

    {/* Nav items */}
    <div className="flex-1 flex flex-col px-2.5 gap-0.5 overflow-y-auto pt-1">
      {NAV_ITEMS.map((item) => {
        const isActive = active === item.key;
        const badge = item.key === 'outbox' ? outboxDraftCount : 0;

        return (
          <button
            key={item.key}
            onClick={() => onNav(item.key)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'sidebar-item',
              isActive
                ? 'bg-sidebar-active font-semibold text-t1'
                : 'bg-transparent text-t2 hover:bg-sidebar-hover',
              item.pinBottom && 'mt-auto',
            )}
            style={{
              // @ts-ignore
              WebkitAppRegion: 'no-drag',
            }}
          >
            <item.Icon
              size={16}
              strokeWidth={isActive ? 2 : 1.6}
              className="flex-shrink-0"
            />
            <span className="flex-1 truncate text-left">{item.label}</span>
            {badge > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-danger text-white text-[10px] font-semibold font-mono flex items-center justify-center px-1">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>

    {/* LIVE indicator */}
    <div className="flex items-center gap-1.5 px-4 pb-3 pt-2">
      <Radio size={8} className="text-success animate-pulse-dot" />
      <span className="text-[10px] font-medium text-t3 tracking-wide">LIVE</span>
    </div>
  </nav>
));

NavRail.displayName = 'NavRail';
