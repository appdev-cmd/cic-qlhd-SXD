import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import ports from './config/runtime-ports.json';

export default defineConfig({
  plugins: [react()],
  build: {rollupOptions:{output:{manualChunks(id){
    if(id.includes('node_modules')){
      if(id.includes('@supabase'))return 'supabase';
      if(id.includes('react-dom')||id.includes('/react/')||id.includes('react-router')||id.includes('scheduler'))return 'react-vendor';
      if(id.includes('leaflet'))return 'maps';
      if(id.includes('pdfjs-dist'))return 'pdf-reader';
    }
  }}}},
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: { '/api/appraisal': { target: `http://127.0.0.1:${ports.core}`, changeOrigin: false,
      bypass(req) {
        if(req.url?.startsWith('/api/appraisal/test-login') && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||''))return false;
      },
    } },
    port: ports.web,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {port:ports.web,strictPort:true,host:'127.0.0.1',proxy:{'/api/appraisal':{target:`http://127.0.0.1:${ports.core}`,changeOrigin:false}}},
});
