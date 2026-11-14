// Accounts (Phase 3): Rajan's owner view. Profit for the month, daily sales, GST watch for the
// financial year, who owes the shop and for how long, and expenses. Hindi on top, English below.
import { useEffect, useState } from 'preact/hooks';
import { go, say } from '../store.js';
import { cloud, cloudApi } from '../cloudState.js';
import { stockData, saveExpense } from '../stockState.js';
import { monthReport, gstWatch, udhaarAgeing, shiftMonth, EXP_CATS, GST_LIMIT } from '../accountsCalc.js';
import { Icon, TopBar, Empty, Sheet, Keypad } from '../ui.jsx';
import { typed, toInt, money, dateText, dayKey } from '../format.js';
import { beep, openWhatsApp } from '../printing.js';
import { useStock, NeedCloud } from './Stock.jsx';

const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthText = (m) => MONTHS_HI[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) + ' · ' + MONTHS_EN[+m.slice(5, 7) - 1];
const MODES = [['galla', 'गल्ले से · From the galla'], ['cash', 'नकद, बाहर से · Other cash'], ['upi', 'UPI'], ['bank', 'बैंक · Bank']];
// Under ₹1 lakh show plain rupees (₹13,700), above it ₹4.25 लाख.
const lakh = (n) => (Math.abs(n) < 100000 ? money(n) : '₹' + (Math.round((n / 100000) * 100) / 100).toLocaleString('en-IN') + ' लाख');
const day12 = (d) => dateText(d + 'T12:00:00');

