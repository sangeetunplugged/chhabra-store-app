import { useEffect, useState } from 'preact/hooks';
import { go, lines, pay, undoLine, refresh, say, bump, clearBill } from '../store.js';
import { allItems, getItem, setPrice, findByBarcode, linkBarcode, holdBill, mode } from '../db.js';
import { money, grams, billTotal, itemCount, lineTotal, lineName, lineSub, showName, typed, toInt } from '../format.js';
import { Icon, TopBar, Keypad, AmountSheet, Sheet, Scanner, Empty } from '../ui.jsx';
import { rackText } from '../racks.js';

export function searchItems(items, q) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const words = t.split(/\s+/);
  const scored = [];
  for (const it of items) {
    const hay = ((it.hi || '') + ' ' + it.en + ' ' + (it.pack || '') + ' ' + (it.brands || '') + ' ' + (it.barcodes || []).join(' ')).toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    let s = 0;
    if ((it.hi || '').toLowerCase().startsWith(t) || it.en.toLowerCase().startsWith(t)) s += 10;
    if (it.quick) s += 3;
    if (it.prio === 'Must') s += 2;
    scored.push([s, it]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, 40).map((x) => x[1]);
}

const newKey = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function useItems() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    allItems().then((a) => setItems(a.filter((i) => i.active !== false)));
  }, [refresh.value, mode.value]);
  return [items, setItems];
}

function ItemRow({ it, onPick, showRack }) {
  return (
    <button type="button" class="item-row" onClick={() => onPick(it)}>
      <span class="two">
        <b>{showName(it)} {it.pack ? <em>{it.pack}</em> : null}</b>
        <small>{it.en}{showRack && it.rack ? ' · ' + rackText(it.rack) : ''}</small>
      </span>
      <span class={'price' + (it.price == null ? ' none' : '')}>
        {it.price == null ? 'दाम नहीं' : money(it.price) + (it.loose ? '/kg' : '')}
      </span>
    </button>
  );
}

function Tile({ it, onPick }) {
  return (
    <button type="button" class={'tile' + (it.loose ? ' loose' : '')} onClick={() => onPick(it)}>
      <b>{showName(it)}</b>
      <small>{it.pack || it.en}</small>
      <span>{it.price == null ? 'दाम डालें' : money(it.price) + (it.loose ? ' / kg' : '')}</span>
    </button>
  );
}

