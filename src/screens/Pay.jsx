import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import { go, lines, pay, route, refresh, say, bump, clearBill } from '../store.js';
import { saveBill, getBill, getSettings, allCustomers, balances, getCustomer, mode } from '../db.js';
import { money, billTotal, itemCount, typed, toInt, dateTimeText } from '../format.js';
import { Icon, TopBar, Keypad, Empty } from '../ui.jsx';
import { printBill, receiptLines, billText, openWhatsApp, upiLink, beep } from '../printing.js';

let busy = false;

async function finishBill(patch) {
  if (busy) return;
  busy = true;
  try {
    const p = { ...pay.value, ...patch };
    const ls = lines.value;
    const total = billTotal(ls);
    const id = await saveBill({
      lines: ls,
      total,
      pay: {
        cash: p.cash || 0, upi: p.upi || 0, udhaar: p.udhaar || 0,
        given: p.given || 0, change: p.change || 0, customerId: p.customerId || null
      }
    });
    beep();
    clearBill();
    bump();
    go('done', { id, fresh: true });
  } catch (e) {
    beep(false);
    say('बिल सेव नहीं हुआ, फिर दबाएं · Bill not saved, press again');
  } finally {
    busy = false;
  }
}

function useDue() {
  const p = pay.value;
  useEffect(() => {
    if (!p) go(lines.value.length ? 'bill' : 'home');
  }, [p]);
  if (!p) return null;
  return { p, due: Math.max(0, p.total - p.cash - p.upi - p.udhaar) };
}

function DueRight({ due }) {
  return (
    <span class="top-total">
      <small>बाकी · Due</small>
      <b>{money(due)}</b>
    </span>
  );
}

export function Pay() {
  const d = useDue();
  if (!d) return null;
  const { p, due } = d;
  const paidSoFar = p.cash + p.upi + p.udhaar;
  return (
    <main class="screen pad-screen">
      <TopBar title="पैसे लें" sub="Take payment" onBack={() => go('bill')} />
      <div class="big-total">
        <small>{itemCount(lines.value)} सामान · items</small>
        <b>{money(due)}</b>
        {paidSoFar > 0 && <small>{money(paidSoFar)} मिल चुके · already paid</small>}
      </div>
      <div class="pay-options">
        <button type="button" class="btn green pay-opt" onClick={() => go('cash')}>
          <Icon name="cash" size={38} />
          <span class="two"><b>नकद</b><small>Cash</small></span>
        </button>
        <button type="button" class="btn primary pay-opt" onClick={() => go('upi')}>
          <Icon name="qr" size={38} />
          <span class="two"><b>UPI</b><small>QR से · By QR</small></span>
        </button>
        <button type="button" class="btn brown pay-opt" onClick={() => go('udhaar')}>
          <Icon name="book" size={38} />
          <span class="two"><b>उधार</b><small>Udhaar · khata</small></span>
        </button>
      </div>
      <p class="note center">गलती हुई? पीछे जाकर सामान बदलें · Made a mistake? Go back and change the items</p>
    </main>
  );
}

export function Cash() {
  const d = useDue();
  const [v, setV] = useState('');
  if (!d) return null;
  const { p, due } = d;
  const given = toInt(v);
  const enough = given > 0 && given >= due;
  const short = given > 0 && given < due;

  function finish() {
    if (!enough) {
      say(given ? 'रकम कम है। बाकी UPI या उधार में डालें · Not enough: put the rest on UPI or khata' : 'ग्राहक ने कितने दिए? · How much did the customer give?');
      return;
    }
    finishBill({ cash: p.cash + due, given, change: given - due });
  }

  function split(to) {
    pay.value = { ...p, cash: p.cash + given, given, change: 0 };
    go(to);
  }

  return (
    <main class="screen pad-screen">
      <TopBar title="नकद" sub="Cash" onBack={() => go('pay')} right={<DueRight due={due} />} />
      <div class="readout">
        <span class="two"><b class="label">ग्राहक ने दिए</b><small>Customer gave</small></span>
        <b>{money(given)}</b>
      </div>
      <div class="presets five">
        {[50, 100, 200, 500].map((n) => (
          <button type="button" key={n} class="green-outline" onClick={() => setV(String(n))}>₹{n}</button>
        ))}
        <button type="button" class="green-outline" onClick={() => setV(String(due))}>पूरे</button>
      </div>
      <Keypad onKey={(k) => setV(typed(v, k))} compact />
      {short ? (
        <div class="split">
          <p>बाकी {money(due - given)} · Still due</p>
          <div class="split-row">
            <button type="button" class="btn primary" onClick={() => split('upi')}><b>बाकी UPI से</b><small>Rest by UPI</small></button>
            <button type="button" class="btn brown" onClick={() => split('udhaar')}><b>बाकी उधार में</b><small>Rest on khata</small></button>
          </div>
        </div>
      ) : (
        <div class={'change' + (enough ? '' : ' muted-box')}>
          <span class="two"><b>वापस दें</b><small>Give back</small></span>
          <b class="change-amt">{enough ? money(given - due) : '—'}</b>
        </div>
      )}
      <button type="button" class="btn green big" onClick={finish}>
        <b>बिल पूरा करें</b>
        <small>Finish bill</small>
      </button>
    </main>
  );
}

