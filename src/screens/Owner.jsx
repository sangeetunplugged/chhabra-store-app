import { useEffect, useState } from 'preact/hooks';
import { go, ownerOk, refresh, say, bump, clearBill } from '../store.js';
import { getSettings, setSettings, allItems, getItem, saveItem, mode, switchMode as changeMode, resetPractice } from '../db.js';
import { money, showName } from '../format.js';
import { Icon, TopBar, Keypad, Sheet, Scanner, Empty } from '../ui.jsx';
import { btPair, printBill, testBill, beep } from '../printing.js';
import { shareBackup, restoreBackup } from '../backup.js';
import { cloud } from '../cloudState.js';
import { RACKS } from '../racks.js';
import { searchItems } from './Bill.jsx';

function readPin() {
  try {
    return localStorage.getItem('chhabra-pin') || '';
  } catch (e) {
    return '';
  }
}

function writePin(p) {
  try {
    localStorage.setItem('chhabra-pin', p);
  } catch (e) {
    /* ignore */
  }
}

function PinPad({ title, sub, onDone }) {
  const [v, setV] = useState('');
  const press = (k) => {
    if (k === 'del') setV(v.slice(0, -1));
    else if (k !== '00' && v.length < 4) {
      const n = v + k;
      setV(n);
      if (n.length === 4) setTimeout(() => { onDone(n); setV(''); }, 120);
    }
  };
  return (
    <div class="pin">
      <h2>{title}</h2>
      <p class="muted">{sub}</p>
      <div class="pin-dots" aria-label={v.length + ' of 4'}>
        {[0, 1, 2, 3].map((i) => <span key={i} class={i < v.length ? 'on' : ''} />)}
      </div>
      <Keypad onKey={press} />
    </div>
  );
}

