import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: '/tv/',
  build: {
    outDir: '../../server/public/tv',
    emptyOutDir: true,
  },
  server: {
    port: 5178,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
