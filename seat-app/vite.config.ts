import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 配信先に依存しない相対パスの指定
  base: './',
  plugins: [react()],
})
