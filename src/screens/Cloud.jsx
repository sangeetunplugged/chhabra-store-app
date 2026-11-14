// Cloud screens: sign-in and status (owner settings), the small status line on Home, and Shop live
// (Rajan's view of the real numbers from the cloud).
import { useEffect, useState } from 'preact/hooks';
import { go, say, bump } from '../store.js';
import { cloud, cloudApi } from '../cloudState.js';
import { memoryOnly, summarize } from '../db.js';
import { gallaPaid } from '../vendorCalc.js';
import { money, dayKey, dateText, timeText, lineName, lineSub, lineTotal } from '../format.js';
import { Icon, TopBar, Empty, Sheet } from '../ui.jsx';
import { Field, useOwnerGuard } from './Owner.jsx';

export function ago(ms, enOnly) {
  if (!ms) return enOnly ? 'not yet' : 'अभी तक नहीं · not yet';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return enOnly ? 'just now' : 'अभी · just now';
  if (m < 60) return enOnly ? m + ' min ago' : m + ' मिनट पहले · ' + m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return enOnly ? h + ' h ago' : h + ' घंटे पहले · ' + h + ' h ago';
  return dateText(ms) + ' · ' + timeText(ms);
}

// [Hindi, English, tone] for the counter phone's upload state
export function statusText(c) {
  const n = c.pending || 0;
  switch (c.status) {
    case 'ok':
      return n > 0
        ? ['क्लाउड में भेजना बाकी', n + ' to send', 'busy']
        : ['सब क्लाउड में सेव', 'All saved to the cloud' + (c.lastSync ? ' · ' + timeText(c.lastSync) : ''), 'ok'];
    case 'sending':
      return ['क्लाउड में भेज रहे हैं', 'Sending' + (n ? ' ' + n : '') + ' to the cloud', 'busy'];
    case 'offline':
      return ['इंटरनेट आने पर भेजेंगे', (n ? n + ' ' : '') + 'waiting for internet · billing works as usual', 'wait'];
    case 'error':
      return ['क्लाउड में दिक्कत', c.msg || 'Cloud problem', 'bad'];
    case 'claim':
      return ['काउंटर फ़ोन की पुष्टि बाकी', 'Confirm the counter phone in owner settings → Cloud', 'wait'];
    case 'moved':
      return ['यह फ़ोन अब क्लाउड में नहीं भेजता', 'The counter moved to another phone: bills here are not uploaded', 'bad'];
    case 'starting':
      return ['क्लाउड जुड़ रहा है', 'Connecting to the cloud', 'busy'];
    default:
      return null;
  }
}

// Home: one quiet line on the counter phone.
export function CloudLine() {
  const c = cloud.value;
  if (c.role !== 'counter') return null;
  const t = statusText(c);
  if (!t) return null;
  return (
    <p class={'cloud-line ' + t[2]} role="status">
      <Icon name="cloud" size={20} />
      <span><b>{t[0]}</b> · {t[1]}</span>
    </p>
  );
}

