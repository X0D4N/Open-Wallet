# Capability matrix (Open Wallet 2.1.0)

Status key:
- **Tested**: implemented and tested (unit tests and/or the Android 15 emulator).
- **Built**: implemented and compiled, but not fully testable here.
- **Config**: implemented, but needs external configuration.
- **Blocked**: needs approval from an issuer, operator, government or platform.
- **Device**: depends on the phone's hardware.

Google Wallet's own features vary by country, issuer, device and provider. This table describes what Open Wallet does, not Google Wallet parity.

| Feature | Status | Notes |
|---|---|---|
| Payment-card display copies (issuer, product, network, last 4) | Tested | No full number, CVV or PIN is ever stored |
| Camera card scan: live preview, guide frame, auto-capture when steady and sharp, manual shutter, flash, front and back, rotate, retake | Tested (emulator virtual camera) | Not yet tested with a physical card on a real phone |
| Card-edge detection and perspective correction ("Straighten") | Built | Line-search edge finder plus a 4-point warp. Checked on the emulator capture. Accuracy on real cards still to measure |
| Blur, low-light and glare warnings | Built | Brightness, Laplacian sharpness and blown-out pixel share, computed live |
| On-device text recognition (ML Kit, bundled Latin model) | Tested | Synthetic test card image → HDFC Bank, Millennia, Visa, •••• 1111, 08/29, holder name |
| Barcode/QR recognition (ML Kit bundled plus ZXing) | Tested (unit) | Live camera code scanning built. IATA boarding-pass barcodes (BCBP) are parsed |
| Card classification: payment, loyalty, gift, transport, ID, ticket | Tested (unit) | Confidence-ranked; uncertain banks aren't pre-selected |
| Issuer match from printed bank name | Tested | Catalogue match only, marked as a suggestion. No BIN database is bundled |
| Official bank logos and card art | Blocked | Needs each brand's licence. Uses an Open Wallet design in issuer colours |
| Image and PDF import → automatic routing to the right form | Tested (image) / Built (PDF) | PdfRenderer, first 3 pages. Password-protected PDFs are reported |
| Source-photo retention | Tested | Off by default. Payment-card photos are never kept. ID photos go only into the vault |
| Loyalty, gift, transport, ticket and custom passes | Tested | Owner's illustration templates for 8 categories |
| Pass modes: visual / barcode / NFC | Tested | Shown on every pass. NFC mode only with an operator-issued credential (none yet) |
| Offers and coupons | Built | As a "purchase" or custom pass. No merchant offer feeds |
| Boarding passes, event tickets, transit passes, generic passes | Tested | Local copies. No live airline or operator updates |
| ID & document vault (Keystore encryption, biometrics or screen lock, screenshot block) | Tested | Personal copies. Not official mobile IDs |
| Official mobile ID / government credentials | Blocked | Needs government integration (e.g. DigiLocker, UAE PASS) |
| Search, filters, favourites, archive, delete, duplicate detection | Tested | |
| Offline viewing | Tested | Everything is local |
| Backup export / import | Built | JSON for cards and passes. The vault isn't included |
| Google Calendar import | Config | Needs your OAuth client (docs/GOOGLE_CALENDAR_SETUP.md). Not yet verified |
| Calendar file (.ics) import | Tested (unit) | |
| Expiry reminders | Built | Shown in the vault. No system notifications yet |
| Location-based pass suggestions | Not built | Would need a location permission. Left out for privacy |
| Import from other apps' "Add to Wallet" buttons | Blocked | That uses Google's Wallet API (Google Wallet only) |
| NFC capability detection (hardware, on/off, HCE, wallet role, default payment app) | Tested (no-NFC emulator) | Still to test on an NFC phone |
| NFC tag reading (NDEF text, links) | Built | Protected bank, transit and access cards are never read or copied. Needs an NFC phone to test |
| HCE access credential: developer test credential | Tested (unit, APDU protocol) / Device | Proprietary test AID with HMAC challenge-response, counter and unlock requirement. Needs a reader you program yourself |
| Operator access credentials (hotel, campus, office, transit) | Blocked | Each operator must issue AIDs, keys and a protocol |
| Contactless bank payments (tap to pay) | Blocked | Needs an issuer and a certified token service provider, network approval and certification. The UI says "Not yet available". The demo payment was removed |
| Default wallet role request (Android 15+) | Built, disabled | Only offered once a certified payment provider makes the app eligible |
| Accessibility | Built | Content descriptions on key controls, large touch targets. A full TalkBack audit is still to do |
| Localization | Not built | English only. Dates and currency use the phone's locale |
| Instrumentation tests | Not built | Device journeys run with adb scripts (scripts/device-test*.ps1) |
| WorkManager background processing | Not built | Recognition runs while the screen is open (a few seconds). No background jobs |
