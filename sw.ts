// sw.ts

// 1. Version Control
// Update this string to 'v2', 'v3', etc. to force all users to download the new version.
const CACHE_NAME = 't1-analyser-v1';

// 2. Asset Manifest
// List every single file required for the app to run.
// If one is missing, the app will look broken offline.
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/src/main.ts',
    '/src/style.css',
    '/manifest.json',
    '/t1analyserlogo.svg',
    '/favicon.svg'
];

// --- INSTALL EVENT ---
// Triggered once when the browser sees a new SW version.
self.addEventListener('install', (event: any) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Caching static assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Force the waiting SW to become the active SW immediately
    (self as any).skipWaiting();
});

// --- ACTIVATE EVENT ---
// Triggered when the new SW takes control. Good for cleaning old caches.
self.addEventListener('activate', (event: any) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('SW: Clearing old cache', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    // Tell the SW to claim control of all clients immediately
    (self as any).clients.claim();
});

// --- FETCH EVENT ---
// The core logic: Intercepts every HTTP request.
self.addEventListener('fetch', (event: any) => {
    // 1. Skip non-GET requests and browser extensions/internal urls
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    // 2. Bypass SW for connectivity checks (OfflineVerifier uses this)
    if (event.request.url.includes('generate_204')) {
        return;
    }

    const request = event.request;

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // Strategy: Cache First, Fallback to Network
            if (cachedResponse) {
                return cachedResponse;
            }

            // If not in cache, try network
            return fetch(request).catch(() => {
                // 3. SPA Fallback: If network fails and it's a navigation request (HTML),
                // return the cached /index.html. This allows deep links to work offline.
                if (request.mode === 'navigate' ||
                    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))) {
                    console.log('SW: Serving SPA fallback [index.html] for:', request.url);
                    return caches.match('/index.html');
                }

                // For other assets (images, etc.), just let it fail
                console.warn('SW: Resource not found and no fallback:', request.url);
                return null as any;
            });
        })
    );
});