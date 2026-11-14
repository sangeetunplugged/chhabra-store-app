// Suppliers (Phase 2 part 2): who supplies what, a khata per supplier (purchase bills with a photo,
// payments, returns), what is due when, buy rates, and the order list sent to each supplier.
import { useEffect, useState } from 'preact/hooks';
import { go, say } from '../store.js';
import { stockData, saveVendor, saveVEntry, savePhoto, loadPhoto, shrinkPhoto } from '../stockState.js';
import { lists, shiftDay } from '../stockCalc.js';
import { DUE_SOON } from '../vendorCalc.js';
import { Icon, TopBar, Empty, Sheet, Keypad } from '../ui.jsx';
import { searchItems } from './Bill.jsx';
import { typed, toInt, money, dateText, timeText, dayKey, showName } from '../format.js';
import { beep, openWhatsApp } from '../printing.js';
import { useStock, NeedCloud, canEdit } from './Stock.jsx';
import { cloud } from '../cloudState.js';

export const DAYS = ['रवि · Sun', 'सोम · Mon', 'मंगल · Tue', 'बुध · Wed', 'गुरु · Thu', 'शुक्र · Fri', 'शनि · Sat'];
const CREDIT = [[0, 'नकद · Cash'], [7, '7 दिन'], [15, '15 दिन'], [30, '30 दिन']];
const MODES = [['galla', 'गल्ले से · From the galla'], ['cash', 'नकद, बाहर से · Other cash'], ['upi', 'UPI'], ['bank', 'बैंक · Bank']];
const KIND = {
  opening: ['पुराना बाकी', 'Old balance'],
  bill: ['माल का बिल', 'Purchase bill'],
  payment: ['पैसे दिए', 'Paid'],
  return: ['वापसी', 'Return'],
  undo: ['वापस लिया', 'Undone']
};
const dueText = (days) => (days < 0 ? -days + ' दिन ऊपर · ' + -days + ' days late' : days === 0 ? 'आज · today' : days + ' दिन में · in ' + days + ' days');
const day12 = (d) => dateText(d + 'T12:00:00');

function orderText(v, rows) {
  const out = ['छाबड़ा स्टोर · Chhabra Store · ' + dateText(Date.now()), (v ? v.name + ' ji, ' : '') + 'यह माल भेज दें · Please send:', ''];
  rows.forEach((r) => out.push('- ' + showName(r.it) + ' (' + r.it.en + (r.it.pack ? ' ' + r.it.pack : '') + ') × ' + r.qty));
  return out.join('\n');
}

