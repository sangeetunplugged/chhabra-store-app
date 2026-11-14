// Stock maths on plain data, so every phone (and the tests) work out the same numbers.
//
// A move changes stock in the shop and/or at home:  { id, at, item, kind, d: { shop, home }, ... }
//   in      goods arrived (to home or straight to the shelf); may carry a buy rate and an expiry date
//   fill    from home to the shelf
//   out     taken out: return to vendor, damaged or expired, used at home
//   count   a counting: d is the correction, counted is the number found, loc is shop or home
//   clear   an expiry batch dealt with (no stock change)
//   undo    reverses an earlier move (ref)
// Sales come from the counter phone, one record per day: { day, items: { itemId: qty } }.
// Shop stock = all shop changes − everything sold; home stock = all home changes.
import { dayKey } from './format.js';

export const WALK = ['R1', 'R2', 'R3', 'R4', 'B1', 'B2', 'L2', 'L1', 'C', 'DF', 'CH', 'ST', 'FL'];
export const SHORT_LIFE = new Set(['Dairy, Bread & Eggs']); // expiry warning 2 days ahead, others 30

export function shiftDay(day, n) {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

const r3 = (x) => Math.round(x * 1000) / 1000;

export function computeStock({ items, moves, sales, today = dayKey() }) {
  const st = new Map();
  const get = (id) => {
    let s = st.get(id);
    if (!s) {
      s = { shop: 0, home: 0, countedShop: false, countedHome: false, homeMoves: false, cost: null, costAt: 0, lastIn: 0, lastCount: 0,
        sold7: 0, sold30: 0, sold60: 0, lastSale: '', batches: [], cleared: new Set(), history: [] };
      st.set(id, s);
    }
    return s;
  };
  const undone = new Set(moves.filter((m) => m.kind === 'undo' && m.ref).map((m) => m.ref));
  const sorted = moves.slice().sort((a, b) => a.at - b.at);
  for (const m of sorted) {
    if (!m.item) continue;
    const s = get(m.item);
    s.history.push(m);
    if (m.d) {
      s.shop += Number(m.d.shop) || 0;
      s.home += Number(m.d.home) || 0;
      if (m.d.home) s.homeMoves = true;
    }
    if (m.kind === 'count') {
      if (m.loc === 'home') s.countedHome = true;
      else s.countedShop = true;
      s.lastCount = Math.max(s.lastCount, m.at);
    }
    if (m.kind === 'in' && !undone.has(m.id)) {
      if (m.cost > 0 && m.at >= s.costAt) {
        s.cost = m.cost;
        s.costAt = m.at;
      }
      s.lastIn = Math.max(s.lastIn, m.at);
      if (m.expiry) s.batches.push({ id: m.id, expiry: m.expiry, qty: Number(m.qty) || 0, at: m.at });
    }
    if (m.kind === 'clear' && m.batch) s.cleared.add(m.batch);
  }
  const d7 = shiftDay(today, -6);
  const d30 = shiftDay(today, -29);
  const d60 = shiftDay(today, -59);
  let firstSaleDay = '';
  for (const day of sales) {
    if (!day || !day.day) continue;
    if (!firstSaleDay || day.day < firstSaleDay) firstSaleDay = day.day;
    for (const [id, q0] of Object.entries(day.items || {})) {
      const q = Number(q0) || 0;
      const s = get(id);
      s.shop -= q;
      if (day.day >= d7) s.sold7 += q;
      if (day.day >= d30) s.sold30 += q;
      if (day.day >= d60) s.sold60 += q;
      if (q > 0 && day.day > s.lastSale) s.lastSale = day.day;
    }
  }
  for (const [id, s] of st) {
    s.shop = r3(s.shop);
    s.home = r3(s.home);
    s.sold7 = r3(s.sold7);
    s.sold30 = r3(s.sold30);
    s.sold60 = r3(s.sold60);
    // first in, first out: what is left in stock belongs to the newest deliveries
    let left = Math.max(0, s.shop) + Math.max(0, s.home);
    s.batches.sort((a, b) => b.at - a.at);
    for (const b of s.batches) {
      b.left = Math.min(b.qty, left);
      left -= b.left;
    }
    const it = items.get(id);
    s.counted = s.countedShop || s.countedHome;
    s.knownHome = s.countedHome || s.homeMoves; // home stock is known once counted or once goods went there
    s.total = r3(s.shop + s.home);
    s.item = it;
  }
  return { st, firstSaleDay };
}

export const empty = () => ({ shop: 0, home: 0, countedShop: false, countedHome: false, homeMoves: false, knownHome: false, counted: false, total: 0, cost: null,
  sold7: 0, sold30: 0, sold60: 0, lastSale: '', batches: [], cleared: new Set(), history: [] });

const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

// The lists behind each tile. cat narrows to one category ('' = all).
export function lists({ items, st, today = dayKey(), cat = '' }) {
  const all = [...items.values()].filter((it) => it.active !== false && (!cat || it.cat === cat));
  const S = (it) => st.get(it.id) || empty();
  const walk = (it) => {
    const i = WALK.indexOf(it.rack);
    return i < 0 ? 99 : i;
  };

  const fill = all
    .map((it) => {
      const s = S(it);
      const target = Number(it.shopQty) || 0;
      if (!s.countedShop || target <= 0 || s.shop >= target) return null;
      const need = r3(target - Math.max(0, s.shop));
      const avail = s.knownHome ? Math.max(0, s.home) : null;
      const take = avail == null ? need : Math.min(need, avail);
      return { it, s, need, avail, take };
    })
    .filter(Boolean)
    .sort((a, b) => walk(a.it) - walk(b.it) || (b.avail > 0) - (a.avail > 0) || a.it.en.localeCompare(b.it.en));

  const order = all
    .map((it) => {
      const s = S(it);
      const target = (Number(it.shopQty) || 0) + (Number(it.homeQty) || 0);
      if (!(s.countedShop || s.knownHome) || target <= 0 || it.prio === 'Season') return null;
      const have = Math.max(0, s.shop) + Math.max(0, s.home);
      if (have > target / 2) return null;
      return { it, s, have, qty: Math.ceil(target - have) };
    })
    .filter(Boolean)
    .sort((a, b) => (a.it.cat || '').localeCompare(b.it.cat || '') || a.have / (a.have + a.qty) - b.have / (b.have + b.qty));

  const expiry = [];
  for (const it of all) {
    const s = S(it);
    const warn = SHORT_LIFE.has(it.cat) ? 2 : 30;
    for (const b of s.batches) {
      if (!(b.left > 0) || s.cleared.has(b.id)) continue;
      const days = daysBetween(today, b.expiry);
      if (days <= warn) expiry.push({ it, s, batch: b, days });
    }
  }
  expiry.sort((a, b) => a.days - b.days);

  const hot = (n) =>
    all
      .map((it) => ({ it, s: S(it), sold: n === 7 ? S(it).sold7 : S(it).sold30 }))
      .filter((x) => x.sold > 0)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 20);

  const slow = (n) =>
    all
      .map((it) => ({ it, s: S(it) }))
      .filter(({ it, s }) => s.counted && s.total > 0 && it.prio !== 'Season' && (n === 30 ? s.sold30 : s.sold60) <= 0)
      .sort((a, b) => b.s.total - a.s.total);

  const uncounted = all.filter((it) => !S(it).countedShop).length;
  return { all, fill, order, expiry, hot7: hot(7), hot30: hot(30), slow30: slow(30), slow60: slow(60), uncounted };
}

// Money view of one category (or the whole shop).
export function summary(all, st) {
  let value = 0;
  let noRate = 0;
  let sold = 0;
  let soldCost = 0;
  let margin = 0;
  for (const it of all) {
    const s = st.get(it.id);
    if (!s) continue;
    const have = Math.max(0, s.shop) + Math.max(0, s.home);
    if (s.cost > 0) value += have * s.cost;
    else if (have > 0) noRate++;
    if (it.price > 0 && s.sold30 > 0) {
      sold += s.sold30 * it.price;
      if (s.cost > 0) {
        soldCost += s.sold30 * s.cost;
        margin += s.sold30 * (it.price - s.cost);
      }
    }
  }
  const perDay = soldCost / 30;
  return { value: Math.round(value), noRate, sold: Math.round(sold), marginPct: sold > 0 && soldCost > 0 ? Math.round((margin / (soldCost + margin)) * 100) : null, daysLeft: perDay > 0 ? Math.round(value / perDay) : null };
}
