(() => {
  const installButton = document.querySelector('#pwa-install');
  const status = document.querySelector('#pwa-status');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installPrompt = null;

  const say = (message) => { if (status) status.textContent = message; };
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => say('Install is unavailable right now. You can still use the uploader in your browser.')));
  }
  if (installButton && !standalone) {
    if (isAppleMobile) {
      installButton.hidden = false;
      installButton.textContent = 'add to home screen';
    }
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault(); installPrompt = event;
      installButton.hidden = false; installButton.textContent = 'install app';
    });
    installButton.addEventListener('click', async () => {
      if (installPrompt) {
        installPrompt.prompt();
        const result = await installPrompt.userChoice;
        if (result.outcome === 'accepted') say('Our little diary is being added to your Home Screen.');
        installPrompt = null; installButton.hidden = true;
      } else if (isAppleMobile) {
        say('In your browser, open the Share menu and choose “Add to Home Screen.” Your icon will open the diary like an app.');
      } else {
        say('Open your browser menu and choose “Install app” or “Add to Home Screen.”');
      }
    });
    window.addEventListener('appinstalled', () => { installButton.hidden = true; say('Our little diary is installed on this device.'); });
  }

  const openShareDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('our-little-diary-share', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('incoming', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const readSharedFiles = async () => {
    const db = await openShareDb();
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('incoming', 'readonly').objectStore('incoming').get('latest');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!record) return [];
    if (Date.now() - record.receivedAt > 24 * 60 * 60 * 1000) { await clearSharedFiles(); return []; }
    return record.files.map((entry) => {
      const file = entry.file || entry;
      const shared = new File([file], file.name, { type: file.type, lastModified: file.lastModified || Date.now() });
      if (entry.id) Object.defineProperty(shared, 'shareQueueId', { value: entry.id });
      return shared;
    });
  };
  const clearSharedFiles = async () => {
    const db = await openShareDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('incoming', 'readwrite'); tx.objectStore('incoming').delete('latest');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  };
  const removeSharedFile = async (file) => {
    const db = await openShareDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('incoming', 'readwrite');
      const store = tx.objectStore('incoming');
      const request = store.get('latest');
      request.onsuccess = () => {
        const record = request.result;
        if (!record) return;
        record.files = record.files.filter((entry) => {
          if (file.shareQueueId) return entry.id !== file.shareQueueId;
          const shared = entry.file || entry;
          return shared.name !== file.name || shared.size !== file.size || shared.lastModified !== file.lastModified;
        });
        if (record.files.length) store.put(record); else store.delete('latest');
      };
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  };
  window.DiaryPwa = { readSharedFiles, clearSharedFiles, removeSharedFile };
  window.addEventListener('online', () => say('You’re back online. Sign in or save your memory when you’re ready.'));
  window.addEventListener('offline', () => say('You’re offline. Your files stay on this device; uploads need an internet connection.'));
})();
