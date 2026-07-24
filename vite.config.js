import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, host: true },
  build: { target: 'es2022' },
  // Post-processing addons import three internally; dedupe to a single instance.
  resolve: { dedupe: ['three'] },
});
