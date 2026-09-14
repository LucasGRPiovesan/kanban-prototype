import type { Config } from 'tailwindcss';

/**
 * Tailwind reads the CSS variables declared in styles/index.css, so a colour has
 * exactly one definition and the dark theme is a token swap rather than a parallel set
 * of `dark:` classes scattered through the components.
 */
const withOpacity = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: withOpacity('--brand-50'),
          100: withOpacity('--brand-100'),
          200: withOpacity('--brand-200'),
          300: withOpacity('--brand-300'),
          400: withOpacity('--brand-400'),
          500: withOpacity('--brand-500'),
          600: withOpacity('--brand-600'),
          700: withOpacity('--brand-700'),
          800: withOpacity('--brand-800'),
          900: withOpacity('--brand-900'),
        },
        canvas: withOpacity('--bg'),
        surface: {
          DEFAULT: withOpacity('--surface'),
          muted: withOpacity('--surface-muted'),
          raised: withOpacity('--surface-raised'),
        },
        line: {
          DEFAULT: withOpacity('--border'),
          strong: withOpacity('--border-strong'),
        },
        body: withOpacity('--text'),
        muted: withOpacity('--text-muted'),
        subtle: withOpacity('--text-subtle'),
        'on-brand': withOpacity('--text-on-brand'),

        danger: {
          DEFAULT: withOpacity('--danger'),
          surface: withOpacity('--danger-surface'),
          border: withOpacity('--danger-border'),
        },
        success: {
          DEFAULT: withOpacity('--success'),
          surface: withOpacity('--success-surface'),
        },
        warning: {
          DEFAULT: withOpacity('--warning'),
          surface: withOpacity('--warning-surface'),
        },

        status: {
          'not-started': withOpacity('--status-not-started'),
          'not-started-surface': withOpacity('--status-not-started-surface'),
          'not-started-border': withOpacity('--status-not-started-border'),
          'in-progress': withOpacity('--status-in-progress'),
          'in-progress-surface': withOpacity('--status-in-progress-surface'),
          'in-progress-border': withOpacity('--status-in-progress-border'),
          paused: withOpacity('--status-paused'),
          'paused-surface': withOpacity('--status-paused-surface'),
          'paused-border': withOpacity('--status-paused-border'),
          'in-review': withOpacity('--status-in-review'),
          'in-review-surface': withOpacity('--status-in-review-surface'),
          'in-review-border': withOpacity('--status-in-review-border'),
          production: withOpacity('--status-production'),
          'production-surface': withOpacity('--status-production-surface'),
          'production-border': withOpacity('--status-production-border'),
        },

        sidebar: {
          DEFAULT: withOpacity('--sidebar-bg'),
          text: withOpacity('--sidebar-text'),
          'text-muted': withOpacity('--sidebar-text-muted'),
          'active-bg': withOpacity('--sidebar-active-bg'),
          'active-text': withOpacity('--sidebar-active-text'),
          hover: withOpacity('--sidebar-hover-bg'),
          'hover-text': withOpacity('--sidebar-hover-text'),
          border: withOpacity('--sidebar-border'),
          /** A light accent on the solid brand panel (login screen) — see index.css. */
          'panel-accent': withOpacity('--sidebar-panel-accent'),
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // A deliberate scale rather than ad-hoc sizes, with line heights tuned per step.
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.625rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.011em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.016em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.021em' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.024em' }],
      },
      boxShadow: {
        // Discreet, single-source elevation — no scattered rgba values.
        subtle: '0 1px 2px rgb(var(--shadow-color) / 0.06)',
        card: '0 1px 3px rgb(var(--shadow-color) / 0.07), 0 1px 2px rgb(var(--shadow-color) / 0.04)',
        lifted:
          '0 8px 24px -6px rgb(var(--shadow-color) / 0.16), 0 2px 6px rgb(var(--shadow-color) / 0.06)',
        panel: '0 24px 60px -20px rgb(var(--shadow-color) / 0.28)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      transitionTimingFunction: {
        // Decelerating: fast to start, settles gently. Used for anything the user
        // triggered, so the interface answers immediately and then calms down.
        smooth: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        // A single, restrained overshoot. Reserved for elements that appear from
        // nothing — a counter incrementing, a badge landing — never for movement.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.97)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        // The single entrance used across the app: content arrives from just below its
        // resting place. Eight pixels, not thirty — enough to read as motion, short
        // enough that nothing ever feels like it is waiting to load.
        'rise-in': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'pop-in': {
          from: { transform: 'scale(0.82)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        /* Marks the column a card is hovering over without moving anything. */
        'pulse-ring': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        // A new notification: the bell swings a few times around its top, then rests.
        'bell-ring': {
          '0%, 100%': { transform: 'rotate(0)' },
          '15%': { transform: 'rotate(14deg)' },
          '30%': { transform: 'rotate(-12deg)' },
          '45%': { transform: 'rotate(8deg)' },
          '60%': { transform: 'rotate(-5deg)' },
          '75%': { transform: 'rotate(2deg)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        // A slow, ambient drift — for decoration that should read as alive without
        // ever drawing the eye away from something the user is actually doing.
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(var(--float-rotate, 0deg))' },
          '50%': { transform: 'translateY(-14px) rotate(var(--float-rotate, 0deg))' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        'scale-in': 'scale-in 180ms cubic-bezier(0.22, 0.61, 0.36, 1)',
        'rise-in': 'rise-in 320ms cubic-bezier(0.22, 0.61, 0.36, 1) backwards',
        'pop-in': 'pop-in 260ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards',
        'pulse-ring': 'pulse-ring 1.6s ease-in-out infinite',
        'bell-ring': 'bell-ring 900ms ease-in-out',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        float: 'float 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