export function Owner() {
  const [pin, setPin] = useState(readPin());
  const [st, setSt] = useState(null);
  const [ask, setAsk] = useState('');
  useEffect(() => {
    getSettings().then(setSt);
  }, [refresh.value, mode.value]);

  if (!ownerOk.value) {
    if (!pin) {
      return (
        <main class="screen pad-screen">
          <TopBar title="मालिक की सेटिंग" sub="Owner settings" onBack={() => go('home')} />
          <PinPad title="नया PIN बनाएं" sub="Create a 4-digit PIN for Rajan and your brother. Keep it away from the counter."
            onDone={(p) => { writePin(p); setPin(p); ownerOk.value = true; beep(); }} />
        </main>
      );
    }
    return (
      <main class="screen pad-screen">
        <TopBar title="मालिक की सेटिंग" sub="Owner settings" onBack={() => go('home')} />
        <PinPad title="PIN डालें" sub="Enter the owner PIN"
          onDone={(p) => { if (p === pin) { ownerOk.value = true; beep(); } else { beep(false); say('गलत PIN · Wrong PIN'); } }} />
      </main>
    );
  }

  const practice = mode.value === 'practice';

  async function switchMode() {
    clearBill();
    await changeMode(practice ? 'real' : 'practice');
    setAsk('');
    bump();
    say(practice ? 'असली हिसाब शुरू · Real accounts on' : 'अभ्यास मोड · Practice mode on');
  }

  async function wipePractice() {
    clearBill();
    await resetPractice();
    setAsk('');
    bump();
    say('अभ्यास डेटा साफ़ · Practice data cleared');
  }

  return (
    <main class="screen">
      <TopBar title="मालिक की सेटिंग" sub="Owner settings" onBack={() => go('home')} />
      <div class={'mode-card ' + (practice ? 'practice' : 'real')}>
        <span class="two">
          <b>{practice ? 'अभ्यास मोड चालू' : 'असली हिसाब चालू'}</b>
          <small>{practice ? 'Practice mode: sample prices, nothing counts' : 'Real mode: every bill counts'}</small>
        </span>
        <button type="button" class="btn small-btn" onClick={() => setAsk('mode')}>{practice ? 'असली शुरू करें' : 'अभ्यास पर जाएं'}</button>
      </div>
      <div class="menu">
        <button type="button" class="row-btn" onClick={() => go('shop')}>
          <Icon name="bag" size={28} /><span class="two"><b>दुकान और UPI</b><small>Shop details and UPI ID{st && !st.upiId ? ' · not set' : ''}</small></span>
        </button>
        <button type="button" class="row-btn" onClick={() => go('printer')}>
          <Icon name="print" size={28} /><span class="two"><b>प्रिंटर</b><small>Printer · {st ? { none: 'not set', bluetooth: 'Bluetooth', rawbt: 'RawBT app', system: 'phone print' }[st.printer] : ''}</small></span>
        </button>
        <button type="button" class="row-btn" onClick={() => go('items')}>
          <Icon name="box" size={28} /><span class="two"><b>सामान और दाम</b><small>Items, prices, barcodes, quick tiles</small></span>
        </button>
        <button type="button" class="row-btn" onClick={() => go('cloud')}>
          <Icon name="cloud" size={28} /><span class="two"><b>क्लाउड</b><small>Cloud backup and sync · {cloud.value.login ? 'signed in: ' + cloud.value.login : 'not signed in'}</small></span>
        </button>
        <button type="button" class="row-btn" onClick={() => go('backup')}>
          <Icon name="undo" size={28} /><span class="two"><b>बैकअप</b><small>Send or restore a backup</small></span>
        </button>
        <button type="button" class="row-btn" onClick={() => go('pin')}>
          <Icon name="lock" size={28} /><span class="two"><b>PIN बदलें</b><small>Change PIN</small></span>
        </button>
        {practice && (
          <button type="button" class="row-btn" onClick={() => setAsk('wipe')}>
            <Icon name="x" size={28} /><span class="two"><b>अभ्यास डेटा साफ़ करें</b><small>Clear practice bills and start fresh</small></span>
          </button>
        )}
      </div>
      <p class="note center">Chhabra Store app · Phase 1 · {practice ? 'practice' : 'real'} data on this phone</p>

      {ask === 'mode' && (
        <Sheet onClose={() => setAsk('')} label="मोड बदलें · Switch mode">
          <div class="sheet-head">
            <div>
              <h2>{practice ? 'असली हिसाब शुरू करें?' : 'अभ्यास मोड पर जाएं?'}</h2>
              <p class="muted">{practice
                ? 'Real bills, khata and day close start from zero. Shop details, UPI ID, printer and learned barcodes come along. Practice prices stay behind: set real prices in Items, or the app asks each one once.'
                : 'Real data stays safe. Practice uses its own sample data.'}</p>
            </div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setAsk('')}><Icon name="x" /></button>
          </div>
          <button type="button" class={'btn big ' + (practice ? 'primary' : 'dark')} onClick={switchMode}>
            <b>{practice ? 'हां, असली शुरू करें' : 'हां, अभ्यास पर जाएं'}</b><small>{practice ? 'Yes, start real accounts' : 'Yes, switch to practice'}</small>
          </button>
        </Sheet>
      )}
      {ask === 'wipe' && (
        <Sheet onClose={() => setAsk('')} label="अभ्यास डेटा साफ़ करें · Clear practice data">
          <div class="sheet-head">
            <div><h2>अभ्यास डेटा साफ़ करें?</h2><p class="muted">Practice bills and practice khata are deleted. Real data is not touched.</p></div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setAsk('')}><Icon name="x" /></button>
          </div>
          <button type="button" class="btn dark big" onClick={wipePractice}><b>हां, साफ़ करें</b><small>Yes, clear it</small></button>
        </Sheet>
      )}
    </main>
  );
}

export function Field({ label, value, onInput, type = 'text', mode: im, placeholder }) {
  return (
    <label class="field">
      <span>{label}</span>
      <input type={type} inputMode={im} value={value} placeholder={placeholder} onInput={(e) => onInput(e.currentTarget.value)} autocomplete="off" />
    </label>
  );
}

export function useOwnerGuard() {
  useEffect(() => {
    if (!ownerOk.value) go('owner');
  }, []);
  return ownerOk.value;
}

