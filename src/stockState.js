// Stock data on this phone: a local copy of the cloud's moves, daily sales and items, kept up to
// date from the cloud a little at a time, so stock screens open at once and work offline.
import Dexie from 'dexie';
import { signal } from '@preact/signals';
import catalog from './catalog.json';
import { cloud, cloudApi } from './cloudState.js';
import { computeStock } from './stockCalc.js';
import { computeVendors, ratesByItem, vendorOfItem } from './vendorCalc.js';
import { dayKey } from './format.js';

export const CAT_HI = {
  'Atta & Flours': 'आटा', 'Rice': 'चावल', 'Dals & Pulses': 'दाल', 'Masala & Spices': 'मसाले', 'Oil & Ghee': 'तेल-घी',
  'Salt, Sugar & Jaggery': 'नमक-चीनी', 'Tea, Coffee & Health Drinks': 'चाय-कॉफ़ी', 'Breakfast & Spreads': 'नाश्ता',
  'Noodles, Sauces & Pickles': 'नूडल्स-अचार', 'Biscuits, Rusk & Cakes': 'बिस्कुट', 'Namkeen & Chips': 'नमकीन',
  'Chocolates & Sweets': 'चॉकलेट', 'Dairy, Bread & Eggs': 'दूध-ब्रेड', 'Cold Drinks & Water': 'कोल्ड ड्रिंक',
  'Frozen (Deep Freezer)': 'फ़्रीज़र', 'Dry Fruits': 'मेवे', 'Personal Care': 'साबुन-शैम्पू', 'Health & OTC': 'दवा-पट्टी',
  'Cleaning & Utility': 'सफ़ाई', 'Detergent & Laundry': 'डिटर्जेंट', 'Repellents & Pest Control': 'मच्छर-कीड़े',
  'Puja Samagri': 'पूजा', 'Disposables & Party': 'डिस्पोज़ेबल', 'Stationery': 'स्टेशनरी', 'Fresh (optional)': 'सब्ज़ी'
};
export const CATS = Object.keys(CAT_HI);
export const catLabel = (c) => (CAT_HI[c] ? CAT_HI[c] + ' · ' + c.split(/[ ,&(]/)[0] : c);

export const unit = (it) => (it && it.loose ? 'kg' : 'pcs');
export function qtyText(n, it) {
  const x = Math.round((Number(n) || 0) * 10) / 10;
  return x.toLocaleString('en-IN') + (it && it.loose ? ' kg' : '');
}

export const stockCat = signal(''); // the category chip picked on the stock screens
export const stockData = signal({
  ready: false, items: new Map(), st: new Map(), firstSaleDay: '', moves: [], error: '',
  vendors: [], vledger: [], V: new Map(), rates: new Map(), itemVendor: new Map()
});

let cache = null;
function db() {
  if (!cache) {
    cache = new Dexie('chhabra-cloudcache');
    cache.version(1).stores({ moves: 'id, sat, at, item', sales: 'day, sat', items: 'id, sat' });
    cache.version(2).stores({ vendors: 'id, sat', vledger: 'id, sat, vendor, day' });
  }
  return cache;
}

let started = false;
let timer = null;

export function ensureStock() {
  const c = cloud.value;
  if (started || !c.login || ['signedout', 'off'].includes(c.status)) return;
  started = true;
  recompute()
    .catch(() => {})
    .then(() => cloudApi())
    .then((m) => m.watchStock(onRemote, since))
    .catch((e) => {
      stockData.value = { ...stockData.value, error: 'क्लाउड से नहीं जुड़ा · Could not reach the cloud' };
      started = false;
    });
}

export function stopStock() {
  started = false;
}

// For the cloud listener: where each collection left off (by server time).
async function since() {
  const d = db();
  const last = async (t) => {
    const x = await d.table(t).orderBy('sat').last();
    return x && x.sat ? x.sat : 0;
  };
  return { moves: await last('moves'), sales: await last('sales'), items: await last('items'), vendors: await last('vendors'), vledger: await last('vledger') };
}

async function onRemote(part) {
  const d = db();
  try {
    await d.transaction('rw', [d.moves, d.sales, d.items, d.vendors, d.vledger], async () => {
      for (const t of ['moves', 'sales', 'items', 'vendors', 'vledger']) {
        if (part[t] && part[t].length) await d.table(t).bulkPut(part[t]);
      }
    });
  } catch (e) {
    stockData.value = { ...stockData.value, error: 'स्टॉक सेव नहीं हुआ · Could not save stock data on this phone' };
  }
  schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => recompute().catch(() => {}), 150);
}

