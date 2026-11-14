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
  - `rajan` for Rajan's phone: view only.
  In the app, go to **Owner settings → Cloud** and type just `counter` or `rajan` with the password.
- The counter phone uploads **real data only**: bills, khata entries, customers with their balance, returns, day closes, items and shop settings. Each change goes into an outbox in the same database step and is sent in batches when online. Practice data never leaves the phone.
- Only one phone can be the counter. If a new phone signs in as `counter`, it offers to take over: it pulls the cloud copy, and the old phone stops uploading and says so.
- Any other login sees **Shop live**: any day's sales (cash, UPI, udhaar), bills with their items, khata balances, and when the counter phone last synced.
- `firestore.rules`: shop logins can read; only `counter` can write. Publish them from the console (Firestore → Rules) or with `firebase deploy --only firestore:rules`.
- To test against the Firebase emulators, build with `VITE_FIREBASE_EMULATOR=127.0.0.1 npx vite build --outDir dist-emu` and run `firebase emulators:start --only auth,firestore`.

## Code map
- `src/screens/` – Home, Bill (billing, loose, amount only, item finder), Pay (payment and done), Khata, Today (day, bills, returns, day close), Owner (settings)
- `src/db.js` – local database, practice and real, with the upload outbox
- `src/cloud.js`, `src/cloudState.js` – Firebase sign-in, upload, counter hand-over, Shop live reads (loaded only when used)
- `src/screens/Cloud.jsx` – Cloud settings, the status line on Home, Shop live
- `src/printing.js` – ESC/POS receipt, Bluetooth and RawBT printing, WhatsApp text, UPI link
- `src/catalog.json` – the 300 items from the Stock List, with Hindi names and rack codes
