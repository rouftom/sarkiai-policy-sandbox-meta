// Service worker: caches the hashed build assets and the logo, so the console
// opens fast and the shell survives a flaky link. Pages come from the network
// first (fresh operator data), and the API is never cached.
const VERSION = 'sps-v1'
const SHELL = ['/icons/sps-logo.svg', '/icons/web-app-manifest-192x192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/v1/')) return

  if (url.pathname.startsWith('/_next/static/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit
        return fetch(request).then((response) => {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(request, copy))
          return response
        })
      }),
    )
    return
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)))
})
