import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/auth': { target: 'http://localhost:3001', changeOrigin: true },
      '/repo': { target: 'http://localhost:3001', changeOrigin: true },
      '/github': { target: 'http://localhost:3001', changeOrigin: true },
      '/preview': { target: 'http://localhost:3001', changeOrigin: true },
      '/ai': { target: 'http://localhost:3001', changeOrigin: true },
      '/health': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
});
