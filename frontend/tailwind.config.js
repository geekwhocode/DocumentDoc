/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e3a5f',
          900: '#172554',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          700: '#283548',
          800: '#1e2a3a',
          900: '#151e2d',
        }
      }
    },
  },
  plugins: [],
}