export function Cloud() {
  const ok = useOwnerGuard();
  const c = cloud.value;
  const [login, setLogin] = useState('counter');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState('');
  if (!ok) return <main class="screen" />;

  const signedIn = !!c.login && !['signedout', 'off'].includes(c.status);

  async function doSignIn() {
    if (!login.trim() || !pw) {
      say('लॉगिन और पासवर्ड लिखें · Type the login and password');
      return;
    }
    setBusy(true);
    try {
      const m = await cloudApi();
      if (await m.signIn(login, pw)) {
        setPw('');
        say('क्लाउड जुड़ गया · Cloud connected');
      }
    } catch (e) {
      say('क्लाउड नहीं खुला, इंटरनेट देखें · Cloud did not load, check the internet');
    }
    setBusy(false);
  }

  async function doClaim() {
    setAsk('');
    setBusy(true);
    const m = await cloudApi();
    const done = await m.claim(true);
    setBusy(false);
    bump();
    if (done) say('काउंटर इस फ़ोन पर आ गया · The counter is now this phone');
  }

  async function doSignOut() {
    setAsk('');
    const m = await cloudApi();
    await m.signOut();
    say('लॉग आउट · Signed out');
  }

  if (memoryOnly.value) {
    return (
      <main class="screen pad-screen">
        <TopBar title="क्लाउड" sub="Cloud backup and sync" onBack={() => go('owner')} />
        <p class="warn">क्लाउड सिर्फ़ इंस्टॉल किए ऐप में चलता है · The cloud works only in the installed app, not in this preview.</p>
      </main>
    );
  }

  const t = statusText(c);
  return (
    <main class="screen pad-screen">
      <TopBar title="क्लाउड" sub="Cloud backup and sync" onBack={() => go('owner')} />

      {!signedIn && (
        <>
          <p class="lead">
            दुकान के फ़ोन पर <b>counter</b> से लॉगिन करें। राजन के फ़ोन पर <b>rajan</b> से। · Sign in the shop phone with <b>counter</b>, Rajan's phone with <b>rajan</b>.
          </p>
          <Field label="लॉगिन · Login" value={login} onInput={setLogin} placeholder="counter" />
          <label class="field">
            <span>पासवर्ड · Password</span>
            <input type="password" value={pw} onInput={(e) => setPw(e.currentTarget.value)} autocomplete="current-password" />
          </label>
          <button type="button" class="btn primary big" disabled={busy || c.status === 'starting'} onClick={doSignIn}>
            <b>{busy ? 'जुड़ रहा है…' : 'लॉगिन करें'}</b><small>Sign in</small>
          </button>
          {c.msg && <p class="warn">{c.msg}</p>}
          <p class="note">बिना क्लाउड के भी बिलिंग पूरी चलती है · Billing works fully without the cloud.</p>
        </>
      )}

      {signedIn && (
        <>
          <div class="card">
            <span class="two">
              <b>{c.role === 'counter' ? 'यह फ़ोन: काउंटर' : 'यह फ़ोन: सिर्फ़ देखने के लिए'}</b>
              <small>{c.role === 'counter' ? 'This phone: counter · uploads the real bills and khata' : 'This phone: view only · ' + c.login}</small>
            </span>
            {c.role === 'counter' && t && !['claim', 'moved'].includes(c.status) && (
              <p class={'cloud-line inset ' + t[2]} role="status">
                <Icon name="cloud" size={20} />
                <span><b>{t[0]}</b> · {t[1]}</span>
              </p>
            )}
            {c.role === 'counter' && c.lastSync > 0 && <small class="muted">आखिरी बार भेजा · Last upload: {ago(c.lastSync)}</small>}
          </div>

          {c.status === 'claim' && c.other && (
            <div class="card warn-card">
              <b>{c.other.resume ? 'काउंटर यहाँ लाना अधूरा रहा' : 'counter लॉगिन दूसरे फ़ोन पर चालू है'}</b>
              <small>
                {c.other.resume
                  ? 'Moving the counter to this phone stopped half way. Finish it to bring the cloud copy here.'
                  : 'The counter login is in use on another phone (' + (c.other.label || 'phone') + '), last upload ' + ago(c.other.lastSync, true) + '. Only one phone can be the counter.'}
              </small>
              <small>इस फ़ोन का असली हिसाब क्लाउड वाले से बदल जाएगा। अभ्यास डेटा वैसा ही रहेगा। · This phone's real data is replaced by the cloud copy. Practice data stays.</small>
              <button type="button" class="btn primary" disabled={busy} onClick={() => setAsk('claim')}>
                <b>काउंटर यहाँ लाएं</b><small>Make this phone the counter</small>
              </button>
            </div>
          )}

          {c.status === 'moved' && (
            <div class="card bad-card">
              <b>काउंटर दूसरे फ़ोन पर चला गया</b>
              <small>Another phone signed in as counter, so this phone stopped uploading. Bills made here now stay only on this phone.</small>
              <button type="button" class="btn outline" disabled={busy} onClick={() => setAsk('claim')}>
                <b>काउंटर वापस यहाँ लाएं</b><small>Make this phone the counter again (gets the cloud copy)</small>
              </button>
            </div>
          )}

          {c.role === 'counter' && !['claim', 'moved'].includes(c.status) && (
            <button type="button" class="btn outline" disabled={busy} onClick={() => cloudApi().then((m) => m.syncNow())}>
              <Icon name="cloud" size={22} /><b>अभी भेजें · Send now</b>
            </button>
          )}
          <button type="button" class="btn outline" onClick={() => go('live', { back: 'cloud' })}>
            <Icon name="chart" size={22} /><b>दुकान लाइव · Shop live</b>
          </button>
          <button type="button" class="btn outline red-text" onClick={() => setAsk('out')}>
            <b>लॉग आउट</b><small>Sign out of the cloud on this phone</small>
          </button>
        </>
      )}

      {ask === 'claim' && (
        <Sheet onClose={() => setAsk('')} label="काउंटर यहाँ लाएं · Move the counter here">
          <div class="sheet-head">
            <div>
              <h2>पक्का?</h2>
              <p class="muted">This phone becomes the counter. Its real bills, khata and prices are replaced by the cloud copy; the other phone stops uploading.</p>
            </div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setAsk('')}><Icon name="x" /></button>
          </div>
          <button type="button" class="btn primary big" onClick={doClaim}><b>हां, यहाँ लाएं</b><small>Yes, move the counter here</small></button>
        </Sheet>
      )}
      {ask === 'out' && (
        <Sheet onClose={() => setAsk('')} label="लॉग आउट · Sign out">
          <div class="sheet-head">
            <div>
              <h2>लॉग आउट करें?</h2>
              <p class="muted">{c.role === 'counter' ? 'Billing keeps working, but nothing goes to the cloud until someone signs in again.' : 'Shop live stops on this phone until you sign in again.'}</p>
            </div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setAsk('')}><Icon name="x" /></button>
          </div>
          <button type="button" class="btn dark big" onClick={doSignOut}><b>हां, लॉग आउट</b><small>Yes, sign out</small></button>
        </Sheet>
      )}
    </main>
  );
}

