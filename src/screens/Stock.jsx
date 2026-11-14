// Stock (Phase 2): shop and home counts, goods in and out, filling shelves, counting, and the lists
// that tell the family what to refill, order, sell first or stop buying. Hindi on top, English below.
import { useEffect, useState } from 'preact/hooks';
import { go, say } from '../store.js';
import { cloud } from '../cloudState.js';
import { stockData, stockCat, ensureStock, saveMove, saveVEntry, findByCode, CATS, catLabel, qtyText, unit } from '../stockState.js';
import { DUE_SOON } from '../vendorCalc.js';
import { lists, summary, empty, WALK } from '../stockCalc.js';
import { Icon, TopBar, Empty, Sheet, Keypad, Scanner } from '../ui.jsx';
import { searchItems } from './Bill.jsx';
import { typed, toInt, money, dateText, timeText, dayKey, showName } from '../format.js';
import { RACKS, rackText } from '../racks.js';
import { beep, openWhatsApp } from '../printing.js';

const signedIn = () => !!cloud.value.login && !['signedout', 'off'].includes(cloud.value.status);
export const canEdit = () => ['stock', 'counter'].includes(cloud.value.role);
const REASONS = {
  vendor: ['वापस सप्लायर को', 'Return to vendor'],
  expired: ['खराब / एक्सपायर', 'Damaged or expired'],
  home: ['घर में इस्तेमाल', 'Used at home']
};
const KIND = {
  in: ['माल आया', 'In'],
  fill: ['शेल्फ भरा', 'Filled shelf'],
  out: ['माल बाहर', 'Out'],
  count: ['गिनती', 'Count'],
  clear: ['एक्सपायरी देखी', 'Expiry handled'],
  undo: ['वापस लिया', 'Undone']
};

export function useStock() {
  const on = signedIn();
  useEffect(() => {
    if (on) ensureStock();
  }, [on]);
  return { on, sd: stockData.value };
}

export function NeedCloud({ title }) {
  return (
    <main class="screen pad-screen">
      <TopBar title={title || 'स्टॉक'} sub="Stock" onBack={() => go('home')} right={null} />
      <p class="lead">स्टॉक की गिनती क्लाउड से चलती है · Stock counts work through the cloud.</p>
      <p class="note">मालिक की सेटिंग → क्लाउड में लॉगिन करें · Sign in under owner settings → Cloud.</p>
      <button type="button" class="btn outline" onClick={() => go('find')}><b>सामान कहां रखा है</b><small>Where is it kept?</small></button>
    </main>
  );
}

function SearchBar({ q, setQ, onScan, placeholder }) {
  return (
    <div class="search-row">
      <label class="search">
        <Icon name="search" size={22} />
        <input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder={placeholder || 'खोजें · Search or scan'} aria-label="सामान खोजें · Search items" />
        {q && (
          <button type="button" class="clear" aria-label="साफ़ करें · Clear" onClick={() => setQ('')}>
            <Icon name="x" size={18} />
          </button>
        )}
      </label>
      <button type="button" class="icon-btn scan" aria-label="स्कैन करें · Scan barcode" onClick={onScan}>
        <Icon name="scan" />
      </button>
    </div>
  );
}

function CatChips() {
  const cat = stockCat.value;
  return (
    <div class="filters" role="group" aria-label="श्रेणी · Category">
      <button type="button" class={!cat ? 'on' : ''} aria-pressed={!cat} onClick={() => (stockCat.value = '')}>सब · All</button>
      {CATS.map((c) => (
        <button type="button" key={c} class={cat === c ? 'on' : ''} aria-pressed={cat === c} onClick={() => (stockCat.value = c)}>
          {catLabel(c)}
        </button>
      ))}
    </div>
  );
}

function Qty({ s, it }) {
  return (
    <span class="qty-cell">
      <span>
        <small>दुकान</small>
        <b class={s.countedShop ? (s.shop <= 0 ? 'red-text' : '') : 'muted'}>{s.countedShop ? qtyText(s.shop, it) : '?'}</b>
      </span>
      <span>
        <small>घर</small>
        <b class={s.knownHome ? '' : 'muted'}>{s.knownHome ? qtyText(s.home, it) : '?'}</b>
      </span>
    </span>
  );
}

function ItemRows({ list, st, onPick }) {
  if (!list.length) return <Empty hi="कुछ नहीं मिला" en="Nothing found" />;
  return list.map((it) => (
    <button type="button" key={it.id} class="item-row stock-row" onClick={() => (onPick ? onPick(it) : go('stockItem', { id: it.id }))}>
      <span class="two">
        <b>{showName(it)} {it.pack ? <em>{it.pack}</em> : null}</b>
        <small>{it.en} · {it.rack}</small>
      </span>
      <Qty s={st.get(it.id) || empty()} it={it} />
    </button>
  ));
}

