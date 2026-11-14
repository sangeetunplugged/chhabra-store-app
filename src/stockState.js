// Stock data on this phone: a local copy of the cloud's moves, daily sales and items, kept up to
// date from the cloud a little at a time, so stock screens open at once and work offline.
import Dexie from 'dexie';
import { signal } from '@preact/signals';
import catalog from './catalog.json';
import { cloud, cloudApi } from './cloudState.js';
import { computeStock } from './stockCalc.js';
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
export const stockData = signal({ ready: false, items: new Map(), st: new Map(), firstSaleDay: '', moves: [], error: '' });

let cache = null;
function db() {
  if (!cache) {
    cache = new Dexie('chhabra-cloudcache');
    cache.version(1).stores({ moves: 'id, sat, at, item', sales: 'day, sat', items: 'id, sat' });
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
  return { moves: await last('moves'), sales: await last('sales'), items: await last('items') };
}

async function onRemote(part) {
  const d = db();
  try {
    await d.transaction('rw', d.moves, d.sales, d.items, async () => {
      if (part.moves && part.moves.length) await d.moves.bulkPut(part.moves);
      if (part.sales && part.sales.length) await d.sales.bulkPut(part.sales);
      if (part.items && part.items.length) await d.items.bulkPut(part.items);
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
  const [moves, sales, cloudItems] = await Promise.all([d.moves.toArray(), d.sales.toArray(), d.items.toArray()]);
  const items = new Map(catalog.map((it) => [it.id, it]));
  for (const it of cloudItems) items.set(it.id, { ...(items.get(it.id) || {}), ...it });
  const { st, firstSaleDay } = computeStock({ items, moves, sales, today: dayKey() });
  stockData.value = { ready: true, items, st, firstSaleDay, moves, error: '' };
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
