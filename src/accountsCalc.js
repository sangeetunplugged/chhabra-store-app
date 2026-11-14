// Money maths for the owner view, on plain data, the same on every phone.
import { dayKey } from './format.js';
import { daysBetween } from './vendorCalc.js';
import { shiftDay } from './stockCalc.js';

export const GST_LIMIT = 2000000; // ₹20 lakh: the shop sells ice cream, so the services limit applies
export const EXP_CATS = {
  rent: ['किराया', 'Rent'],
  power: ['बिजली', 'Electricity'],
  salary: ['तनख्वाह', 'Salary'],
  transport: ['भाड़ा-हमाली', 'Transport and loading'],
  tea: ['चाय-नाश्ता', 'Tea and snacks'],
  repair: ['मरम्मत', 'Repairs'],
  other: ['दूसरा', 'Other']
};

const live = (list) => {
  const undone = new Set(list.filter((e) => e.kind === 'undo' && e.ref).map((e) => e.ref));
  return list.filter((e) => e.kind !== 'undo' && !undone.has(e.id));
};

export function fyStart(day) {
  const y = +day.slice(0, 4);
  const m = +day.slice(5, 7);
  return (m >= 4 ? y : y - 1) + '-04-01';
}
export const fyEnd = (day) => +fyStart(day).slice(0, 4) + 1 + '-03-31';

export function shiftMonth(month, n) {
  const d = new Date(month + '-15T12:00:00');
  d.setMonth(d.getMonth() + n);
  return dayKey(d).slice(0, 7);
}

// One month: sales and their split, cost of goods sold (from buy rates), profit, expenses, purchases.
// costs: Map itemId -> buy rate. Cost is known only for items with a buy rate; the margin on those is
// used to estimate profit on all sales, and the share it covers is shown with the numbers.
export function monthReport({ month, sales, costs, expenses = [], vledger = [] }) {
  const days = sales.filter((s) => s.day && s.day.startsWith(month)).sort((a, b) => (a.day < b.day ? -1 : 1));
  let total = 0;
  let cash = 0;
  let upi = 0;
  let udhaar = 0;
  let bills = 0;
  let costed = 0;
  let cogs = 0;
  const daily = [];
  for (const s of days) {
    const t = Number(s.total) || 0;
    total += t;
    cash += Number(s.cash) || 0;
    upi += Number(s.upi) || 0;
    udhaar += Number(s.udhaar) || 0;
    bills += Number(s.bills) || 0;
    daily.push({ day: s.day, total: t });
    for (const [id, q] of Object.entries(s.items || {})) {
      const c = costs.get(id);
      const rev = s.rev ? Number(s.rev[id]) || 0 : 0;
      if (c > 0 && rev > 0) {
        cogs += q * c;
        costed += rev;
      }
    }
  }
  const gross = costed - cogs;
  const marginPct = costed > 0 ? Math.round((gross / costed) * 1000) / 10 : null;
  const estGross = costed > 0 ? Math.round((total * gross) / costed) : null;
  const ex = live(expenses).filter((e) => e.day && e.day.startsWith(month));
  const byCat = {};
  for (const e of ex) byCat[e.cat] = (byCat[e.cat] || 0) + (Number(e.amount) || 0);
  const expTotal = Object.values(byCat).reduce((a, b) => a + b, 0);
  const vl = live(vledger).filter((e) => e.day && e.day.startsWith(month));
  const sumKind = (k) => vl.filter((e) => e.kind === k).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  return {
    month,
    total: Math.round(total), cash: Math.round(cash), upi: Math.round(upi), udhaar: Math.round(udhaar), bills,
    daily,
    cogs: Math.round(cogs), costed: Math.round(costed), coverage: total > 0 ? Math.round((costed / total) * 100) : 0,
    marginPct, estGross,
    byCat, expTotal, net: estGross == null ? null : estGross - expTotal,
    purchases: sumKind('bill'), paidVendors: sumKind('payment'),
    expenses: ex.sort((a, b) => b.at - a.at)
  };
}

// GST watch for the financial year (April to March): sales so far, including sales from before the
// app (typed by the owner), and where this year ends at the app's daily average.
export function gstWatch({ sales, today = dayKey(), preApp = 0 }) {
  const start = fyStart(today);
  const end = fyEnd(today);
  const inFy = sales.filter((s) => s.day >= start && s.day <= end && s.day <= today);
  const appTotal = inFy.reduce((a, s) => a + (Number(s.total) || 0), 0);
  const first = inFy.reduce((m, s) => (!m || s.day < m ? s.day : m), '');
  const total = appTotal + (Number(preApp) || 0);
  const daysWithData = first ? daysBetween(first, today) + 1 : 0;
  const perDay = daysWithData > 0 ? appTotal / daysWithData : 0;
  const left = Math.max(0, daysBetween(today, end));
  const projected = Math.round(total + perDay * left);
  const pct = Math.round((total / GST_LIMIT) * 100);
  const level = total >= GST_LIMIT ? 'over' : projected >= GST_LIMIT ? 'will' : pct >= 75 ? 'near' : 'ok';
  let crossDay = '';
  if (perDay > 0 && total < GST_LIMIT) {
    const d = shiftDay(today, Math.ceil((GST_LIMIT - total) / perDay));
    if (d <= end) crossDay = d;
  }
  return { start, end, appTotal: Math.round(appTotal), preApp: Number(preApp) || 0, total: Math.round(total), perDay: Math.round(perDay), projected, pct, level, first, crossDay, daysWithData };
}

// Who owes the shop and for how long, in 30-day groups. since = day of the oldest unpaid udhaar.
export const BUCKETS = [
  [0, 30, '0–30'],
  [31, 60, '31–60'],
  [61, 90, '61–90'],
  [91, Infinity, '90+']
];

export function udhaarAgeing(customers, today = dayKey()) {
  const rows = customers
    .filter((c) => (Number(c.balance) || 0) > 0)
    .map((c) => ({ c, age: c.since ? daysBetween(c.since, today) : null }))
    .sort((a, b) => (b.age ?? -1) - (a.age ?? -1) || b.c.balance - a.c.balance);
  const buckets = BUCKETS.map(([a, b, label]) => {
    const rs = rows.filter((r) => r.age != null && r.age >= a && r.age <= b);
    return { label, from: a, rows: rs, amount: rs.reduce((x, r) => x + r.c.balance, 0) };
  });
  const unknown = rows.filter((r) => r.age == null);
  return { rows, buckets, unknown, total: rows.reduce((x, r) => x + r.c.balance, 0) };
}
