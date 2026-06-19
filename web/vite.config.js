import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/dish/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/dish-api': 'http://127.0.0.1:3002',
      '/dish-uploads': 'http://127.0.0.1:3002'
    }
  }
});
