// Printing (58 mm thermal, ESC/POS), WhatsApp bills, UPI links and the confirm beep.
import { money, lineTotal, lineNameEn, grams, dateText, timeText, dateTimeText } from './format.js';

const ESC = 0x1b;
const GS = 0x1d;
const WIDTH = 32; // characters per line on 58 mm paper

// Printers print plain ASCII here; ₹ becomes Rs. and Hindi is left out.
function ascii(str) {
  return String(str || '')
    .replace(/₹/g, 'Rs.')
    .replace(/[×]/g, 'x')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function wrap(text) {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const rows = [];
  let cur = '';
  words.forEach((w) => {
    const piece = w.length > WIDTH ? w.slice(0, WIDTH) : w;
    if (!cur) cur = piece;
    else if ((cur + ' ' + piece).length <= WIDTH) cur += ' ' + piece;
    else {
      rows.push(cur);
      cur = piece;
    }
  });
  if (cur) rows.push(cur);
  return rows.slice(0, 3);
}

export function receiptLines(bill, st, extra = {}) {
  const out = [];
  const lr = (l, r) => {
    const right = ascii(r);
    const left = ascii(l).slice(0, Math.max(0, WIDTH - right.length - 1));
    out.push({ t: left + ' '.repeat(Math.max(1, WIDTH - left.length - right.length)) + right });
  };
  const rule = () => out.push({ t: '-'.repeat(WIDTH) });
  out.push({ t: ascii(st.shopName).toUpperCase(), center: true, bold: true, big: true });
  if (st.address) out.push({ t: ascii(st.address), center: true });
  if (st.phone) out.push({ t: 'Ph ' + ascii(st.phone), center: true });
  rule();
  lr('Bill ' + bill.no, dateText(bill.at));
  lr('', timeText(bill.at));
  rule();
  bill.lines.forEach((l) => {
    wrap(lineNameEn(l)).forEach((t) => out.push({ t }));
    const q = l.quick ? '' : l.loose ? '  ' + grams(l.grams) : '  ' + l.qty + ' x ' + l.price;
    lr(q, String(lineTotal(l)));
  });
  rule();
  out.push({ t: (() => { const r = 'Rs.' + bill.total; return 'TOTAL' + ' '.repeat(Math.max(1, WIDTH - 5 - r.length)) + r; })(), bold: true });
  const p = bill.pay || {};
  if (p.cash) lr('Cash', 'Rs.' + p.cash);
  if (p.given && p.change) lr('  Given Rs.' + p.given, 'Change Rs.' + p.change);
  if (p.upi) lr('UPI', 'Rs.' + p.upi);
  const who = ascii(extra.customer || '');
  if (p.udhaar) lr('Khata' + (who ? ': ' + who : ''), 'Rs.' + p.udhaar);
  rule();
  out.push({ t: 'Thank you, visit again', center: true });
  return out;
}

export function receiptBytes(bill, st, extra) {
  const b = [ESC, 0x40];
  receiptLines(bill, st, extra).forEach((ln) => {
    b.push(ESC, 0x61, ln.center ? 1 : 0);
    b.push(ESC, 0x45, ln.bold ? 1 : 0);
    b.push(GS, 0x21, ln.big ? 0x01 : 0x00);
    for (const ch of ln.t) b.push(ch.charCodeAt(0));
    b.push(0x0a);
  });
  b.push(ESC, 0x61, 0, GS, 0x21, 0, 0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00);
  return new Uint8Array(b);
}

function toBase64(bytes) {
  let s = '';
  bytes.forEach((x) => {
    s += String.fromCharCode(x);
  });
  return btoa(s);
}

// ---- Bluetooth (BLE printers, straight from Chrome) ----
const BT_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455'
];
let bt = null;

async function btWritable(server) {
  for (const uuid of BT_SERVICES) {
    try {
      const svc = await server.getPrimaryService(uuid);
      const chars = await svc.getCharacteristics();
      const c = chars.find((ch) => ch.properties.writeWithoutResponse || ch.properties.write);
      if (c) return c;
    } catch (e) {
      /* try the next service */
    }
  }
  return null;
}

async function btConnect() {
  if (!navigator.bluetooth) throw new Error('यह फ़ोन ब्लूटूथ प्रिंट नहीं करता · Bluetooth printing not supported here');
  let dev = null;
  if (navigator.bluetooth.getDevices) {
    const known = await navigator.bluetooth.getDevices();
    dev = known[0] || null;
  }
  if (!dev) dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
  const server = await dev.gatt.connect();
  const ch = await btWritable(server);
  if (!ch) throw new Error('प्रिंटर नहीं जुड़ा · Printer not supported');
  bt = { dev, ch };
}

