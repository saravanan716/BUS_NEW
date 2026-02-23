import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'public',
  publicDir: '../public/assets',

  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'public/index.html'),
      },
    },
    // ⚡ Split vendor chunk so browser can cache Leaflet separately
    chunkSizeWarningLimit: 800,
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // ⚡ Worker entry — Vite handles Web Workers natively with ?worker import
  worker: {
    format: 'es',
  },

  server: {
    port: 3000,
    open: true,
    // Proxy Nominatim & OSRM during dev to avoid CORS issues
    proxy: {
      '/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/nominatim/, ''),
      },
      '/osrm': {
        target: 'https://router.project-osrm.org',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/osrm/, ''),
      },
    },
  },
});
