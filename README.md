# Chhabra Store counter app

Billing, khata and day close for Chhabra Store, Patel Nagar, Panipat. Phase 1 of the shop app plan.
Hindi on top with English below, big buttons, works offline on an Android phone.

## What Phase 1 does
- **Billing:** quick tiles, search, camera barcode scan (the app learns each barcode the first time), price asked once on first sale, loose items by weight or by ₹, amount-only rush sale, undo, hold a bill.
- **Payment:** cash with change, UPI QR with the exact amount, udhaar to a customer's khata, or a split (part cash, rest UPI or khata).
- **Bill:** saved with a tick and a sound, printed on a 58 mm thermal printer (Bluetooth, RawBT app or the phone's print screen), WhatsApp copy on request.
- **Khata:** customers, balances, payments received (cash or UPI), WhatsApp reminders.
- **Today's account:** totals by cash, UPI and udhaar, bill list with reprint and cancel, returns, day close against the galla, daily backup file.
- **Owner settings (PIN):** shop details and UPI ID, printer, items and prices (300 items from the Stock List, with rack codes), practice or real mode, backup and restore.

Practice and real mode keep separate bills, khata and prices on the phone. Shop details, UPI ID, printer and learned barcodes are shared by both. Practice starts with sample prices and sample customers.

## Run it
```
npm install
npm run dev      # local test
npm run build    # production files in dist/
```

## Put it on the counter phone
Live app: https://sangeetunplugged.github.io/chhabra-store-app/

Every push to `main` builds the app and publishes it with GitHub Pages (`.github/workflows/deploy.yml`).
1. Open the link in Chrome on the counter phone.
2. Tap **⋮ → Add to Home screen → Install**.
3. Open it once with internet. After that it opens like an app and works with no internet.

Updates load by themselves the next time the app is opened with internet. Data on the phone is not touched by updates.

## Data
Data lives on the phone (IndexedDB), so billing never waits for the internet. Once the counter phone is signed in to the cloud (below), it also uploads the real data. Send the backup file every day from **Day close** or **Owner settings → Backup**. A backup restores into the mode it came from, so a real backup restored on a new phone goes straight into the real accounts.

## Cloud sync (Firebase)
- Project `chhabra-store` (free Spark plan). Firestore database in `asia-south2` (Delhi). Email/Password sign-in with new sign-ups blocked.
- Logins are made by Rajan in the Firebase console (Authentication → Users → Add user) as `<name>@chhabra-store.firebaseapp.com`:
  - `counter` for the shop phone: it uploads.
  - `stock` for the brother's phone: stock and suppliers.
  - `rajan` for Rajan's phone: Shop live and Accounts; it can add expenses.
  In the app, go to **Owner settings → Cloud** and type just `counter`, `stock` or `rajan` with the password.
- The counter phone uploads **real data only**: bills, khata entries, customers with their balance, returns, day closes, items and shop settings. Each change goes into an outbox in the same database step and is sent in batches when online. Practice data never leaves the phone.
- Only one phone can be the counter. If a new phone signs in as `counter`, it offers to take over: it pulls the cloud copy, and the old phone stops uploading and says so.
- Any other login sees **Shop live**: any day's sales (cash, UPI, udhaar), bills with their items, khata balances, and when the counter phone last synced.
- `firestore.rules`: shop logins can read. Only `counter` writes sales data; `stock` and `counter` add stock moves, suppliers and khata lines; any shop login adds expenses and owner notes. Publish them from the console (Firestore → Rules) or with `firebase deploy --only firestore:rules`.
- To test against the Firebase emulators, build with `VITE_FIREBASE_EMULATOR=127.0.0.1 npx vite build --outDir dist-emu` and run `firebase emulators:start --only auth,firestore`.

## Stock (Phase 2, part 1)
- **Who does what:** the brother's phone signs in as `stock`. It records goods in (with buy rate and expiry), fills shelves from home, does counts rack by rack, and takes goods out (return to vendor, damaged or expired, used at home). The counter phone's **स्टॉक** button shows search and Fill shelves. Rajan's phone sees every list, read-only.
- **How the numbers work:** every change is a stock move (`shops/chhabra/moves`), and a move is never edited; a mistake is undone with a new move. The counter phone uploads what each item sold per day (`shops/chhabra/sales/{day}`). Shop stock is all shop moves minus everything sold, and home stock is all home moves. A count records the difference from what the app expected, so after a count the number is exactly what was counted.
- **Lists:**
  - Fill shelves: items below their shop target, in walking order R1→R4, B1→B2, L2→L1, then the counter, freezer and others.
  - Order list: items at half their shop + home target or less, sendable on WhatsApp.
  - Expiring soon: 30 days ahead, or 2 days for dairy, bread and eggs, counted first in, first out.
  - Hot sellers: top 20 over 7 or 30 days.
  - Not selling: no sale in 30 or 60 days; seasonal items are left out.
  - All stock: shop and home for every item, with stock value, 30-day sales, margin and days of stock for the chosen category.
- **On the phone:** each phone keeps a local copy of moves, sales and items (`chhabra-cloudcache`) and fetches only what is new, by server time. Moves made offline are kept by Firestore and sent later.
- **Start with one full count**, one rack a day. Until an item is counted, its shop number shows **?**.

## Suppliers (Phase 2, part 2)
- **Stock → सप्लायर · Vendors:** the list shows what the shop owes in total, what falls due in 3 days or is overdue, whose order day it is today, and each supplier with their balance and next due date. **+ New vendor** sits at the top.
- **Supplier page:** what the shop owes, unpaid bills with their due dates, and the full khata. From here:
  - **Purchase bill:** amount, bill number, bill date, pay-within days and a photo of the paper bill (shrunk to under 1 MB and kept in the cloud).
  - **Payment:** from the galla, other cash, UPI or bank.
  - **Return** and **Send order** (the low items from this supplier, on their WhatsApp).
  - Call and WhatsApp buttons, and the items they supply with this supplier's buy rate (✓ marks the cheapest).
  - Any line can be undone within a day.
- Payments and returns settle the oldest bill first, so due dates always show what is really unpaid.
- **Goods in** asks which supplier; the supplier's own item list fills that in automatically. **Stock out → Return to vendor** picks the supplier, suggests the value from their last rate, and adds a return line to their khata.
- **Item page** compares buy rates by supplier. **Order list** is split by supplier, with a WhatsApp button for each.
- **Cash paid from the galla** counts in the counter's Today's account and day close, and in Shop live, so the galla still matches.
- Cloud: `vendors`, `vledger` (khata lines, never edited) and `photos`. Rules: stock and counter logins add these; everyone signed in can read.

## Accounts (Phase 3)
- **Rajan's phone → हिसाब-किताब · Accounts**, month by month:
  - **Profit:** sales (cash, UPI, udhaar), cost of goods at the latest buy rates, gross profit, expenses and net profit. Sales of items with no buy rate yet are left out of the cost, and the gross is scaled from the items that have one; the screen says what share of sales that covers. It also shows what was bought from suppliers and paid to them.
  - **Daily sales** bars, with the best day.
  - **GST watch:** sales this financial year (1 April to 31 March) against the ₹20 lakh limit, where they land by 31 March at the current daily average, and the day they would cross it. Sales from before the app are typed in once (kept at `owner/gst`).
  - **Udhaar by age:** 0–30, 31–60, 61–90 and 90+ days, counted from the oldest unpaid udhaar (payments clear the oldest first). Each customer has a WhatsApp reminder button.
  - **Expenses:** rent, electricity, salary, transport and loading, tea and snacks, repairs, other; paid from the galla, other cash, UPI or bank. A line can be undone within a day.
- **Counter phone:** **+ खर्चा** on Today's account adds an expense paid from the galla. Like supplier payments, it comes off the expected galla in Today, Day close and Shop live.
- **Day close → राजन को हिसाब भेजें:** sends the day's summary (bills, sales split, khata received, returns, galla payouts, whether the galla matched, shelves to fill and items to order) to Rajan's WhatsApp. Set the number once in **Owner settings → Shop → Owner's WhatsApp**.
- Cloud: `expenses` (never edited; undo adds a line) and `owner` (notes such as the GST figure). Customers now carry `since` (oldest unpaid udhaar) and `lastPay`, and each day's sales doc carries the day's totals.

## Code map
- `src/screens/` – Home, Bill (billing, loose, amount only, item finder), Pay (payment and done), Khata, Today (day, bills, returns, day close), Owner (settings)
- `src/db.js` – local database, practice and real, with the upload outbox
- `src/cloud.js`, `src/cloudState.js` – Firebase sign-in, upload, counter hand-over, Shop live reads (loaded only when used)
- `src/screens/Cloud.jsx` – Cloud settings, the status line on Home, Shop live
- `src/stockCalc.js` – stock maths and the lists (plain functions, same on every phone)
- `src/stockState.js` – the phone's copy of stock data, saving moves
- `src/screens/Stock.jsx` – stock screens: hub, goods in and out, item, counting, lists
- `src/vendorCalc.js` – what is owed, dues (oldest bill first), buy rates by supplier, galla payouts
- `src/screens/Vendors.jsx` – supplier list, supplier page and khata, bill with photo, add/edit supplier
- `src/accountsCalc.js` – month profit, GST watch, udhaar ageing (plain functions)
- `src/screens/Accounts.jsx` – Accounts screen, the expense sheet, the day-close WhatsApp text
- `src/printing.js` – ESC/POS receipt, Bluetooth and RawBT printing, WhatsApp text, UPI link
- `src/catalog.json` – the 300 items from the Stock List, with Hindi names and rack codes