export function Upi() {
  const d = useDue();
  const [st, setSt] = useState(null);
  const [qr, setQr] = useState('');
  const due = d ? d.due : 0;
  const practice = mode.value === 'practice';

  useEffect(() => {
    if (!d) return;
    getSettings().then(async (s) => {
      setSt(s);
      try {
        if (practice) setQr(await QRCode.toDataURL('PRACTICE ONLY - NOT A PAYMENT CODE', { width: 520, margin: 1 }));
        else if (s.upiId) setQr(await QRCode.toDataURL(upiLink(s, due, 'Chhabra Store bill'), { width: 520, margin: 1, errorCorrectionLevel: 'M' }));
        else setQr('');
      } catch (e) {
        setQr('');
      }
    });
  }, [due, practice]);

  if (!d) return null;
  return (
    <main class="screen pad-screen">
      <TopBar title="UPI" sub="QR से पैसे · Pay by QR" onBack={() => go('pay')} />
      <div class="qr-card">
        {qr ? <img src={qr} alt={practice ? 'नमूना QR · Practice QR' : 'UPI QR ' + money(due)} /> : (
          <div class="qr-missing">
            <Icon name="qr" size={48} />
            <p>दुकान का UPI ID मालिक की सेटिंग में डालें · Add the shop's UPI ID in Owner settings</p>
          </div>
        )}
        <b class="qr-amt">{money(due)}</b>
        <small>{practice ? 'अभ्यास QR, पैसे नहीं जाएंगे · Practice QR, no money moves' : st && st.upiId ? (st.upiName || st.shopName) + ' · ' + st.upiId : ''}</small>
      </div>
      <p class="warn">दुकान के फ़ोन पर पैसे आने का मैसेज देखकर ही दबाएं · Press only after the payment message arrives on the shop phone</p>
      <button type="button" class="btn green big" onClick={() => finishBill({ upi: due })}>
        <b>पैसे मिल गए</b>
        <small>Money received</small>
      </button>
    </main>
  );
}

export function Udhaar() {
  const d = useDue();
  const [list, setList] = useState([]);
  const [bal, setBal] = useState({});
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(route.value.p.customerId || null);

  useEffect(() => {
    allCustomers().then(setList);
    balances().then(setBal);
  }, [refresh.value, mode.value]);

  if (!d) return null;
  const { due } = d;
  const t = q.trim().toLowerCase();
  const shown = list
    .filter((c) => !t || c.name.toLowerCase().includes(t) || (c.phone || '').includes(t))
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = list.find((c) => c.id === sel);
  const before = chosen ? bal[chosen.id] || 0 : 0;

  return (
    <main class="screen">
      <TopBar title="उधार" sub="Udhaar · khata" onBack={() => go('pay')} right={<DueRight due={due} />} />
      <div class="search-row">
        <label class="search">
          <Icon name="search" size={22} />
          <input value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="ग्राहक का नाम · Customer" aria-label="ग्राहक खोजें · Search customers" />
        </label>
      </div>
      <div class="cust-list">
        {shown.length === 0 && <Empty hi="कोई ग्राहक नहीं मिला" en="No customer found" />}
        {shown.map((c) => (
          <button type="button" key={c.id} class={'cust' + (sel === c.id ? ' on' : '')} onClick={() => setSel(c.id)}>
            <span class="two"><b>{c.name}</b><small>{c.phone || 'फ़ोन नहीं · no phone'}</small></span>
            <span class="end"><small>बाकी · Due</small><b class="brown">{money(bal[c.id] || 0)}</b></span>
          </button>
        ))}
        <button type="button" class="btn dashed" onClick={() => go('newCustomer', { back: 'udhaar' })}>
          <b>+ नया ग्राहक</b>
          <small>New customer</small>
        </button>
      </div>
      {chosen && (
        <div class="confirm">
          <p>{chosen.name}: पुराना {money(before)} + आज {money(due)} = <b>{money(before + due)}</b></p>
          <button type="button" class="btn brown big" onClick={() => finishBill({ udhaar: due, customerId: chosen.id })}>
            <b>खाते में जोड़ें</b>
            <small>Add to khata</small>
          </button>
        </div>
      )}
    </main>
  );
}

