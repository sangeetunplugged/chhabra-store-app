// Local database (IndexedDB through Dexie). Practice and real data live in two separate
// databases, so practice bills can never mix with the shop's real accounts.
// Every change to the real database also writes a row to an outbox in the same step. The cloud
// module (cloud.js) uploads the outbox when the counter phone is signed in and online, so nothing
// is lost if the app closes or the internet is down. Practice data never goes to the cloud.
import Dexie from 'dexie';
import { signal } from '@preact/signals';
import catalog from './catalog.json';
import { dayKey, lineTotal } from './format.js';

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
  ownerPhone: '', // Rajan's WhatsApp, for the day-close summary
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
  db.version(2).stores({ outbox: '++seq' });
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

function dbFor(m) {
  if (!dbs[m]) dbs[m] = openDb(m === 'real' ? 'chhabra-real' : 'chhabra-practice', m !== 'real');
  return dbs[m];
}

export function db() {
  return dbFor(mode.value);
}

export const realDb = () => dbFor('real');

const otherMode = () => (mode.value === 'real' ? 'practice' : 'real');

export function setMode(m) {
  try {
    localStorage.setItem('chhabra-mode', m);
  } catch (e) {
    /* storage blocked: mode lasts for this visit only */
  }
  mode.value = m;
}

// ---------- sync outbox (real data only) ----------
export const SYNC_TABLES = ['settings', 'items', 'customers', 'ledger', 'bills', 'returns', 'closes'];
export const NUMBER_KEYS = new Set(['customers', 'ledger', 'bills', 'returns']);
const isReal = (d) => d.name === 'chhabra-real';
let notify = () => {};
export function onOutbox(fn) {
  notify = fn;
}

// Call inside a transaction that includes d.outbox.
function mark(d, table, keys) {
  if (!isReal(d)) return Promise.resolve();
  const at = Date.now();
  const rows = keys.filter((k) => k !== null && k !== undefined).map((key) => ({ table, key: String(key), at }));
  if (!rows.length) return Promise.resolve();
  setTimeout(() => notify(), 300);
  return d.outbox.bulkAdd(rows);
}

// Queue every real record for upload (first sign-in of the counter phone, or after a file restore).
export async function markAll() {
  const d = realDb();
  await d.transaction('rw', [...SYNC_TABLES.map((t) => d.table(t)), d.outbox], async () => {
    await d.outbox.clear();
    for (const t of SYNC_TABLES) {
      const keys = t === 'bills'
        ? (await d.bills.toArray()).filter((b) => b.status !== 'held').map((b) => b.id)
        : await d.table(t).toCollection().primaryKeys();
      await mark(d, t, keys);
    }
    await mark(d, 'sales', await saleDays(d));
  });
}

// ---------- daily sales per item (for stock) ----------
async function saleDays(d) {
  const days = new Set();
  await d.bills.each((b) => {
    if (b.status === 'done') days.add(b.day);
  });
  return [...days];
}

export async function markSalesDays() {
  const d = realDb();
  await d.transaction('rw', d.bills, d.outbox, async () => {
    await mark(d, 'sales', await saleDays(d));
  });
}

// One day's sales for the cloud: what each item sold (packs by count, loose items in kg) and earned,
// and the day's totals. Amount-only lines have no item; they count in the totals as "quick".
export async function salesDoc(d, day) {
  const bills = await d.bills.where('day').equals(day).toArray();
  const items = {};
  const rev = {};
  const r = (x) => Math.round(x * 1000) / 1000;
  let n = 0;
  let total = 0;
  let cash = 0;
  let upi = 0;
  let udhaar = 0;
  let quick = 0;
  for (const b of bills) {
    if (b.status !== 'done') continue;
    n++;
    total += Number(b.total) || 0;
    cash += (b.pay && b.pay.cash) || 0;
    upi += (b.pay && b.pay.upi) || 0;
    udhaar += (b.pay && b.pay.udhaar) || 0;
    for (const l of b.lines || []) {
      if (l.quick || !l.itemId) {
        quick += lineTotal(l);
        continue;
      }
      const q = l.loose ? (Number(l.grams) || 0) / 1000 : Number(l.qty) || 0;
      items[l.itemId] = r((items[l.itemId] || 0) + q);
      rev[l.itemId] = r((rev[l.itemId] || 0) + lineTotal(l));
    }
  }
  return { day, items, rev, bills: n, total, cash, upi, udhaar, quick };
}

