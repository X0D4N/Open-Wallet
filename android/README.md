# Open Wallet for Android

A local-first wallet for Android (Kotlin, Jetpack Compose, Material 3) for payment-card display copies, boarding passes and tickets, loyalty and gift cards, transport passes, and an encrypted vault for personal copies of IDs. Built for release on Google Play. It's an independent project, not affiliated with Google or any bank, airline, cinema or government.

## Ready-made builds (`dist/`)

| File | What it's for |
|---|---|
| **`OpenWallet-2.1.0.apk`** | **Install this on your phone** (most phones from about 2017 on, 64-bit ARM). Signed with your Play upload key |
| `OpenWallet-2.1.0-universal.apk` | Works on every phone type, but larger (89 MB) |
| `OpenWallet-2.1.0-older-32bit-phones.apk` | For older 32-bit phones |
| `OpenWallet-2.1.0-x86_64-emulator.apk` | For the Android emulator on a PC |
| **`OpenWallet-2.1.0.aab`** | Upload to Google Play Console (Play gives each phone only what it needs) |
| `OpenWallet-2.1.0-mapping.txt` | Crash-report mapping for Play Console |
| `OpenWallet-2.0.0.*`, `OpenWallet-1.*.apk` | Older versions, kept for reference |

**New in 2.1.0:** camera card scanner, on-device recognition of bank, loyalty, gift, transport and ID cards and tickets (from photos, screenshots and PDFs), boarding-pass barcode reading, live QR/barcode scanning, Settings › Payments & NFC (real NFC capability check, NFC tag reader, developer test access credential), and visual/barcode/NFC pass modes. The demo tap-to-pay screen and all sample transactions were **removed**: contactless payments now show "Not yet available: issuer or partner integration required". See [docs/CAPABILITIES.md](docs/CAPABILITIES.md) and [docs/NFC_PAYMENTS.md](docs/NFC_PAYMENTS.md).

2.1.0 test run on the Android 15 emulator, 14 Nov 2026 (`scripts/device-test-scan.ps1`):
- **Passed:** the scanner opened with the live camera and auto-captured; a synthetic test-card image was recognised on the phone as HDFC Bank Millennia, Visa, •••• 1111; the full number didn't appear anywhere; no crashes.
- **Checked by hand:** Payments & NFC correctly showed "no NFC hardware" on the emulator. The automated check failed only because it tapped the section heading, which is now fixed in the script.
- **Unit tests passing:** 12, including card scanning, CVV scrubbing, boarding-pass barcodes and the NFC protocol.
- **Not tested yet:** a physical card on a real phone, NFC hardware and an NFC reader.

Release steps: [docs/PLAY_STORE.md](docs/PLAY_STORE.md). Google Calendar set-up: [docs/GOOGLE_CALENDAR_SETUP.md](docs/GOOGLE_CALENDAR_SETUP.md). Privacy policy: [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md).

## Features (2.0.0)

| Area | Status |
|---|---|
| Home: swipeable card carousel with the next card peeking, Hold to reader (demo), all-cards view with re-ordering, "next up" trip or event, filtered two-column pass grid, IDs & documents tile, Add to Wallet button that shrinks on scroll | Works, tested on the emulator |
| **Ticket illustrations**: the owner's 8 illustrations (flight, train, bus, taxi, ship, entry/exit, amusement, movies) are the background of each ticket. Details are laid out in the empty top area and never over the artwork, and a card with many details grows upward in the illustration's own colour. The illustration is chosen automatically by category and can be changed per pass | Works, all 8 opened on the emulator |
| Ticket templates: flight, train, bus, taxi, ferry/ship, movie, event, sports, amusement, entry, hotel, parking, transport pass, loyalty, gift, purchase, custom. Each shows only the fields that were filled in | Works |
| Codes: QR, Code 128, PDF417 and Aztec drawn from the exact text (ZXing); codes read from imported photos on the phone; full-screen code at full brightness; demo codes labelled | Works |
| Add to Wallet: searchable chooser, region switch, provider directories (loyalty, gift, transport, cinemas, airlines, rail, bus, taxi, ferry, events, parks, entry, hotels, parking), ticket-type chooser, "Everything else" (import a photo or PDF, camera, custom pass, .ics) | Works, tested on the emulator |
| Payment cards: no full number, only the first 6–8 digits for the network plus the last 4; issuer and product from 52 banks; match level shown; correction | Works |
| Encrypted database (SQLCipher, key in Android Keystore). Nothing goes into cloud backups | Works |
| ID & document vault: Keystore encryption, unlock with fingerprint, face or screen lock, screenshots blocked, locks when the app is left or after a timeout, masked numbers, reveal after re-authentication, front/back originals, export, delete, country-aware types, official-site links, format checks | Works, unlock and save tested on the emulator |
| Calendar: .ics import with booking detection, review and duplicate check | Works (unit tested) |
| Google Calendar: official Android authorization, read-only scope, Calendar API with paging, review before saving, duplicate and change handling, manual sync plus optional sync on app start, disconnect with revoke | **Built, not verified.** It needs your OAuth client, see the set-up guide. On the emulator, Connect opened Google's real sign-in screen |
| Backup export and import (cards and passes, JSON) | Works |
| Demo tap to pay, transit top-ups | **Demo only**, labelled |

A new install starts empty. *Settings › Add sample passes* adds made-up, labelled samples.

## Build

Needs JDK 17 and the Android SDK (platform 36, build-tools 36.0.0).

```bash
./gradlew testDebugUnitTest assembleRelease bundleRelease          # Windows: gradlew.bat
# If the project is in OneDrive or Dropbox, keep build output elsewhere:
./gradlew bundleRelease -Popenwallet.buildRoot=C:\temp\ow-build
```

Release builds are signed with `keystore/upload-keystore.jks` when `keystore.properties` exists, and with the debug key otherwise. Both files are git-ignored. **Back them up.**

The catalogue (`app/src/main/assets/catalog.json`) is generated from `../src/renderer/catalog.js` by `node ../scripts/export-catalog.js`.

## Tests

- `./gradlew testDebugUnitTest`: catalogue, card networks and match levels, booking detection (flight, movie, taxi, amusement, meetings ignored), .ics parsing, duplicates, masking and ID checks.
- `powershell -File scripts/device-test.ps1`: installs the APK on a running emulator or phone and walks through the main journeys. Last run on the Android 15 emulator, 14 Nov 2026:
  - **Passed:** install; welcome screen; app starts empty; samples load; all 10 ticket types open, with the 8 supplied illustrations shown; Add chooser, gift directory, transport operators, movie form; vault unlock with the screen lock; no crashes.
  - **Checked by hand:** the saved vault document shows masked as `XXXX XXXX 6789`. The automated check for this step failed only because it looked before the screen finished loading.
  - **Calendar:** Connect opened Google's sign-in screen. Nothing further, because there's no OAuth client yet.

  Screenshots are in `../shots/android2/`. The vault screenshot is black because the app blocks screenshots while the vault is open.

## Known limits

- Provider logos are text wordmarks in approximate brand colours. No official logos are bundled without permission.
- No Purchases/Gift Cards illustration was supplied, so gift, purchase, loyalty, hotel and custom passes use a plain card in their colour.
- Animation timings use Material 3 emphasized easing (300 ms page transitions). They weren't measured against Google Wallet: there's no screen recording, and the original app's files weren't opened.
- Only text-based codes are read from photos; other text (OCR) isn't.
- Real payments, NFC and verified IDs aren't possible.
