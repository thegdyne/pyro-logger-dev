// Pyro Logger Service Worker
const CACHE_NAME = 'pyro-logger-v2';
const STATIC_ASSETS = [
  '/pyro-logger/',
  '/pyro-logger/index.html',
  '/pyro-logger/manifest.json',
  '/pyro-logger/icons/icon-72.png',
  '/pyro-logger/icons/icon-96.png',
  '/pyro-logger/icons/icon-128.png',
  '/pyro-logger/icons/icon-144.png',
  '/pyro-logger/icons/icon-152.png',
  '/pyro-logger/icons/icon-192.png',
  '/pyro-logger/icons/icon-384.png',
  '/pyro-logger/icons/icon-512.png'
];

// External CDN resources to cache
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        // Cache local assets
        const localPromise = cache.addAll(STATIC_ASSETS).catch(err => {
          console.warn('[SW] Some local assets failed to cache:', err);
        });
        // Cache CDN assets individually (they might fail)
        const cdnPromises = CDN_ASSETS.map(url => 
          cache.add(url).catch(err => {
            console.warn(`[SW] Failed to cache CDN asset: ${url}`, err);
          })
        );
        return Promise.all([localPromise, ...cdnPromises]);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          // Optionally update cache in background (stale-while-revalidate)
          event.waitUntil(
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  caches.open(CACHE_NAME)
                    .then((cache) => cache.put(request, networkResponse));
                }
              })
              .catch(() => {
                // Network failed, that's fine - we have the cached version
              })
          );
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((networkResponse) => {
            // Cache successful responses for future use
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseClone);
                });
            }
            return networkResponse;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', error);
            
            // For navigation requests, return the cached index.html
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            // For other requests, just let it fail
            throw error;
          });
      })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared');
    });
  }
});

// Background sync for offline form submissions (future enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-entries') {
    console.log('[SW] Background sync triggered');
    // Could sync saved entries to a server here
  }
});
