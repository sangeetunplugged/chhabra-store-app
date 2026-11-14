import { useEffect, useState } from 'preact/hooks';
import { go, refresh, say, bump } from '../store.js';
import { daySummary, getBill, getSettings, getCustomer, cancelBill, addReturn, allCustomers, saveClose, setSettings, mode } from '../db.js';
import { money, dayKey, dateText, timeText, toInt, typed } from '../format.js';
import { Icon, TopBar, Keypad, Sheet, Empty } from '../ui.jsx';
import { printBill, billText, openWhatsApp, beep } from '../printing.js';
import { shareBackup } from '../backup.js';
import { Receipt } from './Pay.jsx';

function shiftDay(day, n) {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

function payLabel(p) {
  const parts = [];
  if (p.cash) parts.push('नकद');
  if (p.upi) parts.push('UPI');
  if (p.udhaar) parts.push('उधार');
  return parts.join(' + ');
}

export function Today({ day: dayParam }) {
  const today = dayKey();
  const [day, setDay] = useState(dayParam || today);
  const [s, setS] = useState(null);
  useEffect(() => {
    daySummary(day).then(setS);
  }, [day, refresh.value, mode.value]);

  const isToday = day === today;
  return (
    <main class="screen">
      <TopBar title="आज का हिसाब" sub="Today's account" onBack={() => go('home')} />
      <div class="day-nav">
        <button type="button" class="icon-btn" aria-label="पिछला दिन · Previous day" onClick={() => setDay(shiftDay(day, -1))}><Icon name="back" /></button>
        <b>{isToday ? 'आज · Today' : dateText(day + 'T12:00:00')}</b>
        <button type="button" class="icon-btn flip" aria-label="अगला दिन · Next day" disabled={isToday} onClick={() => setDay(shiftDay(day, 1))}><Icon name="back" /></button>
      </div>
      {!s ? null : (
        <>
          <div class="sum-card">
            <div class="sum-row"><span>बिल · Bills</span><b>{s.bills}</b></div>
            <div class="sum-row"><span class="green-text">नकद · Cash</span><b>{money(s.cash)}</b></div>
            <div class="sum-row"><span class="blue">UPI</span><b>{money(s.upi)}</b></div>
            <div class="sum-row"><span class="brown">उधार · Udhaar</span><b>{money(s.udhaar)}</b></div>
            <div class="sum-row total"><span>कुल बिक्री · Total sales</span><b>{money(s.total)}</b></div>
            {(s.khataCash > 0 || s.khataUpi > 0) && (
              <div class="sum-row"><span>खाते के पैसे मिले · Khata received</span><b>{money(s.khataCash + s.khataUpi)}</b></div>
            )}
            {s.returnsCash + s.returnsKhata > 0 && (
              <div class="sum-row"><span>वापसी · Returns</span><b>− {money(s.returnsCash + s.returnsKhata)}</b></div>
            )}
          </div>
          <div class="galla">
            <span class="two"><b>गल्ले में होने चाहिए</b><small>Cash expected in the galla (with {money(s.opening)} opening)</small></span>
            <b>{money(s.expectedCash)}</b>
          </div>
          {s.close && (
            <p class={'close-note ' + (s.close.diff === 0 ? 'ok' : 'off')}>
              दिन बंद: गिने {money(s.close.counted)} · {s.close.diff === 0 ? 'हिसाब मिल गया · Matched' : (s.close.diff > 0 ? 'ज़्यादा ' : 'कम ') + money(Math.abs(s.close.diff)) + (s.close.diff > 0 ? ' · Extra' : ' · Short')}
            </p>
          )}
          {isToday && (
            <div class="split-row pad-x">
              <button type="button" class="btn dark" onClick={() => go('close')}><b>दिन बंद करें</b><small>Close the day</small></button>
              <button type="button" class="btn outline" onClick={() => go('returnNew')}><b>वापसी</b><small>Return / refund</small></button>
            </div>
          )}
          <h2 class="section-title">बिल · Bills</h2>
          <div class="entries">
            {s.list.length === 0 && <Empty hi="इस दिन कोई बिल नहीं" en="No bills this day" />}
            {s.list.map((b) => (
              <button type="button" key={b.id} class={'entry tap' + (b.status === 'cancelled' ? ' cancelled' : '')} onClick={() => go('billView', { id: b.id })}>
                <span class="two">
                  <b>Bill {b.no} · {timeText(b.at)}</b>
                  <small>{b.status === 'cancelled' ? 'रद्द · Cancelled' : payLabel(b.pay)}</small>
                </span>
                <b>{money(b.total)}</b>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

const CANCEL_REASONS = [
  ['गलत बिल बना', 'Wrong bill'],
  ['ग्राहक ने सामान लौटाया', 'Customer returned the goods'],
  ['दूसरा कारण', 'Other reason']
];

export function BillView({ id }) {
  const [b, setB] = useState(null);
  const [st, setSt] = useState(null);
  const [cust, setCust] = useState(null);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    (async () => {
      const bill = await getBill(id);
      setB(bill);
      setSt(await getSettings());
      if (bill && bill.pay && bill.pay.customerId) setCust(await getCustomer(bill.pay.customerId));
    })();
  }, [id, refresh.value]);
  if (!b || !st) return <main class="screen" />;
  const canCancel = b.status === 'done' && b.day === dayKey();

  async function doCancel(reason) {
    await cancelBill(b.id, reason);
    setAsk(false);
    beep();
    bump();
    say('बिल रद्द हुआ · Bill cancelled');
  }

  return (
    <main class="screen pad-screen">
      <TopBar title={'Bill ' + b.no} sub={dateText(b.at) + ' · ' + timeText(b.at)} onBack={() => go('today', { day: b.day })} />
      {b.status === 'cancelled' && <p class="warn">रद्द · Cancelled: {b.reason}</p>}
      <Receipt bill={b} st={st} customer={cust && cust.name} />
      <div class="split-row">
        <button type="button" class="btn outline" onClick={() => printBill(b, st, { customer: cust && cust.name }).catch((e) => say(e.message))}>
          <Icon name="print" size={22} /><b>प्रिंट</b>
        </button>
        <button type="button" class="btn outline green-text" onClick={() => openWhatsApp(billText(b, st), cust && cust.phone)}>
          <Icon name="chat" size={22} /><b>WhatsApp</b>
        </button>
      </div>
      {canCancel && (
        <button type="button" class="btn outline red-text" onClick={() => setAsk(true)}>
          <b>बिल रद्द करें</b><small>Cancel this bill</small>
        </button>
      )}
      {ask && (
        <Sheet onClose={() => setAsk(false)} label="रद्द क्यों? · Why cancel?">
          <div class="sheet-head">
            <div><h2>बिल रद्द क्यों?</h2><p class="muted">Why cancel? Cash bills: give the money back. Udhaar comes off the khata.</p></div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setAsk(false)}><Icon name="x" /></button>
          </div>
          {CANCEL_REASONS.map(([hi, en]) => (
            <button type="button" key={hi} class="btn outline" onClick={() => doCancel(hi)}><b>{hi}</b><small>{en}</small></button>
          ))}
        </Sheet>
      )}
    </main>
  );
}

const RETURN_REASONS = [
  ['खराब या एक्सपायरी', 'Damaged or expired'],
  ['गलत सामान', 'Wrong item'],
  ['ग्राहक को नहीं चाहिए', 'Customer changed their mind']
];

export function ReturnNew() {
  const [v, setV] = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState(1);
  const [custs, setCusts] = useState([]);
  const n = toInt(v);
  useEffect(() => {
    allCustomers().then((l) => setCusts(l.sort((a, b) => a.name.localeCompare(b.name))));
  }, []);

  async function done(refund, customerId) {
    await addReturn({ amount: n, refund, customerId, reason });
    beep();
    bump();
    say(money(n) + ' वापसी दर्ज · Return saved');
    go('today');
  }

  return (
    <main class="screen pad-screen">
      <TopBar title="वापसी" sub="Return / refund" onBack={() => (step > 1 ? setStep(step - 1) : go('today'))} />
      {step === 1 && (
        <>
          <p class="lead">कितने रुपये का सामान लौटा? · Value of the goods returned</p>
          <div class="readout single"><b>{money(n)}</b></div>
          <Keypad onKey={(k) => setV(typed(v, k))} />
          <button type="button" class="btn primary big" disabled={!n} onClick={() => setStep(2)}><b>आगे</b><small>Next</small></button>
        </>
      )}
      {step === 2 && (
        <>
          <p class="lead">क्यों लौटा? · Why?</p>
          {RETURN_REASONS.map(([hi, en]) => (
            <button type="button" key={hi} class="btn outline" onClick={() => { setReason(hi); setStep(3); }}><b>{hi}</b><small>{en}</small></button>
          ))}
        </>
      )}
      {step === 3 && (
        <>
          <p class="lead">{money(n)} कैसे लौटाए? · How was it refunded?</p>
          <button type="button" class="btn green big" onClick={() => done('cash', null)}><b>नकद वापस दिए</b><small>Cash given back</small></button>
          <h2 class="section-title">या खाते से घटाएं · Or take it off a khata</h2>
          <div class="cust-list">
            {custs.length === 0 && <Empty hi="कोई ग्राहक नहीं" en="No customers yet" />}
            {custs.map((c) => (
              <button type="button" key={c.id} class="cust" onClick={() => done('khata', c.id)}>
                <span class="two"><b>{c.name}</b><small>{c.phone || ''}</small></span>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

export function Close() {
  const day = dayKey();
  const [s, setS] = useState(null);
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [field, setField] = useState('counted');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    daySummary(day).then((r) => {
      setS(r);
      setOpening(String(r.opening || ''));
      if (r.close) setCounted(String(r.close.counted));
    });
  }, []);
  if (!s) return <main class="screen" />;
  const open = toInt(opening);
  const expected = open + s.cash + s.khataCash - s.returnsCash;
  const c = toInt(counted);
  const diff = c - expected;

  async function save() {
    await saveClose({ day, opening: open, expected, counted: c, diff, at: Date.now() });
    await setSettings({ openingCash: open });
    beep(diff === 0);
    bump();
    setSaved(true);
  }

  async function backup() {
    try {
      const r = await shareBackup();
      if (r === 'downloaded') say('बैकअप फ़ाइल सेव हुई · Backup file saved');
    } catch (e) {
      say('बैकअप नहीं बना · Backup failed');
    }
  }

  return (
    <main class="screen pad-screen">
      <TopBar title="दिन बंद करें" sub="Close the day" onBack={() => go('today')} />
      <div class="seg">
        <button type="button" class={field === 'opening' ? 'on' : ''} onClick={() => setField('opening')}>
          <b>{money(open)}</b><small>सुबह गल्ले में · Opening</small>
        </button>
        <button type="button" class={field === 'counted' ? 'on' : ''} onClick={() => setField('counted')}>
          <b>{money(c)}</b><small>अभी गिने · Counted now</small>
        </button>
      </div>
      <div class="sum-card">
        <div class="sum-row"><span>होने चाहिए · Expected</span><b>{money(expected)}</b></div>
        <div class={'sum-row total ' + (counted === '' ? '' : diff === 0 ? 'ok' : 'off')}>
          <span>{counted === '' ? 'गिनकर लिखें · Count and type' : diff === 0 ? 'हिसाब मिल गया · Matched' : diff > 0 ? 'ज़्यादा · Extra' : 'कम · Short'}</span>
          <b>{counted === '' ? '—' : money(Math.abs(diff))}</b>
        </div>
      </div>
      <Keypad compact onKey={(k) => (field === 'opening' ? setOpening(typed(opening, k)) : setCounted(typed(counted, k)))} />
      {!saved ? (
        <button type="button" class="btn dark big" disabled={counted === ''} onClick={save}><b>दिन बंद करें</b><small>Save day close</small></button>
      ) : (
        <button type="button" class="btn green big" onClick={backup}><b>बैकअप भेजें</b><small>Send today's backup (WhatsApp or Drive)</small></button>
      )}
    </main>
  );
}
