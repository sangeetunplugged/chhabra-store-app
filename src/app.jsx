import { useEffect } from 'preact/hooks';
import { route } from './store.js';
import { installBackHandler } from './store.js';
import { Toast } from './ui.jsx';
import { Home } from './screens/Home.jsx';
import { Bill, Loose, Quick, Find } from './screens/Bill.jsx';
import { Pay, Cash, Upi, Udhaar, Done } from './screens/Pay.jsx';
import { Khata, Customer, NewCustomer } from './screens/Khata.jsx';
import { Today, BillView, ReturnNew, Close } from './screens/Today.jsx';
import { Owner, Shop, Printer, Items, Item, Backup, Pin } from './screens/Owner.jsx';
import { Cloud, Live } from './screens/Cloud.jsx';
import { Stock, StockPick, StockItem, StockCount, StockList } from './screens/Stock.jsx';
import { Vendors, Vendor, VendorEdit } from './screens/Vendors.jsx';
import { Accounts } from './screens/Accounts.jsx';

const SCREENS = {
  home: Home, bill: Bill, loose: Loose, quick: Quick, find: Find,
  pay: Pay, cash: Cash, upi: Upi, udhaar: Udhaar, done: Done,
  khata: Khata, customer: Customer, newCustomer: NewCustomer,
  today: Today, billView: BillView, returnNew: ReturnNew, close: Close,
  owner: Owner, shop: Shop, printer: Printer, items: Items, item: Item, backup: Backup, pin: Pin,
  cloud: Cloud, live: Live,
  stock: Stock, stockPick: StockPick, stockItem: StockItem, stockCount: StockCount, stockList: StockList,
  vendors: Vendors, vendor: Vendor, vendorEdit: VendorEdit,
  accounts: Accounts
};

export function App() {
  useEffect(() => {
    installBackHandler();
  }, []);
  const { name, p } = route.value;
  const Screen = SCREENS[name] || Home;
  return (
    <>
      <Screen key={name + ':' + JSON.stringify(p)} {...p} />
      <Toast />
    </>
  );
}