// How old a customer's udhaar is: payments clear the oldest udhaar first; "since" is the day of the
// oldest udhaar still unpaid, "lastPay" the day of the last payment.
export async function customerAgeing(d, id) {
  const all = (await d.ledger.where('customerId').equals(id).toArray()).sort((a, b) => a.at - b.at);
  const debits = [];
  let credit = 0;
  let lastPay = '';
  for (const e of all) {
    if (e.amount > 0) debits.push({ day: e.day, left: e.amount });
    else {
      credit += -e.amount;
      if (e.type === 'payment' && e.day > lastPay) lastPay = e.day;
    }
  }
  for (const x of debits) {
    const t = Math.min(x.left, credit);
    x.left -= t;
    credit -= t;
  }
  const open = debits.find((x) => x.left > 0);
  return { since: open ? open.day : '', lastPay };
}

// One-time: send every sales day and customer again (for the totals and ageing added in Phase 3).
export async function markForPhase3() {
  const d = realDb();
  await d.transaction('rw', d.bills, d.customers, d.outbox, async () => {
    await mark(d, 'sales', await saleDays(d));
    await mark(d, 'customers', await d.customers.toCollection().primaryKeys());
  });
}

// Replace the real data with a copy from the cloud (a new counter phone). Nothing is queued:
// the cloud already has it.
export async function replaceReal(data) {
  const d = realDb();
  await d.transaction('rw', [...SYNC_TABLES.map((t) => d.table(t)), d.outbox], async () => {
    for (const t of SYNC_TABLES) {
      await d.table(t).clear();
      if (Array.isArray(data[t]) && data[t].length) await d.table(t).bulkAdd(data[t]);
    }
    await d.outbox.clear();
  });
  try {
    await carryOver('real', 'practice');
  } catch (e) {
    /* practice keeps its own setup */
  }
}

export async function customerBalance(d, id) {
  const all = await d.ledger.where('customerId').equals(id).toArray();
  return all.reduce((a, e) => a + e.amount, 0);
}

// ---------- shared setup between modes ----------
// Shop setup is shared by both modes: set it once, in either mode, and it holds in both.
// Barcodes learned in practice count in real too. Bills, khata, prices and the bill number stay apart.
const SHARED = ['shopName', 'shopNameHi', 'address', 'phone', 'ownerPhone', 'upiId', 'upiName', 'printer', 'autoPrint'];

async function addBarcodes(d, id, codes, drop = []) {
  await d.transaction('rw', d.items, d.outbox, async () => {
    const it = await d.items.get(id);
    if (!it) return;
    const set = new Set(it.barcodes || []);
    const before = [...set].join('|');
    codes.forEach((c) => set.add(String(c)));
    drop.forEach((c) => set.delete(String(c)));
    if ([...set].join('|') !== before) {
      await d.items.update(id, { barcodes: [...set] });
      await mark(d, 'items', [id]);
    }
  });
}

// Copies the shop setup and learned barcodes from one mode's database to the other's.
// Covers anything set before both databases existed, or before sharing was added.
async function carryOver(from, to) {
  const src = dbFor(from);
  const dst = dbFor(to);
  const rows = (await src.settings.toArray()).filter((r) => SHARED.includes(r.key));
  const srcItems = await src.items.toArray();
  await dst.transaction('rw', dst.settings, dst.items, dst.outbox, async () => {
    const have = new Map((await dst.settings.toArray()).map((r) => [r.key, JSON.stringify(r.value)]));
    const newRows = rows.filter((r) => have.get(r.key) !== JSON.stringify(r.value));
    if (newRows.length) {
      await dst.settings.bulkPut(newRows);
      await mark(dst, 'settings', newRows.map((r) => r.key));
    }
    const target = new Map((await dst.items.toArray()).map((x) => [x.id, x]));
    const changed = [];
    srcItems.forEach((it) => {
      const t = target.get(it.id);
      if (!t || !(it.barcodes && it.barcodes.length)) return;
      const set = new Set(t.barcodes || []);
      const n = set.size;
      it.barcodes.forEach((c) => set.add(c));
      if (set.size !== n) changed.push({ ...t, barcodes: [...set] });
    });
    if (changed.length) {
      await dst.items.bulkPut(changed);
      await mark(dst, 'items', changed.map((c) => c.id));
    }
  });
}

