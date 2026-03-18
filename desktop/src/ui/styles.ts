// ─── OneTeam · Design System ───

export type ThemeId = 'mono' | 'lime' | 'forest' | 'coral';

/** Design tokens (legacy inline-style consumers) */
export const T = {
  bg0: '#F0F0F0',
  bg1: '#FFFFFF',
  bg2: '#F5F5F5',
  bg3: '#E8E8E8',
  bg4: '#FFFFFF',

  bgDark: '#111111',
  bgDark2: '#0A0A0A',

  pri: '#1D1D1F',
  priLight: 'rgba(29,29,31,0.06)',
  priDark: '#000000',
  priBright: '#3A3A3C',
  priDeep: '#1D1D1F',
  priMuted: 'rgba(29,29,31,0.10)',
  priBorder: 'rgba(29,29,31,0.20)',

  navActiveFg: '#FFFFFF',
  navActiveBg: 'rgba(255,255,255,0.16)',
  navBrandBg: '#FFFFFF',
  navBrandFg: '#111111',

  green: '#34C759',   greenLight: '#E8F9ED', greenDeep: '#248A3D',
  red: '#FF3B30',     redLight: '#FFECEB',   redDeep: '#D70015',
  blue: '#007AFF',    blueLight: '#E5F1FF',  blueDeep: '#0060CC',
  amber: '#FF9500',   amberLight: '#FFF4E5', amberDeep: '#C77800',

  indigo: '#5856D6', orange: '#FF9500', cyan: '#5AC8FA',
  pink: '#FF2D55',   violet: '#AF52DE', lime: '#34C759',

  t1: '#1D1D1F',
  t2: '#48484A',
  t3: '#8E8E93',
  t4: '#C7C7CC',
  t5: '#E5E5EA',

  b1: 'rgba(0,0,0,0.08)',
  b2: 'rgba(0,0,0,0.05)',
  b3: 'rgba(0,0,0,0.12)',

  sh0: 'none',
  sh1: '0 2px 8px rgba(0,0,0,0.06)',
  sh2: '0 4px 20px rgba(0,0,0,0.08)',
  sh3: '0 8px 40px rgba(0,0,0,0.12)',

  fs10: '10px', fs11: '11px', fs12: '12px', fs13: '13px',
  fs14: '14px', fs15: '15px', fs16: '16px', fs20: '20px',
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", "Microsoft YaHei", sans-serif',
  mono: '"SF Mono", "Geist Mono", "JetBrains Mono", "Fira Code", Consolas, monospace',
  w4: 400 as const, w5: 500 as const, w6: 600 as const, w7: 700 as const,

  s2: 2, s4: 4, s6: 6, s8: 8, s10: 10, s12: 12, s14: 14,
  s16: 16, s20: 20, s24: 24, s32: 32,

  r4: 6, r6: 8, r8: 10, r10: 12, r12: 12, r14: 14,
  r16: 14, r20: 16, r24: 16, rFull: 9999,

  trackBg: '#E5E5EA',
  gradHeader: '#007AFF',
  gradAccent: '#007AFF',
};

export function applyTheme(_id: ThemeId): void {}

export function makeGlobalCss(): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html,body,#root{height:100%;overflow:hidden;background:${T.bg0}}
body{font-family:${T.sans};-webkit-font-smoothing:antialiased;color:${T.t2};font-size:13px;line-height:1.54}
input::placeholder,textarea::placeholder{color:${T.t3}}
input,textarea,select{background:${T.bg1};color:${T.t1};border-color:${T.b1}}
button,a,input,textarea,select,[role="button"]{-webkit-app-region:no-drag}
`;
}

export const GLOBAL_CSS = makeGlobalCss();

const HUES = ['#34C759','#007AFF','#FF9500','#FF2D55','#AF52DE','#5AC8FA','#FF6B1A','#30D158'];
export function agentHue(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return HUES[Math.abs(h) % HUES.length];
}

export const EVT: Record<string, { icon: string; color: string; bg: string }> = {
  proposal_created:     { icon: 'FileEdit',      color: T.amber,  bg: T.amberLight },
  proposal_approved:    { icon: 'CheckCircle2',   color: T.green,  bg: T.greenLight },
  proposal_rejected:    { icon: 'XCircle',        color: T.red,    bg: T.redLight },
  mission_created:      { icon: 'Play',           color: T.blue,   bg: T.blueLight },
  mission_cancelled:    { icon: 'Ban',            color: T.red,    bg: T.redLight },
  mission_finalized:    { icon: 'Flag',           color: T.green,  bg: T.greenLight },
  step_started:         { icon: 'Loader2',        color: T.blue,   bg: T.blueLight },
  step_succeeded:       { icon: 'CheckCircle2',   color: T.green,  bg: T.greenLight },
  step_completed:       { icon: 'CheckCircle2',   color: T.green,  bg: T.greenLight },
  step_failed:          { icon: 'XCircle',        color: T.red,    bg: T.redLight },
  step_recovered:       { icon: 'AlertTriangle',  color: T.amber,  bg: T.amberLight },
  trigger_fired:        { icon: 'Zap',            color: T.amber,  bg: T.amberLight },
  gate_rejected:        { icon: 'ShieldX',        color: T.orange, bg: T.amberLight },
  reaction_queued:      { icon: 'RefreshCw',      color: T.pink,   bg: 'rgba(255,45,85,0.08)' },
  roundtable_started:   { icon: 'MessageCircle',  color: T.violet, bg: 'rgba(175,82,222,0.08)' },
  roundtable_concluded: { icon: 'MessageCircle',  color: T.green,  bg: T.greenLight },
  content_published:    { icon: 'ExternalLink',   color: T.green,  bg: T.greenLight },
  circuit_breaker:      { icon: 'AlertTriangle',  color: T.red,    bg: T.redLight },
  memory_written:       { icon: 'Brain',          color: T.pink,   bg: 'rgba(255,45,85,0.08)' },
  _default:             { icon: 'Zap',            color: T.t3,     bg: T.bg3 },
};

export const STAGES = [
  { key: 'pending',   label: '待审批', color: '#946800', bg: '#FFF3BF', deep: '#946800', icon: '◇' },
  { key: 'approved',  label: '已批准', color: '#1864AB', bg: '#D0EBFF', deep: '#1864AB', icon: '▹' },
  { key: 'running',   label: '执行中', color: '#1864AB', bg: '#D0EBFF', deep: '#1864AB', icon: '●' },
  { key: 'succeeded', label: '已完成', color: '#1B7A3D', bg: '#D3F9E0', deep: '#1B7A3D', icon: '✓' },
  { key: 'failed',    label: '失败',   color: '#C92A2A', bg: '#FFE3E3', deep: '#C92A2A', icon: '✕' },
  { key: 'cancelled', label: '已取消', color: '#868E96', bg: '#F1F3F5', deep: '#868E96', icon: '⊘' },
] as const;

export const THEME_LIST: { id: ThemeId; name: string; label: string; swatches: string[] }[] = [
  { id: 'mono',   name: 'Mono',   label: '极简黑白', swatches: ['#1D1D1F', '#8E8E93', '#F0F0F0'] },
  { id: 'lime',   name: 'Lime',   label: '暖调橄榄', swatches: ['#5C7A2E', '#9A9790', '#F2E9E1'] },
  { id: 'forest', name: 'Forest', label: '清新薄荷', swatches: ['#1A7A3A', '#7A9A84', '#E8F0EA'] },
  { id: 'coral',  name: 'Coral',  label: '柔暖珊瑚', swatches: ['#8B3228', '#A88A80', '#F8EDE8'] },
];
