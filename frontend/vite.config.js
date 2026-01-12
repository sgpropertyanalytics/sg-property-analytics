import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Proxy API requests to backend during development
    // In production, set VITE_API_URL to your backend URL
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5001',
        changeOrigin: true,
        rewrite: (path) => path // Keep /api prefix
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Manual chunks for better caching and parallel loading
        manualChunks: {
          // Chart.js is large (~200KB) - separate chunk for caching
          'chart': ['chart.js', 'react-chartjs-2', 'chartjs-plugin-annotation'],
          // Map libraries - only loaded on pages with maps
          'map': ['maplibre-gl', 'react-map-gl'],
          // React core - stable, cached long-term
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Firebase auth - only needed after login
          'firebase': ['firebase/app', 'firebase/auth'],
        },
      },
    },
    // Increase chunk size warning threshold (Chart.js is legitimately large)
    chunkSizeWarningLimit: 500,
  },
})

