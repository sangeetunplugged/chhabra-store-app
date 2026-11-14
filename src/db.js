// Local database (IndexedDB through Dexie). Practice and real data live in two separate
// databases, so practice bills can never mix with the shop's real accounts.
import Dexie from 'dexie';
import { signal } from '@preact/signals';
import catalog from './catalog.json';
import { dayKey } from './format.js';

const PRACTICE_PRICES = {
  'milk-full-cream-toned-500-ml-pouch': 35,
  'bread-white-brown-400-g': 45,
  'eggs-tray-of-30': 7,
  'instant-noodles-single-1-pack': 14,
  'sugar-loose': 46,
  'wheat-atta-5-kg': 290,
  'mustard-oil-kachi-ghani-1-l-pouch-bottle': 180,
  'iodised-salt-1-kg': 28,
  'tea-leaf-250-g': 140,
  'arhar-toor-dal-1-kg': 165,
  'detergent-powder-500-g-1-kg': 135
};

const PRACTICE_CUSTOMERS = [
  { name: 'शर्मा जी', phone: '', opening: 480 },
  { name: 'गुप्ता आंटी', phone: '', opening: 120 },
  { name: 'राजू सब्ज़ी वाले', phone: '', opening: 65 },
  { name: 'मोहन लाल', phone: '', opening: 0 }
];

export const DEFAULTS = {
  shopName: 'Chhabra Store',
  shopNameHi: 'छाबड़ा स्टोर',
  address: 'Patel Nagar, Panipat',
  phone: '',
  upiId: '',
  upiName: 'Chhabra Store',
  printer: 'none', // none | bluetooth | rawbt | system
  autoPrint: true,
  pin: '',
  billNo: 0,
  openingCash: 0
};

// When the browser blocks storage (some preview frames do), the app runs on an in-memory
// database instead, and says so on screen.
let idbOptions = null;
export const memoryOnly = signal(false);
export function useMemoryDb(opts) {
  idbOptions = opts;
  memoryOnly.value = true;
}

function openDb(name, practice) {
  const db = idbOptions ? new Dexie(name, idbOptions) : new Dexie(name);
  db.version(1).stores({
    items: 'id, cat, quick, *barcodes',
    customers: '++id, name',
    ledger: '++id, customerId, day, billId',
    bills: '++id, day, status',
    returns: '++id, day',
    closes: 'day',
    settings: 'key'
  });
  db.on('populate', (tx) => {
    tx.table('items').bulkAdd(
      catalog.map((it) => (practice && PRACTICE_PRICES[it.id] ? { ...it, price: PRACTICE_PRICES[it.id] } : { ...it }))
    );
    if (practice) {
      const at = Date.now();
      const day = dayKey(new Date(at));
      tx.table('customers').bulkAdd(PRACTICE_CUSTOMERS.map((c, i) => ({ id: i + 1, name: c.name, phone: c.phone, at })));
      PRACTICE_CUSTOMERS.forEach((c, i) => {
        if (c.opening) {
          tx.table('ledger').add({ customerId: i + 1, type: 'opening', amount: c.opening, day, at, note: 'पुराना बाकी' });
        }
      });
    }
  });
  return db;
}

function readMode() {
  try {
    return localStorage.getItem('chhabra-mode') === 'real' ? 'real' : 'practice';
  } catch (e) {
    return 'practice';
  }
}

export const mode = signal(readMode());
const dbs = {};

export function db() {
  const m = mode.value;
  if (!dbs[m]) dbs[m] = openDb(m === 'real' ? 'chhabra-real' : 'chhabra-practice', m !== 'real');
  return dbs[m];
}

export function setMode(m) {
  try {
    localStorage.setItem('chhabra-mode', m);
  } catch (e) {
    /* storage blocked: mode lasts for this visit only */
  }
  mode.value = m;
}

export async function resetPractice() {
  if (dbs.practice) {
    dbs.practice.close();
    delete dbs.practice;
  }
  await Dexie.delete('chhabra-practice');
}

// ---------- settings ----------
export async function getSettings() {
  const rows = await db().settings.toArray();
  const s = { ...DEFAULTS };
  rows.forEach((r) => {
    s[r.key] = r.value;
  });
  return s;
}

export function setSettings(obj) {
  return db().settings.bulkPut(Object.entries(obj).map(([key, value]) => ({ key, value })));
}

// ---------- items ----------
export const allItems = () => db().items.toArray();
export const getItem = (id) => db().items.get(id);
export const findByBarcode = (code) => db().items.where('barcodes').equals(String(code)).first();
export const saveItem = (it) => db().items.put(it);
export const setPrice = (id, price) => db().items.update(id, { price });

export async function linkBarcode(id, code) {
  const it = await db().items.get(id);
  if (!it) return;
  const set = new Set(it.barcodes || []);
  set.add(String(code));
  await db().items.update(id, { barcodes: [...set] });
}

// ---------- bills ----------
export async function saveBill({ lines, total, pay }) {
  const d = db();
  return d.transaction('rw', d.bills, d.ledger, d.settings, async () => {
    const r = await d.settings.get('billNo');
    const no = (r ? r.value : 0) + 1;
    await d.settings.put({ key: 'billNo', value: no });
    const at = Date.now();
    const day = dayKey(new Date(at));
    const id = await d.bills.add({ no, at, day, lines, total, pay, status: 'done' });
    if (pay.udhaar > 0 && pay.customerId) {
      await d.ledger.add({ customerId: pay.customerId, type: 'udhaar', amount: pay.udhaar, billId: id, billNo: no, day, at });
    }
    return id;
  });
}

