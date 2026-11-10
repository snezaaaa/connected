import type { DataSource } from './types'
import { hasSupabaseConfig } from './env'

const MODE_KEY = 'ce-mode'

export function isOfflineMode(): boolean {
  if (!hasSupabaseConfig) return true
  try {
    return localStorage.getItem(MODE_KEY) === 'offline'
  } catch {
    return false
  }
}

export function setOfflineMode(on: boolean) {
  try {
    localStorage.setItem(MODE_KEY, on ? 'offline' : 'online')
  } catch {
    /* ignore */
  }
  location.reload()
}

export { hasSupabaseConfig }

let ds: DataSource | null = null
export async function getSource(): Promise<DataSource> {
  if (ds) return ds
  ds = isOfflineMode()
    ? (await import('./offlineSource')).offlineSource
    : (await import('./supabaseSource')).supabaseSource
  return ds
}