function shiftDay(day, n) {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

function payLabel(p) {
  const parts = [];
  if (p && p.cash) parts.push('नकद');
  if (p && p.upi) parts.push('UPI');
  if (p && p.udhaar) parts.push('उधार');
  return parts.join(' + ');
}

// Rajan's view: the real numbers, straight from the cloud, updating live.
export function Live({ day: dayParam, back: backTo }) {
  const today = dayKey();
  const [day, setDay] = useState(dayParam || today);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [khata, setKhata] = useState(null);
  const [open, setOpen] = useState(null);
  const c = cloud.value;
  const signedIn = !!c.login && !['signedout', 'off'].includes(c.status);

  useEffect(() => {
    if (!signedIn) return undefined;
    let stop = () => {};
    let alive = true;
    setData(null);
    setErr('');
    cloudApi()
      .then((m) => {
        if (alive) stop = m.watchDay(day, setData, setErr);
      })
      .catch(() => setErr('क्लाउड नहीं खुला · Cloud did not load'));
    return () => {
      alive = false;
      stop();
    };
  }, [day, signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    cloudApi()
      .then((m) => m.khataList())
      .then(setKhata)
      .catch(() => setKhata([]));
  }, [signedIn]);

  const goBack = () => go(backTo || 'home');
  if (!signedIn) {
    return (
      <main class="screen pad-screen">
        <TopBar title="दुकान लाइव" sub="Shop live" onBack={goBack} right={null} />
        <p class="lead">क्लाउड में लॉगिन नहीं है · This phone is not signed in to the cloud.</p>
        <button type="button" class="btn primary" onClick={() => go('cloud')}><b>लॉगिन करें</b><small>Sign in (owner settings → Cloud)</small></button>
      </main>
    );
  }

  const s = data ? summarize({ bills: data.bills, ledger: data.ledger, rets: data.rets, close: data.close, openingCash: data.openingCash }) : null;
  const galla = data ? gallaPaid(data.vledger || [], day) : 0;
  if (s) s.expectedCash -= galla;
  const isToday = day === today;
  const owed = (khata || []).filter((x) => (x.balance || 0) > 0).sort((a, b) => b.balance - a.balance);
  const totalDue = owed.reduce((a, x) => a + x.balance, 0);
  const m = data && data.meta;

  return (
    <main class="screen">
      <TopBar title="दुकान लाइव" sub="Shop live · real accounts from the cloud" onBack={goBack} right={null} />
      {m ? (
        <p class={'cloud-line ' + (Date.now() - m.lastSync < 30 * 60000 ? 'ok' : 'wait')}>
          <Icon name="cloud" size={20} />
          <span>
            <b>काउंटर फ़ोन</b> · Counter phone {m.label ? '(' + m.label + ') ' : ''}synced {ago(m.lastSync, true)}
            {m.pending > 0 ? ' · ' + m.pending + ' still on the phone' : ''}
          </span>
        </p>
      ) : (
        data && <p class="cloud-line wait"><Icon name="cloud" size={20} /><span>अभी कोई काउंटर फ़ोन नहीं जुड़ा · No counter phone has synced yet</span></p>
      )}
      {err && <p class="warn pad-x">{err}</p>}
      <div class="day-nav">
        <button type="button" class="icon-btn" aria-label="पिछला दिन · Previous day" onClick={() => setDay(shiftDay(day, -1))}><Icon name="back" /></button>
        <b>{isToday ? 'आज · Today' : dateText(day + 'T12:00:00')}</b>
        <button type="button" class="icon-btn flip" aria-label="अगला दिन · Next day" disabled={isToday} onClick={() => setDay(shiftDay(day, 1))}><Icon name="back" /></button>
      </div>
      {!s ? (
        <p class="note center">लोड हो रहा है · Loading…</p>
      ) : (
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
            {s.cancelled > 0 && <div class="sum-row"><span>रद्द बिल · Cancelled bills</span><b>{s.cancelled}</b></div>}
            {galla > 0 && <div class="sum-row"><span>सप्लायर को दिए (गल्ले से) · Paid to vendors from the galla</span><b>− {money(galla)}</b></div>}
          </div>
          <div class="galla">
            <span class="two"><b>गल्ले में होने चाहिए</b><small>Cash expected in the galla (with {money(s.opening)} opening)</small></span>
            <b>{money(s.expectedCash)}</b>
          </div>
          {s.close ? (
            <p class={'close-note ' + (s.close.diff === 0 ? 'ok' : 'off')}>
              दिन बंद: गिने {money(s.close.counted)} · {s.close.diff === 0 ? 'हिसाब मिल गया · Matched' : (s.close.diff > 0 ? 'ज़्यादा ' : 'कम ') + money(Math.abs(s.close.diff)) + (s.close.diff > 0 ? ' · Extra' : ' · Short')}
            </p>
          ) : (
            <p class="note">दिन अभी बंद नहीं हुआ · Day not closed yet</p>
          )}
          <h2 class="section-title">बिल · Bills</h2>
          <div class="entries">
            {s.list.length === 0 && <Empty hi="इस दिन कोई बिल नहीं" en="No bills this day" />}
            {s.list.map((b) => (
              <button type="button" key={b.id} class={'entry tap' + (b.status === 'cancelled' ? ' cancelled' : '')} onClick={() => setOpen(b)}>
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

      <h2 class="section-title">खाता · Khata {khata ? '· कुल उधार ' + money(totalDue) : ''}</h2>
      <div class="entries">
        {khata && owed.length === 0 && <Empty hi="किसी का उधार नहीं" en="Nobody owes the shop" />}
        {owed.map((x) => (
          <div key={x.id} class="entry">
            <span class="two"><b>{x.name}</b><small>{x.phone || ''}</small></span>
            <b class="brown">{money(x.balance)}</b>
          </div>
        ))}
      </div>

      {open && (
        <Sheet onClose={() => setOpen(null)} label={'Bill ' + open.no}>
          <div class="sheet-head">
            <div>
              <h2>Bill {open.no} · {money(open.total)}</h2>
              <p class="muted">{dateText(open.at)} · {timeText(open.at)} · {open.status === 'cancelled' ? 'Cancelled: ' + (open.reason || '') : payLabel(open.pay)}</p>
            </div>
            <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={() => setOpen(null)}><Icon name="x" /></button>
          </div>
          <div class="entries tight">
            {(open.lines || []).map((l, i) => (
              <div key={i} class="entry">
                <span class="two"><b>{lineName(l)}</b><small>{lineSub(l)}</small></span>
                <b>{money(lineTotal(l))}</b>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </main>
  );
}
