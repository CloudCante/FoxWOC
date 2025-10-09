import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node18',
    lib: { entry: 'src/preload.js', formats: ['cjs'] },
    rollupOptions: { external: ['electron','fs','path','xlsx'] },
  },
});
