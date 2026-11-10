// ConnectEd service worker: keširanje aplikacije za rad bez interneta.
// Supabase zahtjevi (drugi domen) se nikad ne keširaju.
const CACHE = 'ce-v2'
const BASE = new URL('./', self.location).pathname

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE)
      let files = []
      try {
        files = await (await fetch(BASE + 'precache.json', { cache: 'no-store' })).json()
      } catch {}
      await c.addAll([BASE, ...files.map((f) => BASE + f)]).catch(() => {})
      self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (e.request.mode === 'navigate') {
    // Mreža prvo (nova verzija), keš ako nema interneta.
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone()
          caches.open(CACHE).then((c) => c.put(BASE, copy))
          return r
        })
        .catch(() => caches.match(BASE, { ignoreVary: true })),
    )
    return
  }
  e.respondWith(
    caches.match(e.request, { ignoreVary: true, ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          if (r.ok) {
            const copy = r.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy))
          }
          return r
        }),
    ),
  )
})
