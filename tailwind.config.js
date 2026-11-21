/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0e14',
        panel: '#11151f',
        panel2: '#171c28',
        line: '#232a3a',
        brand: {
          DEFAULT: '#7c5cff',
          soft: '#9b85ff',
          deep: '#5b3fd6',
        },
        accent: '#22d3ee',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,.35), 0 8px 30px rgba(124,92,255,.15)',
      },
    },
  },
  plugins: [],
}