export function Shop() {
  const ok = useOwnerGuard();
  const [f, setF] = useState(null);
  useEffect(() => {
    getSettings().then(setF);
  }, [mode.value]);
  if (!ok || !f) return <main class="screen" />;
  const set = (k) => (v) => setF({ ...f, [k]: v });
  async function save() {
    const upi = f.upiId.trim();
    if (upi && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upi)) {
      say('UPI ID ऐसा हो: naam@bank · UPI ID looks like name@bank');
      return;
    }
    await setSettings({ shopName: f.shopName.trim(), shopNameHi: f.shopNameHi.trim(), address: f.address.trim(), phone: f.phone.trim(), ownerPhone: (f.ownerPhone || '').replace(/\D/g, '').slice(-10), upiId: upi, upiName: f.upiName.trim() });
    beep();
    bump();
    say('सेव हुआ · Saved');
    go('owner');
  }
  return (
    <main class="screen pad-screen">
      <TopBar title="दुकान और UPI" sub="Shop details and UPI ID" onBack={() => go('owner')} />
      <Field label="दुकान का नाम (हिंदी) · Shop name in Hindi" value={f.shopNameHi} onInput={set('shopNameHi')} />
      <Field label="Shop name (bill and WhatsApp)" value={f.shopName} onInput={set('shopName')} />
      <Field label="पता · Address" value={f.address} onInput={set('address')} />
      <Field label="फ़ोन · Shop phone" value={f.phone} onInput={set('phone')} mode="numeric" />
      <Field label="मालिक का WhatsApp · Owner's WhatsApp (day-close summary goes here)" value={f.ownerPhone || ''} onInput={set('ownerPhone')} mode="numeric" />
      <Field label="UPI ID (जैसे naam@okhdfcbank)" value={f.upiId} onInput={set('upiId')} placeholder="name@bank" />
      <Field label="UPI पर दिखने वाला नाम · Name shown in UPI apps" value={f.upiName} onInput={set('upiName')} />
      <p class="note">Mode: {mode.value}. Practice and real keep separate settings, so set this in real mode too.</p>
      <button type="button" class="btn primary big" onClick={save}><b>सेव करें</b><small>Save</small></button>
    </main>
  );
}

export function Printer() {
  const ok = useOwnerGuard();
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    getSettings().then(setSt);
  }, [refresh.value, mode.value]);
  if (!ok || !st) return <main class="screen" />;
  async function pick(p) {
    await setSettings({ printer: p });
    setSt({ ...st, printer: p });
  }
  async function pair() {
    try {
      const name = await btPair();
      setMsg('जुड़ गया · Connected: ' + name);
    } catch (e) {
      setMsg((e && e.message) || 'नहीं जुड़ा · Not connected');
    }
  }
  async function test() {
    try {
      await printBill(testBill(), st, {});
      setMsg('टेस्ट भेजा · Test sent');
    } catch (e) {
      setMsg((e && e.message) || 'प्रिंट नहीं हुआ · Not printed');
    }
  }
  const opts = [
    ['bluetooth', 'ब्लूटूथ (सीधा)', 'Bluetooth, straight from the app (BLE printers)'],
    ['rawbt', 'RawBT ऐप से', 'Through the RawBT app (most Bluetooth printers)'],
    ['system', 'फ़ोन का प्रिंट', "Phone's own print screen"],
    ['none', 'प्रिंटर नहीं', 'No printer: WhatsApp bills only']
  ];
  return (
    <main class="screen pad-screen">
      <TopBar title="प्रिंटर" sub="Printer" onBack={() => go('owner')} />
      <div class="radio-list">
        {opts.map(([v, hi, en]) => (
          <button type="button" key={v} class={'radio' + (st.printer === v ? ' on' : '')} aria-pressed={st.printer === v} onClick={() => pick(v)}>
            <span class="dot" /><span class="two"><b>{hi}</b><small>{en}</small></span>
          </button>
        ))}
      </div>
      <label class="check">
        <input type="checkbox" checked={!!st.autoPrint} onChange={async (e) => { await setSettings({ autoPrint: e.currentTarget.checked }); setSt({ ...st, autoPrint: e.currentTarget.checked }); }} />
        <span class="two"><b>हर बिल अपने आप प्रिंट हो</b><small>Print every bill automatically</small></span>
      </label>
      {st.printer === 'bluetooth' && (
        <button type="button" class="btn outline" onClick={pair}><b>प्रिंटर जोड़ें</b><small>Pair the printer (once)</small></button>
      )}
      {st.printer !== 'none' && (
        <button type="button" class="btn primary big" onClick={test}><b>टेस्ट प्रिंट</b><small>Print a test bill</small></button>
      )}
      {msg && <p class="note center">{msg}</p>}
      <p class="note">Bills print in English on 58 mm paper. Hindi names show on screen and on WhatsApp.</p>
    </main>
  );
}

