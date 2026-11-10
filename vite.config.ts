import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages servira aplikaciju na /<ime-repoa>/. Promijenite VITE_BASE ako se repo drugačije zove.
const base = process.env.VITE_BASE ?? '/connected/'

// Spisak svih fajlova builda za service worker (offline rad).
function precache(): Plugin {
  return {
    name: 'ce-precache',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && !f.endsWith('.woff'))
      files.push('logo.png', 'icon-192.png', 'icon-512.png', 'favicon.png', 'manifest.webmanifest')
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) })
    },
  }
}

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? base : '/',
  plugins: [react(), precache()],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
}))
