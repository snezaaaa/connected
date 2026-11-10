import { defineConfig, devices } from '@playwright/test'

// Offline: build bez Supabase ključeva → aplikacija radi iz localStorage.
// Online: pokreće se samo ako su postavljeni E2E_SUPABASE_URL i E2E_SUPABASE_ANON_KEY
//         (pravi Supabase projekat; test na kraju resetuje demo).
// Ili: E2E_BASE_URL=https://<nalog>.github.io/connected/ → online test nad objavljenom aplikacijom.
const deployed = process.env.E2E_BASE_URL
const localOnline = !!(process.env.E2E_SUPABASE_URL && process.env.E2E_SUPABASE_ANON_KEY)
const online = !!deployed || localOnline

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { ...devices['Pixel 7'], trace: 'off' },
  projects: [
    { name: 'offline', testMatch: /offline\.spec\.ts/, use: { baseURL: 'http://localhost:4173/connected/' } },
    ...(online ? [{ name: 'online', testMatch: /online\.spec\.ts/, use: { baseURL: deployed ?? 'http://localhost:4174/connected/' } }] : []),
  ],
  webServer: [
    {
      command: 'VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir dist-e2e-offline && npx vite preview --outDir dist-e2e-offline --port 4173 --strictPort',
      url: 'http://localhost:4173/connected/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    ...(localOnline && !deployed
      ? [{
          command: `VITE_SUPABASE_URL=${process.env.E2E_SUPABASE_URL} VITE_SUPABASE_ANON_KEY=${process.env.E2E_SUPABASE_ANON_KEY} npx vite build --outDir dist-e2e-online && npx vite preview --outDir dist-e2e-online --port 4174 --strictPort`,
          url: 'http://localhost:4174/connected/',
          reuseExistingServer: false,
          timeout: 120_000,
        }]
      : []),
  ],
})