export function Items() {
  const ok = useOwnerGuard();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('noprice');
  useEffect(() => {
    allItems().then(setItems);
  }, [refresh.value, mode.value]);
  if (!ok) return <main class="screen" />;
  const PRIO = { Must: 0, Good: 1, Season: 2 };
  const ordered = items.slice().sort((a, b) => (b.quick > 0) - (a.quick > 0) || (PRIO[a.prio] ?? 3) - (PRIO[b.prio] ?? 3) || (a.cat || '').localeCompare(b.cat || '') || a.en.localeCompare(b.en));
  let shown = q ? searchItems(items, q) : ordered;
  if (!q) {
    if (filter === 'noprice') shown = ordered.filter((i) => i.price == null && i.active !== false);
    if (filter === 'quick') shown = items.filter((i) => i.quick > 0).sort((a, b) => a.quick - b.quick);
    if (filter === 'off') shown = ordered.filter((i) => i.active === false);
  }
  const noPrice = items.filter((i) => i.price == null && i.active !== false).length;
  return (
    <main class="screen">
      <TopBar title="सामान और दाम" sub={'Items · ' + items.length + ' total · ' + noPrice + ' without price'} onBack={() => go('owner')} right={null} />
      <div class="top-action">
        <button type="button" class="btn primary" onClick={() => go('item', { id: '' })}><b>+ नया सामान</b><small>New item</small></button>
      </div>
      <div class="search-row">
        <label class="search">
          <Icon name="search" size={22} />
          <input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="खोजें · Search" aria-label="सामान खोजें · Search items" />
        </label>
      </div>
      {!q && (
        <div class="filters">
          {[['noprice', 'बिना दाम · No price'], ['quick', 'जल्दी वाले · Quick'], ['all', 'सब · All'], ['off', 'बंद · Hidden']].map(([v, label]) => (
            <button type="button" key={v} class={filter === v ? 'on' : ''} aria-pressed={filter === v} onClick={() => setFilter(v)}>{label}</button>
          ))}
        </div>
      )}
      <div class="results tall">
        {shown.length === 0 && <Empty hi="कुछ नहीं" en="Nothing here" />}
        {shown.slice(0, 120).map((it) => (
          <button type="button" key={it.id} class="item-row" onClick={() => go('item', { id: it.id })}>
            <span class="two"><b>{showName(it)} {it.pack ? <em>{it.pack}</em> : null}</b><small>{it.en} · {it.rack}{it.quick ? ' · tile ' + it.quick : ''}{(it.barcodes || []).length ? ' · ' + it.barcodes.length + ' barcode' : ''}</small></span>
            <span class={'price' + (it.price == null ? ' none' : '')}>{it.price == null ? 'दाम नहीं' : money(it.price) + (it.loose ? '/kg' : '')}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

export function Item({ id }) {
  const ok = useOwnerGuard();
  const [it, setIt] = useState(null);
  const [scan, setScan] = useState(false);
  useEffect(() => {
    if (id) getItem(id).then((x) => setIt(x ? { ...x, priceText: x.price == null ? '' : String(x.price) } : null));
    else setIt({ id: '', en: '', hi: '', pack: '', cat: 'Other', rack: 'C', prio: 'Good', price: null, priceText: '', loose: false, barcodes: [], quick: 0, active: true });
  }, [id]);
  if (!ok || !it) return <main class="screen" />;
  const set = (k) => (v) => setIt({ ...it, [k]: v });
  async function save() {
    if (!it.en.trim() && !it.hi.trim()) {
      say('नाम लिखें · Type a name');
      return;
    }
    const price = it.priceText === '' ? null : Math.round(Number(it.priceText));
    if (it.priceText !== '' && !(price > 0)) {
      say('दाम सही लिखें · Type a valid price');
      return;
    }
    const rec = { ...it, en: it.en.trim() || it.hi.trim(), hi: it.hi.trim(), pack: it.pack.trim(), price, quick: Number(it.quick) || 0 };
    delete rec.priceText;
    if (!rec.id) rec.id = 'custom-' + Date.now().toString(36);
    await saveItem(rec);
    beep();
    bump();
    say('सेव हुआ · Saved');
    go('items');
  }
  return (
    <main class="screen pad-screen">
      <TopBar title={id ? showName(it) : 'नया सामान'} sub={id ? it.en : 'New item'} onBack={() => go('items')} right={null} />
      <Field label="हिंदी नाम · Hindi name" value={it.hi} onInput={set('hi')} />
      <Field label="English name (printed on the bill)" value={it.en} onInput={set('en')} />
      <Field label="पैक · Pack size (e.g. 1 kg, 500 ml)" value={it.pack} onInput={set('pack')} />
      <Field label={it.loose ? 'किलो का दाम · Price per kg' : 'बेचने का दाम (MRP) · Selling price'} value={it.priceText} onInput={(v) => set('priceText')(v.replace(/[^\d]/g, ''))} mode="numeric" />
      <label class="check">
        <input type="checkbox" checked={!!it.loose} onChange={(e) => set('loose')(e.currentTarget.checked)} />
        <span class="two"><b>खुला सामान, तौलकर</b><small>Loose: sold by weight or by ₹</small></span>
      </label>
      <label class="check">
        <input type="checkbox" checked={it.active !== false} onChange={(e) => set('active')(e.currentTarget.checked)} />
        <span class="two"><b>बिक्री में दिखे</b><small>Show in billing</small></span>
      </label>
      <label class="field">
        <span>जल्दी वाला टाइल नंबर (0 = नहीं) · Quick tile position, 0 = off</span>
        <input type="number" min="0" max="24" value={it.quick} onInput={(e) => set('quick')(e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>रैक · Rack</span>
        <select value={it.rack} onChange={(e) => set('rack')(e.currentTarget.value)}>
          {Object.keys(RACKS).map((k) => <option key={k} value={k}>{k} · {RACKS[k].en}</option>)}
        </select>
      </label>
      <div class="field">
        <span>बारकोड · Barcodes</span>
        <div class="codes">
          {(it.barcodes || []).map((c) => (
            <button type="button" key={c} class="code" aria-label={'हटाएं ' + c} onClick={() => setIt({ ...it, barcodes: it.barcodes.filter((x) => x !== c) })}>
              {c} <Icon name="x" size={14} />
            </button>
          ))}
          <button type="button" class="code add" onClick={() => setScan(true)}><Icon name="scan" size={18} /> स्कैन से जोड़ें · Add by scan</button>
        </div>
      </div>
      <button type="button" class="btn primary big" onClick={save}><b>सेव करें</b><small>Save</small></button>
      {scan && (
        <Scanner onClose={() => setScan(false)} onCode={(c) => { setScan(false); setIt({ ...it, barcodes: [...new Set([...(it.barcodes || []), String(c)])] }); }} />
      )}
    </main>
  );
}

export function Backup() {
  const ok = useOwnerGuard();
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  if (!ok) return <main class="screen" />;
  async function send() {
    try {
      const r = await shareBackup();
      setMsg(r === 'downloaded' ? 'फ़ाइल सेव हुई · File saved to Downloads' : r === 'shared' ? 'भेजा · Sent' : '');
    } catch (e) {
      setMsg('बैकअप नहीं बना · Backup failed');
    }
  }
  async function restore() {
    try {
      const data = await restoreBackup(file);
      clearBill();
      bump();
      setMsg('वापस आ गया · Restored ' + (data.mode === 'real' ? 'real' : 'practice') + ' backup from ' + new Date(data.at).toLocaleString('en-IN'));
      setFile(null);
    } catch (e) {
      setMsg('यह बैकअप फ़ाइल नहीं है · Not a Chhabra Store backup file');
    }
  }
  return (
    <main class="screen pad-screen">
      <TopBar title="बैकअप" sub={'Backup · ' + mode.value + ' data'} onBack={() => go('owner')} />
      <p class="lead">अभी सारा हिसाब इसी फ़ोन में है। रोज़ बैकअप WhatsApp पर Rajan को भेजें · Until the cloud is connected, all data is on this phone. Send a backup every day.</p>
      <button type="button" class="btn green big" onClick={send}><b>बैकअप भेजें</b><small>Send backup (WhatsApp, Drive or file)</small></button>
      <h2 class="section-title">बैकअप से वापस लाएं · Restore</h2>
      <label class="field">
        <span>बैकअप फ़ाइल चुनें · Pick a backup file</span>
        <input type="file" accept="application/json,.json" onChange={(e) => setFile(e.currentTarget.files[0] || null)} />
      </label>
      {file && (
        <button type="button" class="btn dark" onClick={restore}><b>वापस लाएं</b><small>Restore: replaces this phone's data for the backup's mode (real or practice)</small></button>
      )}
      {msg && <p class="note center">{msg}</p>}
    </main>
  );
}

export function Pin() {
  const ok = useOwnerGuard();
  if (!ok) return <main class="screen" />;
  return (
    <main class="screen pad-screen">
      <TopBar title="PIN बदलें" sub="Change PIN" onBack={() => go('owner')} />
      <PinPad title="नया PIN" sub="Type the new 4-digit PIN" onDone={(p) => { writePin(p); beep(); say('PIN बदला · PIN changed'); go('owner'); }} />
    </main>
  );
}
