// Cloud sync with Firebase (Firestore in Delhi, email sign-in, sign-ups blocked).
//
// The counter phone ("counter" login) uploads the real database's outbox: bills, khata entries,
// customers with their balance, returns, day closes, items and shop settings. Only one phone at a
// time can be the counter: the cloud keeps which phone it is in shops/chhabra/meta/counter, and
// every upload checks it in the same transaction, so a phone that was replaced can never write.
// Every other login ("rajan", later the brother) only reads: the Shop live screen.
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInWithEmailAndPassword,
  signOut as fbSignOut, connectAuthEmulator
} from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, collection, query, where,
  runTransaction, serverTimestamp, onSnapshot
} from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';
import { realDb, onOutbox, markAll, replaceReal, SYNC_TABLES, NUMBER_KEYS, customerBalance, setMode } from './db.js';
import { cloud, LOGIN_KEY, DOMAIN, roleOf } from './cloudState.js';

const SHOP = 'shops/chhabra';
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
const fs = initializeFirestore(app, {}); // memory cache: the outbox in IndexedDB is the durable queue
if (import.meta.env.VITE_FIREBASE_EMULATOR) {
  const host = import.meta.env.VITE_FIREBASE_EMULATOR;
  connectAuthEmulator(auth, 'http://' + host + ':9099', { disableWarnings: true });
  connectFirestoreEmulator(fs, host, 8080);
}

const set = (patch) => {
  cloud.value = { ...cloud.value, ...patch };
};
const store = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch (e) {
    /* storage blocked */
  }
};

function deviceId() {
  try {
    let id = localStorage.getItem('chhabra-device');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem('chhabra-device', id);
    }
    return id;
  } catch (e) {
    return 'unknown';
  }
}
const DEVICE = deviceId();
let LABEL = 'Phone';
(async () => {
  try {
    const ua = navigator.userAgentData;
    const hi = ua && ua.getHighEntropyValues ? await ua.getHighEntropyValues(['model']) : null;
    const android = /Android/i.test(navigator.userAgent);
    LABEL = (hi && hi.model) || (android ? 'Android phone' : 'Computer');
  } catch (e) {
    /* keep the plain label */
  }
})();

const metaRef = () => doc(fs, SHOP, 'meta', 'counter');
const millis = (t) => (t && t.toMillis ? t.toMillis() : typeof t === 'number' ? t : 0);
const offlineError = (e) =>
  !navigator.onLine || (e && ['unavailable', 'deadline-exceeded', 'auth/network-request-failed'].includes(e.code)) ||
  /offline|network/i.test((e && e.message) || '');

export function errText(e) {
  const c = (e && e.code) || '';
  if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email')
    return 'लॉगिन या पासवर्ड गलत · Wrong login or password';
  if (c === 'auth/too-many-requests') return 'बहुत बार गलत हुआ, थोड़ी देर बाद · Too many tries, wait a few minutes';
  if (c === 'auth/user-disabled') return 'यह लॉगिन बंद है · This login is turned off';
  if (c === 'permission-denied') return 'क्लाउड ने मना किया · Cloud refused: check the login and rules';
  if (offlineError(e)) return 'इंटरनेट नहीं · No internet';
  return (e && e.message) || 'Error';
}

// ---------- sign-in ----------
export async function signIn(login, password) {
  const id = login.trim().toLowerCase();
  const email = id.includes('@') ? id : id + '@' + DOMAIN;
  set({ status: 'starting', msg: '' });
  try {
    await signInWithEmailAndPassword(auth, email, password);
    store(LOGIN_KEY, email.split('@')[0]);
    started = false;
    await start();
    return true;
  } catch (e) {
    set({ status: 'signedout', msg: errText(e) });
    return false;
  }
}

export async function signOut() {
  stop();
  try {
    await fbSignOut(auth);
  } catch (e) {
    /* signed out locally anyway */
  }
  store(LOGIN_KEY, null);
  store('chhabra-counter-ok', null);
  set({ status: 'signedout', login: '', role: '', other: null, msg: '', pending: 0 });
}

let started = false;
let listening = false;
let beat = null;

