// Supplier maths on plain data, the same on every phone.
// vendors: [{ id, name, phone, creditDays, orderDay, items: [itemId], active }]
// vledger (supplier khata), entries are never edited, a mistake is undone with a new entry:
//   { id, vendor, kind: 'opening' | 'bill' | 'payment' | 'return' | 'undo', amount, at, day, due, billNo, photo, mode, ref }
// Payments and returns settle the oldest bills first, so "due" is what is still unpaid on each bill.
import { dayKey } from './format.js';

export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
export const DUE_SOON = 3; // days

export function computeVendors({ vendors, vledger, moves, today = dayKey() }) {
  const V = new Map();
  for (const v of vendors) {
    V.set(v.id, { v, owed: 0, advance: 0, bills: [], entries: [], lastBuy: 0, dueNow: 0, overdue: 0, nextDue: '', unpaid: [] });
  }
  const undone = new Set(vledger.filter((e) => e.kind === 'undo' && e.ref).map((e) => e.ref));
  const paid = new Map();
  for (const e of vledger.slice().sort((a, b) => a.at - b.at)) {
    const x = V.get(e.vendor);
    if (!x) continue;
    x.entries.push(e);
    if (e.kind === 'undo' || undone.has(e.id)) continue;
    const a = Number(e.amount) || 0;
    if (e.kind === 'bill' || e.kind === 'opening') {
      x.owed += a;
      x.bills.push({ ...e, left: a, dueDay: e.due || e.day });
    } else if (e.kind === 'payment' || e.kind === 'return') {
      x.owed -= a;
      paid.set(e.vendor, (paid.get(e.vendor) || 0) + a);
    }
  }
  for (const [id, x] of V) {
    let p = paid.get(id) || 0;
    x.bills.sort((a, b) => (a.dueDay < b.dueDay ? -1 : a.dueDay > b.dueDay ? 1 : a.at - b.at));
    for (const b of x.bills) {
      const take = Math.min(b.left, p);
      b.left -= take;
      p -= take;
    }
    x.advance = Math.max(0, p);
    x.owed = Math.round(x.owed);
    for (const b of x.bills) {
      if (b.left <= 0) continue;
      const days = daysBetween(today, b.dueDay);
      const row = { ...b, days };
      x.unpaid.push(row);
      if (days < 0) x.overdue += b.left;
      if (days <= DUE_SOON) x.dueNow += b.left;
      if (!x.nextDue || b.dueDay < x.nextDue) x.nextDue = b.dueDay;
    }
  }
  for (const m of moves) {
    if (m.kind === 'in' && m.vendor && V.has(m.vendor)) {
      const x = V.get(m.vendor);
      x.lastBuy = Math.max(x.lastBuy, m.at);
    }
  }
  return V;
}

// item -> Map(vendor -> { vendor, cost, at }): the latest buy rate from each supplier
export function ratesByItem(moves) {
  const undone = new Set(moves.filter((m) => m.kind === 'undo' && m.ref).map((m) => m.ref));
  const R = new Map();
  for (const m of moves) {
    if (m.kind !== 'in' || !(m.cost > 0) || undone.has(m.id)) continue;
    let r = R.get(m.item);
    if (!r) R.set(m.item, (r = new Map()));
    const key = m.vendor || '';
    const cur = r.get(key);
    if (!cur || m.at > cur.at) r.set(key, { vendor: m.vendor || '', cost: m.cost, at: m.at });
  }
  return R;
}

// item -> vendor id: the supplier's own list wins, otherwise whoever delivered it last
export function vendorOfItem(vendors, moves) {
  const M = new Map();
  const last = new Map();
  for (const m of moves) {
    if (m.kind === 'in' && m.vendor) {
      const p = last.get(m.item);
      if (!p || m.at > p.at) last.set(m.item, m);
    }
  }
  for (const [item, m] of last) M.set(item, m.vendor);
  for (const v of vendors) if (v.active !== false) for (const id of v.items || []) M.set(id, v.id);
  return M;
}

// Cash paid to suppliers from the shop's cash drawer (galla) on one day: lowers the cash expected there.
export function gallaPaid(vledger, day) {
  const undone = new Set(vledger.filter((e) => e.kind === 'undo' && e.ref).map((e) => e.ref));
  return vledger
    .filter((e) => e.kind === 'payment' && e.mode === 'galla' && e.day === day && !undone.has(e.id))
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);
}
