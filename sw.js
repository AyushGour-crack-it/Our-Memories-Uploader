const SHELL_CACHE = 'our-little-diary-shell-v2';
const SHARE_DB = 'our-little-diary-share';
const SHARE_STORE = 'incoming';
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const APP_SHELL = [
  '/offline.html',
  '/styles.css',
  '/archive.css',
  '/uploader-theme.css',
  '/diary-config.js',
  '/diary-client.js',
  '/upload-live.js',
  '/pwa.js',
  '/manifest.webmanifest',
  '/icons/diary-icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('our-little-diary-shell-') && key !== SHELL_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

const openShareDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(SHARE_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(SHARE_STORE, { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const saveSharedPayload = async (record) => {
  const db = await openShareDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, 'readwrite');
    tx.objectStore(SHARE_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Could not keep the shared files on this device.'));
  });
  db.close();
};

const receiveShare = async (request) => {
  try {
    const data = await request.formData();
    const files = data.getAll('media').filter((entry) => entry instanceof File && entry.name);
    if (!files.length) return Response.redirect(new URL('/?shared=empty', self.location.origin), 303);
    const tooLarge = files.find((file) => file.size > MAX_FILE_SIZE);
    if (tooLarge) return Response.redirect(new URL('/?shared=large', self.location.origin), 303);
    const unsupported = files.find((file) => !/^(image|video|audio)\//.test(file.type));
    if (unsupported) return Response.redirect(new URL('/?shared=unsupported', self.location.origin), 303);
    await saveSharedPayload({ id: 'latest', receivedAt: Date.now(), files: files.map((file) => ({ id: crypto.randomUUID(), file })) });
    return Response.redirect(new URL('/?shared=ready', self.location.origin), 303);
  } catch {
    return Response.redirect(new URL('/?shared=failed', self.location.origin), 303);
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === 'POST' && url.pathname === '/share-target/') {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || Response.error()));
  }
});
