import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative so the built app also runs when
// opened from a sub-path or served over a plain LAN address (handy on iPad).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true, port: 5847, strictPort: true },
  preview: { host: true, port: 4847, strictPort: true },
});