export async function switchMode(m) {
  if (m === mode.value) return;
  try {
    await carryOver(mode.value, m);
  } catch (e) {
    /* the switch still works; the setup can be entered again */
  }
  setMode(m);
}

export async function resetPractice() {
  await dbFor('practice').delete();
  delete dbs.practice;
  try {
    await carryOver('real', 'practice');
  } catch (e) {
    /* practice starts with the default setup */
  }
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

function putSettings(d, rows) {
  return d.transaction('rw', d.settings, d.outbox, async () => {
    await d.settings.bulkPut(rows);
    await mark(d, 'settings', rows.map((r) => r.key));
  });
}

export async function setSettings(obj) {
  const rows = Object.entries(obj).map(([key, value]) => ({ key, value }));
  await putSettings(db(), rows);
  const shared = rows.filter((r) => SHARED.includes(r.key));
  if (shared.length) await putSettings(dbFor(otherMode()), shared);
}

// ---------- items ----------
export const allItems = () => db().items.toArray();
export const getItem = (id) => db().items.get(id);
export const findByBarcode = (code) => db().items.where('barcodes').equals(String(code)).first();

export async function setPrice(id, price) {
  const d = db();
  await d.transaction('rw', d.items, d.outbox, async () => {
    await d.items.update(id, { price });
    await mark(d, 'items', [id]);
  });
}

export async function saveItem(it) {
  const d = db();
  let removed = [];
  await d.transaction('rw', d.items, d.outbox, async () => {
    const before = await d.items.get(it.id);
    await d.items.put(it);
    await mark(d, 'items', [it.id]);
    const now = new Set(it.barcodes || []);
    removed = ((before && before.barcodes) || []).filter((c) => !now.has(c));
  });
  await addBarcodes(dbFor(otherMode()), it.id, it.barcodes || [], removed);
}

export async function linkBarcode(id, code) {
  await addBarcodes(db(), id, [code]);
  await addBarcodes(dbFor(otherMode()), id, [code]);
}

// ---------- bills ----------
export async function saveBill({ lines, total, pay }) {
  const d = db();
  return d.transaction('rw', d.bills, d.ledger, d.settings, d.outbox, async () => {
    const r = await d.settings.get('billNo');
    const no = (r ? r.value : 0) + 1;
    await d.settings.put({ key: 'billNo', value: no });
    const at = Date.now();
    const day = dayKey(new Date(at));
    const id = await d.bills.add({ no, at, day, lines, total, pay, status: 'done' });
    await mark(d, 'bills', [id]);
    await mark(d, 'settings', ['billNo']);
    await mark(d, 'sales', [day]);
    if (pay.udhaar > 0 && pay.customerId) {
      const lid = await d.ledger.add({ customerId: pay.customerId, type: 'udhaar', amount: pay.udhaar, billId: id, billNo: no, day, at });
      await mark(d, 'ledger', [lid]);
      await mark(d, 'customers', [pay.customerId]);
    }
    return id;
  });
}

export const getBill = (id) => db().bills.get(id);

// Held bills stay on this phone only: they are not sales yet.
export function holdBill(lines, total) {
  const at = Date.now();
  return db().bills.add({ no: 0, at, day: dayKey(new Date(at)), lines, total, pay: null, status: 'held' });
}

export const heldBills = () => db().bills.where('status').equals('held').toArray();
export const dropHeld = (id) => db().bills.delete(id);

export async function cancelBill(id, reason) {
  const d = db();
  return d.transaction('rw', d.bills, d.ledger, d.outbox, async () => {
    const b = await d.bills.get(id);
    if (!b || b.status !== 'done') return;
    await d.bills.update(id, { status: 'cancelled', reason, cancelledAt: Date.now() });
    await mark(d, 'bills', [id]);
    await mark(d, 'sales', [b.day]);
    if (b.pay && b.pay.udhaar > 0 && b.pay.customerId) {
      const lid = await d.ledger.add({
        customerId: b.pay.customerId, type: 'cancel', amount: -b.pay.udhaar, billId: id, billNo: b.no,
        day: dayKey(), at: Date.now(), note: reason
      });
      await mark(d, 'ledger', [lid]);
      await mark(d, 'customers', [b.pay.customerId]);
    }
  });
}

// ---------- khata ----------
export const allCustomers = () => db().customers.toArray();
export const getCustomer = (id) => db().customers.get(id);
export const customerLedger = (id) => db().ledger.where('customerId').equals(id).toArray();

export async function addCustomer(name, phone, opening) {
  const d = db();
  return d.transaction('rw', d.customers, d.ledger, d.outbox, async () => {
    const at = Date.now();
    const id = await d.customers.add({ name: name.trim(), phone: phone || '', at });
    await mark(d, 'customers', [id]);
    if (opening > 0) {
      const lid = await d.ledger.add({ customerId: id, type: 'opening', amount: opening, day: dayKey(), at, note: 'पुराना बाकी' });
      await mark(d, 'ledger', [lid]);
    }
    return id;
  });
}

export async function updateCustomer(id, patch) {
  const d = db();
  await d.transaction('rw', d.customers, d.outbox, async () => {
    await d.customers.update(id, patch);
    await mark(d, 'customers', [id]);
  });
}

function addLedger(entry) {
  const d = db();
  return d.transaction('rw', d.ledger, d.outbox, async () => {
    const lid = await d.ledger.add(entry);
    await mark(d, 'ledger', [lid]);
    await mark(d, 'customers', [entry.customerId]);
    return lid;
  });
}

export function receivePayment(customerId, amount, payMode) {
  return addLedger({ customerId, type: 'payment', amount: -amount, mode: payMode, day: dayKey(), at: Date.now() });
}

export function addUdhaar(customerId, amount, note) {
  return addLedger({ customerId, type: 'manual', amount, day: dayKey(), at: Date.now(), note: note || '' });
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
  return d.transaction('rw', d.returns, d.ledger, d.outbox, async () => {
    const at = Date.now();
    const day = dayKey(new Date(at));
    const rid = await d.returns.add({ amount, refund, customerId: customerId || null, reason, day, at });
    await mark(d, 'returns', [rid]);
    if (refund === 'khata' && customerId) {
      const lid = await d.ledger.add({ customerId, type: 'return', amount: -amount, day, at, note: reason });
      await mark(d, 'ledger', [lid]);
      await mark(d, 'customers', [customerId]);
    }
  });
}

// ---------- day ----------
// Works on any set of records, local or from the cloud.
export function summarize({ bills, ledger, rets, close, openingCash }) {
  const done = bills.filter((b) => b.status === 'done');
  const sum = (f) => done.reduce((a, b) => a + (f(b) || 0), 0);
  const pays = ledger.filter((e) => e.type === 'payment');
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
    close: close || undefined,
    opening: close ? close.opening : Number(openingCash) || 0
  };
  r.expectedCash = r.opening + r.cash + r.khataCash - r.returnsCash;
  return r;
}

