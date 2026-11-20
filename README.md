<p align="center"><img src="docs/media/header.png" alt="Open Wallet. Your cards. Your passes. On your phone. Android app screens showing Add to Wallet and review of a recognised display-only card." width="100%"></p>

<p align="center"><strong>A local-first Android wallet for cards, passes and personal documents.</strong></p>
<p align="center">Kotlin · Jetpack Compose · Android 8.0+ · MIT</p>

Keep display copies of payment cards, tickets, loyalty cards and personal documents together. Scan a card, import an image or PDF, or add the details yourself. No app account is required.

**This is not a contactless payment app.** Bank cards are display copies. Open Wallet cannot pay at a terminal, replace official digital IDs, or issue valid tickets.

## At a glance

- **Scan and import:** camera capture, on-device text and barcode recognition, image and PDF import, then review before saving.
- **Cards and passes:** payment-card display copies, boarding passes, travel and event tickets, loyalty, gift and custom passes.
- **Personal document vault:** encrypted storage with Android Keystore integration and biometric or device-lock access.
- **Local-first:** core wallet features work without an app account. Google Calendar import is optional and requires separate setup.

<table>
<tr>
<td width="33%"><img src="docs/media/01-add.png" alt="Add to Wallet screen with camera, barcode, image, PDF and calendar import options."></td>
<td width="33%"><img src="docs/media/05-card-from-image.png" alt="A synthetic test-card image recognised as a display-only card, with a review warning."></td>
<td width="33%"><img src="docs/media/06-payments-nfc.png" alt="Payments and NFC screen explaining that contactless bank payments are unavailable."></td>
</tr>
<tr><td align="center">Add your way</td><td align="center">Review recognised details</td><td align="center">Clear capability limits</td></tr>
</table>

Screenshots supplied with the project, captured on an emulator. The card example uses synthetic test data.

## Install

Version **2.1.0** is the current version in the Android source.

**Upgrade hold:** source review found that a failed migration from the older 1.x database can still delete the original database. Do not upgrade a 1.x install with this build until migration handling is fixed and tested. This has not been reproduced on a device.

The phone APK is named `OpenWallet-2.1.0.apk` and targets **64-bit ARM** devices. Android 8.0 or newer is required. Install APKs only from a source you trust, and back up your data before updating.

The APK release asset and its SHA-256 checksum will be added after the supplied binary is inspected. No APK has been verified as part of this repository preparation yet.

## Build from source

Requires **JDK 17**, Android SDK platform **36** and build-tools **36.0.0**.

```bash
cd android
./gradlew testDebugUnitTest
./gradlew assembleRelease
```

On Windows, use `gradlew.bat`. Build the Play bundle separately with `./gradlew bundleRelease`.

The existing build uses a private upload key when configured, otherwise a debug key. A locally built APK is not necessarily signed for updating an existing install. Never commit signing keys or signing passwords.

## What is and isn't verified

The project includes unit tests and prior Android 15 emulator test notes. Those notes are historical, not a new test run or security audit. Physical-phone scanning, NFC hardware behaviour and end-to-end Google Calendar authorization still need validation.

- Contactless bank payments need issuer and payment-provider integration, approval and certification. None is configured.
- NFC tag reading and the developer test credential are not bank-card cloning or general door/transit compatibility.
- Stored documents are personal copies, not government-issued mobile credentials.
- No live ticket validity, balance updates or operator integration is promised.

See [capability details](android/docs/CAPABILITIES.md), [NFC and payments](android/docs/NFC_PAYMENTS.md), [Calendar setup](android/docs/GOOGLE_CALENDAR_SETUP.md) and the [privacy policy](android/docs/PRIVACY_POLICY.md).

## Project map

| Path | Purpose |
|---|---|
| `android/` | Android app, Gradle build and device-test scripts |
| `android/app/src/main/` | Kotlin source, resources and catalogue |
| `android/app/src/test/` | Android unit tests |
| `src/`, `main.js`, `preload.js` | Earlier Electron desktop prototype |
| `scripts/`, `test/` | Desktop tooling, catalogue export and tests |
| `docs/` | Technical notes and repository imagery |

The Android app is the product. The desktop prototype is retained as development history, not a desktop release.

## License and attribution

Code is provided under the [MIT License](LICENSE). The supplied license also identifies Material Icons paths under Apache 2.0. Keep applicable third-party notices when redistributing.

Open Wallet is an independent project, not affiliated with Google, banks, card networks, transport operators or governments. Provider names identify the relevant card or pass; they do not imply endorsement.
