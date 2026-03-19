/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        polar: {
          bg: '#1a1a2e',
          sidebar: '#16213e',
          accent: '#0f3460',
          highlight: '#533483',
          text: '#e4e4e7',
          'text-muted': '#9ca3af',
          'text-dim': '#6b7280',
          hover: '#1e2a4a',
          border: '#2a2a4a',
          input: '#12122a',
          success: '#22c55e',
          danger: '#ef4444',
          warning: '#f59e0b',
          online: '#22c55e',
          idle: '#f59e0b',
          dnd: '#ef4444',
          offline: '#6b7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};
