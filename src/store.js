// App-wide state: which screen is open, the bill being made, the payment in progress, toasts.
import { signal } from '@preact/signals';

export const route = signal({ name: 'home', p: {} });
export const toastMsg = signal('');
export const lines = signal([]); // the bill being made
export const pay = signal(null); // { total, cash, upi, udhaar, given, change, customerId }
export const undoLine = signal(null); // { line, index }
export const ownerOk = signal(false); // owner PIN entered in this visit
export const refresh = signal(0); // bump after a write so open screens reload

// Logical parent of each screen: the phone's back gesture goes here.
const PARENT = {
  bill: 'home', find: 'home', loose: 'bill', quick: 'bill', pay: 'bill', cash: 'pay', upi: 'pay', udhaar: 'pay', done: 'home',
  khata: 'home', customer: 'khata', newCustomer: 'khata', today: 'home', billView: 'today', returnNew: 'today',
  close: 'today', owner: 'home', shop: 'owner', printer: 'owner', items: 'owner', item: 'items', backup: 'owner', pin: 'owner',
  cloud: 'owner', live: 'home',
  stock: 'home', stockPick: 'stock', stockItem: 'stock', stockCount: 'stock', stockList: 'stock',
  vendors: 'stock', vendor: 'vendors', vendorEdit: 'vendors',
  accounts: 'home'
};

export function go(name, p = {}) {
  route.value = { name, p };
  try {
    window.scrollTo(0, 0);
  } catch (e) {
    /* ignore */
  }
}

export function back() {
  const cur = route.value.name;
  const parent = (route.value.p && route.value.p.back) || PARENT[cur];
  if (!parent) return false;
  go(parent);
  return true;
}

export function installBackHandler() {
  try {
    history.pushState({ guard: 1 }, '');
    window.addEventListener('popstate', () => {
      if (back()) history.pushState({ guard: 1 }, '');
    });
  } catch (e) {
    /* history not available: in-app back buttons still work */
  }
}

let toastTimer;
export function say(msg) {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMsg.value = '';
  }, 2800);
}

export const bump = () => {
  refresh.value++;
};

export function clearBill() {
  lines.value = [];
  pay.value = null;
  undoLine.value = null;
}