export const getBill = (id) => db().bills.get(id);

export function holdBill(lines, total) {
  const at = Date.now();
  return db().bills.add({ no: 0, at, day: dayKey(new Date(at)), lines, total, pay: null, status: 'held' });
}

export const heldBills = () => db().bills.where('status').equals('held').toArray();
export const dropHeld = (id) => db().bills.delete(id);

export async function cancelBill(id, reason) {
  const d = db();
  return d.transaction('rw', d.bills, d.ledger, async () => {
    const b = await d.bills.get(id);
    if (!b || b.status !== 'done') return;
    await d.bills.update(id, { status: 'cancelled', reason, cancelledAt: Date.now() });
    if (b.pay && b.pay.udhaar > 0 && b.pay.customerId) {
      await d.ledger.add({
        customerId: b.pay.customerId, type: 'cancel', amount: -b.pay.udhaar, billId: id, billNo: b.no,
        day: dayKey(), at: Date.now(), note: reason
      });
    }
  });
}

// ---------- khata ----------
export const allCustomers = () => db().customers.toArray();
export const getCustomer = (id) => db().customers.get(id);
export const customerLedger = (id) => db().ledger.where('customerId').equals(id).toArray();

export async function addCustomer(name, phone, opening) {
  const d = db();
  return d.transaction('rw', d.customers, d.ledger, async () => {
    const at = Date.now();
    const id = await d.customers.add({ name: name.trim(), phone: phone || '', at });
    if (opening > 0) {
      await d.ledger.add({ customerId: id, type: 'opening', amount: opening, day: dayKey(), at, note: 'पुराना बाकी' });
    }
    return id;
  });
}

export const updateCustomer = (id, patch) => db().customers.update(id, patch);

export function receivePayment(customerId, amount, payMode) {
  return db().ledger.add({ customerId, type: 'payment', amount: -amount, mode: payMode, day: dayKey(), at: Date.now() });
}

export function addUdhaar(customerId, amount, note) {
  return db().ledger.add({ customerId, type: 'manual', amount, day: dayKey(), at: Date.now(), note: note || '' });
}

export async function balances() {
  const all = await db().ledger.toArray();
  const m = {};
  all.forEach((e) => {
    m[e.customerId] = (m[e.customerId] || 0) + e.amount;
  });
  return m;
}

// ---------- returns ----------
export async function addReturn({ amount, refund, customerId, reason }) {
  const d = db();
  return d.transaction('rw', d.returns, d.ledger, async () => {
    const at = Date.now();
    const day = dayKey(new Date(at));
    await d.returns.add({ amount, refund, customerId: customerId || null, reason, day, at });
    if (refund === 'khata' && customerId) {
      await d.ledger.add({ customerId, type: 'return', amount: -amount, day, at, note: reason });
    }
  });
}

// ---------- day ----------
export async function daySummary(day) {
  const d = db();
  const bills = await d.bills.where('day').equals(day).toArray();
  const done = bills.filter((b) => b.status === 'done');
  const sum = (f) => done.reduce((a, b) => a + (f(b) || 0), 0);
  const led = await d.ledger.where('day').equals(day).toArray();
  const pays = led.filter((e) => e.type === 'payment');
  const rets = await d.returns.where('day').equals(day).toArray();
  const close = await d.closes.get(day);
  const s = await getSettings();
  const r = {
    bills: done.length,
    total: sum((b) => b.total),
    cash: sum((b) => b.pay.cash),
    upi: sum((b) => b.pay.upi),
    udhaar: sum((b) => b.pay.udhaar),
    khataCash: -pays.filter((p) => p.mode === 'cash').reduce((a, p) => a + p.amount, 0),
    khataUpi: -pays.filter((p) => p.mode === 'upi').reduce((a, p) => a + p.amount, 0),
    returnsCash: rets.filter((x) => x.refund === 'cash').reduce((a, x) => a + x.amount, 0),
    returnsKhata: rets.filter((x) => x.refund === 'khata').reduce((a, x) => a + x.amount, 0),
    cancelled: bills.filter((b) => b.status === 'cancelled').length,
    list: bills.filter((b) => b.status !== 'held').sort((a, b) => b.at - a.at),
    close,
    opening: close ? close.opening : Number(s.openingCash) || 0
  };
  r.expectedCash = r.opening + r.cash + r.khataCash - r.returnsCash;
  return r;
}

export function saveClose(rec) {
  return db().closes.put(rec);
}

// ---------- backup ----------
export async function exportAll() {
  const d = db();
  const out = { app: 'chhabra-store', version: 1, mode: mode.value, at: Date.now() };
  for (const t of d.tables) out[t.name] = await t.toArray();
  return out;
}

export async function importAll(data) {
  if (!data || data.app !== 'chhabra-store') throw new Error('not a Chhabra Store backup');
  const d = db();
  await d.transaction('rw', d.tables, async () => {
    for (const t of d.tables) {
      await t.clear();
      if (Array.isArray(data[t.name])) await t.bulkAdd(data[t.name]);
    }
  });
}
