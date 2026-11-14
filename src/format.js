// Small helpers for money, weights, dates and bill maths.

export const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

export function grams(g) {
  const n = Math.round(Number(g) || 0);
  if (n >= 1000) {
    const kg = Math.round(n / 10) / 100;
    return kg.toLocaleString('en-IN') + ' kg';
  }
  return n + ' g';
}

const z = (n) => String(n).padStart(2, '0');

export function dayKey(d = new Date()) {
  const t = d instanceof Date ? d : new Date(d);
  return t.getFullYear() + '-' + z(t.getMonth() + 1) + '-' + z(t.getDate());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function timeText(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  return ((h + 11) % 12) + 1 + ':' + z(d.getMinutes()) + (h < 12 ? ' AM' : ' PM');
}

export function dateText(ts) {
  const d = new Date(ts);
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

export function dateTimeText(ts) {
  return dateText(ts) + ', ' + timeText(ts);
}

// A bill line is one of:
//   packed: { itemId, en, hi, pack, price, qty }
//   loose:  { itemId, en, hi, loose: true, grams, amount, perKg }
//   quick:  { quick: true, amount } (amount only, typed in a rush)
export const lineTotal = (l) => (l.loose || l.quick ? Number(l.amount) || 0 : (Number(l.price) || 0) * (Number(l.qty) || 0));

export const billTotal = (lines) => lines.reduce((a, l) => a + lineTotal(l), 0);

export const itemCount = (lines) => lines.reduce((a, l) => a + (l.loose || l.quick ? 1 : l.qty), 0);

export const showName = (it) => it.hi || it.en;

export function lineName(l) {
  if (l.quick) return 'सिर्फ़ रकम';
  return (l.hi || l.en) + (l.pack ? ' ' + l.pack : '');
}

export function lineNameEn(l) {
  if (l.quick) return 'Sale';
  return l.en + (l.pack ? ' ' + l.pack : '');
}

export function lineSub(l) {
  if (l.quick) return 'भीड़ में · Rush sale';
  if (l.loose) return grams(l.grams) + ' · ' + money(l.perKg) + ' / kg';
  return money(l.price) + ' × ' + l.qty;
}

// Keypad entry: digits only, no leading zeros, at most 7 digits.
export function typed(cur, key) {
  const s = cur || '';
  if (key === 'del') return s.slice(0, -1);
  if (key === 'clear') return '';
  const next = (s + key).replace(/^0+(?=\d)/, '');
  return next.length > 7 ? s : next;
}

export const toInt = (s) => parseInt(s || '0', 10) || 0;

export function phone10(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}