export function Bill() {
  const [items, setItems] = useItems();
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const [askPrice, setAskPrice] = useState(null);
  const [unknown, setUnknown] = useState(null);
  const [uq, setUq] = useState('');

  const ls = lines.value;
  const total = billTotal(ls);
  const quick = items.filter((i) => i.quick > 0).sort((a, b) => a.quick - b.quick);
  const results = searchItems(items, q);

  function push(it, price) {
    const cur = lines.value.slice();
    const i = cur.findIndex((l) => !l.loose && !l.quick && l.itemId === it.id);
    if (i >= 0) cur[i] = { ...cur[i], qty: cur[i].qty + 1 };
    else cur.push({ key: newKey(), itemId: it.id, en: it.en, hi: it.hi, pack: it.pack, price, qty: 1 });
    lines.value = cur;
    undoLine.value = null;
  }

  function add(it) {
    if (it.loose) {
      go('loose', { id: it.id });
      return;
    }
    if (it.price == null || it.price === '') {
      setAskPrice(it);
      return;
    }
    push(it, it.price);
    if (q) setQ('');
  }

  async function onPrice(n) {
    const it = askPrice;
    await setPrice(it.id, n);
    setAskPrice(null);
    setItems(items.map((x) => (x.id === it.id ? { ...x, price: n } : x)));
    push({ ...it, price: n }, n);
    setQ('');
  }

  async function onCode(code) {
    setScanning(false);
    const it = await findByBarcode(code);
    if (it) add(it);
    else {
      setUnknown(code);
      setUq('');
    }
  }

  async function linkAndAdd(it) {
    const code = unknown;
    await linkBarcode(it.id, code);
    setUnknown(null);
    bump();
    add({ ...it, barcodes: [...(it.barcodes || []), code] });
  }

  function changeQty(key, d) {
    const cur = lines.value.slice();
    const i = cur.findIndex((l) => l.key === key);
    if (i < 0) return;
    const q2 = cur[i].qty + d;
    if (q2 <= 0) {
      remove(key);
      return;
    }
    cur[i] = { ...cur[i], qty: q2 };
    lines.value = cur;
  }

  function remove(key) {
    const cur = lines.value.slice();
    const i = cur.findIndex((l) => l.key === key);
    if (i < 0) return;
    const [gone] = cur.splice(i, 1);
    lines.value = cur;
    undoLine.value = { line: gone, index: i };
  }

  function undo() {
    const u = undoLine.value;
    if (!u) return;
    const cur = lines.value.slice();
    cur.splice(Math.min(u.index, cur.length), 0, u.line);
    lines.value = cur;
    undoLine.value = null;
  }

  async function hold() {
    if (!ls.length) {
      say('पहले सामान जोड़ें · Add an item first');
      return;
    }
    await holdBill(ls, total);
    clearBill();
    bump();
    say('बिल रोका गया। होम से खोलें · Bill on hold. Open it from Home');
    go('home');
  }

  function toPay() {
    if (!ls.length) {
      say('पहले सामान जोड़ें · Add an item first');
      return;
    }
    pay.value = { total, cash: 0, upi: 0, udhaar: 0, given: 0, change: 0, customerId: null };
    go('pay');
  }

  const unknownResults = searchItems(items, uq);

  return (
    <main class="screen bill">
      <TopBar title="नया बिल" sub="New bill" onBack={() => go('home')} />
      <div class="search-row">
        <label class="search">
          <Icon name="search" size={22} />
          <input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="खोजें · Search" aria-label="सामान खोजें · Search items" />
          {q && (
            <button type="button" class="clear" aria-label="साफ़ करें · Clear" onClick={() => setQ('')}>
              <Icon name="x" size={18} />
            </button>
          )}
        </label>
        <button type="button" class="icon-btn scan" aria-label="स्कैन करें · Scan barcode" onClick={() => setScanning(true)}>
          <Icon name="scan" />
        </button>
      </div>

      {q ? (
        <div class="results">
          {results.length ? (
            results.map((it) => <ItemRow key={it.id} it={it} onPick={add} />)
          ) : (
            <Empty hi="नहीं मिला। स्कैन करें या सिर्फ़ रकम लगाएं" en="Not found: scan it, or use Amount only" />
          )}
        </div>
      ) : (
        <>
          <div class="tiles-head">
            <span>जल्दी वाले · Quick items</span>
            <button type="button" class="pill" onClick={() => go('quick')}>₹ सिर्फ़ रकम · Amount only</button>
          </div>
          <div class="tiles">
            {quick.map((it) => (
              <Tile key={it.id} it={it} onPick={add} />
            ))}
          </div>
        </>
      )}

      <div class="lines">
        {ls.length === 0 ? (
          <Empty hi="ऊपर से सामान चुनें या स्कैन करें" en="Tap an item above, or scan it" />
        ) : (
          ls.map((l) => (
            <div class="line" key={l.key}>
              <span class="two">
                <b>{lineName(l)}</b>
                <small>{lineSub(l)}</small>
              </span>
              {l.loose || l.quick ? (
                <button type="button" class="icon-btn" aria-label="हटाएं · Remove" onClick={() => remove(l.key)}>
                  <Icon name="x" size={20} stroke={2.5} />
                </button>
              ) : (
                <span class="qty">
                  <button type="button" class="icon-btn" aria-label="एक कम · One less" onClick={() => changeQty(l.key, -1)}>
                    <Icon name="minus" size={20} stroke={2.5} />
                  </button>
                  <b>{l.qty}</b>
                  <button type="button" class="icon-btn" aria-label="एक और · One more" onClick={() => changeQty(l.key, 1)}>
                    <Icon name="plus" size={20} stroke={2.5} />
                  </button>
                </span>
              )}
              <b class="amt">{money(lineTotal(l))}</b>
            </div>
          ))
        )}
      </div>

      {undoLine.value && (
        <div class="undo">
          <span>हटाया: {lineName(undoLine.value.line)}</span>
          <button type="button" onClick={undo}>वापस लाएं · Undo</button>
        </div>
      )}

      <footer class="total-bar">
        <div class="total">
          <small>कुल · Total ({itemCount(ls)})</small>
          <b>{money(total)}</b>
        </div>
        <button type="button" class="btn ghost hold" onClick={hold}>
          <Icon name="pause" />
          <small>रोकें</small>
        </button>
        <button type="button" class="btn primary pay-btn" onClick={toPay}>
          <b>पैसे लें</b>
          <small>Take payment</small>
        </button>
      </footer>

      {scanning && <Scanner onCode={onCode} onClose={() => setScanning(false)} />}

      {askPrice && (
        <AmountSheet
          title={'दाम डालें: ' + showName(askPrice) + (askPrice.pack ? ' ' + askPrice.pack : '')}
          sub={'Selling price for ' + askPrice.en + (askPrice.pack ? ' ' + askPrice.pack : '') + '. Saved for next time.'}
          okText={['दाम सेव करें', 'Save price']}
          onDone={onPrice}
          onClose={() => setAskPrice(null)}
        />
      )}

      {unknown && (
        <Sheet onClose={() => setUnknown(null)} label="नया बारकोड · New barcode">
          <div class="sheet-head">
            <div>
              <h2>यह बारकोड नया है</h2>
              <p class="muted">New barcode {unknown}. Pick the item once; next time the scan finds it.</p>
            </div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setUnknown(null)}>
              <Icon name="x" />
            </button>
          </div>
          <label class="search">
            <Icon name="search" size={22} />
            <input value={uq} onInput={(e) => setUq(e.currentTarget.value)} placeholder="सामान का नाम · Item name" aria-label="सामान खोजें · Search items" />
          </label>
          <div class="results tall">
            {unknownResults.map((it) => (
              <ItemRow key={it.id} it={it} onPick={linkAndAdd} />
            ))}
          </div>
          <button type="button" class="btn outline" onClick={() => { setUnknown(null); go('quick'); }}>
            <b>सिर्फ़ रकम लगाएं</b>
            <small>Use Amount only instead</small>
          </button>
        </Sheet>
      )}
    </main>
  );
}

