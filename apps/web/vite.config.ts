import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = fileURLToPath(new URL('.', import.meta.url));
const serviceOrigin = process.env.CRYPTIFICATE_SERVICE ?? 'http://127.0.0.1:4173';

const DEV_PORT = 5173;
const PREVIEW_PORT = 4174;
const ownOrigins = new Set(
  [DEV_PORT, PREVIEW_PORT].flatMap((port) => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]),
);

// The service accepts state-changing requests only from its own origin. Requests
// coming from this dev page are forwarded as if they came from the service's
// origin; requests from any other origin pass through unchanged and are refused.
const proxy = {
  '/api': {
    target: serviceOrigin,
    changeOrigin: false,
    configure(server: { on(event: 'proxyReq', cb: (req: ProxyRequest) => void): void }) {
      server.on('proxyReq', (req) => {
        const origin = req.getHeader('origin');
        if (typeof origin === 'string' && ownOrigins.has(origin)) req.setHeader('origin', serviceOrigin);
      });
    },
  },
};

interface ProxyRequest {
  getHeader(name: string): unknown;
  setHeader(name: string, value: string): void;
}

export default defineConfig(({ command }) => {
  // Builds always use production React, whatever NODE_ENV the shell exports.
  if (command === 'build') process.env.NODE_ENV = 'production';
  return {
    // Relative asset paths so the replay build can be served from any static location.
    base: './',
    plugins: [react()],
  // Use the schema package from source so the app needs no separate build step for it.
  resolve: { alias: { '@cryptificate/schema': `${here}../../packages/schema/src/index.ts` } },
    define: {
      __BRAND_MARK__: JSON.stringify(existsSync(`${here}public/brand/mark.svg`)),
      __BRAND_LOGO__: JSON.stringify(existsSync(`${here}public/brand/logo.svg`)),
    },
    server: { host: '127.0.0.1', port: DEV_PORT, strictPort: false, proxy },
    preview: { host: '127.0.0.1', port: PREVIEW_PORT, proxy },
    build: { target: 'es2022', sourcemap: true },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