function dueCount(sd) {
  let n = 0;
  for (const x of sd.V.values()) if (x.v.active !== false) n += x.unpaid.filter((b) => b.days <= DUE_SOON).length;
  return n;
}

function activeItems(sd) {
  return [...sd.items.values()].filter((it) => it.active !== false);
}

// ---------------- hub ----------------
export function Stock() {
  const { on, sd } = useStock();
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  if (!on) return <NeedCloud />;
  const role = cloud.value.role;
  const L = sd.ready ? lists({ items: sd.items, st: sd.st, cat: stockCat.value }) : null;
  const results = q ? searchItems(activeItems(sd), q) : [];
  const edit = canEdit();

  function onCode(code) {
    setScan(false);
    const it = findByCode(code);
    if (it) go('stockItem', { id: it.id });
    else say('यह बारकोड अभी किसी सामान से नहीं जुड़ा · This barcode is not linked to an item yet');
  }
  const tile = (key, hi, en, badge, main, onClick) => (
    <button type="button" key={key} class={'stock-tile' + (main ? ' main' : '')} disabled={!onClick} onClick={onClick}>
      <b>{hi}</b>
      <small>{en}</small>
      {badge ? <span class="badge">{badge}</span> : null}
    </button>
  );

  return (
    <main class="screen">
      <TopBar title="स्टॉक" sub={role === 'counter' ? 'Stock · find items, fill shelves' : 'Stock · shop and home'} onBack={() => go('home')} right={null} />
      <SearchBar q={q} setQ={setQ} onScan={() => setScan(true)} />
      {q ? (
        <div class="results tall">
          <ItemRows list={results} st={sd.st} />
        </div>
      ) : (
        <>
          {role !== 'counter' && <CatChips />}
          {sd.error && <p class="warn mx">{sd.error}</p>}
          {!L ? (
            <p class="note center">लोड हो रहा है · Loading…</p>
          ) : (
            <div class="stock-tiles">
              {tile('fill', 'शेल्फ भरो', 'Fill shelves', L.fill.length || null, true, () => go('stockList', { view: 'fill' }))}
              {role !== 'counter' && edit && tile('in', 'माल आया', 'Stock in', null, false, () => go('stockPick', { act: 'in' }))}
              {role !== 'counter' && tile('all', 'सारा स्टॉक', 'All stock · shop and home', null, false, () => go('stockList', { view: 'all' }))}
              {role !== 'counter' && edit && tile('count', 'गिनती', 'Count', L.uncounted ? L.uncounted + ' बाकी' : null, false, () => go('stockCount', {}))}
              {role !== 'counter' && edit && tile('out', 'माल बाहर', 'Stock out', null, false, () => go('stockPick', { act: 'out' }))}
              {role !== 'counter' && tile('order', 'ऑर्डर लिस्ट', 'Order list', L.order.length || null, false, () => go('stockList', { view: 'order' }))}
              {role !== 'counter' && tile('expiry', 'एक्सपायरी नज़दीक', 'Expiring soon', L.expiry.length || null, false, () => go('stockList', { view: 'expiry' }))}
              {role !== 'counter' && tile('hot', 'ज़्यादा बिकने वाले', 'Hot sellers', null, false, () => go('stockList', { view: 'hot' }))}
              {role !== 'counter' && tile('slow', 'नहीं बिक रहा', 'Not selling', L.slow30.length || null, false, () => go('stockList', { view: 'slow' }))}
              {role !== 'counter' && tile('vendors', 'सप्लायर', 'Vendors · khata, bills, orders', dueCount(sd) || null, false, () => go('vendors'))}
            </div>
          )}
          {L && role !== 'counter' && L.uncounted > 0 && (
            <p class="note">
              {L.uncounted} सामान की दुकान में गिनती बाकी है। एक बार गिनने से शेल्फ, ऑर्डर और स्टॉक सही दिखेंगे। · {L.uncounted} items are not counted in the shop yet; count them once and the lists become exact.
            </p>
          )}
        </>
      )}
      {scan && <Scanner onCode={onCode} onClose={() => setScan(false)} />}
    </main>
  );
}