export async function daySummary(day) {
  const d = db();
  const bills = await d.bills.where('day').equals(day).toArray();
  const ledger = await d.ledger.where('day').equals(day).toArray();
  const rets = await d.returns.where('day').equals(day).toArray();
  const close = await d.closes.get(day);
  const s = await getSettings();
  return summarize({ bills, ledger, rets, close, openingCash: s.openingCash });
}

export async function saveClose(rec) {
  const d = db();
  await d.transaction('rw', d.closes, d.outbox, async () => {
    await d.closes.put(rec);
    await mark(d, 'closes', [rec.day]);
  });
}

// ---------- backup ----------
export async function exportAll() {
  const d = db();
  const out = { app: 'chhabra-store', version: 1, mode: mode.value, at: Date.now() };
  for (const t of d.tables) if (t.name !== 'outbox') out[t.name] = await t.toArray();
  return out;
}

// A backup goes back into the mode it came from, so a real backup restored on a new
// phone (which starts in practice) lands in the real accounts, and the app switches there.
export async function importAll(data) {
  if (!data || data.app !== 'chhabra-store') throw new Error('not a Chhabra Store backup');
  const target = data.mode === 'real' || data.mode === 'practice' ? data.mode : mode.value;
  const d = dbFor(target);
  const tables = d.tables.filter((t) => t.name !== 'outbox');
  await d.transaction('rw', tables, async () => {
    for (const t of tables) {
      await t.clear();
      if (Array.isArray(data[t.name])) await t.bulkAdd(data[t.name]);
    }
  });
  if (target === 'real') await markAll();
  try {
    await carryOver(target, target === 'real' ? 'practice' : 'real');
  } catch (e) {
    /* the restored mode is complete on its own */
  }
  setMode(target);
  return target;
}
