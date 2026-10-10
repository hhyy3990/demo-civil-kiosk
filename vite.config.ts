import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const replitHosts = [
  process.env.REPLIT_DEV_DOMAIN,
  ...(process.env.REPLIT_DOMAINS ?? '').split(',').map((host) => host.trim()),
].filter((host): host is string => Boolean(host));

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: [...new Set(replitHosts)],
  },
});
