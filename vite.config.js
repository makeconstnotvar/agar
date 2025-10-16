import { defineConfig } from 'vite'

export default defineConfig({
  root: 'client',
  server: {
    port: 3001,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: './build',
    emptyOutDir: true,
    minify: false,
    polyfillModulePreload: false,
    sourcemap:true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  }
})
