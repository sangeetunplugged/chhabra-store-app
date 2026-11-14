import { useEffect, useState } from 'preact/hooks';
import { go, refresh, say, bump } from '../store.js';
import { allCustomers, balances, getCustomer, customerLedger, addCustomer, updateCustomer, receivePayment, addUdhaar, getSettings, mode } from '../db.js';
import { money, dateText, toInt, phone10 } from '../format.js';
import { Icon, TopBar, Keypad, AmountSheet, Sheet, Empty } from '../ui.jsx';
import { reminderText, openWhatsApp, beep } from '../printing.js';

export function Khata() {
  const [list, setList] = useState([]);
  const [bal, setBal] = useState({});
  const [q, setQ] = useState('');
  useEffect(() => {
    allCustomers().then(setList);
    balances().then(setBal);
  }, [refresh.value, mode.value]);
  const total = Object.values(bal).reduce((a, x) => a + Math.max(0, x), 0);
  const t = q.trim().toLowerCase();
  const shown = list
    .filter((c) => !t || c.name.toLowerCase().includes(t) || (c.phone || '').includes(t))
    .sort((a, b) => (bal[b.id] || 0) - (bal[a.id] || 0));
  return (
    <main class="screen">
      <TopBar title="खाता" sub="Khata" onBack={() => go('home')} />
      <div class="khata-total">
        <span class="two"><b>कुल उधार</b><small>Total due from customers</small></span>
        <b class="brown">{money(total)}</b>
      </div>
      <div class="search-row">
        <label class="search">
          <Icon name="search" size={22} />
          <input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="ग्राहक का नाम · Customer" aria-label="ग्राहक खोजें · Search customers" />
        </label>
      </div>
      <div class="cust-list">
        {shown.length === 0 && <Empty hi="कोई ग्राहक नहीं" en="No customers yet" />}
        {shown.map((c) => (
          <button type="button" key={c.id} class="cust" onClick={() => go('customer', { id: c.id })}>
            <span class="two"><b>{c.name}</b><small>{c.phone || 'फ़ोन नहीं · no phone'}</small></span>
            <span class="end"><small>बाकी · Due</small><b class="brown">{money(bal[c.id] || 0)}</b></span>
          </button>
        ))}
      </div>
      <div class="bottom-pad">
        <button type="button" class="btn brown big" onClick={() => go('newCustomer')}>
          <b>+ नया ग्राहक</b>
          <small>New customer</small>
        </button>
      </div>
    </main>
  );
}

const TYPE = {
  opening: 'पुराना बाकी · Opening',
  udhaar: 'बिल · Bill',
  payment: 'पैसे मिले · Paid',
  manual: 'उधार जोड़ा · Added',
  cancel: 'बिल रद्द · Bill cancelled',
  return: 'वापसी · Return'
};

function PhoneSheet({ initial, onDone, onClose }) {
  const [v, setV] = useState(initial || '');
  const press = (k) => {
    if (k === 'del') setV(v.slice(0, -1));
    else if (v.length < 10) setV((v + k).slice(0, 10));
  };
  return (
    <Sheet onClose={onClose} label="फ़ोन नंबर · Phone number">
      <div class="sheet-head">
        <div><h2>फ़ोन नंबर</h2><p class="muted">Phone number, 10 digits</p></div>
        <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div class="amount-box">{v || '—'}</div>
      <Keypad onKey={press} compact />
      <button type="button" class="btn primary big" disabled={v.length !== 10} onClick={() => onDone(v)}>
        <b>सेव करें</b><small>Save</small>
      </button>
    </Sheet>
  );
}

