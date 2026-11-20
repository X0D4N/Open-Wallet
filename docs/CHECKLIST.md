# Feature and testing checklist (desktop 1.1.0)

Legend: **Done**: built and tested · **Demo**: simulated and labelled in the app · **Untested**: built, but couldn't be tested here · **No**: not possible locally · **Later**: not done yet

Tests: `npm test` (19 unit tests), `npm run e2e` (58 UI steps + 9 restart checks), and screenshots (`--screen …`, light and dark, 412×870).

## Screens and journeys

| Journey | Status | Tested by |
|---|---|---|
| Home: carousel (drag, keys, tap the peeking card), Hold to reader, all-cards view, featured next trip, filtered pass grid, IDs tile, FAB | Done | screenshot, e2e |
| Add to Wallet chooser, search across categories, providers and documents, region switch | Done | screenshot, e2e |
| Loyalty directory ("Popular in …", all, region filters, add your own) | Done | screenshot |
| Gift card directory, then form, with balance validation | Done | screenshot, e2e |
| Transport operators ("Choose a transport operator") | Done | screenshot |
| Tickets & events, then movie, then cinema directory, then form, then pass | Done | e2e |
| Boarding passes & travel (flight, train, bus, ferry, hotel, parking) | Done | screenshot (flight, train, hotel), manual form |
| IDs & personal info ("Choose what to add", region and group chips, official-site icon) | Done | screenshot, e2e |
| ABHA health ID (explanation, official link or personal copy) | Done | `--screen add-abha` |
| Aadhaar: official site or personal copy, check digit, masked | Done | unit, screenshot |
| Everything else: import photo or PDF, webcam photo, custom pass, .ics | Done (no OCR) | manual import path; e2e covers .ics |
| Payment card form: issuer picker, product, first digits to network, last 4, toggles | Done | e2e |
| Card detail, match level, correction, demo tap, activity | Done / Demo | e2e |
| Pass detail templates (13) with motifs, QR or Code 128, full-screen code | Done | screenshot, e2e, QR round-trip test |
| Favourite, archive, delete + undo, edit, duplicate warning | Done | e2e |
| Search, filters, sort | Done | e2e |
| Vault: set up PIN, unlock, wrong PIN, lockout, auto-lock, lock on switching apps, reveal with PIN, add, edit, replace and delete file, export, reset | Done | unit (crypto, lockout), e2e (create, unlock, reveal, lock) |
| Calendar file review: meetings skipped, prefilled form, no duplicates | Done | unit, e2e |
| Google Calendar connect, sync, disable, disconnect, revoke | Untested | No OAuth client was available. Errors (offline, expired, revoked, rate limit) are handled in code |
| Settings (theme, motion, region, default card, prefixes, sort, vault timeout, calendar, backup, restore, delete) | Done | e2e (theme, motion, calendar page) |
| Restart persistence (cards, passes, edits, favourite, exact code, calendar source, vault stays locked) | Done | e2e restart |
| Light and dark themes, sizes 340–1000 px wide | Done | screenshots |

## Card system tests

| Case | Result |
|---|---|
| Visa 411111, Mastercard 555555 / 222100, Amex 378282, Discover 601111, RuPay 652150 / 608001 / 508500, JCB 352800, UnionPay 620000, Diners 305693 | Pass (unit) |
| Unknown prefix gives no network and no guessed issuer | Pass |
| Priority: product › issuer + network › issuer › network › fallback | Pass |
| Product on an unusual network is flagged | Pass |
| Manual correction, and a confirmed prefix is remembered (6 digits only) | Pass (e2e) |
| Full number never requested or stored, and v1 data cleaned on migration | Pass |

## Pass system tests

| Case | Result |
|---|---|
| PVR INOX-style movie, Air India-style and SalamAir-style flights, train, event, hotel, transit, loyalty, gift | Sample data + screenshots |
| QR payloads (1–600 chars, Unicode) decode to the exact text, and over-long input is refused | Pass (independent reader with Reed–Solomon check) |
| Code text stored byte-for-byte | Pass |
| Missing code: no code block, nothing invented | Pass (hotel sample) |
| Sample codes labelled "not valid for entry" | Pass |

## Known gaps

- OCR and decoding barcodes from images: **Later**.
- PDF417 and Aztec drawing: **Later** (QR and Code 128 only).
- Windows Hello or biometric unlock for the vault: **Later** (PIN only).
- Android port of the 1.1 features: **Later** (the Android app has the new icon only).
- Real payments, NFC, issuer provisioning, government verification: **No**.
