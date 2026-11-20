# Catalogue coverage and contribution guide

Catalogue version `2026.11.1` lives in `src/renderer/catalog.js`. It's plain data, so adding a bank, provider, region or document type never needs UI or renderer changes.

## What's in it

| Part | Count | Notes |
|---|---|---|
| Regions | 15 | IN, AE, SA, QA, KW, BH, OM, US, CA, GB, EU, AU, NZ, SG, plus "Other" (XX). GCC can be used as a filter group |
| Add categories | 11 | Payment, loyalty, gift, transport, tickets & events, boarding passes & travel, IDs, ABHA (India only), health, vehicle, everything else |
| Pass templates | 13 | movie, flight, train, bus, ferry, transit, event, sports, hotel, parking, loyalty, gift, generic |
| Card networks | 9 | Visa, Mastercard, American Express, Discover, RuPay, JCB, UnionPay, Diners Club, Maestro (public prefix ranges) |
| Card issuers | 52 | India 14, UAE 8, Qatar 2, Saudi Arabia 3, Oman 2, Kuwait 1, Bahrain 1, US 7, UK 6, EU 5, Canada 2, Australia 1 |
| Providers | 221 | loyalty 47, gift 28, transit 32, cinemas 14, airlines 33, railways 16, bus 13, ferry and cruise 9, ticket sellers 9, hotels 12, parking 8 |
| Document types | 66 | India 13, UAE 5, Saudi Arabia 4, Qatar 2, Kuwait 2, Bahrain 2, Oman 2, US 10, Canada 2, UK 6, EU 5, Australia 2, generic 11 |

## Artwork status (honest)

| Level | Coverage |
|---|---|
| Official issuer or provider artwork, verified | **None.** No logo, card face or ticket artwork is bundled, and no permission was available |
| Issuer-specific design | All 52 issuers: an Open Wallet design in approximate brand colours (`art.verified = false`) |
| Product-specific design | Products listed for 35 issuers get a tier treatment (premium "metal", mid gradient, entry band). These aren't the bank's product designs |
| Network-level design | Neutral graphite design with the network name in text |
| Fallback | Neutral grey. Custom colour available |
| Pass providers | All 221: text wordmark in a round badge, in approximate brand colours. Airlines with a light pass surface: Air India only. Others use their brand colour as the pass background |

Brand colours are approximations from public appearance and are **not** checked against brand guidelines. Replace them when a brand kit is available.

## BIN / IIN data

No issuer BIN ranges are bundled, because there was no licensed or verifiable source. Issuers are identified from:

1. the person's choice, or
2. a 6-digit prefix the person confirmed on this computer (`settings.learnedIins`, which can be cleared in Settings).

Only the network is derived from digits, using published network prefixes. Full card numbers are never requested, stored or sent anywhere.

## Record formats

```js
// Provider
{ id: 'flight.airindia', cat: 'flight', name: 'Air India', sub: 'AI', region: 'IN', color: '#b5121b', fg: '#ffffff',
  iata: 'AI', surface: '#f7f3ec', ink: '#1b1b1b', scene: 'city', aliases: [],
  art: { kind: 'wordmark', source: 'Open Wallet original text treatment', licence: 'MIT', verified: false } }

// Issuer
{ id: 'hdfc', name: 'HDFC Bank', country: 'IN', colors: ['#004c8f', '#002a55'], fg: '#ffffff', iins: [], aliases: [],
  products: [{ id: 'infinia', name: 'Infinia', tier: 'premium', networks: ['visa', 'mastercard'] }], art: { … } }

// Document type
{ id: 'IN.pan', region: 'IN', name: 'PAN card', group: 'identity', authority: 'Income Tax Department', numberLabel: 'PAN',
  pattern: '^[A-Z]{5}\\d{4}[A-Z]$', check: null, mask: 'last4', sides: 1, expiry: false, sensitivity: 'very-high',
  official: { label: 'Get e-PAN from the Income Tax Department', url: 'https://www.incometax.gov.in/' }, fields: ['dob', 'father'] }
```

## Contributing

1. Add rows with the `add(cat, rows)`, `bank(...)` or `doc(...)` helpers. Use stable lowercase ids.
2. Give a source for every colour or artwork. For a real logo, add the file under `assets/providers/`, set `art: { kind: 'logo', source, licence, verified: true }` and include written permission or the brand kit's licence in the pull request.
3. Official links must point to the issuing authority's own domain, and the host must be added to `OPEN_HOSTS` in `main.js`.
4. Run `npm run build` (it checks ids, regions, colours and patterns) and `npm test`.
5. Never add BIN ranges without a citable, licensed source.