export function Receipt({ bill, st, customer }) {
  return (
    <div class="receipt" aria-label="बिल · Receipt">
      {receiptLines(bill, st, { customer }).map((l, i) => (
        <div key={i} class={(l.center ? 'c ' : '') + (l.bold ? 'b ' : '') + (l.big ? 'big' : '')}>{l.t}</div>
      ))}
    </div>
  );
}

export function Done({ id, fresh }) {
  const [b, setB] = useState(null);
  const [st, setSt] = useState(null);
  const [cust, setCust] = useState(null);
  const [bal, setBal] = useState(null);
  const [printed, setPrinted] = useState('');

  useEffect(() => {
    (async () => {
      const bill = await getBill(id);
      const s = await getSettings();
      let c = null;
      if (bill && bill.pay && bill.pay.customerId) {
        c = await getCustomer(bill.pay.customerId);
        const m = await balances();
        setBal(m[bill.pay.customerId] || 0);
      }
      setB(bill);
      setSt(s);
      setCust(c);
      if (fresh && bill && s.autoPrint && s.printer !== 'none') doPrint(bill, s, c);
    })();
  }, [id]);

  async function doPrint(bill = b, s = st, c = cust) {
    try {
      await printBill(bill, s, { customer: c && c.name });
      setPrinted('प्रिंटर पर भेजा · Sent to the printer');
    } catch (e) {
      setPrinted('');
      say((e && e.message) || 'प्रिंट नहीं हुआ · Not printed');
    }
  }

  if (!b || !st) return <main class="screen" />;
  const p = b.pay;
  const parts = [];
  if (p.cash) parts.push('नकद ' + money(p.cash));
  if (p.upi) parts.push('UPI ' + money(p.upi));
  if (p.udhaar) parts.push((cust ? cust.name + ' के खाते में ' : 'उधार ') + money(p.udhaar));

  return (
    <main class="screen pad-screen done">
      <div class="done-head">
        <Icon name="check" size={56} color="#1B7F3B" stroke={2.25} />
        <span class="two">
          <b>बिल सेव हो गया</b>
          <small>Bill saved · Bill {b.no} · {dateTimeText(b.at)}</small>
        </span>
      </div>
      {p.change > 0 && (
        <div class="change big-change">
          <span class="two"><b>वापस दें</b><small>Give back</small></span>
          <b class="change-amt">{money(p.change)}</b>
        </div>
      )}
      <p class="paid-line">{parts.join(' + ')}{bal != null ? ' · कुल बाकी ' + money(bal) : ''}</p>
      {printed && <p class="muted small"><Icon name="print" size={16} /> {printed}</p>}
      <Receipt bill={b} st={st} customer={cust && cust.name} />
      <div class="done-actions">
        <div class="split-row">
          <button type="button" class="btn outline" onClick={() => doPrint()}>
            <Icon name="print" size={22} />
            <b>प्रिंट</b>
          </button>
          <button type="button" class="btn outline green-text" onClick={() => openWhatsApp(billText(b, st, { balance: bal }), cust && cust.phone)}>
            <Icon name="chat" size={22} />
            <b>WhatsApp</b>
          </button>
        </div>
        <button type="button" class="btn primary big" onClick={() => { clearBill(); go('bill'); }}>
          <b>अगला बिल</b>
          <small>Next bill</small>
        </button>
        <button type="button" class="btn ghost" onClick={() => go('home')}>
          <b>होम · Home</b>
        </button>
      </div>
    </main>
  );
}