export function Loose({ id }) {
  const [it, setIt] = useState(null);
  const [byWeight, setByWeight] = useState(true);
  const [entry, setEntry] = useState('');
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    getItem(id).then((x) => {
      setIt(x || null);
      if (x && x.price == null) setAsk(true);
    });
  }, [id]);

  if (!it) return <main class="screen" />;
  const per = Number(it.price) || 0;
  const n = toInt(entry);
  const g = byWeight ? n : per ? Math.round((n / per) * 1000) : 0;
  const amt = byWeight ? Math.round((per * n) / 1000) : n;
  const presets = byWeight
    ? [['250', '250 g'], ['500', '500 g'], ['1000', '1 kg'], ['2000', '2 kg']]
    : [['10', '₹10'], ['20', '₹20'], ['50', '₹50'], ['100', '₹100']];

  function addIt() {
    if (!per) {
      setAsk(true);
      return;
    }
    if (!n || !g || !amt) {
      say('पहले वज़न या रकम चुनें · Pick a weight or an amount first');
      return;
    }
    lines.value = [...lines.value, { key: newKey(), itemId: it.id, en: it.en, hi: it.hi, pack: '', loose: true, grams: g, amount: amt, perKg: per }];
    undoLine.value = null;
    go('bill');
  }

  async function savePer(v) {
    await setPrice(it.id, v);
    setIt({ ...it, price: v });
    setAsk(false);
    bump();
  }

  return (
    <main class="screen pad-screen">
      <TopBar title={showName(it)} sub={it.en} onBack={() => go('bill')} right={<b class="blue">{per ? money(per) + ' / kg' : ''}</b>} />
      <div class="seg">
        <button type="button" class={byWeight ? 'on' : ''} onClick={() => { setByWeight(true); setEntry(''); }}>
          <b>वज़न से</b>
          <small>By weight</small>
        </button>
        <button type="button" class={!byWeight ? 'on' : ''} onClick={() => { setByWeight(false); setEntry(''); }}>
          <b>रकम से</b>
          <small>By amount</small>
        </button>
      </div>
      <div class="presets">
        {presets.map(([v, label]) => (
          <button type="button" key={v} onClick={() => setEntry(v)}>{label}</button>
        ))}
      </div>
      <div class="readout">
        <b>{byWeight ? grams(n) : money(n)}</b>
        <span>{n ? (byWeight ? '= ' + money(amt) : '≈ ' + grams(g)) : ''}</span>
      </div>
      <Keypad onKey={(k) => setEntry(typed(entry, k))} compact />
      <button type="button" class="btn primary big" onClick={addIt}>
        <b>बिल में जोड़ें</b>
        <small>Add to bill</small>
      </button>
      {ask && (
        <AmountSheet
          title={'किलो का दाम: ' + showName(it)}
          sub={'Price per kg for ' + it.en + '. Saved for next time.'}
          unit="/ kg"
          okText={['दाम सेव करें', 'Save price']}
          onDone={savePer}
          onClose={() => { setAsk(false); if (!per) go('bill'); }}
        />
      )}
    </main>
  );
}

