import { render } from 'preact';
import '@fontsource/mukta/400.css';
import '@fontsource/mukta/600.css';
import '@fontsource/mukta/700.css';
import '@fontsource/mukta/800.css';
import './styles.css';
import { App } from './app.jsx';
import { useMemoryDb } from './db.js';

function storageWorks() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('chhabra-probe');
      req.onsuccess = () => {
        try {
          req.result.close();
        } catch (e) {
          /* ignore */
        }
        resolve(true);
      };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(true);
      setTimeout(() => resolve(false), 1500);
    } catch (e) {
      resolve(false);
    }
  });
}

async function start() {
  if (!(await storageWorks())) {
    const fake = await import('fake-indexeddb');
    useMemoryDb({ indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange });
  }
  render(<App />, document.getElementById('app'));
}

start();

// Offline support: the service worker keeps the app working with no internet.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      /* preview links and some browsers do not allow it; the app still runs */
    });
}
