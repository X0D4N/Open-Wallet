# Releasing on Google Play

## Files

| File | Use |
|---|---|
| `dist/OpenWallet-2.0.0.aab` | **Upload this to Play Console** (Android App Bundle, signed with your upload key) |
| `dist/OpenWallet-2.0.0.apk` | Install directly on a phone for testing (same code, same upload-key signature) |
| `dist/OpenWallet-2.0.0-mapping.txt` | Upload to Play Console › App bundle explorer › Downloads › ReTrace mapping, so crash reports are readable |
| `keystore/upload-keystore.jks` + `keystore.properties` | **Your upload key. Back them up somewhere private now** (password manager plus an offline copy). They aren't in Git. If you lose them, Play support can reset the upload key, but that takes time |

App ID `org.openwallet.app`, version 2.0.0 (code 3), `minSdk 26` (Android 8.0), `targetSdk 36` (Android 16), as Play currently requires for new apps.

Before your first upload, check that the package name `org.openwallet.app` is the one you want forever. It can't change after release. To change it, edit `applicationId` in `app/build.gradle.kts` and update the OAuth client.

## Build

```bash
# Windows: gradlew.bat …  (JDK 17 and Android SDK 36 required)
./gradlew testDebugUnitTest assembleRelease -Popenwallet.buildRoot=<folder outside OneDrive>   # per-processor APKs
./gradlew bundleRelease -Popenwallet.buildRoot=<folder outside OneDrive>                       # the AAB, in a separate run
```

## Play Console checklist

1. **Create app**: name (pick your own brand, and don't use "Google" or "Google Wallet"), default language, *App*, *Free*.
2. **App signing**: accept Play App Signing. Then copy the *App signing key* SHA-1 into a Google Cloud Android OAuth client (see `GOOGLE_CALENDAR_SETUP.md`).
3. **Privacy policy**: host `PRIVACY_POLICY.md` at a public URL (for example GitHub Pages) and add your contact email.
4. **Data safety** (based on the app's actual behaviour):
   - Data collected: **No.** Nothing is sent to the developer. Calendar events are read from Google straight to the phone and aren't "collected" by you.
   - Data shared: **No.**
   - Data encrypted in transit: **Yes** (HTTPS to Google only).
   - Users can request deletion: **Yes** (in-app delete, or uninstall).
5. **App access**: say that all features work without an account. Google Calendar is optional.
6. **Ads**: No.
7. **Content rating**: answer the questionnaire (no user-generated sharing, no gambling and so on). The result is usually "Everyone".
8. **Target audience**: 18+, or 13+ if you prefer, but not children.
9. **Financial features declaration**: the app *doesn't* make payments, transfers or loans. Declare **"My app doesn't provide any financial features"**, or the closest option, and say it only shows display copies of cards with a labelled demo. Reviewers may still question the "Demo tap to pay" screen. If that blocks review, hide it with one change (remove the `pay/{id}` route and the "Hold to reader" chip).
10. **Health apps**: the vault can store health-card copies. If asked, say that no health data is collected or processed beyond the user's own local copies.
11. **Store listing**: short and full description, at least 2 phone screenshots (`../shots/android2/` has captures from the emulator), 512×512 icon (`../assets/icon.png` resized from your icon), 1024×500 feature graphic.
12. **Release**: start with **Internal testing**, then Closed testing. New personal developer accounts need 12+ testers for 14 days before Production.

## Things a reviewer may flag

- Brand names (banks, airlines, cinemas) appear as text only, for identification. Keep it that way unless you have permission to use logos.
- The vault stores copies of government IDs. The app says everywhere that they're personal copies, not verified IDs.
- The sensitive Calendar scope needs Google OAuth verification before more than 100 users can connect.
