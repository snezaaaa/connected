import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Change, DataSource, Me } from './data/types'

type Listener = (c: Change, payload?: { project_id?: string }) => void

interface Ctx {
  ds: DataSource
  me: Me | null
  setMe: (m: Me | null) => void
  on: (l: Listener) => () => void
  emitLocal: (c: Change) => void
  toast: (msg: string, icon?: string) => void
  confetti: () => void
}

const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('AppCtx')
  return c
}

export function AppProvider({ ds, initialMe, children }: { ds: DataSource; initialMe: Me | null; children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(initialMe)
  const listeners = useRef(new Set<Listener>())
  const [toastMsg, setToastMsg] = useState<{ msg: string; icon: string; k: number } | null>(null)
  const [burst, setBurst] = useState(0)

  const on = useCallback((l: Listener) => {
    listeners.current.add(l)
    return () => void listeners.current.delete(l)
  }, [])
  const fire = useCallback<Listener>((c, p) => {
    for (const l of listeners.current) l(c, p)
  }, [])

  useEffect(() => {
    if (!me) return
    return ds.subscribe(me, fire)
  }, [ds, me?.id, fire]) // eslint-disable-line react-hooks/exhaustive-deps

  const toast = useCallback((msg: string, icon = '✨') => {
    setToastMsg({ msg, icon, k: Date.now() })
  }, [])
  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), 4200)
    return () => clearTimeout(t)
  }, [toastMsg])

  const confetti = useCallback(() => setBurst(Date.now()), [])
  useEffect(() => {
    if (!burst) return
    const t = setTimeout(() => setBurst(0), 2000)
    return () => clearTimeout(t)
  }, [burst])

  return (
    <AppCtx.Provider value={{ ds, me, setMe, on, emitLocal: (c) => fire(c), toast, confetti }}>
      {children}
      {toastMsg && (
        <div className="toast" role="status" key={toastMsg.k} onClick={() => setToastMsg(null)}>
          <span className="ic">{toastMsg.icon}</span>
          <span>{toastMsg.msg}</span>
        </div>
      )}
      {burst > 0 && (
        <div className="confetti" aria-hidden>
          {Array.from({ length: 26 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.08}s` }}>
              {['🎉', '✨', '💜', '💙', '⭐'][i % 5]}
            </i>
          ))}
        </div>
      )}
    </AppCtx.Provider>
  )
}

/** Učitava podatke i ponovo ih učitava kad stigne neka od navedenih promjena (Realtime ili offline). */
export function useLive<T>(load: () => Promise<T>, changes: Change[], deps: unknown[] = []) {
  const { on } = useApp()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load
  const reload = useCallback(() => {
    loadRef.current().then(
      (d) => {
        setData(d)
        setError(null)
        setLoaded(true)
      },
      (e: Error) => {
        setError(e.message)
        setLoaded(true)
      },
    )
  }, [])
  useEffect(() => {
    reload()
    return on((c) => {
      if (changes.includes(c)) reload()
    })
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loaded, reload }
}
