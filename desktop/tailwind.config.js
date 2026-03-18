/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Surfaces ───
        'bg-base':   'var(--color-bg-base)',
        'bg-panel':  'var(--color-bg-panel)',
        'bg-hover':  'var(--color-bg-hover)',
        'bg-inset':  'var(--color-bg-inset)',

        // ─── Sidebar (macOS style) ───
        'sidebar':       'var(--color-sidebar)',
        'sidebar-hover': 'var(--color-sidebar-hover)',
        'sidebar-active':'var(--color-sidebar-active)',

        // ─── Brand ───
        primary:        'var(--color-primary)',
        'primary-light':'var(--color-primary-light)',
        'primary-dark': 'var(--color-primary-dark)',
        'primary-deep': 'var(--color-primary-deep)',
        'primary-muted':'var(--color-primary-muted)',

        // ─── Text ───
        't1': 'var(--color-t1)',
        't2': 'var(--color-t2)',
        't3': 'var(--color-t3)',
        't4': 'var(--color-t4)',
        't5': 'var(--color-t5)',

        // ─── Borders ───
        'border-1': 'var(--color-border-1)',
        'border-2': 'var(--color-border-2)',
        'border-3': 'var(--color-border-3)',

        // ─── Status ───
        success:       'var(--color-success)',
        'success-bg':  'var(--color-success-bg)',
        danger:        'var(--color-danger)',
        'danger-bg':   'var(--color-danger-bg)',
        info:          'var(--color-info)',
        'info-bg':     'var(--color-info-bg)',
        warning:       'var(--color-warning)',
        'warning-bg':  'var(--color-warning-bg)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Inter"', '"Segoe UI"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"SF Mono"', '"Geist Mono"', '"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        xs:    ['11px', { lineHeight: '16px' }],
        sm:    ['12px', { lineHeight: '18px' }],
        base:  ['13px', { lineHeight: '20px' }],
        md:    ['14px', { lineHeight: '20px' }],
        lg:    ['15px', { lineHeight: '22px' }],
        xl:    ['16px', { lineHeight: '24px' }],
        '2xl': ['18px', { lineHeight: '26px' }],
        '3xl': ['20px', { lineHeight: '28px' }],
        '4xl': ['24px', { lineHeight: '32px' }],
      },
      borderRadius: {
        sm:   '6px',
        md:   '8px',
        lg:   '10px',
        xl:   '12px',
        '2xl':'14px',
        '3xl':'16px',
        full: '9999px',
      },
      boxShadow: {
        'xs':  '0 1px 2px rgba(0,0,0,0.04)',
        'sm':  '0 2px 8px rgba(0,0,0,0.06)',
        'md':  '0 4px 20px rgba(0,0,0,0.08)',
        'lg':  '0 8px 40px rgba(0,0,0,0.12)',
        'none':'none',
      },
      animation: {
        'fade-up': 'fadeUp 0.2s ease both',
        'pulse-slow': 'pulse 2.5s ease-in-out infinite',
        'spin-slow': 'spin 1.2s linear infinite',
      },
    },
  },
  plugins: [],
};
