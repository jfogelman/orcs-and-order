import { defineConfig } from 'vite';

// `base: './'` keeps the built bundle relocatable: it works from a GitHub Pages
// project subpath, from an itch.io zip, and from a plain local file open.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'bundle',
  },
  server: {
    port: 5188,
    strictPort: false,
  },
});
