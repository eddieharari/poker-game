/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: '#1a6b3c',
          dark:    '#134f2d',
          light:   '#2d9c5a',
        },
        gold: {
          DEFAULT: '#d4a017',
          light:   '#f0c040',
        },
        chip: {
          red:    '#e03c31',
          blue:   '#2563eb',
          green:  '#16a34a',
          black:  '#1f2937',
          purple: '#7c3aed',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body:    ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        card: '2px 4px 12px rgba(0,0,0,0.4)',
        'card-hover': '4px 8px 20px rgba(0,0,0,0.6)',
      },
      animation: {
        'card-flip': 'flip 0.4s ease-in-out',
        'slide-up':  'slideUp 0.3s ease-out',
        'pulse-gold':'pulseGold 1.5s ease-in-out infinite',
        'fade-in':   'fadeIn 0.4s ease-out',
      },
      keyframes: {
        flip: {
          '0%':   { transform: 'rotateY(0deg)' },
          '50%':  { transform: 'rotateY(90deg)' },
          '100%': { transform: 'rotateY(0deg)' },
        },
        slideUp: {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(212,160,23,0.4)' },
          '50%':      { boxShadow: '0 0 0 8px rgba(212,160,23,0)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