export async function start() {
  if (started) return;
  await auth.authStateReady();
  const u = auth.currentUser;
  if (!u) {
    store(LOGIN_KEY, null);
    set({ status: 'signedout', login: '', role: '' });
    return;
  }
  started = true;
  const login = (u.email || '').split('@')[0];
  const role = roleOf(login);
  set({ login, role, status: 'starting', msg: '' });
  if (role !== 'counter') {
    set({ status: 'ok' });
    return;
  }
  onOutbox(() => schedule(400));
  if (!listening) {
    listening = true;
    window.addEventListener('online', () => {
      if (cloud.value.role === 'counter') {
        if (cloud.value.status === 'offline' && !counterKnown) counterCheck();
        else schedule(300);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && cloud.value.role === 'counter') schedule(300);
    });
  }
  clearInterval(beat);
  beat = setInterval(() => schedule(0, true), 10 * 60 * 1000);
  set({ pending: await realDb().outbox.count() });
  await counterCheck();
}

function stop() {
  started = false;
  counterKnown = false;
  clearTimeout(retry);
  clearInterval(beat);
  clearTimeout(timer);
  onOutbox(() => {});
}

// ---------- which phone is the counter ----------
let counterKnown = false;
let retry = null;
const claiming = () => {
  try {
    return localStorage.getItem('chhabra-claiming') === '1';
  } catch (e) {
    return false;
  }
};

async function counterCheck() {
  clearTimeout(retry);
  try {
    const m = await getDoc(metaRef());
    counterKnown = true;
    if (!m.exists()) {
      await claim(false); // the first counter phone: upload everything it has
    } else if (m.data().device === DEVICE && claiming()) {
      // a move to this phone stopped half way: the cloud copy is not here yet
      set({ status: 'claim', other: { resume: true, label: LABEL, lastSync: millis(m.data().lastSync), pending: 0 } });
    } else if (m.data().device === DEVICE) {
      store('chhabra-counter-ok', '1');
      set({ status: 'ok', lastSync: millis(m.data().lastSync) });
      schedule(0, true);
    } else {
      set({ status: 'claim', other: { label: m.data().label || '', lastSync: millis(m.data().lastSync), pending: m.data().pending || 0 } });
    }
  } catch (e) {
    // keep billing either way: the outbox goes up once the check passes
    set({ status: offlineError(e) ? 'offline' : 'error', msg: offlineError(e) ? '' : errText(e) });
    if (started) retry = setTimeout(counterCheck, 30000);
  }
}

// Make this phone the counter. fromCloud: first bring the cloud copy of the real data here.
export async function claim(fromCloud) {
  set({ status: 'sending', msg: '' });
  try {
    if (fromCloud) store('chhabra-claiming', '1'); // nothing goes up until the cloud copy is here
    await setDoc(metaRef(), { device: DEVICE, label: LABEL, since: serverTimestamp(), lastSync: serverTimestamp(), pending: 0 });
    counterKnown = true;
    if (fromCloud) {
      await new Promise((r) => setTimeout(r, 2500)); // let the old phone's last upload land
      const data = await pullAll();
      await replaceReal(data);
      store('chhabra-claiming', null);
      setMode('real');
    } else {
      await markAll();
    }
    store('chhabra-counter-ok', '1');
    set({ status: 'ok', other: null, pending: await realDb().outbox.count() });
    schedule(0, true);
    return true;
  } catch (e) {
    set({ status: offlineError(e) ? 'offline' : 'error', msg: errText(e) });
    return false;
  }
}

async function pullAll() {
  const out = {};
  for (const t of SYNC_TABLES) {
    const snap = await getDocs(collection(fs, SHOP, t));
    out[t] = snap.docs.map((d) => {
      const x = d.data();
      if (t === 'settings') return { key: d.id, value: x.value };
      if (t === 'customers') {
        const { balance, ...rest } = x;
        return rest;
      }
      return x;
    });
  }
  return out;
}

// ---------- upload ----------
let timer = null;
let running = false;
let again = false;
let beatDue = false;

export function syncNow() {
  if (cloud.value.role === 'counter' && cloud.value.status === 'offline' && !counterKnown) counterCheck();
  else schedule(0, true);
}

function schedule(ms = 400, heartbeat = false) {
  if (heartbeat) beatDue = true;
  clearTimeout(timer);
  timer = setTimeout(flush, ms);
}

