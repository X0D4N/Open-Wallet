# Technical notes (desktop 1.1.0)

## Processes and security boundary

- **Main process** (`main.js`): window, `WalletStore` (JSON), `Vault` and `Originals` (encrypted), `CalendarClient` (network), file dialogs, `shell.openExternal` for an allow-list of official hosts, and `setContentProtection` while the vault is open.
- **Preload** (`preload.js`): exposes `walletApi` (wallet, vault, originals, calendar) through `contextBridge`. `contextIsolation` is on, `nodeIntegration` off, `sandbox` on.
- **Renderer** (`src/renderer/`): a plain-JS single page. Its CSP is `connect-src 'none'`, so the page itself can't make network requests.

## Renderer modules (load order)

`lib.js` (Code 128, money, dates) → `catalog.js` (data) → `engines.js` (QR, GCIAE, recognition, .ics, masking, checks) → `icons.js` → `art.js` (renderers) → `core.js` (state, navigation stack, sheets, dialogs, snackbar) → `pages.js` → `forms.js` → `flows.js` → `vault-ui.js` → `app.js` (actions, start-up).

Pages register in `App.PAGES` with `render(params)` (returns HTML) and an optional `mount(el, params)`. Pages that hold typed input set `keep: true` and an optional `refresh(entry)` so saves never wipe what the person is typing. Clicks go through one delegated handler: `data-act` maps to `App.ACTIONS`.

## Data model (wallet.json, schema v2)

```js
card = { id, issuerId, issuerName, productId, productName, networkId, kind, last4, holder, showHolder,
         expMonth, expYear, showExpiry, contactless, color, nickname, addedAt, transactions[] }
pass = { id, template, providerId, providerName, color, fields{<template field>: string}, extraFields[{label,value}],
         barcode{ value (verbatim), format: qr|code128|none, source: entered|import|demo },
         original{ fileId, name, mime, size, sha256 } | null, source: manual|import|calendar|sample,
         sourceRef, sourceStatus: ''|changed|removed, favorite, archived, edited, currency, createdAt, updatedAt, history[] }
settings = { theme, region, defaultCardId, sortPasses, vaultTimeout, lockOnBlur, expiryReminders,
             calendar{ enabled, connected, lastSync, lastError, autoImport, onRemoved, clientId }, calendarIgnored[], learnedIins{} , … }
```

`store.normalizeWallet` validates every field against the catalogue templates and drops anything unknown, so no stray full card number survives. v1 records are migrated (`kind` becomes `template`, field names are mapped, the barcode becomes an object), and a `.v1.bak` copy is written first.

## Card identification (GCIAE)

`Engines.identifyCard({ prefix ≤ 8 digits, issuerId, productId, networkId, learned })`:

1. Network: longest matching published prefix (`Catalog.NETWORKS`). 6011 is always Discover. RuPay-JCB co-brands (353/356) show as JCB.
2. Issuer: the person's choice, otherwise a prefix they confirmed here, otherwise catalogue `iins` (empty). Never guessed.
3. Network-locked issuers (Amex, Discover) override the network.
4. Level: `product` › `issuer-network` › `issuer` › `network` › `fallback`. This is shown in the card form and the card detail. A product on a network it isn't listed for is flagged.

`Art.cardArt` is the single renderer. It uses the issuer colours plus a tier treatment (premium "metal", mid gradient, entry band, network graphite, neutral fallback), text issuer, product and network, the contactless mark only if the person says the card has it, holder and expiry only if they choose, and a "Display only" tag.

## Passes

`Catalog.TEMPLATES` defines the fields per template, and `Art.passInfo` derives title, subtitle, colours and motif. `Art.passCard` lays out each template, following the supplied PVR INOX, Air India and SalamAir pictures for the movie and flight layouts. A provider can set `surface`/`ink` (light pass, as for Air India) and `scene` (illustration). Motifs are inline SVG drawn for this project.

QR encoder: byte mode, error correction M, versions 1–20, all 8 masks scored by penalty, UTF-8 payload unchanged. The tests decode every symbol with an independent reader and check that all Reed–Solomon syndromes are zero.

## Calendar

- `.ics`: `Engines.parseIcs` handles folding, escapes, DATE and DATE-TIME (UTC or floating).
- Google: system browser + loopback redirect + PKCE (`S256`), scope `calendar.events.readonly`, `access_type=offline`. The refresh token is kept with `safeStorage`. Events cover yesterday to +180 days, and only `items(id,status,summary,description,location,start,end,organizer/displayName)` is requested. Disconnect calls the revoke endpoint and then deletes the token.
- `Engines.detectBooking` scores keywords and provider names. A meeting-like title subtracts points, and anything under the threshold is ignored. It fills only the fields it finds, and lists missing required fields.
- Duplicates are matched by `sourceRef` (`gcal:<id>` / `ics:<uid>`) or by template + reference + date. Changes are shown as from → to, and a pass the person edited asks before it's overwritten. Deleted events are marked or deleted, as set in Settings. Auto-import is off by default, and even when on it only saves confident matches with no missing fields.

## Vault

The data key is 32 random bytes. It's wrapped with AES-256-GCM under `scrypt(PIN, salt, N=2^15)`, and the wrapped blob is protected again by `safeStorage` when available. Records are one encrypted JSON blob, and each file is its own encrypted blob. After 5 wrong PINs there's a lockout (30 s, doubling, up to 5 min). The main-process timer locks the vault after the set number of minutes of inactivity. The renderer locks it when the window blurs (unless a dialog Open Wallet opened caused the blur). Temporary decrypted PDFs are overwritten and deleted on lock or quit. Documents never enter `wallet.json` or its backups.

## Accessibility

Every control is a button or has a role, icon buttons have labels, the carousel is focusable with arrow keys, "Reduce motion" removes animations, and colour contrast for text on artwork comes from `Art.inkOn` (luminance-based).

## Motion (estimates, not measured from the original)

Page push: slide 450 ms emphasized easing. Pop: 300 ms. Card carousel: 380 ms emphasized. The peeking card scales to 0.93. Shared-element card flight: 460 ms. Sheets: 420 ms in, 250 ms out, and you can drag to dismiss. Tiles: fade-up with a 40 ms stagger. Ripples on every pressable surface.
