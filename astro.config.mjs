// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// GitHub Pages serves the site under /<repo>/ unless a custom domain is used:
// SITE_URL and BASE_PATH are set by the deploy workflow.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://yoanbernabeu.github.io',
  base: process.env.BASE_PATH ?? '/',
  integrations: [react(), sitemap()],

  vite: {
    plugins: [tailwindcss()]
  }
});