async function toDoc(d, t, rec) {
  if (t === 'settings') return { value: rec.value === undefined ? null : rec.value };
  const x = JSON.parse(JSON.stringify(rec)); // Firestore takes no undefined values
  if (t === 'customers') x.balance = await customerBalance(d, rec.id);
  return x;
}

async function flush() {
  if (running) {
    again = true;
    return;
  }
  const c = cloud.value;
  if (c.role !== 'counter' || !counterKnown || claiming() || ['claim', 'moved', 'signedout', 'starting'].includes(c.status)) return;
  running = true;
  const d = realDb();
  try {
    for (;;) {
      const rows = await d.outbox.orderBy('seq').limit(300).toArray();
      const pending = await d.outbox.count();
      set({ pending });
      if (!rows.length && !beatDue) break;
      if (!navigator.onLine) {
        set({ status: 'offline' });
        break;
      }
      set({ status: 'sending' });
      const maxSeq = rows.length ? rows[rows.length - 1].seq : 0;
      const uniq = new Map();
      rows.forEach((r) => uniq.set(r.table + '|' + r.key, r));
      const docs = [];
      for (const r of uniq.values()) {
        const key = NUMBER_KEYS.has(r.table) ? Number(r.key) : r.key;
        const rec = await d.table(r.table).get(key);
        const keep = rec && !(r.table === 'bills' && rec.status === 'held');
        docs.push({ ref: doc(fs, SHOP, r.table, r.key), data: keep ? await toDoc(d, r.table, rec) : null });
      }
      const left = Math.max(0, pending - rows.length);
      await runTransaction(fs, async (tx) => {
        const m = await tx.get(metaRef());
        if (!m.exists() || m.data().device !== DEVICE) {
          const err = new Error('moved');
          err.code = 'moved';
          throw err;
        }
        docs.forEach(({ ref, data }) => (data ? tx.set(ref, data) : tx.delete(ref)));
        tx.set(metaRef(), { lastSync: serverTimestamp(), pending: left, label: LABEL }, { merge: true });
      });
      beatDue = false;
      if (rows.length) await d.outbox.where('seq').belowOrEqual(maxSeq).delete();
      set({ status: 'ok', msg: '', lastSync: Date.now(), pending: await d.outbox.count() });
      if (!rows.length) break;
    }
  } catch (e) {
    if (e && e.code === 'moved') {
      store('chhabra-counter-ok', null);
      set({ status: 'moved' });
    } else if (offlineError(e)) {
      set({ status: 'offline' });
      schedule(30000);
    } else {
      set({ status: 'error', msg: errText(e) });
      schedule(60000);
    }
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(300);
    }
  }
}

// ---------- reading (Shop live) ----------
// Calls back with the day's records from the cloud whenever they change. Returns a stop function.
export function watchDay(day, cb, onError) {
  const parts = { bills: [], ledger: [], rets: [], close: null, meta: null, openingCash: 0, ready: 0 };
  const emit = () => cb({ ...parts });
  const fail = (e) => onError && onError(errText(e));
  const byDay = (t, k) =>
    onSnapshot(query(collection(fs, SHOP, t), where('day', '==', day)), (s) => {
      parts[k] = s.docs.map((x) => x.data());
      parts.ready |= 1;
      emit();
    }, fail);
  const stops = [
    byDay('bills', 'bills'),
    byDay('ledger', 'ledger'),
    byDay('returns', 'rets'),
    onSnapshot(doc(fs, SHOP, 'closes', day), (s) => {
      parts.close = s.exists() ? s.data() : null;
      emit();
    }, fail),
    onSnapshot(metaRef(), (s) => {
      const m = s.exists() ? s.data() : null;
      parts.meta = m ? { label: m.label || '', lastSync: millis(m.lastSync), pending: m.pending || 0 } : null;
      emit();
    }, fail),
    onSnapshot(doc(fs, SHOP, 'settings', 'openingCash'), (s) => {
      parts.openingCash = s.exists() ? Number(s.data().value) || 0 : 0;
      emit();
    }, fail)
  ];
  return () => stops.forEach((f) => f());
}

export async function khataList() {
  const s = await getDocs(collection(fs, SHOP, 'customers'));
  return s.docs.map((x) => x.data());
}
