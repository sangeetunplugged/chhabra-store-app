import { useEffect, useState } from 'preact/hooks';
import { go, refresh, lines, clearBill } from '../store.js';
import { heldBills, dropHeld, balances, daySummary, getSettings, mode, memoryOnly } from '../db.js';
import { money, dayKey, billTotal, timeText } from '../format.js';
import { Icon, PracticeChip } from '../ui.jsx';
import { cloud } from '../cloudState.js';
import { CloudLine } from './Cloud.jsx';

export function Home() {
  const [st, setSt] = useState(null);
  const [held, setHeld] = useState([]);
  const [due, setDue] = useState(0);
  const [today, setToday] = useState(null);

  useEffect(() => {
    (async () => {
      setSt(await getSettings());
      setHeld(await heldBills());
      const b = await balances();
      setDue(Object.values(b).reduce((a, x) => a + Math.max(0, x), 0));
      setToday(await daySummary(dayKey()));
    })();
  }, [refresh.value, mode.value]);

  const inProgress = lines.value.length > 0;

  const newBill = () => {
    if (!inProgress) clearBill();
    go('bill');
  };

  const resume = async (h) => {
    if (inProgress) return;
    clearBill();
    lines.value = h.lines;
    await dropHeld(h.id);
    go('bill');
  };

  return (
    <main class="screen home">
      <header class="home-head">
        <div class="home-title">
          <h1>{st ? st.shopNameHi : 'छाबड़ा स्टोर'}</h1>
          <span>{st ? st.shopName + ' · ' + (st.address || '') : 'Chhabra Store'}</span>
        </div>
        <div class="home-head-right">
          <PracticeChip />
          <button type="button" class="icon-btn" aria-label="मालिक की सेटिंग · Owner settings" onClick={() => go('owner')}>
            <Icon name="lock" />
          </button>
        </div>
      </header>

      {cloud.value.role === 'stock' && (
        <button type="button" class="btn live-hero stock-hero" onClick={() => go('stock')}>
          <Icon name="box" size={30} />
          <span class="two"><b>स्टॉक</b><small>Stock · goods in, shelves, counts, orders</small></span>
        </button>
      )}
      {cloud.value.role === 'viewer' && (
        <button type="button" class="btn live-hero" onClick={() => go('live')}>
          <Icon name="chart" size={30} />
          <span class="two"><b>दुकान लाइव</b><small>Shop live · today's real sales and khata from the cloud</small></span>
        </button>
      )}
      {cloud.value.role === 'viewer' && (
        <button type="button" class="btn live-hero accounts-hero" onClick={() => go('accounts')}>
          <Icon name="book" size={30} />
          <span class="two"><b>हिसाब-किताब</b><small>Accounts · profit, GST watch, old udhaar, expenses</small></span>
        </button>
      )}

      <button type="button" class="btn primary hero" onClick={newBill}>
        <Icon name="plus" size={40} stroke={2.5} />
        <b>{inProgress ? 'चालू बिल' : 'नया बिल'}</b>
        <small>{inProgress ? 'Continue bill · ' + money(billTotal(lines.value)) : 'New bill'}</small>
      </button>

      {held.length > 0 && (
        <section class="held">
          <h2>रुके हुए बिल · Bills on hold</h2>
          <div class="held-row">
            {held.map((h) => (
              <button type="button" key={h.id} class="held-chip" disabled={inProgress} onClick={() => resume(h)}>
                <b>{money(h.total)}</b>
                <small>{timeText(h.at)} · खोलें</small>
              </button>
            ))}
          </div>
          {inProgress && <p class="muted small">पहले चालू बिल पूरा करें · Finish the open bill first</p>}
        </section>
      )}

      <div class="home-list">
        <button type="button" class="row-btn" onClick={() => go('khata')}>
          <Icon name="book" size={32} color="#9A3412" />
          <span class="two">
            <b>खाता</b>
            <small>Khata</small>
          </span>
          <span class="end">
            <small>कुल उधार</small>
            <b class="brown">{money(due)}</b>
          </span>
        </button>
        <button type="button" class="row-btn" onClick={() => go('today')}>
          <Icon name="chart" size={32} color="#1B7F3B" />
          <span class="two">
            <b>आज का हिसाब</b>
            <small>Today's account</small>
          </span>
          <span class="end">
            <small>{today ? today.bills + ' बिल' : ''}</small>
            <b>{today ? money(today.total) : ''}</b>
          </span>
        </button>
        <button type="button" class="row-btn" onClick={() => go(cloud.value.login && cloud.value.status !== 'signedout' ? 'stock' : 'find')}>
          <Icon name="box" size={32} color="#1E40AF" />
          <span class="two">
            <b>स्टॉक</b>
            <small>Stock · where is it kept?</small>
          </span>
        </button>
      </div>

      <CloudLine />

      {memoryOnly.value && (
        <p class="warn">यह झलक है: फ़ोन में कुछ सेव नहीं होगा · Preview only: nothing is saved on this device</p>
      )}
      {mode.value === 'practice' && (
        <p class="note">अभ्यास मोड: ये बिल असली हिसाब में नहीं जुड़ते · Practice mode: these bills stay out of the real accounts</p>
      )}
    </main>
  );
}
