import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vite config: how the dev server and build behave.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // During development, any request to "/api/..." from the frontend
      // is forwarded to the backend. This avoids CORS issues and means
      // the frontend can just use relative URLs like "/api/health".
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
