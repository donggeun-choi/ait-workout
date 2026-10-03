import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

import aitDevtools from "@apps-in-toss/devtools/unplugin";

export default defineConfig(({ mode }) => ({
  plugins: [aitDevtools.vite(), react()],
  server: {
    proxy: {
      '/api/community': {
        target: loadEnv(mode, '.', 'COMMUNITY_').COMMUNITY_PROXY_TARGET || 'http://127.0.0.1:5194',
        changeOrigin: false,
      },
    },
  },
}))
