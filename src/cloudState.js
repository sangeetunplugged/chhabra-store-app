// Cloud status, shared by every screen. The Firebase code itself (cloud.js) loads only when this
// phone uses the cloud, so billing stays fast and works the same without it.
import { signal } from '@preact/signals';

export const LOGIN_KEY = 'chhabra-cloud'; // the login this phone is signed in with, e.g. "counter"
export const DOMAIN = 'chhabra-store.firebaseapp.com'; // logins are <name>@ this domain

// status: off | starting | ok | sending | offline | error | claim | moved | signedout
export const cloud = signal({ status: 'off', login: '', role: '', pending: 0, lastSync: 0, msg: '', other: null });

// counter: the shop phone, uploads · stock: the brother's phone, records stock · anyone else: view only
export const roleOf = (login) => (login === 'counter' ? 'counter' : login === 'stock' ? 'stock' : 'viewer');

export function savedLogin() {
  try {
    return localStorage.getItem(LOGIN_KEY) || '';
  } catch (e) {
    return '';
  }
}

let mod = null;
export async function cloudApi() {
  if (!mod) mod = await import('./cloud.js');
  return mod;
}

// On app start: carry on with the cloud if this phone was signed in before.
export function resumeCloud() {
  const login = savedLogin();
  if (!login) return;
  cloud.value = { ...cloud.value, status: 'starting', login, role: roleOf(login) };
  cloudApi()
    .then((m) => m.start())
    .catch(() => {
      cloud.value = { ...cloud.value, status: 'offline' };
    });
}
