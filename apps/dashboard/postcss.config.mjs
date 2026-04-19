// Tailwind v4 runs through its PostCSS plugin so App Router CSS can stay token-driven.
// Additional PostCSS transforms should be added here only when they apply across the app.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

export default config
