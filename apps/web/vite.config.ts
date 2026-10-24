import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = fileURLToPath(new URL('.', import.meta.url));
const serviceOrigin = process.env.CRYPTIFICATE_SERVICE ?? 'http://127.0.0.1:4173';

const proxy = {
  '/api': { target: serviceOrigin, changeOrigin: false },
};

export default defineConfig(({ command }) => {
  // Builds always use production React, whatever NODE_ENV the shell exports.
  if (command === 'build') process.env.NODE_ENV = 'production';
  return {
    // Relative asset paths so the replay build can be served from any static location.
    base: './',
    plugins: [react()],
    define: {
      __BRAND_MARK__: JSON.stringify(existsSync(`${here}public/brand/mark.svg`)),
      __BRAND_LOGO__: JSON.stringify(existsSync(`${here}public/brand/logo.svg`)),
    },
    server: { host: '127.0.0.1', port: 5173, strictPort: false, proxy },
    preview: { host: '127.0.0.1', port: 4174, proxy },
    build: { target: 'es2022', sourcemap: true },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
