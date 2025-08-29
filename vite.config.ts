import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// Read version from package.json
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
const version = packageJson.version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/kgstudio/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