export function Customer({ id }) {
  const [c, setC] = useState(null);
  const [rows, setRows] = useState([]);
  const [st, setSt] = useState(null);
  const [sheet, setSheet] = useState('');
  const [amt, setAmt] = useState(0);

  useEffect(() => {
    getCustomer(id).then(setC);
    customerLedger(id).then((r) => setRows(r.sort((a, b) => b.at - a.at)));
    getSettings().then(setSt);
  }, [id, refresh.value]);

  if (!c) return <main class="screen" />;
  const bal = rows.reduce((a, e) => a + e.amount, 0);

  async function received(mode2) {
    await receivePayment(id, amt, mode2);
    setSheet('');
    beep();
    bump();
    say(money(amt) + ' जमा हुए · received');
  }

  async function added(n) {
    await addUdhaar(id, n, 'हाथ से जोड़ा');
    setSheet('');
    bump();
    say(money(n) + ' उधार जोड़ा · added');
  }

  async function savePhone(p) {
    await updateCustomer(id, { phone: p });
    setSheet('');
    bump();
  }

  function remind() {
    if (!c.phone) {
      setSheet('phone');
      return;
    }
    openWhatsApp(reminderText(c.name, bal, st), c.phone);
  }

  return (
    <main class="screen">
      <TopBar title={c.name} sub={c.phone || 'फ़ोन नहीं · no phone'} onBack={() => go('khata')} />
      <div class="khata-total">
        <span class="two"><b>बाकी</b><small>Due</small></span>
        <b class="brown big-num">{money(bal)}</b>
      </div>
      <div class="cust-actions">
        <button type="button" class="btn green" onClick={() => setSheet('pay')}>
          <b>पैसे मिले</b><small>Payment received</small>
        </button>
        <button type="button" class="btn brown" onClick={() => setSheet('add')}>
          <b>उधार जोड़ें</b><small>Add udhaar</small>
        </button>
        <button type="button" class="btn outline green-text wide" onClick={remind} disabled={bal <= 0}>
          <Icon name="chat" size={22} />
          <b>WhatsApp पर याद दिलाएं</b>
        </button>
      </div>
      <h2 class="section-title">हिसाब · Entries</h2>
      <div class="entries">
        {rows.length === 0 && <Empty hi="अभी कुछ नहीं" en="Nothing yet" />}
        {rows.map((e) => (
          <div class="entry" key={e.id}>
            <span class="two">
              <b>{TYPE[e.type] || e.type}{e.billNo ? ' ' + e.billNo : ''}{e.mode ? ' · ' + (e.mode === 'upi' ? 'UPI' : 'नकद') : ''}</b>
              <small>{dateText(e.at)}{e.note ? ' · ' + e.note : ''}</small>
            </span>
            <b class={e.amount < 0 ? 'green-text' : 'brown'}>{e.amount < 0 ? '− ' + money(-e.amount) : '+ ' + money(e.amount)}</b>
          </div>
        ))}
      </div>
      {!c.phone && (
        <div class="bottom-pad">
          <button type="button" class="btn outline" onClick={() => setSheet('phone')}>
            <b>फ़ोन नंबर जोड़ें</b><small>Add phone number</small>
          </button>
        </div>
      )}

      {sheet === 'pay' && (
        <AmountSheet title="कितने पैसे मिले?" sub={'Payment received from ' + c.name} okText={['आगे', 'Next']}
          onDone={(n) => { setAmt(n); setSheet('mode'); }} onClose={() => setSheet('')} />
      )}
      {sheet === 'mode' && (
        <Sheet onClose={() => setSheet('')} label="कैसे मिले? · How was it paid?">
          <div class="sheet-head">
            <div><h2>{money(amt)} कैसे मिले?</h2><p class="muted">How was it paid?</p></div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setSheet('')}><Icon name="x" /></button>
          </div>
          <div class="split-row">
            <button type="button" class="btn green big" onClick={() => received('cash')}><b>नकद</b><small>Cash</small></button>
            <button type="button" class="btn primary big" onClick={() => received('upi')}><b>UPI</b><small>UPI</small></button>
          </div>
        </Sheet>
      )}
      {sheet === 'add' && (
        <AmountSheet title="उधार जोड़ें" sub={'Add to ' + c.name + "'s khata without a bill"} okText={['खाते में जोड़ें', 'Add to khata']}
          onDone={added} onClose={() => setSheet('')} />
      )}
      {sheet === 'phone' && <PhoneSheet initial={c.phone} onDone={savePhone} onClose={() => setSheet('')} />}
    </main>
  );
}

export function NewCustomer({ back }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [opening, setOpening] = useState('');
  async function save() {
    if (!name.trim()) {
      say('नाम लिखें · Type the name');
      return;
    }
    if (phone && !phone10(phone)) {
      say('फ़ोन नंबर 10 अंक का हो · Phone needs 10 digits');
      return;
    }
    const id = await addCustomer(name, phone10(phone), toInt(opening));
    bump();
    beep();
    if (back === 'udhaar') go('udhaar', { customerId: id });
    else go('customer', { id });
  }
  return (
    <main class="screen pad-screen">
      <TopBar title="नया ग्राहक" sub="New customer" onBack={() => go(back || 'khata')} />
      <label class="field">
        <span>नाम · Name</span>
        <input value={name} onInput={(e) => setName(e.currentTarget.value)} autocomplete="off" />
      </label>
      <label class="field">
        <span>फ़ोन (अगर है) · Phone, if any</span>
        <input value={phone} inputMode="numeric" maxLength={10} onInput={(e) => setPhone(e.currentTarget.value.replace(/\D/g, ''))} />
      </label>
      <label class="field">
        <span>पुराना बाकी (अगर है) · Old balance, if any</span>
        <input value={opening} inputMode="numeric" onInput={(e) => setOpening(e.currentTarget.value.replace(/\D/g, ''))} />
      </label>
      <button type="button" class="btn brown big" onClick={save}>
        <b>ग्राहक सेव करें</b><small>Save customer</small>
      </button>
    </main>
  );
}
