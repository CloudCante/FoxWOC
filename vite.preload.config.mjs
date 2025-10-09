import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    target: 'node18',
    rollupOptions: {
      output: { entryFileNames: 'preload.js' },
      external: ['electron','fs','path','xlsx','node:fs','node:path']
    }
  }
});
