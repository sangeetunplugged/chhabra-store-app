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
All data stays on the phone (IndexedDB) until the cloud database is connected. Send the backup file every day from **Day close** or **Owner settings → Backup**. A backup restores into the mode it came from, so a real backup restored on a new phone goes straight into the real accounts.

## Code map
- `src/screens/` – Home, Bill (billing, loose, amount only, item finder), Pay (payment and done), Khata, Today (day, bills, returns, day close), Owner (settings)
- `src/db.js` – local database, practice and real
- `src/printing.js` – ESC/POS receipt, Bluetooth and RawBT printing, WhatsApp text, UPI link
- `src/catalog.json` – the 300 items from the Stock List, with Hindi names and rack codes
