# NFC, access credentials and contactless payments

Open Wallet keeps three NFC operations separate, each with its own security model:

| Operation | What it is | Status |
|---|---|---|
| **Reading a tag** | Shows NDEF text or links from stickers and posters, using reader mode only while the reader screen is open | Built. Protected smart cards (bank, transit, access) are detected and **not** read |
| **Emulating a credential (HCE)** | The phone answers a reader with a credential issued for this app | Only a **developer test credential** exists (see below). Real credentials need an operator |
| **Making a payment** | EMV contactless with an issuer-provisioned token | **Not available.** Needs the partners listed below |

## Developer test credential

- Service `nfc.AccessHceService`, category `other`, AID `F04F50454E57414C4C4554` (the `F0` proprietary/unregistered range). The service component is **disabled** until you switch the credential on (Settings › Payments & NFC), so no AID is registered otherwise.
- `requireDeviceUnlock="true"`, plus an in-app keyguard check. It answers only while the phone is unlocked. Switching it on, and showing the reader key, both need your fingerprint, face or screen lock.
- Protocol:
  - `SELECT` returns the 8-byte credential ID, a 4-byte counter, then `9000`.
  - `80 10 00 00 08 <challenge>` returns the counter, then the first 16 bytes of HMAC-SHA256(key, challenge ‖ counter ‖ ID), then `9000`.
  - The counter goes up on every authentication, so readers can reject replays.
  - Other commands return `6D00`, unknown AIDs `6A82`, and an unselected state `6985`.
- The key is 32 random bytes, encrypted with an Android Keystore key and never hard-coded.
- To test, program a PC/SC or Android reader with the key shown in the app, send `SELECT`, then a random challenge, and check the MAC and that the counter keeps increasing.
- **No real door, hotel, campus, transit or payment reader accepts it, and none should be configured to.**

## Adding a real access or transit credential

The operator must provide: assigned AIDs, the APDU protocol specification, provisioning (key injection or personalisation), key management and rotation, the device-authentication rule, test readers and test credentials, and written authorisation. Implement it as a separate `HostApduService` with only that operator's AIDs, and never reuse the test key.

## Contactless bank payments: what's still required

1. An agreement with the **issuer(s)**, or with a wallet programme that represents them.
2. A certified **token service provider**, through the network programmes (for example Visa Token Service, Mastercard MDES, NPCI tokenisation for RuPay, Amex), plus that provider's Android SDK.
3. **Network approval and certification**: EMV contactless (HCE) security evaluation, cryptogram and limited-use key handling, device binding and risk scoring.
4. Implement `PaymentProvider` (`nfc/Nfc.kt`) with the partner SDK: eligibility, provisioning (with issuer ID&V such as OTP or a bank-app step), token state (active, suspended, removed), transactions **as returned by the provider**, and a payment `HostApduService` in category `payment`.
5. Then enable the **Android wallet role** request (`RoleManager.ROLE_WALLET`, Android 15+) and the default-payment-app setting. The role alone doesn't permit payments.
6. Legal and regional: payments regulation (for example RBI in India, CBUAE in the UAE), PCI DSS scope for the provider, privacy notices and Play's financial-services declaration.

Until all of this exists, `PaymentProviders.configured` is `null`, every payment control is disabled, the app says "Not yet available", and **no payment, PAN or transaction is ever simulated**.