export function Quick() {
  const [v, setV] = useState('');
  const n = toInt(v);
  function addIt() {
    if (!n) {
      say('पहले रकम लिखें · Type the amount first');
      return;
    }
    lines.value = [...lines.value, { key: newKey(), quick: true, en: 'Sale', hi: 'सिर्फ़ रकम', amount: n }];
    undoLine.value = null;
    go('bill');
  }
  return (
    <main class="screen pad-screen">
      <TopBar title="सिर्फ़ रकम" sub="Amount only" onBack={() => go('bill')} />
      <p class="lead">भीड़ में सिर्फ़ कुल रकम लिखें, ताकि गल्ले का हिसाब सही रहे · In a rush, type only the total so the cash record stays right</p>
      <div class="readout single">
        <b>{money(n)}</b>
      </div>
      <Keypad onKey={(k) => setV(typed(v, k))} />
      <button type="button" class="btn primary big" onClick={addIt}>
        <b>बिल में जोड़ें</b>
        <small>Add to bill</small>
      </button>
    </main>
  );
}

export function Find() {
  const [items] = useItems();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const results = searchItems(items, q);
  return (
    <main class="screen">
      <TopBar title="कहां रखा है?" sub="Stock · where is it kept?" onBack={() => go('home')} />
      <div class="search-row">
        <label class="search">
          <Icon name="search" size={22} />
          <input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="सामान का नाम · Item name" aria-label="सामान खोजें · Search items" />
        </label>
      </div>
      <div class="results tall">
        {q ? (
          results.length ? results.map((it) => <ItemRow key={it.id} it={it} onPick={setPick} showRack />) : <Empty hi="नहीं मिला" en="Not found" />
        ) : (
          <Empty hi="नाम लिखें, रैक और खाना दिखेगा" en="Type a name to see its rack and price" />
        )}
      </div>
      <p class="note">स्टॉक की गिनती फ़ेज़ 2 में आएगी · Stock counts arrive in Phase 2</p>
      {pick && (
        <Sheet onClose={() => setPick(null)} label={showName(pick)}>
          <div class="sheet-head">
            <div>
              <h2>{showName(pick)} {pick.pack}</h2>
              <p class="muted">{pick.en}</p>
            </div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setPick(null)}>
              <Icon name="x" />
            </button>
          </div>
          <div class="facts">
            <div><small>कहां · Where</small><b>{rackText(pick.rack)}</b></div>
            <div><small>दाम · Price</small><b>{pick.price == null ? 'दाम नहीं डाला · Not set' : money(pick.price) + (pick.loose ? ' / kg' : '')}</b></div>
            {pick.brands && <div><small>ब्रांड · Brands</small><b>{pick.brands}</b></div>}
          </div>
        </Sheet>
      )}
    </main>
  );
}
