/**
 * Trails of Tukana Helper - Auto-Updating Service Worker
 * Version: v1.3.0
 */

const APP_VERSION = 'v1.3.0';
const CACHE_NAME = `ToT_${APP_VERSION}`;

const STATIC_ASSETS = [
    './',
    'index.html',
    'css/styles.css',
    'scripts/script.js',
    'manifest.json',
    'audio/click.mp3',

    // Иконки
    'ico/favicon.ico',
    'ico/icon_x48.png',
    'ico/icon_x72.png',
    'ico/icon_x96.png',
    'ico/icon_x128.png',
    'ico/icon_x192.png',
    'ico/icon_x384.png',
    'ico/icon_x512.png',
    'ico/icon_x1024.png',

    // Карты местности и бонусы
    'img/bird.png',
    'img/birdx.png',
    'img/book.png',
    'img/bookx.png',
    'img/cat.png',
    'img/catx.png',
    'img/desert.png',
    'img/dragon.png',
    'img/dragonx.png',
    'img/forest.png',
    'img/joker.png',
    'img/logo.png',
    'img/map.png',
    'img/monument.png',
    'img/monumentx.png',
    'img/mountan.png',
    'img/water.png'
];

// Установка: кэшируем свежие ресурсы и форсируем активацию
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).catch((err) => {
            console.warn('SW pre-caching warning:', err);
        })
    );
});

// Активация: мгновенно удаляем все старые версии кэша
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log(`[SW ${APP_VERSION}] Removing old cache:`, key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => {
            console.log(`[SW ${APP_VERSION}] Claiming clients`);
            return self.clients.claim();
        })
    );
});

// Обработка сообщений от приложения
self.addEventListener('message', (event) => {
    if (event.data) {
        if (event.data.action === 'skipWaiting') {
            self.skipWaiting();
        } else if (event.data.action === 'clearCaches') {
            caches.keys().then((keys) => {
                return Promise.all(keys.map((k) => caches.delete(k)));
            });
        }
    }
});

// Обработка сетевых запросов
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    const url = new URL(event.request.url);
    const pathname = url.pathname;

    // Для исполняемого кода и HTML (index.html, script.js, styles.css):
    // Стратегия NETWORK-FIRST: сначала пробуем сеть, чтобы сразу подхватить обновление.
    // Если сети нет (офлайн) — достаём из кэша.
    const isCodeFile = pathname.endsWith('.js') || 
                       pathname.endsWith('.css') || 
                       pathname.endsWith('.html') || 
                       pathname === '/' ||
                       event.request.mode === 'navigate';

    if (isCodeFile) {
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Офлайн: достаём из кэша
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    if (event.request.mode === 'navigate') {
                        return caches.match('index.html') || caches.match('./');
                    }
                    return new Response('Offline: resource not cached', { status: 503 });
                });
            })
        );
        return;
    }

    // Для тяжёлой статики (картинки, иконки, звуки): CACHE-FIRST
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                return new Response('Resource unavailable offline', { status: 503 });
            });
        })
    );
});
