import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-ext-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-ext-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-ext-600.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-ext-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-ext-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import '@fontsource/plus-jakarta-sans/latin-ext-800.css'
import './styles.css'
import App from './App'
import { AppProvider } from './state'
import { getSource } from './data'

const root = createRoot(document.getElementById('root')!)

async function boot() {
  const ds = await getSource()
  const me = await ds.currentUser().catch(() => null)
  root.render(
    <StrictMode>
      <AppProvider ds={ds} initialMe={me}>
        <App />
      </AppProvider>
    </StrictMode>,
  )
}
void boot()

// Service worker: aplikacija se otvara i bez interneta (za „Offline demo“).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}
