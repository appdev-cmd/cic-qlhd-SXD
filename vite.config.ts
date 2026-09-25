import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3008,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 3008,
  },
  build: {
    chunkSizeWarningLimit: 450,
    rollupOptions: {
      output: {
        // Tách thư viện nền để trình duyệt cache lâu dài giữa các lần phát hành
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
          if (id.includes('leaflet') || id.includes('@googlemaps')) return 'vendor-maps';
          if (id.includes('/docx/') || id.includes('\\docx\\')) return 'vendor-docx';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
