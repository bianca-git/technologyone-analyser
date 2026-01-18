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
    '/t1gurulogo.svg',
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
    // Bypass SW for connectivity checks
    if (event.request.url.includes('generate_204')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Strategy: Cache First, Fallback to Network
            // If we found it in cache, return it.
            if (cachedResponse) {
                return cachedResponse;
            }
            // If not, try to fetch it from the network.
            return fetch(event.request).catch(() => {
                // If network fails (Airplane mode) and it's not in cache:
                // You could return a custom offline page here, but for your app,
                // it should have been cached in the Install phase.
                console.error('SW: Fetch failed and not in cache', event.request.url);
            });
        })
    );
});