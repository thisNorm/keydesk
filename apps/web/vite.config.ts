import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const target = `http://127.0.0.1:${process.env.KEYDESK_PORT ?? '8088'}`;
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': target, '/gw': target } },
  build: { outDir: 'dist' },
});
