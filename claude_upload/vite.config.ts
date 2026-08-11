import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [tailwindcss(), vue()],
  root: 'src/client',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3000',
      '^/socket': {
        target: 'ws://localhost:3000',
        ws: true,
      }
    }
  },
  build: {
    // DIESER PFAD HAT FUNKTIONIERT (siehe Ihr erstes Build-Log)
    // Er baut nach dist/public (relativ zum Projekt-Root)
    outDir: '../../dist/public', 
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/client/index.html'),
        display: resolve(__dirname, 'src/client/display.html'),
      }
    }
  }
});