// ---------------- pick an item for stock in / out ----------------
export function StockPick({ act }) {
  const { on, sd } = useStock();
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  if (!on) return <NeedCloud />;
  const isIn = act === 'in';
  const results = q ? searchItems(activeItems(sd), q) : [];
  const last = sd.moves
    .filter((m) => m.kind === act && m.by === cloud.value.login && m.day === dayKey())
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
  const pick = (it) => go('stockItem', { id: it.id, act, from: 'pick' });
  function onCode(code) {
    setScan(false);
    const it = findByCode(code);
    if (it) pick(it);
    else say('यह बारकोड अभी किसी सामान से नहीं जुड़ा · Not linked yet: search by name');
  }
  return (
    <main class="screen">
      <TopBar title={isIn ? 'माल आया' : 'माल बाहर'} sub={isIn ? 'Stock in · pick the item' : 'Stock out · pick the item'} onBack={() => go('stock')} right={null} />
      <SearchBar q={q} setQ={setQ} onScan={() => setScan(true)} placeholder="सामान का नाम या स्कैन · Name or scan" />
      {q ? (
        <div class="results tall">
          <ItemRows list={results} st={sd.st} onPick={pick} />
        </div>
      ) : (
        <>
          <h2 class="section-title">आज · Today</h2>
          <div class="entries">
            {last.length === 0 && <Empty hi="आज अभी कुछ नहीं" en="Nothing yet today" />}
            {last.map((m) => {
              const it = sd.items.get(m.item);
              return (
                <div key={m.id} class="entry">
                  <span class="two">
                    <b>{it ? showName(it) + (it.pack ? ' ' + it.pack : '') : m.item}</b>
                    <small>{timeText(m.at)} · {moveText(m, it)}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
      {scan && <Scanner onCode={onCode} onClose={() => setScan(false)} />}
    </main>
  );
}

function moveText(m, it) {
  const k = KIND[m.kind] || [m.kind, m.kind];
  const parts = [];
  if (m.d && m.d.shop) parts.push('दुकान ' + (m.d.shop > 0 ? '+' : '') + qtyText(m.d.shop, it));
  if (m.d && m.d.home) parts.push('घर ' + (m.d.home > 0 ? '+' : '') + qtyText(m.d.home, it));
  let extra = '';
  if (m.kind === 'count') extra = ' ' + qtyText(m.counted, it) + ' (' + (m.loc === 'home' ? 'घर' : 'दुकान') + ')';
  if (m.kind === 'out' && REASONS[m.reason]) extra = ' · ' + REASONS[m.reason][1];
  if (m.kind === 'in' && m.cost) extra += ' · ' + money(m.cost) + '/' + unit(it);
  if (m.kind === 'in' && m.expiry) extra += ' · exp ' + dateText(m.expiry + 'T12:00:00');
  return k[0] + ' · ' + k[1] + extra + (parts.length ? ' · ' + parts.join(', ') : '');
}

// ---------------- one item ----------------
export function StockItem({ id, act, from, loc }) {
  const { on, sd } = useStock();
  const [sheet, setSheet] = useState(act || '');
  if (!on) return <NeedCloud />;
  const it = sd.items.get(id);
  if (!sd.ready || !it) return <main class="screen" />;
  const s = sd.st.get(id) || empty();
  const edit = canEdit();
  const back = () => (from === 'pick' ? go('stockPick', { act }) : from === 'count' ? go('stockCount', { loc }) : from ? go('stockList', { view: from }) : go('stock'));
  const history = s.history.slice().sort((a, b) => b.at - a.at).slice(0, 15);
  const undone = new Set(sd.moves.filter((m) => m.kind === 'undo').map((m) => m.ref));

  async function saved(msg) {
    beep();
    say(msg);
    setSheet('');
    if (from === 'pick') go('stockPick', { act });
    if (from === 'count') go('stockCount', { loc });
  }
  async function undo(m) {
    await saveMove({ kind: 'undo', item: m.item, ref: m.id, d: { shop: -((m.d && m.d.shop) || 0), home: -((m.d && m.d.home) || 0) } });
    say('वापस लिया · Undone');
  }

  return (
    <main class="screen pad-screen">
      <TopBar title={showName(it) + (it.pack ? ' ' + it.pack : '')} sub={it.en + ' · ' + rackText(it.rack)} onBack={back} right={null} />
      <div class="stock-big">
        <div>
          <small>दुकान · Shop</small>
          <b class={s.countedShop ? (s.shop <= 0 ? 'red-text' : '') : 'muted'}>{s.countedShop ? qtyText(s.shop, it) : '?'}</b>
          <small>{it.shopQty ? 'रखना है · keep ' + it.shopQty : ''}{s.countedShop ? '' : ' · गिनती बाकी'}</small>
        </div>
        <div>
          <small>घर · Home</small>
          <b class={s.knownHome ? '' : 'muted'}>{s.knownHome ? qtyText(s.home, it) : '?'}</b>
          <small>{it.homeQty ? 'रखना है · keep ' + it.homeQty : ''}</small>
        </div>
      </div>
      <div class="sum-card">
        <div class="sum-row"><span>7 दिन में बिका · Sold 7 days</span><b>{qtyText(s.sold7, it)}</b></div>
        <div class="sum-row"><span>30 दिन में बिका · Sold 30 days</span><b>{qtyText(s.sold30, it)}</b></div>
        <div class="sum-row"><span>आखिरी बिक्री · Last sold</span><b>{s.lastSale ? dateText(s.lastSale + 'T12:00:00') : '—'}</b></div>
        <div class="sum-row"><span>खरीद दाम · Buy rate</span><b>{s.cost ? money(s.cost) : '—'}</b></div>
        {rateRows(sd, id).map((r) => (
          <div key={r.vendor || 'none'} class="sum-row sub">
            <span>{r.name}{r.best ? ' · सबसे सस्ता · best' : ''}</span>
            <b class={r.best ? 'green-text' : ''}>{money(r.cost)}</b>
          </div>
        ))}
        <div class="sum-row"><span>बेचने का दाम · Selling price</span><b>{it.price ? money(it.price) : '—'}</b></div>
      </div>
      {edit && (
        <div class="stock-actions">
          <button type="button" class="btn primary" onClick={() => setSheet('in')}><b>माल आया</b><small>Stock in</small></button>
          <button type="button" class="btn green" onClick={() => setSheet('fill')}><b>शेल्फ भरो</b><small>Home → shelf</small></button>
          <button type="button" class="btn outline" onClick={() => setSheet('count')}><b>गिनती</b><small>Count</small></button>
          <button type="button" class="btn outline" onClick={() => setSheet('out')}><b>माल बाहर</b><small>Stock out</small></button>
        </div>
      )}
      <h2 class="section-title">हिसाब · History</h2>
      <div class="entries tight">
        {history.length === 0 && <Empty hi="अभी कोई हलचल नहीं" en="No stock moves yet" />}
        {history.map((m) => (
          <div key={m.id} class={'entry' + (undone.has(m.id) ? ' cancelled' : '')}>
            <span class="two">
              <b>{moveText(m, it)}</b>
              <small>{dateText(m.at)} · {timeText(m.at)} · {m.by}{m.sat ? '' : ' · ☁ बाकी'}</small>
            </span>
            {edit && m.kind !== 'undo' && !undone.has(m.id) && m.by === cloud.value.login && Date.now() - m.at < 86400000 && (
              <button type="button" class="btn small-btn" onClick={() => undo(m)}>वापस · Undo</button>
            )}
          </div>
        ))}
      </div>
      {sheet && (
        <MoveSheet
          it={it}
          s={s}
          kind={sheet}
          loc={loc}
          onClose={() => setSheet('')}
          onSaved={saved}
        />
      )}
    </main>
  );
}

function rateRows(sd, id) {
  const r = sd.rates.get(id);
  if (!r || r.size < 2) return [];
  const rows = [...r.values()].map((x) => ({ ...x, name: x.vendor ? (sd.vendors.find((v) => v.id === x.vendor) || { name: '?' }).name : 'बिना सप्लायर · no vendor' }));
  const best = Math.min(...rows.map((x) => x.cost));
  return rows.map((x) => ({ ...x, best: x.cost === best })).sort((a, b) => a.cost - b.cost);
}

// One sheet for every kind of move: a big number pad plus the few choices each kind needs.
function MoveSheet({ it, s, kind, loc: locIn, onClose, onSaved }) {
  const fillTake = (() => {
    const need = Math.max(0, (Number(it.shopQty) || 0) - Math.max(0, s.shop));
    return s.knownHome ? Math.min(need, Math.max(0, s.home)) : need;
  })();
  const [v, setV] = useState(kind === 'fill' && fillTake > 0 ? String(Math.ceil(fillTake)) : '');
  const [place, setPlace] = useState(kind === 'in' ? 'home' : kind === 'count' ? (locIn === 'H' ? 'home' : 'shop') : 'shop');
  const [cost, setCost] = useState(s.cost ? String(s.cost) : '');
  const [expiry, setExpiry] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const sd = stockData.value;
  const vendors = sd.vendors.filter((x) => x.active !== false);
  const [vendor, setVendor] = useState(sd.itemVendor.get(it.id) || '');
  const [value, setValue] = useState('');
  const n = toInt(v);
  const u = unit(it) === 'kg' ? 'kg' : 'pcs';
  const T = {
    in: ['माल आया', 'Stock in: how many came?'],
    out: ['माल बाहर', 'Stock out: how many?'],
    fill: ['शेल्फ भरो', 'Home → shelf: how many?'],
    count: ['गिनती', 'Count: how many are there?']
  }[kind];
  const backToVendor = kind === 'out' && reason === 'vendor';
  const rateFor = (vid) => {
    const r = sd.rates.get(it.id);
    const x = r && (r.get(vid) || null);
    return x ? x.cost : s.cost || 0;
  };
  const retValue = value !== '' ? toInt(value) : n * rateFor(vendor);
  const ok = kind === 'count' ? v !== '' : n > 0 && (kind !== 'out' || reason) && (!backToVendor || vendor);

  async function save() {
    if (!ok || busy) return;
    setBusy(true);
    if (kind === 'in') {
      const c = toInt(cost);
      await saveMove({ kind: 'in', item: it.id, qty: n, to: place, d: { [place]: n }, ...(c > 0 ? { cost: c } : {}), ...(expiry ? { expiry } : {}), ...(vendor ? { vendor } : {}) });
      onSaved('+' + n + ' ' + (place === 'home' ? 'घर में · at home' : 'दुकान में · in the shop'));
    } else if (kind === 'out') {
      const mv = await saveMove({ kind: 'out', item: it.id, qty: n, from: place, reason, d: { [place]: -n }, ...(backToVendor ? { vendor } : {}) });
      if (backToVendor && retValue > 0) {
        await saveVEntry({ vendor, kind: 'return', amount: retValue, note: it.en + (it.pack ? ' ' + it.pack : '') + ' × ' + n, ref: mv.id });
      }
      onSaved('−' + n + ' ' + (place === 'home' ? 'घर से · from home' : 'दुकान से · from the shop'));
    } else if (kind === 'fill') {
      await saveMove({ kind: 'fill', item: it.id, qty: n, d: { shop: n, home: -n } });
      onSaved('शेल्फ पर +' + n + ' · ' + n + ' put on the shelf');
    } else {
      const cur = place === 'home' ? s.home : s.shop;
      const delta = Math.round((n - cur) * 1000) / 1000;
      await saveMove({ kind: 'count', item: it.id, loc: place, counted: n, d: { [place]: delta } });
      onSaved('गिनती सेव · Count saved: ' + n);
    }
    setBusy(false);
  }

  return (
    <Sheet onClose={onClose} label={T[0]}>
      <div class="sheet-head">
        <div>
          <h2>{T[0]}: {showName(it)} {it.pack || ''}</h2>
          <p class="muted">{T[1]} {kind === 'fill' && fillTake > 0 ? '· suggested ' + Math.ceil(fillTake) : ''}</p>
        </div>
        <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      {kind !== 'fill' && (
        <div class="chooser" role="group">
          {(kind === 'in' ? ['home', 'shop'] : ['shop', 'home']).map((p) => (
            <button type="button" key={p} class={place === p ? 'on' : ''} aria-pressed={place === p} onClick={() => setPlace(p)}>
              {p === 'home' ? 'घर · Home' : 'दुकान · Shop'}
            </button>
          ))}
        </div>
      )}
      <div class="amount-box">
        {v || '0'}
        <small>{u}</small>
      </div>
      <Keypad onKey={(k) => setV(typed(v, k))} compact />
      {kind === 'in' && (
        <div class="split-row">
          <label class="field small">
            <span>खरीद दाम ₹ / {u} · Buy rate</span>
            <input inputMode="numeric" value={cost} onInput={(e) => setCost(e.currentTarget.value.replace(/\D/g, ''))} placeholder="—" />
          </label>
          <label class="field small">
            <span>एक्सपायरी · Expiry</span>
            <input type="date" value={expiry} onInput={(e) => setExpiry(e.currentTarget.value)} />
          </label>
        </div>
      )}
      {kind === 'out' && (
        <div class="chooser wrap" role="group" aria-label="क्यों · Why">
          {Object.entries(REASONS).map(([k, [hi, en]]) => (
            <button type="button" key={k} class={reason === k ? 'on' : ''} aria-pressed={reason === k} onClick={() => setReason(k)}>
              {hi} · {en}
            </button>
          ))}
        </div>
      )}
      {(kind === 'in' || backToVendor) && vendors.length > 0 && (
        <div class="chooser wrap half" role="group" aria-label="सप्लायर · Vendor">
          {kind === 'in' && (
            <button type="button" class={!vendor ? 'on' : ''} aria-pressed={!vendor} onClick={() => setVendor('')}>— बिना सप्लायर</button>
          )}
          {vendors.map((x) => (
            <button type="button" key={x.id} class={vendor === x.id ? 'on' : ''} aria-pressed={vendor === x.id} onClick={() => setVendor(x.id)}>{x.name}</button>
          ))}
        </div>
      )}
      {backToVendor && vendors.length === 0 && (
        <p class="warn">पहले सप्लायर जोड़ें: स्टॉक → सप्लायर · Add the vendor first: Stock → Vendors</p>
      )}
      {backToVendor && (
        <label class="field small">
          <span>वापसी की कीमत ₹ · Value of the return (lowers what the shop owes)</span>
          <input inputMode="numeric" value={value === '' ? String(retValue || '') : value} onInput={(e) => setValue(e.currentTarget.value.replace(/\D/g, ''))} />
        </label>
      )}
      <button type="button" class="btn primary big" disabled={!ok || busy} onClick={save}>
        <b>सेव करें</b>
        <small>Save</small>
      </button>
    </Sheet>
  );
}

// ---------------- counting, rack by rack ----------------
export function StockCount({ loc }) {
  const { on, sd } = useStock();
  if (!on) return <NeedCloud />;
  if (!sd.ready) return <main class="screen" />;
  const today = dayKey();
  const countedToday = (id, where) =>
    sd.moves.some((m) => m.kind === 'count' && m.item === id && m.day === today && (where === 'home' ? m.loc === 'home' : m.loc !== 'home'));
  const all = activeItems(sd);
  const forLoc = (L) =>
    L === 'H'
      ? all.filter((it) => (Number(it.homeQty) || 0) > 0 || (sd.st.get(it.id) || empty()).knownHome).sort((a, b) => (a.cat || '').localeCompare(b.cat || ''))
      : all.filter((it) => it.rack === L).sort((a, b) => a.en.localeCompare(b.en));

  if (!loc) {
    const locs = [...WALK, 'H'];
    return (
      <main class="screen pad-screen">
        <TopBar title="गिनती" sub="Count · pick a rack, or home" onBack={() => go('stock')} right={null} />
        <p class="lead">एक दिन में एक रैक गिनें · Count one rack a day; the whole shop takes two weeks.</p>
        <div class="stock-tiles">
          {locs.map((L) => {
            const list = forLoc(L);
            const done = list.filter((it) => countedToday(it.id, L === 'H' ? 'home' : 'shop')).length;
            return (
              <button type="button" key={L} class={'stock-tile' + (L === 'H' ? ' main' : '')} onClick={() => go('stockCount', { loc: L })}>
                <b>{L === 'H' ? 'घर · Home' : L}</b>
                <small>{RACKS[L] ? RACKS[L].en : ''}</small>
                <span class="badge">{done ? done + '/' : ''}{list.length}</span>
              </button>
            );
          })}
        </div>
      </main>
    );
  }
  const list = forLoc(loc);
  const where = loc === 'H' ? 'home' : 'shop';
  const done = list.filter((it) => countedToday(it.id, where)).length;
  return (
    <main class="screen">
      <TopBar title={'गिनती · ' + (loc === 'H' ? 'घर' : loc)} sub={(RACKS[loc] ? RACKS[loc].en : '') + ' · ' + done + ' of ' + list.length + ' counted today'} onBack={() => go('stockCount', {})} right={null} />
      <div class="results tall">
        {list.map((it) => {
          const s = sd.st.get(it.id) || empty();
          const ok = countedToday(it.id, where);
          return (
            <button type="button" key={it.id} class={'item-row stock-row' + (ok ? ' done' : '')} onClick={() => go('stockItem', { id: it.id, act: 'count', from: 'count', loc })}>
              <span class="two">
                <b>{ok ? '✓ ' : ''}{showName(it)} {it.pack ? <em>{it.pack}</em> : null}</b>
                <small>{it.en}</small>
              </span>
              <span class="qty-one">
                <small>{where === 'home' ? 'घर' : 'दुकान'}</small>
                <b>{(where === 'home' ? s.knownHome : s.countedShop) ? qtyText(where === 'home' ? s.home : s.shop, it) : '?'}</b>
              </span>
            </button>
          );
        })}
      </div>
    </main>
  );
}

// ---------------- the lists ----------------
const VIEWS = {
  fill: ['शेल्फ भरो', 'Fill shelves · in walking order'],
  order: ['ऑर्डर लिस्ट', 'Order list · running low'],
  expiry: ['एक्सपायरी नज़दीक', 'Expiring soon · sell or remove first'],
  hot: ['ज़्यादा बिकने वाले', 'Hot sellers · never let these run out'],
  slow: ['नहीं बिक रहा', 'Not selling · stop buying, move to the front'],
  all: ['सारा स्टॉक', 'All stock · shop and home']
};

export function StockList({ view }) {
  const { on, sd } = useStock();
  const [win, setWin] = useState(view === 'slow' ? 30 : 7);
  const [fill, setFill] = useState(null);
  const [q, setQ] = useState('');
  if (!on) return <NeedCloud />;
  const role = cloud.value.role;
  const V = VIEWS[view] || VIEWS.all;
  const cat = role === 'counter' ? '' : stockCat.value;
  const L = sd.ready ? lists({ items: sd.items, st: sd.st, cat }) : null;
  const edit = canEdit();

  function shareOrder(rows, vendor) {
    const lines = ['छाबड़ा स्टोर · Chhabra Store · ऑर्डर ' + dateText(Date.now())];
    if (vendor) lines.push(vendor.name + ' ji, यह माल भेज दें · Please send:');
    let lastCat = '';
    for (const r of rows) {
      if (!vendor && r.it.cat !== lastCat) {
        lastCat = r.it.cat;
        lines.push('', r.it.cat + ':');
      }
      lines.push('- ' + showName(r.it) + ' (' + r.it.en + (r.it.pack ? ' ' + r.it.pack : '') + ') × ' + r.qty);
    }
    openWhatsApp(lines.join('\n'), vendor ? vendor.phone : '');
  }

  const head = (
    <>
      <TopBar title={V[0]} sub={V[1]} onBack={() => go('stock')} right={null} />
      {role !== 'counter' && <CatChips />}
    </>
  );
  if (!L) return <main class="screen">{head}<p class="note center">लोड हो रहा है · Loading…</p></main>;

  let body = null;
  if (view === 'fill') {
    body = (
      <div class="entries">
        {L.fill.length === 0 && <Empty hi="सब शेल्फ भरे हैं" en={L.uncounted ? 'Nothing to fill among counted items' : 'All shelves are full'} />}
        {L.fill.map((r, i) => (
          <div key={r.it.id} class="entry">
            {(i === 0 || L.fill[i - 1].it.rack !== r.it.rack) && <span class="rack-tag">{r.it.rack}</span>}
            <span class="two" onClick={() => go('stockItem', { id: r.it.id, from: 'fill' })}>
              <b>{showName(r.it)} {r.it.pack ? <em>{r.it.pack}</em> : null}</b>
              <small>दुकान {qtyText(r.s.shop, r.it)} / {r.it.shopQty} · घर {r.avail == null ? '?' : qtyText(r.avail, r.it)}</small>
            </span>
            {edit && r.take > 0 ? (
              <button type="button" class="btn small-btn green" onClick={() => setFill(r)}>भरो {Math.ceil(r.take)}</button>
            ) : (
              <span class="muted small">{r.avail === 0 ? 'घर में नहीं · none at home' : ''}</span>
            )}
          </div>
        ))}
      </div>
    );
  } else if (view === 'order') {
    const groups = new Map();
    for (const r of L.order) {
      const vid = sd.itemVendor.get(r.it.id) || '';
      if (!groups.has(vid)) groups.set(vid, []);
      groups.get(vid).push(r);
    }
    const order = [...groups.keys()].sort((a, b) => (!a) - (!b));
    body = (
      <>
        {L.order.length === 0 && <Empty hi="अभी कुछ मंगाना नहीं" en="Nothing running low among counted items" />}
        {order.map((vid) => {
          const vendor = sd.vendors.find((x) => x.id === vid);
          const rows = groups.get(vid);
          return (
            <section key={vid || 'none'} class="vendor-group">
              <div class="group-head">
                <span class="two">
                  <b>{vendor ? vendor.name : 'बिना सप्लायर'}</b>
                  <small>{(vendor ? vendor.phone || 'no phone' : 'No vendor yet') + ' · ' + rows.length + (rows.length === 1 ? ' item' : ' items')}</small>
                </span>
                <button type="button" class="btn small-btn green" onClick={() => shareOrder(rows, vendor)}>
                  <Icon name="chat" size={18} /> WhatsApp
                </button>
              </div>
              <div class="entries">
                {rows.map((r) => (
                  <button type="button" key={r.it.id} class="entry tap" onClick={() => go('stockItem', { id: r.it.id, from: 'order' })}>
                    <span class="two">
                      <b>{showName(r.it)} {r.it.pack ? <em>{r.it.pack}</em> : null}</b>
                      <small>{r.it.cat} · बचा · left {qtyText(r.have, r.it)}</small>
                    </span>
                    <b>× {r.qty}</b>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </>
    );
  } else if (view === 'expiry') {
    body = (
      <div class="entries">
        {L.expiry.length === 0 && <Empty hi="कुछ एक्सपायर होने वाला नहीं" en="Nothing expiring soon (from deliveries with an expiry date)" />}
        {L.expiry.map((r) => (
          <div key={r.batch.id} class="entry">
            <span class="two" onClick={() => go('stockItem', { id: r.it.id, from: 'expiry' })}>
              <b>{showName(r.it)} {r.it.pack ? <em>{r.it.pack}</em> : null}</b>
              <small class={r.days <= 0 ? 'red-text' : ''}>
                {r.days < 0 ? 'एक्सपायर हो गया · expired' : r.days === 0 ? 'आज · today' : r.days + ' दिन · days'} · {dateText(r.batch.expiry + 'T12:00:00')} · {qtyText(r.batch.left, r.it)}
              </small>
            </span>
            {edit && (
              <button type="button" class="btn small-btn" onClick={() => saveMove({ kind: 'clear', item: r.it.id, batch: r.batch.id }).then(() => say('ठीक है · Marked as handled'))}>
                देख लिया · Done
              </button>
            )}
          </div>
        ))}
      </div>
    );
  } else if (view === 'hot' || view === 'slow') {
    const list = view === 'hot' ? (win === 7 ? L.hot7 : L.hot30) : win === 30 ? L.slow30 : L.slow60;
    const opts = view === 'hot' ? [7, 30] : [30, 60];
    const since = sd.firstSaleDay;
    body = (
      <>
        <div class="chooser mx" role="group">
          {opts.map((n) => (
            <button type="button" key={n} class={win === n ? 'on' : ''} aria-pressed={win === n} onClick={() => setWin(n)}>{n} दिन · days</button>
          ))}
        </div>
        {since && <p class="note">बिक्री का हिसाब {dateText(since + 'T12:00:00')} से · Sales counted since {dateText(since + 'T12:00:00')}</p>}
        <div class="entries">
          {list.length === 0 && <Empty hi="अभी कुछ नहीं" en={view === 'hot' ? 'No item sales yet' : 'Every counted item sold'} />}
          {list.map((r, i) => (
            <button type="button" key={r.it.id} class="entry tap" onClick={() => go('stockItem', { id: r.it.id, from: view })}>
              <span class="two">
                <b>{view === 'hot' ? i + 1 + '. ' : ''}{showName(r.it)} {r.it.pack ? <em>{r.it.pack}</em> : null}</b>
                <small>{view === 'hot' ? 'स्टॉक · in stock ' + (r.s.counted ? qtyText(r.s.total, r.it) : '?') : 'आखिरी बिक्री · last sold ' + (r.s.lastSale ? dateText(r.s.lastSale + 'T12:00:00') : '—')}</small>
              </span>
              <b>{view === 'hot' ? qtyText(r.sold, r.it) : qtyText(r.s.total, r.it)}</b>
            </button>
          ))}
        </div>
      </>
    );
  } else {
    const all = L.all.slice().sort((a, b) => WALK.indexOf(a.rack) - WALK.indexOf(b.rack) || a.en.localeCompare(b.en));
    const shown = q ? searchItems(all, q) : all;
    const m = summary(L.all, sd.st);
    body = (
      <>
        <div class="sum-card">
          <div class="sum-row"><span>स्टॉक की कीमत · Stock value</span><b>{money(m.value)}</b></div>
          {m.noRate > 0 && <div class="sum-row"><span class="muted">बिना खरीद दाम · Items without a buy rate</span><b>{m.noRate}</b></div>}
          <div class="sum-row"><span>30 दिन की बिक्री · Sold in 30 days</span><b>{money(m.sold)}</b></div>
          <div class="sum-row"><span>मुनाफ़ा · Margin</span><b>{m.marginPct == null ? '—' : m.marginPct + '%'}</b></div>
          <div class="sum-row"><span>कितने दिन चलेगा · Days of stock</span><b>{m.daysLeft == null ? '—' : m.daysLeft}</b></div>
        </div>
        <div class="search-row">
          <label class="search">
            <Icon name="search" size={22} />
            <input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="खोजें · Search" aria-label="सामान खोजें · Search items" />
          </label>
        </div>
        <div class="results tall">
          <ItemRows list={shown.slice(0, 150)} st={sd.st} onPick={(it) => go('stockItem', { id: it.id, from: 'all' })} />
        </div>
      </>
    );
  }

  return (
    <main class="screen">
      {head}
      {body}
      {fill && (
        <FillSheet r={fill} onClose={() => setFill(null)} />
      )}
    </main>
  );
}

function FillSheet({ r, onClose }) {
  const [v, setV] = useState(String(Math.ceil(r.take)));
  const n = toInt(v);
  async function save() {
    await saveMove({ kind: 'fill', item: r.it.id, qty: n, d: { shop: n, home: -n } });
    beep();
    say('शेल्फ पर +' + n + ' · ' + n + ' put on the shelf');
    onClose();
  }
  return (
    <Sheet onClose={onClose} label="शेल्फ भरो · Fill shelf">
      <div class="sheet-head">
        <div>
          <h2>शेल्फ भरो: {showName(r.it)} {r.it.pack || ''}</h2>
          <p class="muted">{r.it.rack} · दुकान {qtyText(r.s.shop, r.it)} / {r.it.shopQty} · घर {r.avail == null ? '?' : qtyText(r.avail, r.it)}</p>
        </div>
        <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div class="amount-box">{v || '0'}<small>{unit(r.it)}</small></div>
      <Keypad onKey={(k) => setV(typed(v, k))} compact />
      <button type="button" class="btn green big" disabled={n <= 0} onClick={save}><b>भर दिया</b><small>Done: put on the shelf</small></button>
    </Sheet>
  );
}