// Add an expense. The counter's Today screen uses it too (default: paid from the galla).
export function ExpenseSheet({ onClose, defaultMode = 'galla' }) {
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState('');
  const [mode, setMode] = useState(defaultMode);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const n = toInt(amt);
  async function save() {
    if (n <= 0 || !cat || busy) return;
    setBusy(true);
    await saveExpense({ cat, amount: n, mode, note: note.trim() });
    beep();
    say('खर्चा जुड़ा · Expense added: ' + money(n));
    onClose();
  }
  return (
    <Sheet onClose={onClose} label="खर्चा · Expense">
      <div class="sheet-head">
        <div><h2>खर्चा जोड़ें</h2><p class="muted">Add an expense</p></div>
        <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div class="amount-box">{money(n)}</div>
      <Keypad onKey={(k) => setAmt(typed(amt, k))} compact />
      <div class="chooser wrap half" role="group" aria-label="किस चीज़ का · What for">
        {Object.entries(EXP_CATS).map(([k, [hi, en]]) => (
          <button type="button" key={k} class={cat === k ? 'on' : ''} aria-pressed={cat === k} onClick={() => setCat(k)}>{hi} · {en}</button>
        ))}
      </div>
      <div class="chooser wrap half" role="group" aria-label="कैसे दिए · Paid how">
        {MODES.map(([m, label]) => (
          <button type="button" key={m} class={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{label}</button>
        ))}
      </div>
      <label class="field small">
        <span>नोट (अगर कुछ) · Note, if any</span>
        <input value={note} onInput={(e) => setNote(e.currentTarget.value)} />
      </label>
      <button type="button" class="btn primary big" disabled={n <= 0 || !cat || busy} onClick={save}><b>सेव करें</b><small>Save</small></button>
    </Sheet>
  );
}

function Bars({ daily, month }) {
  const last = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
  const by = new Map(daily.map((d) => [d.day, d.total]));
  const days = Array.from({ length: last }, (_, i) => month + '-' + String(i + 1).padStart(2, '0'));
  const max = Math.max(1, ...daily.map((d) => d.total));
  const best = daily.reduce((m, d) => (!m || d.total > m.total ? d : m), null);
  return (
    <div class="bars-card">
      <div class="bars" role="img" aria-label="रोज़ की बिक्री · Daily sales">
        {days.map((d) => (
          <span key={d} class={d === dayKey() ? 'today' : ''} style={{ height: Math.max(2, Math.round(((by.get(d) || 0) / max) * 100)) + '%' }} title={d + ' ' + money(by.get(d) || 0)} />
        ))}
      </div>
      <div class="bars-foot">
        <small>1</small>
        <small>{best ? 'सबसे अच्छा · best ' + day12(best.day).split(' ')[0] + ' ' + MONTHS_EN[+month.slice(5, 7) - 1] + ': ' + money(best.total) : ''}</small>
        <small>{last}</small>
      </div>
    </div>
  );
}

function GstCard({ sd }) {
  const [pre, setPre] = useState(null);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState('');
  const today = dayKey();
  const fy = gstWatch({ sales: sd.sales, today, preApp: 0 }).start;
  useEffect(() => {
    cloudApi()
      .then((m) => m.getOwner('gst'))
      .then((d) => setPre(d && d.fy === fy ? Number(d.preApp) || 0 : 0))
      .catch(() => setPre(0));
  }, [fy]);
  if (pre == null) return null;
  const g = gstWatch({ sales: sd.sales, today, preApp: pre });
  const tone = { over: 'bad', will: 'bad', near: 'wait', ok: 'ok' }[g.level];
  const msg = {
    over: ['₹20 लाख पार हो गया: GST रजिस्ट्रेशन ज़रूरी', 'Over ₹20 lakh this year: GST registration is due now. Talk to a CA.'],
    will: ['इस रफ़्तार से इस साल ₹20 लाख पार होगा', "At this pace sales cross ₹20 lakh this year: plan GST registration with a CA."],
    near: ['₹20 लाख के पास', 'Close to ₹20 lakh: keep an eye on it.'],
    ok: ['अभी ठीक है', 'Well under ₹20 lakh.']
  }[g.level];
  async function save() {
    const api = await cloudApi();
    await api.setOwner('gst', { fy, preApp: toInt(v) });
    setPre(toInt(v));
    setEdit(false);
    say('सेव हुआ · Saved');
  }
  return (
    <div class="card">
      <span class="two">
        <b>GST: इस साल की बिक्री</b>
        <small>Sales this financial year · {day12(g.start)} to {day12(g.end)}</small>
      </span>
      <div class="meter" role="img" aria-label={g.pct + '% of ₹20 lakh'}>
        <span class={tone} style={{ width: Math.min(100, g.pct) + '%' }} />
      </div>
      <div class="sum-row bare"><span>अब तक · So far</span><b>{lakh(g.total)} · {g.pct}%</b></div>
      <div class="sum-row bare"><span>31 मार्च तक, इसी रफ़्तार से · By 31 March at this pace</span><b>{lakh(g.projected)}</b></div>
      {g.crossDay && <div class="sum-row bare"><span>₹20 लाख पार · Crosses ₹20 lakh around</span><b>{day12(g.crossDay)}</b></div>}
      <p class={'cloud-line inset ' + tone}><span><b>{msg[0]}</b> · {msg[1]}</span></p>
      <small class="muted">
        ऐप से · App sales{g.first ? ' (since ' + day12(g.first) + ')' : ''}: {lakh(g.appTotal)} + ऐप से पहले · Before the app: {lakh(g.preApp)}
      </small>
      {!edit ? (
        <button type="button" class="btn outline" onClick={() => { setV(String(pre || '')); setEdit(true); }}>
          <b>ऐप से पहले की बिक्री</b><small>Sales this year before the app ({money(pre)})</small>
        </button>
      ) : (
        <div class="split-row">
          <label class="field small">
            <span>₹ इस साल, ऐप से पहले · this year before the app</span>
            <input inputMode="numeric" value={v} onInput={(e) => setV(e.currentTarget.value.replace(/\D/g, ''))} />
          </label>
          <button type="button" class="btn primary" onClick={save}><b>सेव</b><small>Save</small></button>
        </div>
      )}
    </div>
  );
}

function Ageing({ sd }) {
  const [pick, setPick] = useState(-1);
  const a = udhaarAgeing(sd.customers);
  const rows = pick < 0 ? a.rows : a.buckets[pick].rows;
  const shopName = 'छाबड़ा स्टोर';
  const remind = (c) =>
    openWhatsApp(
      'नमस्ते ' + c.name + ', ' + shopName + ' में आपका बाकी ' + money(c.balance) + ' है' + (c.since ? ' (' + day12(c.since) + ' से)' : '') + '। कृपया जमा कर दें।\n' +
        'Your due at Chhabra Store is ' + money(c.balance) + '. Please clear it at your convenience.\n— Chhabra Store, Patel Nagar, Panipat',
      c.phone
    );
  return (
    <div class="card">
      <span class="two">
        <b>उधार कितना पुराना · Udhaar by age</b>
        <small>कुल · Total due {money(a.total)} · {a.rows.length} ग्राहक · customers</small>
      </span>
      <div class="age-grid">
        {a.buckets.map((b, i) => (
          <button type="button" key={b.label} class={'age' + (pick === i ? ' on' : '') + (i >= 2 && b.amount > 0 ? ' old' : '')} aria-pressed={pick === i} onClick={() => setPick(pick === i ? -1 : i)}>
            <small>{b.label} दिन · days</small>
            <b>{money(b.amount)}</b>
            <small>{b.rows.length}</small>
          </button>
        ))}
      </div>
      <div class="entries tight">
        {rows.length === 0 && <Empty hi="किसी का उधार नहीं" en="Nobody owes the shop" />}
        {rows.slice(0, 40).map(({ c, age }) => (
          <div key={c.id} class="entry">
            <span class="two">
              <b>{c.name}</b>
              <small class={age > 60 ? 'red-text' : ''}>
                {age == null ? '' : age + ' दिन · days · since ' + day12(c.since)}
                {c.lastPay ? ' · last paid ' + day12(c.lastPay) : ' · no payment yet'}
              </small>
            </span>
            <b class="brown">{money(c.balance)}</b>
            {c.phone ? (
              <button type="button" class="icon-btn" aria-label={'याद दिलाएं ' + c.name + ' · Remind on WhatsApp'} onClick={() => remind(c)}><Icon name="chat" /></button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Accounts() {
  const { on, sd } = useStock();
  const [month, setMonth] = useState(dayKey().slice(0, 7));
  const [sheet, setSheet] = useState(false);
  if (!on) return <NeedCloud title="हिसाब-किताब" />;
  if (!sd.ready) return <main class="screen"><TopBar title="हिसाब-किताब" sub="Accounts" onBack={() => go('home')} right={null} /><p class="note center">लोड हो रहा है · Loading…</p></main>;
  const costs = new Map();
  for (const [id, s] of sd.st) if (s.cost > 0) costs.set(id, s.cost);
  const r = monthReport({ month, sales: sd.sales, costs, expenses: sd.expenses, vledger: sd.vledger });
  const thisMonth = month === dayKey().slice(0, 7);
  const undone = new Set(sd.expenses.filter((e) => e.kind === 'undo').map((e) => e.ref));

  async function undo(e) {
    await saveExpense({ kind: 'undo', ref: e.id, cat: 'undo', amount: 0 });
    say('वापस लिया · Undone');
  }

  return (
    <main class="screen">
      <TopBar title="हिसाब-किताब" sub="Accounts · profit, GST, udhaar" onBack={() => go('home')} right={null} />
      <div class="top-action">
        <button type="button" class="btn primary" onClick={() => setSheet(true)}><b>+ खर्चा जोड़ें</b><small>Add expense</small></button>
      </div>
      <div class="day-nav">
        <button type="button" class="icon-btn" aria-label="पिछला महीना · Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="back" /></button>
        <b>{monthText(month)}</b>
        <button type="button" class="icon-btn flip" aria-label="अगला महीना · Next month" disabled={thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="back" /></button>
      </div>
      <div class="sum-card">
        <div class="sum-row total"><span>बिक्री · Sales <small class="muted">({r.bills} बिल)</small></span><b>{money(r.total)}</b></div>
        <div class="sum-row sub"><span>नकद {money(r.cash)} · UPI {money(r.upi)} · उधार {money(r.udhaar)}</span></div>
        <div class="sum-row"><span>माल की लागत · Cost of goods <small class="muted">(known for {r.coverage}%)</small></span><b>{money(r.cogs)}</b></div>
        <div class="sum-row"><span>मुनाफ़ा · Gross profit <small class="muted">{r.marginPct == null ? '' : '(' + r.marginPct + '% margin, estimate)'}</small></span><b>{r.estGross == null ? '—' : money(r.estGross)}</b></div>
        <div class="sum-row"><span>खर्चे · Expenses</span><b>− {money(r.expTotal)}</b></div>
        <div class={'sum-row total ' + (r.net == null ? '' : r.net >= 0 ? 'ok' : 'off')}><span>शुद्ध मुनाफ़ा · Net profit <small class="muted">(estimate)</small></span><b>{r.net == null ? '—' : money(r.net)}</b></div>
        <div class="sum-row sub"><span>माल ख़रीदा · Bought from suppliers {money(r.purchases)} · दिए · paid {money(r.paidVendors)}</span></div>
      </div>
      {r.coverage < 60 && r.total > 0 && (
        <p class="note">मुनाफ़ा अंदाज़ा है: {r.coverage}% बिक्री की खरीद कीमत पता है। माल आया में खरीद दाम भरते रहें · Profit is an estimate: buy rates are known for {r.coverage}% of sales. Keep entering buy rates on goods in.</p>
      )}
      <h2 class="section-title">रोज़ की बिक्री · Daily sales</h2>
      <Bars daily={r.daily} month={month} />
      <div class="stack">
        <GstCard sd={sd} />
        <Ageing sd={sd} />
      </div>
      <h2 class="section-title">खर्चे · Expenses {Object.keys(r.byCat).length ? '· ' + Object.entries(r.byCat).map(([k, v]) => (EXP_CATS[k] || [k])[0] + ' ' + money(v)).join(' · ') : ''}</h2>
      <div class="entries">
        {r.expenses.length === 0 && sd.expenses.filter((e) => e.kind === 'undo').length === 0 && <Empty hi="इस महीने कोई खर्चा नहीं" en="No expenses this month" />}
        {sd.expenses
          .filter((e) => e.day && e.day.startsWith(month) && e.kind !== 'undo')
          .sort((a, b) => b.at - a.at)
          .map((e) => (
            <div key={e.id} class={'entry' + (undone.has(e.id) ? ' cancelled' : '')}>
              <span class="two">
                <b>{(EXP_CATS[e.cat] || [e.cat, ''])[0]} · {(EXP_CATS[e.cat] || ['', e.cat])[1]}</b>
                <small>{day12(e.day)} · {(MODES.find((m) => m[0] === e.mode) || ['', e.mode])[1]}{e.note ? ' · ' + e.note : ''} · {e.by}{e.sat ? '' : ' · ☁ बाकी'}</small>
              </span>
              <b>{money(e.amount)}</b>
              {!undone.has(e.id) && e.by === cloud.value.login && Date.now() - e.at < 86400000 && (
                <button type="button" class="btn small-btn" onClick={() => undo(e)}>वापस</button>
              )}
            </div>
          ))}
      </div>
      {sheet && <ExpenseSheet onClose={() => setSheet(false)} defaultMode="bank" />}
    </main>
  );
}

// The day-close message for Rajan's WhatsApp.
export function closeSummaryText({ day, s, paidOut, close, fill, order, st }) {
  const L = [];
  L.push((st.shopNameHi || 'छाबड़ा स्टोर') + ' · ' + day12(day) + ' · दिन का हिसाब');
  L.push('बिल · Bills ' + s.bills + ' · बिक्री · Sales ' + money(s.total));
  L.push('नकद ' + money(s.cash) + ' · UPI ' + money(s.upi) + ' · उधार ' + money(s.udhaar));
  if (s.khataCash + s.khataUpi > 0) L.push('खाते के पैसे मिले · Khata received ' + money(s.khataCash + s.khataUpi));
  if (s.returnsCash + s.returnsKhata > 0) L.push('वापसी · Returns ' + money(s.returnsCash + s.returnsKhata));
  if (paidOut > 0) L.push('गल्ले से दिए (सप्लायर/खर्चा) · Paid from the galla ' + money(paidOut));
  if (close) {
    const diff = close.diff;
    L.push('गल्ला · Galla: होने चाहिए ' + money(close.expected) + ' · गिने ' + money(close.counted) + ' · ' + (diff === 0 ? 'मिल गया ✓' : (diff > 0 ? 'ज़्यादा ' : 'कम ') + money(Math.abs(diff))));
  }
  if (fill != null) L.push('शेल्फ भरने हैं · To fill ' + fill + ' · ऑर्डर · To order ' + order);
  return L.join('\n');
}
