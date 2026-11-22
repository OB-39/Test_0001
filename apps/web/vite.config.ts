import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const rawUseMock = process.env.VITE_USE_MOCK ?? env.VITE_USE_MOCK;
  const mockEnabled = rawUseMock !== 'false';
  const apiProxyTarget = process.env.API_URL || 'http://127.0.0.1:3001';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_USE_MOCK': JSON.stringify(mockEnabled ? 'true' : 'false'),
    },
    resolve: {
      alias: [
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        ...(!mockEnabled
          ? [{ find: './mock', replacement: fileURLToPath(new URL('./src/api/mock.disabled.ts', import.meta.url)) }]
          : []),
      ],
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      ...(!mockEnabled
        ? {
            proxy: {
              '/api': apiProxyTarget,
            },
          }
        : {}),
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
