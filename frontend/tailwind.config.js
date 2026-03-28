/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // All colors reference CSS variables — theme switching via html.light class
      colors: {
        'app-bg':      'var(--color-bg)',
        'app-surface': 'var(--color-surface)',
        'app-card':    'var(--color-card)',
        'app-border':  'var(--color-border)',
        'app-input':   'var(--color-input)',
        'app-hover':   'var(--color-hover)',
        gain:          'var(--color-gain)',
        loss:          'var(--color-loss)',
        gold:          'var(--color-gold)',
        accent:        'var(--color-accent)',
        ticker:        'var(--color-ticker)',
        'text-primary':'var(--color-text-primary)',
        'text-dim':    'var(--color-text-dim)',
        'text-muted':  'var(--color-text-muted)',
      },
      fontFamily: {
        sans: ['var(--font-heebo)', 'Heebo', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-in-out',
        'pulse-gold': 'pulseGold 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGold: {
          '0%, 100%': { borderColor: 'var(--color-gold)' },
          '50%':      { borderColor: '#fbbf24' },
        },
      },
    },
  },
  plugins: [],
}
