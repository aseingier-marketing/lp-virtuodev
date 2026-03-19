import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  compressHTML: true,
  build: {
    // Inline les feuilles de style < 4kB dans le HTML (évite un aller-retour réseau)
    inlineStylesheets: 'auto',
  },
});
