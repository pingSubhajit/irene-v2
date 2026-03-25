const PWA_CACHE = "irene-pwa-v3"
const RUNTIME_CACHE = "irene-runtime-v3"
const OFFLINE_URL = "/offline"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PWA_CACHE)
      .then((cache) =>
        cache.addAll([
          OFFLINE_URL,
          "/manifest.webmanifest",
          "/favicon.ico",
        ])
      )
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key !== PWA_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request))
    return
  }

  if (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/_next/image") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/favicon.ico")
  ) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "IR_PWA_CLEAR_CACHES") {
    event.waitUntil(clearAllCaches())
  }
})

self.addEventListener("sync", (event) => {
  if (event.tag === "irene-pwa-replay") {
    event.waitUntil(notifyClientsToReplay())
  }
})

async function handleNavigate(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE)
  const pathname = new URL(request.url).pathname

  try {
    const response = await fetch(request)
    if (response && response.ok) {
      runtimeCache.put(request, response.clone())
    }
    return response
  } catch {
    const offlineResponse = await caches.match(OFFLINE_URL)
    if (!offlineResponse) {
      throw new Error("Offline document not cached")
    }

    if (pathname === OFFLINE_URL) {
      return offlineResponse
    }

    return Response.redirect(
      `${OFFLINE_URL}?pathname=${encodeURIComponent(pathname)}`,
      302
    )
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(request)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    return cached
  }

  const network = await networkPromise
  if (network) {
    return network
  }

  return new Response("", { status: 504 })
}

async function notifyClientsToReplay() {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  })

  await Promise.all(
    clients.map((client) =>
      client.postMessage({
        type: "IR_PWA_REPLAY_REQUESTED",
      })
    )
  )
}

async function clearAllCaches() {
  const keys = await caches.keys()
  await Promise.all(keys.map((key) => caches.delete(key)))
}
