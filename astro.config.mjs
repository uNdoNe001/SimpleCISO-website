// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://simpleciso.ai',
  output: 'static',
  // Keep HTML-aware whitespace handling so inline elements in multi-line markup
  // (e.g. the homepage h1) don't get jammed together. Do not remove.
  compressHTML: true,
  integrations: [
    sitemap({
      changefreq: 'weekly',
      lastmod: new Date(),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: node({
    mode: 'standalone',
  }),
});
