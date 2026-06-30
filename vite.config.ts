import { defineConfig } from 'vite';

export default defineConfig({
  // Ensures assets are referenced with relative paths — important for Vercel CDN
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Target modern browsers — Vercel serves these fine
    target: 'es2020',
  },
});
