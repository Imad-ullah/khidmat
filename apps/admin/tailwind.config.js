/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211f',
        leaf: '#087b6f',
        mint: '#eaf6f2',
        line: '#d8e2de',
      },
    },
  },
  plugins: [],
};