export async function recompute() {
  const d = db();
  const [moves, sales, cloudItems, vendors, vledger] = await Promise.all([
    d.moves.toArray(), d.sales.toArray(), d.items.toArray(), d.vendors.toArray(), d.vledger.toArray()
  ]);
  const items = new Map(catalog.map((it) => [it.id, it]));
  for (const it of cloudItems) items.set(it.id, { ...(items.get(it.id) || {}), ...it });
  const today = dayKey();
  const { st, firstSaleDay } = computeStock({ items, moves, sales, today });
  vendors.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const V = computeVendors({ vendors, vledger, moves, today });
  stockData.value = {
    ready: true, items, st, firstSaleDay, moves, error: '',
    vendors, vledger, V, rates: ratesByItem(moves), itemVendor: vendorOfItem(vendors, moves)
  };
}

// Saves a stock move: on this phone at once, and to the cloud (queued if offline).
export async function saveMove(m) {
  const login = cloud.value.login || '';
  const move = {
    id: login + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    at: Date.now(),
    day: dayKey(),
    by: login,
    sat: 0,
    ...m
  };
  await db().moves.put(move);
  schedule();
  const api = await cloudApi();
  api.addMove(move).catch((e) => {
    stockData.value = { ...stockData.value, error: api.errText(e) };
  });
  return move;
}

export function findByCode(code) {
  const c = String(code);
  for (const it of stockData.value.items.values()) if ((it.barcodes || []).includes(c)) return it;
  return null;
}

const newId = () => (cloud.value.login || 'x') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

// A supplier: new (no id) or edited (the whole record is saved again).
export async function saveVendor(v) {
  const rec = { active: true, items: [], creditDays: 0, orderDay: -1, phone: '', ...v, id: v.id || newId(), by: cloud.value.login || '', at: Date.now(), sat: 0 };
  await db().vendors.put(rec);
  schedule();
  const api = await cloudApi();
  api.setVendor(rec).catch((e) => (stockData.value = { ...stockData.value, error: api.errText(e) }));
  return rec;
}

// One line in a supplier's khata. Never edited afterwards.
export async function saveVEntry(e) {
  const rec = { id: newId(), at: Date.now(), day: dayKey(), by: cloud.value.login || '', sat: 0, ...e };
  await db().vledger.put(rec);
  schedule();
  const api = await cloudApi();
  api.addVEntry(rec).catch((err) => (stockData.value = { ...stockData.value, error: api.errText(err) }));
  return rec;
}

// A bill photo, made small enough for the cloud (well under 1 MB).
export async function savePhoto(dataUrl, vendor) {
  const id = newId();
  const api = await cloudApi();
  api.addPhoto({ id, data: dataUrl, vendor, at: Date.now(), by: cloud.value.login || '' }).catch((err) => (stockData.value = { ...stockData.value, error: api.errText(err) }));
  return id;
}

export async function loadPhoto(id) {
  const api = await cloudApi();
  return api.getPhoto(id);
}

// Shrinks a camera photo: longest side 1280 px, JPEG, stepping quality down until it is under ~700 KB.
export async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let q = 0.7;
    let out = c.toDataURL('image/jpeg', q);
    while (out.length > 700000 && q > 0.3) {
      q -= 0.1;
      out = c.toDataURL('image/jpeg', q);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
