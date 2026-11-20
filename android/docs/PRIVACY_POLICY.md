# Open Wallet privacy policy

_Last updated: 14 November 2026_

Open Wallet is a wallet app that keeps your cards, passes, tickets and personal documents **on your phone**. We (the publisher) don't run servers that receive your data, and the app contains no analytics, advertising or tracking code.

## What the app stores, and where

| Data | Where | Protection |
|---|---|---|
| Payment-card display details: bank, product, network, type, **last 4 digits only**, optional name and expiry | On your phone | Encrypted database (SQLCipher). The key is protected by Android Keystore |
| Passes and tickets you add, import or confirm from your calendar | On your phone | Encrypted database |
| Original files you import (photos, PDFs) | On your phone | Each file encrypted with an Android Keystore key, kept byte for byte |
| Identity, health and vehicle documents (the vault) | On your phone | Encrypted with an Android Keystore key. They open only after your fingerprint, face or screen lock. Screenshots are blocked while the vault is open |
| Settings (theme, region, preferences) | On your phone | App-private storage |

The app never asks for or stores a full card number, security code (CVV) or PIN. Nothing is included in Google cloud backups or device-to-device transfers.

## Optional Google Calendar connection

If you choose to connect Google Calendar:

- The app asks Google for **read-only** access to your calendar events (`calendar.events.readonly`).
- It reads the title, time, location, organiser name and description of events from yesterday to 6 months ahead in your primary calendar, directly from Google to your phone, to suggest bookings.
- Only bookings you confirm are saved, encrypted on your phone, with the event's ID to avoid duplicates. Other event data is not kept.
- Calendar data is never sent to us or to anyone else, and it's never used for advertising or profiling.
- You can disconnect at any time in Settings. The app then asks Google to revoke its access and deletes its stored token.

Open Wallet's use of information received from Google APIs follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Permissions

| Permission | Why |
|---|---|
| Internet | Used only for the optional Google Calendar connection |
| Biometric | To unlock the document vault with your fingerprint, face or screen lock |
| Camera (through your camera app) | Only when you choose "Take a photo" to add a pass |

## Sharing

None. Files leave the app only when you choose to export a backup or a document, or open a file in another app.

## Deleting your data

Delete single items in the app, use *Settings › Delete all cards and passes*, use *Vault › Reset vault*, or uninstall the app. Uninstalling removes everything, including the encryption keys.

## Children

The app isn't directed at children under 13.

## Contact

Publisher contact: _add your support email here before publishing_.
