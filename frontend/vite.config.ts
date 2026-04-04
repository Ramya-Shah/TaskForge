import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Mirror Nginx proxy rules for local dev
      '/jobs': 'http://localhost:3001',
      '/queue': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,  // Enable WebSocket proxying
      },
    },
  },
})

