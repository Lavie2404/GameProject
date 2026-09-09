import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Web app entry lives in src-web/; App.tsx and gameConfig.js stay at repo
// root (that's where the user's original single-file export already
// imports gameConfig.js from — kept as-is to avoid rewriting import paths).
export default defineConfig({
  plugins: [react()],
  root: '.',
  // GitHub Pages project-page URL: https://<user>.github.io/GameProject/ — every
  // built asset path needs this prefix or the deployed page 404s on load.
  // (Repo renamed textbase -> GameProject on 2026-09-09.)
  base: '/GameProject/',
  build: {
    outDir: 'dist',
  },
});