// ---------------- all suppliers ----------------
export function Vendors() {
  const { on, sd } = useStock();
  if (!on) return <NeedCloud title="सप्लायर" />;
  if (!sd.ready) return <main class="screen" />;
  const edit = canEdit();
  const list = sd.vendors.filter((v) => v.active !== false);
  const xs = list.map((v) => sd.V.get(v.id)).filter(Boolean);
  const total = xs.reduce((a, x) => a + Math.max(0, x.owed), 0);
  const dueNow = xs.reduce((a, x) => a + x.dueNow, 0);
  const overdue = xs.reduce((a, x) => a + x.overdue, 0);
  const dues = xs
    .flatMap((x) => x.unpaid.filter((b) => b.days <= DUE_SOON).map((b) => ({ x, b })))
    .sort((a, b) => a.b.days - b.b.days);
  const wd = new Date().getDay();
  const orderToday = list.filter((v) => v.orderDay === wd);

  return (
    <main class="screen">
      <TopBar title="सप्लायर" sub="Vendors · what the shop owes" onBack={() => go('stock')} right={null} />
      {edit && (
        <div class="top-action">
          <button type="button" class="btn primary" onClick={() => go('vendorEdit', {})}><b>+ नया सप्लायर</b><small>New vendor</small></button>
        </div>
      )}
      <div class="sum-card">
        <div class="sum-row total"><span>कुल देना · Total owed</span><b>{money(total)}</b></div>
        <div class="sum-row"><span class="brown">{DUE_SOON} दिन में देना · Due in {DUE_SOON} days</span><b>{money(dueNow)}</b></div>
        {overdue > 0 && <div class="sum-row"><span class="red-text">तारीख निकल गई · Overdue</span><b class="red-text">{money(overdue)}</b></div>}
      </div>
      {orderToday.length > 0 && (
        <p class="cloud-line wait">
          <Icon name="chat" size={20} />
          <span><b>आज ऑर्डर का दिन</b> · Order day today: {orderToday.map((v) => v.name).join(', ')}</span>
        </p>
      )}
      {dues.length > 0 && (
        <>
          <h2 class="section-title">देना है · Payments due</h2>
          <div class="entries">
            {dues.map(({ x, b }) => (
              <button type="button" key={b.id} class="entry tap" onClick={() => go('vendor', { id: x.v.id })}>
                <span class="two">
                  <b>{x.v.name}</b>
                  <small class={b.days < 0 ? 'red-text' : ''}>{dueText(b.days)} · {day12(b.dueDay)}{b.billNo ? ' · bill ' + b.billNo : ''}</small>
                </span>
                <b>{money(b.left)}</b>
              </button>
            ))}
          </div>
        </>
      )}
      <h2 class="section-title">सारे सप्लायर · All vendors</h2>
      <div class="entries">
        {list.length === 0 && <Empty hi="अभी कोई सप्लायर नहीं" en="No vendors yet: add the first one" />}
        {xs.map((x) => (
          <button type="button" key={x.v.id} class="entry tap" onClick={() => go('vendor', { id: x.v.id })}>
            <span class="two">
              <b>{x.v.name}</b>
              <small>{x.v.phone || 'फ़ोन नहीं · no phone'}{x.nextDue ? ' · next due ' + day12(x.nextDue) : ''}{x.v.orderDay >= 0 ? ' · order ' + DAYS[x.v.orderDay].split(' · ')[1] : ''}</small>
            </span>
            <span class="end">
              <small>{x.owed >= 0 ? 'देना · owe' : 'जमा · advance'}</small>
              <b class={x.owed > 0 ? 'brown' : 'green-text'}>{money(Math.abs(x.owed))}</b>
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}

// ---------------- one supplier ----------------
export function Vendor({ id }) {
  const { on, sd } = useStock();
  const [sheet, setSheet] = useState('');
  const [photo, setPhoto] = useState(null);
  if (!on) return <NeedCloud title="सप्लायर" />;
  const v = sd.vendors.find((x) => x.id === id);
  if (!sd.ready || !v) return <main class="screen" />;
  const x = sd.V.get(id);
  const edit = canEdit();
  const undone = new Set(sd.vledger.filter((e) => e.kind === 'undo').map((e) => e.ref));
  const items = [...sd.itemVendor.entries()].filter(([, vid]) => vid === id).map(([iid]) => sd.items.get(iid)).filter(Boolean);
  const toOrder = lists({ items: sd.items, st: sd.st }).order.filter((r) => sd.itemVendor.get(r.it.id) === id);
  const entries = x.entries.slice().sort((a, b) => b.at - a.at).slice(0, 40);

  async function undo(e) {
    await saveVEntry({ vendor: id, kind: 'undo', amount: 0, ref: e.id });
    say('वापस लिया · Undone');
  }

  return (
    <main class="screen pad-screen">
      <TopBar title={v.name} sub={(v.phone || 'no phone') + ' · ' + (v.creditDays ? v.creditDays + ' days credit' : 'cash') + (v.orderDay >= 0 ? ' · order ' + DAYS[v.orderDay] : '')} onBack={() => go('vendors')} right={null} />
      <div class="stock-big one">
        <div>
          <small>{x.owed >= 0 ? 'देना है · Shop owes' : 'जमा है · Paid in advance'}</small>
          <b class={x.owed > 0 ? 'brown' : 'green-text'}>{money(Math.abs(x.owed))}</b>
          <small>{x.dueNow > 0 ? DUE_SOON + ' दिन में · due soon ' + money(x.dueNow) : 'अभी कुछ देय नहीं · nothing due now'}</small>
        </div>
      </div>
      {edit && (
        <div class="stock-actions">
          <button type="button" class="btn primary" onClick={() => setSheet('bill')}><b>माल का बिल</b><small>Purchase bill</small></button>
          <button type="button" class="btn green" onClick={() => setSheet('payment')}><b>पैसे दिए</b><small>Paid</small></button>
          <button type="button" class="btn outline" onClick={() => setSheet('return')}><b>वापसी</b><small>Return</small></button>
          <button type="button" class="btn outline" onClick={() => setSheet('order')}><b>ऑर्डर भेजें</b><small>Send order{toOrder.length ? ' · ' + toOrder.length : ''}</small></button>
        </div>
      )}
      <div class="split-row">
        {v.phone && <a class="btn outline" href={'tel:' + v.phone}><Icon name="user" size={20} /><b>कॉल · Call</b></a>}
        {v.phone && <button type="button" class="btn outline green-text" onClick={() => openWhatsApp('', v.phone)}><Icon name="chat" size={20} /><b>WhatsApp</b></button>}
      </div>
      {x.unpaid.length > 0 && (
        <>
          <h2 class="section-title">बाकी बिल · Unpaid bills</h2>
          <div class="entries tight">
            {x.unpaid.map((b) => (
              <div key={b.id} class="entry">
                <span class="two">
                  <b>{b.kind === 'opening' ? 'पुराना बाकी · Old balance' : 'बिल · Bill ' + (b.billNo || '') + ' · ' + day12(b.day)}</b>
                  <small class={b.days < 0 ? 'red-text' : b.days <= DUE_SOON ? 'brown' : ''}>{dueText(b.days)} · {day12(b.dueDay)}</small>
                </span>
                <b>{money(b.left)}</b>
              </div>
            ))}
          </div>
        </>
      )}
      <h2 class="section-title">खाता · Khata</h2>
      <div class="entries tight">
        {entries.length === 0 && <Empty hi="अभी कोई हिसाब नहीं" en="No entries yet" />}
        {entries.map((e) => (
          <div key={e.id} class={'entry' + (undone.has(e.id) ? ' cancelled' : '')}>
            <span class="two">
              <b>{(KIND[e.kind] || [e.kind, ''])[0]} · {(KIND[e.kind] || ['', e.kind])[1]}{e.kind === 'bill' && e.billNo ? ' ' + e.billNo : ''}</b>
              <small>
                {day12(e.day)} · {timeText(e.at)}
                {e.mode ? ' · ' + (MODES.find((m) => m[0] === e.mode) || ['', e.mode])[1] : ''}
                {e.note ? ' · ' + e.note : ''}
                {e.sat ? '' : ' · ☁ बाकी'}
              </small>
            </span>
            {e.photo && (
              <button type="button" class="icon-btn" aria-label="बिल की फ़ोटो · Bill photo" onClick={() => setPhoto(e.photo)}><Icon name="photo" /></button>
            )}
            {e.kind !== 'undo' && <b class={e.kind === 'payment' || e.kind === 'return' ? 'green-text' : 'brown'}>{e.kind === 'payment' || e.kind === 'return' ? '− ' : '+ '}{money(e.amount)}</b>}
            {edit && e.kind !== 'undo' && !undone.has(e.id) && e.by === cloud.value.login && Date.now() - e.at < 86400000 && (
              <button type="button" class="btn small-btn" onClick={() => undo(e)}>वापस</button>
            )}
          </div>
        ))}
      </div>
      <h2 class="section-title">इनसे आता है · Supplies {items.length ? '· ' + items.length : ''}</h2>
      <div class="entries tight">
        {items.length === 0 && <Empty hi="अभी कोई सामान नहीं जुड़ा" en="No items yet: add them in Edit, or pick this vendor on goods in" />}
        {items.map((it) => {
          const r = sd.rates.get(it.id);
          const mine = r && r.get(id);
          const best = r ? Math.min(...[...r.values()].map((y) => y.cost)) : 0;
          return (
            <button type="button" key={it.id} class="entry tap" onClick={() => go('stockItem', { id: it.id })}>
              <span class="two"><b>{showName(it)} {it.pack ? <em>{it.pack}</em> : null}</b><small>{it.en}</small></span>
              <b>{mine ? money(mine.cost) + (mine.cost <= best ? ' ✓' : '') : '—'}</b>
            </button>
          );
        })}
      </div>
      {edit && (
        <button type="button" class="btn outline" onClick={() => go('vendorEdit', { id })}><b>बदलें</b><small>Edit vendor, credit days, order day, items</small></button>
      )}
      {sheet === 'order' && (
        <Sheet onClose={() => setSheet('')} label="ऑर्डर · Order">
          <div class="sheet-head">
            <div>
              <h2>ऑर्डर: {v.name}</h2>
              <p class="muted">{toOrder.length ? 'Items from this vendor that are running low' : 'Nothing from this vendor is running low right now'}</p>
            </div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setSheet('')}><Icon name="x" /></button>
          </div>
          <div class="entries tight">
            {toOrder.map((r) => (
              <div key={r.it.id} class="entry">
                <span class="two"><b>{showName(r.it)} {r.it.pack || ''}</b><small>बचा · left {r.have}</small></span>
                <b>× {r.qty}</b>
              </div>
            ))}
          </div>
          <button type="button" class="btn green big" disabled={!toOrder.length} onClick={() => openWhatsApp(orderText(v, toOrder), v.phone)}>
            <b>WhatsApp पर भेजें</b><small>Send to {v.name}</small>
          </button>
        </Sheet>
      )}
      {['bill', 'payment', 'return'].includes(sheet) && <VEntrySheet v={v} kind={sheet} onClose={() => setSheet('')} />}
      {photo && <PhotoSheet id={photo} onClose={() => setPhoto(null)} />}
    </main>
  );
}

function PhotoSheet({ id, onClose }) {
  const [src, setSrc] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    loadPhoto(id).then((d) => (d ? setSrc(d) : setErr('फ़ोटो नहीं मिली · Photo not found'))).catch(() => setErr('फ़ोटो नहीं खुली · Could not open the photo'));
  }, [id]);
  return (
    <Sheet onClose={onClose} label="बिल की फ़ोटो · Bill photo">
      <div class="sheet-head">
        <div><h2>बिल की फ़ोटो</h2><p class="muted">Bill photo</p></div>
        <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      {src ? <img class="bill-photo" src={src} alt="बिल · Bill" /> : <p class="note center">{err || 'लोड हो रहा है · Loading…'}</p>}
    </Sheet>
  );
}

// Purchase bill, payment or return: amount on the big pad plus the few details each needs.
function VEntrySheet({ v, kind, onClose }) {
  const [amt, setAmt] = useState('');
  const [billNo, setBillNo] = useState('');
  const [billDay, setBillDay] = useState(dayKey());
  const [credit, setCredit] = useState(Number(v.creditDays) || 0);
  const [mode, setMode] = useState('galla');
  const [note, setNote] = useState('');
  const [pic, setPic] = useState('');
  const [busy, setBusy] = useState(false);
  const n = toInt(amt);
  const T = { bill: ['माल का बिल', 'Purchase bill: total amount'], payment: ['पैसे दिए', 'Paid to the vendor'], return: ['वापसी', 'Goods returned: their value'] }[kind];

  async function onFile(e) {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    if (!f) return;
    try {
      setPic(await shrinkPhoto(f));
    } catch (err) {
      say('फ़ोटो नहीं खुली · The photo did not open');
    }
  }
  async function save() {
    if (n <= 0 || busy) return;
    setBusy(true);
    if (kind === 'bill') {
      const photo = pic ? await savePhoto(pic, v.id) : '';
      await saveVEntry({ vendor: v.id, kind: 'bill', amount: n, billNo: billNo.trim(), day: billDay, due: shiftDay(billDay, credit), note: note.trim(), ...(photo ? { photo } : {}) });
      say('बिल जुड़ा · Bill added: ' + money(n));
    } else if (kind === 'payment') {
      await saveVEntry({ vendor: v.id, kind: 'payment', amount: n, mode, note: note.trim() });
      say('पैसे दिए · Paid ' + money(n));
    } else {
      await saveVEntry({ vendor: v.id, kind: 'return', amount: n, note: note.trim() });
      say('वापसी जुड़ी · Return added ' + money(n));
    }
    beep();
    onClose();
  }

  return (
    <Sheet onClose={onClose} label={T[0]}>
      <div class="sheet-head">
        <div><h2>{T[0]}: {v.name}</h2><p class="muted">{T[1]}</p></div>
        <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div class="amount-box">{money(n)}</div>
      <Keypad onKey={(k) => setAmt(typed(amt, k))} compact />
      {kind === 'bill' && (
        <>
          <div class="split-row">
            <label class="field small">
              <span>बिल नंबर · Bill no.</span>
              <input value={billNo} onInput={(e) => setBillNo(e.currentTarget.value)} />
            </label>
            <label class="field small">
              <span>बिल की तारीख · Bill date</span>
              <input type="date" value={billDay} onInput={(e) => setBillDay(e.currentTarget.value || dayKey())} />
            </label>
          </div>
          <p class="muted small">कब देना है · Pay within</p>
          <div class="chooser" role="group" aria-label="उधार के दिन · Credit days">
            {CREDIT.map(([d, label]) => (
              <button type="button" key={d} class={credit === d ? 'on' : ''} aria-pressed={credit === d} onClick={() => setCredit(d)}>{label}</button>
            ))}
          </div>
          <label class="btn outline photo-btn">
            <Icon name="photo" size={22} />
            <b>{pic ? 'फ़ोटो बदलें · Change photo' : 'बिल की फ़ोटो · Photo of the bill'}</b>
            <input type="file" accept="image/*" capture="environment" onChange={onFile} aria-label="बिल की फ़ोटो · Photo of the bill" />
          </label>
          {pic && <img class="bill-photo small" src={pic} alt="बिल · Bill" />}
        </>
      )}
      {kind === 'payment' && (
        <div class="chooser wrap half" role="group" aria-label="कैसे दिए · Paid how">
          {MODES.map(([m, label]) => (
            <button type="button" key={m} class={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{label}</button>
          ))}
        </div>
      )}
      <label class="field small">
        <span>नोट (अगर कुछ) · Note, if any</span>
        <input value={note} onInput={(e) => setNote(e.currentTarget.value)} />
      </label>
      <button type="button" class="btn primary big" disabled={n <= 0 || busy} onClick={save}><b>सेव करें</b><small>Save</small></button>
    </Sheet>
  );
}

// ---------------- add or edit a supplier ----------------
export function VendorEdit({ id }) {
  const { on, sd } = useStock();
  const [f, setF] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (f || (id && !sd.ready)) return;
    const v0 = id ? sd.vendors.find((x) => x.id === id) : null;
    setF(v0 ? { ...v0, items: [...(v0.items || [])], opening: '' } : { name: '', phone: '', creditDays: 7, orderDay: -1, items: [], opening: '' });
  }, [sd.ready]);
  if (!on) return <NeedCloud title="सप्लायर" />;
  if (!f) return <main class="screen" />;
  const set = (k) => (val) => setF({ ...f, [k]: val });
  const chosen = f.items.map((iid) => sd.items.get(iid)).filter(Boolean);
  const found = q ? searchItems([...sd.items.values()].filter((it) => it.active !== false && !f.items.includes(it.id)), q).slice(0, 8) : [];

  async function save() {
    const name = f.name.trim();
    if (!name) {
      say('नाम लिखें · Type the name');
      return;
    }
    setBusy(true);
    const { opening, ...rest } = f;
    const rec = await saveVendor({ ...rest, name, phone: (f.phone || '').replace(/\D/g, '').slice(-10) });
    if (!id && toInt(opening) > 0) await saveVEntry({ vendor: rec.id, kind: 'opening', amount: toInt(opening), day: dayKey(), due: dayKey(), note: 'पुराना बाकी' });
    beep();
    say('सेव हुआ · Saved');
    go('vendor', { id: rec.id });
  }

  return (
    <main class="screen pad-screen">
      <TopBar title={id ? 'सप्लायर बदलें' : 'नया सप्लायर'} sub={id ? 'Edit vendor' : 'New vendor'} onBack={() => (id ? go('vendor', { id }) : go('vendors'))} right={null} />
      <label class="field">
        <span>नाम · Name (firm or person)</span>
        <input value={f.name} onInput={(e) => set('name')(e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>फ़ोन (WhatsApp) · Phone</span>
        <input value={f.phone} inputMode="numeric" maxLength={14} onInput={(e) => set('phone')(e.currentTarget.value)} />
      </label>
      <p class="muted small">उधार कितने दिन · Credit days</p>
      <div class="chooser" role="group">
        {CREDIT.map(([d, label]) => (
          <button type="button" key={d} class={f.creditDays === d ? 'on' : ''} aria-pressed={f.creditDays === d} onClick={() => set('creditDays')(d)}>{label}</button>
        ))}
      </div>
      <p class="muted small">ऑर्डर का दिन · Order day</p>
      <div class="chooser wrap half" role="group">
        <button type="button" class={f.orderDay < 0 ? 'on' : ''} onClick={() => set('orderDay')(-1)}>कोई नहीं · None</button>
        {DAYS.map((d, i) => (
          <button type="button" key={i} class={f.orderDay === i ? 'on' : ''} aria-pressed={f.orderDay === i} onClick={() => set('orderDay')(i)}>{d}</button>
        ))}
      </div>
      {!id && (
        <label class="field">
          <span>पुराना बाकी (अगर है) · Old balance the shop owes, if any</span>
          <input value={f.opening} inputMode="numeric" onInput={(e) => set('opening')(e.currentTarget.value.replace(/\D/g, ''))} />
        </label>
      )}
      <h2 class="section-title">इनसे आता है · Items they supply</h2>
      <div class="search-row flush">
        <label class="search">
          <Icon name="search" size={22} />
          <input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="सामान जोड़ें · Add an item" aria-label="सामान खोजें · Search items" />
        </label>
      </div>
      {found.map((it) => (
        <button type="button" key={it.id} class="item-row" onClick={() => { setF({ ...f, items: [...f.items, it.id] }); setQ(''); }}>
          <span class="two"><b>+ {showName(it)} {it.pack ? <em>{it.pack}</em> : null}</b><small>{it.en}</small></span>
        </button>
      ))}
      <div class="chips-list">
        {chosen.map((it) => (
          <button type="button" key={it.id} class="chip" aria-label={'हटाएं ' + showName(it)} onClick={() => setF({ ...f, items: f.items.filter((x) => x !== it.id) })}>
            {showName(it)} {it.pack || ''} ✕
          </button>
        ))}
      </div>
      {id && (
        <label class="check">
          <input type="checkbox" checked={f.active === false} onChange={(e) => set('active')(!e.currentTarget.checked)} />
          <span class="two"><b>अब इनसे माल नहीं लेते</b><small>No longer buying from this vendor (hides it)</small></span>
        </label>
      )}
      <button type="button" class="btn primary big" disabled={busy} onClick={save}><b>सेव करें</b><small>Save</small></button>
    </main>
  );
}
