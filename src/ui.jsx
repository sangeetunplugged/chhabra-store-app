// Shared pieces: icons, top bar, number pad, sheets, toast and the barcode scanner.
import { useEffect, useRef, useState } from 'preact/hooks';
import { toastMsg } from './store.js';
import { mode } from './db.js';
import { money, typed, toInt } from './format.js';
import { beep } from './printing.js';

const PATHS = {
  back: 'M15 18l-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-3.5-3.5',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9v6M11 9v6M14 9v6M16.5 9v6',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7M8 11h7',
  box: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10',
  chart: 'M4 20V11M10 20V5M16 20v-6M2 20h20',
  cash: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3M20 14v7M14 20h3',
  check: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM7.5 12.5l3 3 6-7',
  print: 'M6 9V3h12v6M5 9h14a2 2 0 0 1 2 2v6H3v-6a2 2 0 0 1 2-2zM7 14h10v7H7z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.9A8 8 0 1 1 21 12z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  pause: 'M8 5v14M16 5v14',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8zM4 21a8 8 0 0 1 16 0',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM19 12l2-1-1-3-2 .2-1.3-1.5.4-2-3-1-1 1.8h-2L9.1 3.7l-3 1 .4 2L5.2 8.2 3 8l-1 3 2 1-2 1 1 3 2.2-.2 1.3 1.5-.4 2 3 1 1-1.8h2l1 1.8 3-1-.4-2 1.3-1.5 2 .2 1-3z',
  bag: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2',
  cloud: 'M7 18a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.6 8.2 4.9 4.9 0 0 1 17 18z'
};

export function Icon({ name, size = 24, stroke = 2, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      style={{ flex: 'none', fill: 'none', stroke: color || 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d={PATHS[name]} />
    </svg>
  );
}

export function PracticeChip() {
  if (mode.value !== 'practice') return null;
  return <span class="chip practice">अभ्यास · Practice</span>;
}

export function TopBar({ title, sub, onBack, right }) {
  return (
    <header class="top">
      {onBack && (
        <button type="button" class="icon-btn" aria-label="वापस · Back" onClick={onBack}>
          <Icon name="back" />
        </button>
      )}
      <div class="top-title">
        <h1>{title}</h1>
        {sub && <span>{sub}</span>}
      </div>
      <div class="top-right">{right !== undefined ? right : <PracticeChip />}</div>
    </header>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];

export function Keypad({ onKey, compact }) {
  return (
    <div class={'keypad' + (compact ? ' compact' : '')}>
      {KEYS.map((k) => (
        <button type="button" key={k} class="key" aria-label={k === 'del' ? 'मिटाएं · Delete' : k} onClick={() => onKey(k)}>
          {k === 'del' ? <Icon name="back" size={26} stroke={2.5} /> : k}
        </button>
      ))}
    </div>
  );
}

export function Toast() {
  const msg = toastMsg.value;
  if (!msg) return null;
  return <div class="toast" role="status">{msg}</div>;
}

export function Sheet({ children, onClose, label }) {
  return (
    <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div class="sheet">{children}</div>
    </div>
  );
}

// Asks for a number (a price, an amount) with the big number pad.
export function AmountSheet({ title, sub, unit, initial, okText, onDone, onClose, min = 1 }) {
  const [v, setV] = useState(initial ? String(initial) : '');
  const n = toInt(v);
  return (
    <Sheet onClose={onClose} label={title}>
      <div class="sheet-head">
        <div>
          <h2>{title}</h2>
          {sub && <p class="muted">{sub}</p>}
        </div>
        <button type="button" class="icon-btn" aria-label="बंद करें · Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div class="amount-box">
        {money(n)}
        {unit && <small>{unit}</small>}
      </div>
      <Keypad onKey={(k) => setV(typed(v, k))} compact />
      <button type="button" class="btn primary big" disabled={n < min} onClick={() => onDone(n)}>
        <b>{okText ? okText[0] : 'ठीक है'}</b>
        <small>{okText ? okText[1] : 'OK'}</small>
      </button>
    </Sheet>
  );
}

// Camera barcode scanner. Uses the phone's built-in barcode reader in Chrome.
export function Scanner({ onCode, onClose }) {
  const video = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let stream = null;
    let stopped = false;
    let timer = null;
    (async () => {
      if (!('BarcodeDetector' in window)) {
        setErr('इस फ़ोन में स्कैनर नहीं चलता। नाम से खोजें · This phone cannot scan here. Search by name');
        return;
      }
      const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
      let formats = wanted;
      try {
        const sup = await window.BarcodeDetector.getSupportedFormats();
        formats = wanted.filter((f) => sup.includes(f));
      } catch (e) {
        /* use the full list */
      }
      const det = new window.BarcodeDetector({ formats });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play();
      const tick = async () => {
        if (stopped) return;
        try {
          const codes = await det.detect(video.current);
          if (codes && codes.length) {
            beep();
            stopped = true;
            onCode(codes[0].rawValue);
            return;
          }
        } catch (e) {
          /* keep trying */
        }
        timer = setTimeout(tick, 160);
      };
      tick();
    })().catch(() => setErr('कैमरा नहीं खुला। अनुमति दें · Camera did not open. Allow camera access'));
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div class="scanner" role="dialog" aria-modal="true" aria-label="बारकोड स्कैन · Scan barcode">
      <video ref={video} playsInline muted />
      <div class="scan-frame" aria-hidden="true" />
      <div class="scanner-bar">
        <p>{err || 'बारकोड को डिब्बे में रखें · Hold the barcode inside the box'}</p>
        <button type="button" class="btn light" onClick={onClose}>
          <b>बंद करें</b>
          <small>Close</small>
        </button>
      </div>
    </div>
  );
}

export function Empty({ hi, en }) {
  return (
    <div class="empty">
      <span>{hi}</span>
      <small>{en}</small>
    </div>
  );
}