export async function btPair() {
  bt = null;
  if (!navigator.bluetooth) throw new Error('यह फ़ोन ब्लूटूथ प्रिंट नहीं करता · Bluetooth printing not supported here');
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
  const server = await dev.gatt.connect();
  const ch = await btWritable(server);
  if (!ch) throw new Error('प्रिंटर नहीं जुड़ा · Printer not supported');
  bt = { dev, ch };
  return dev.name || 'Printer';
}

async function btPrint(bytes) {
  if (!bt || !bt.dev.gatt.connected) await btConnect();
  for (let i = 0; i < bytes.length; i += 180) {
    const chunk = bytes.slice(i, i + 180);
    if (bt.ch.properties.writeWithoutResponse) await bt.ch.writeValueWithoutResponse(chunk);
    else await bt.ch.writeValue(chunk);
  }
}

// ---- RawBT app (any Bluetooth/USB printer through the RawBT Android app) ----
function rawbtPrint(bytes) {
  const b64 = toBase64(bytes);
  window.location.href = 'intent:base64,' + b64 + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
}

// ---- Phone's own print screen (works with any installed print service) ----
function systemPrint(bill, st, extra) {
  const rows = receiptLines(bill, st, extra)
    .map((l) => `<div style="${l.center ? 'text-align:center;' : ''}${l.bold ? 'font-weight:700;' : ''}${l.big ? 'font-size:15px;' : ''}">${l.t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/ /g, '&nbsp;')}</div>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:58mm auto;margin:2mm}body{margin:0;font:12px/1.35 monospace}</style></head><body>${rows}</body></html>`;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(f);
  f.srcdoc = html;
  f.onload = () => {
    try {
      f.contentWindow.focus();
      f.contentWindow.print();
    } finally {
      setTimeout(() => f.remove(), 60000);
    }
  };
}

export async function printBill(bill, st, extra) {
  const bytes = receiptBytes(bill, st, extra);
  if (st.printer === 'bluetooth') return btPrint(bytes);
  if (st.printer === 'rawbt') return rawbtPrint(bytes);
  if (st.printer === 'system') return systemPrint(bill, st, extra);
  throw new Error('प्रिंटर सेट नहीं है · No printer set up yet');
}

export function testBill() {
  return {
    no: 0, at: Date.now(), total: 10, pay: { cash: 10 },
    lines: [{ en: 'Test print', pack: '', price: 10, qty: 1 }]
  };
}

// ---- WhatsApp ----
export function billText(bill, st, extra = {}) {
  const rows = bill.lines.map((l) => {
    const q = l.quick ? '' : l.loose ? ' ' + grams(l.grams) : ' ' + l.qty + ' × ' + money(l.price);
    return '• ' + lineNameEn(l) + q + ' = ' + money(lineTotal(l));
  });
  const p = bill.pay || {};
  const paid = [p.cash ? 'Cash ' + money(p.cash) : '', p.upi ? 'UPI ' + money(p.upi) : '', p.udhaar ? 'Khata ' + money(p.udhaar) : '']
    .filter(Boolean)
    .join(' + ');
  const due = extra.balance != null ? '\nखाते में कुल बाकी · Total due: ' + money(extra.balance) : '';
  return (
    '*' + st.shopName + '*' + (st.address ? ' · ' + st.address : '') + '\n' +
    'Bill ' + bill.no + ' · ' + dateTimeText(bill.at) + '\n\n' +
    rows.join('\n') + '\n\n' +
    '*Total ' + money(bill.total) + '*\n' +
    (paid ? 'Paid: ' + paid : '') + due + '\n\nधन्यवाद · Thank you'
  );
}

export function reminderText(name, amount, st) {
  return (
    'नमस्ते ' + name + ', ' + st.shopNameHi + ' में आपका बाकी ' + money(amount) + ' है।\n' +
    'Your due at ' + st.shopName + ' is ' + money(amount) + '.\n— ' + st.shopName + (st.address ? ', ' + st.address : '')
  );
}

export function openWhatsApp(text, phone) {
  const d = String(phone || '').replace(/\D/g, '');
  const to = d.length >= 10 ? '91' + d.slice(-10) : '';
  window.open('https://wa.me/' + to + '?text=' + encodeURIComponent(text), '_blank');
}

// ---- UPI ----
export function upiLink(st, amount, note) {
  return (
    'upi://pay?pa=' + encodeURIComponent(st.upiId.trim()) +
    '&pn=' + encodeURIComponent(st.upiName || st.shopName) +
    '&am=' + (Math.round(amount * 100) / 100).toFixed(2) +
    '&cu=INR&tn=' + encodeURIComponent(note)
  );
}

// ---- confirm sound ----
let audio = null;
export function beep(ok = true) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    const t = audio.currentTime;
    const notes = ok ? [880, 1320] : [300];
    notes.forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.18);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.2);
    });
  } catch (e) {
    /* sound is a nice-to-have */
  }
}
