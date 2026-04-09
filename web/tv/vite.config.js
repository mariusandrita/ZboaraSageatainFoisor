import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const socketIoClientPath = path.dirname(require.resolve('socket.io-client/package.json'));

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      'socket.io-client': socketIoClientPath,
    },
  },
  base: '/tv/',
  build: {
    outDir: '../../server/public/tv',
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
