import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // Static par défaut — toutes les pages prerendues en HTML pur
  // Les routes API gardent export const prerender = false pour rester en serverless
  output: 'static',
  adapter: vercel(),
  site: 'https://reccolt.com',
  compressHTML: true,
  build: {
    // Inline les feuilles de style < 4kB dans le HTML (évite un aller-retour réseau)
    inlineStylesheets: 'auto',
  },
});
