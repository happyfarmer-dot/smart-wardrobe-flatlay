import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Using relative base './' ensures the static bundle works cleanly on both
// GitHub Pages (/smart-wardrobe-flatlay/) and local preview servers.
export default defineConfig({
  plugins: [react()],
  base: './',
})
