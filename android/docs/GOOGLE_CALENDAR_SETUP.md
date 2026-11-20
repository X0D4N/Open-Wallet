# Google Calendar connection: set-up guide

**Status: built, not yet verified.** The integration uses Google's official Android authorization flow and the real Google Calendar API. It has **not** been tested end to end, because no OAuth client exists yet. On a test phone without that set-up, tapping *Connect* opens Google's own sign-in screen, and Google then refuses with a "developer error". That's expected until the steps below are done.

## How it works

| Part | What the app does |
|---|---|
| Sign-in and consent | Google Identity Services `AuthorizationClient` (Play services). Google shows its own account picker and consent screen. The app never sees a password. |
| Permission requested | Only `https://www.googleapis.com/auth/calendar.events.readonly`. There's no calendar-list scope, because only the primary calendar is read. |
| Client secret | None. Android OAuth clients don't use one, and nothing secret is stored in the APK or in Git. |
| Token | A short-lived access token from Google Play services. Its latest copy is kept encrypted with an Android Keystore key, only so it can be revoked. Play services manages refresh. |
| API calls | `GET calendar/v3/calendars/primary/events` from yesterday to +180 days, `singleEvents=true`, every page (`nextPageToken`), minimal `fields`. |
| Review | Bookings are detected on the phone (flight, train, bus, taxi, ferry, hotel, cinema, event, sports, amusement, entry, parking). Each one opens a pre-filled form and is saved only after you confirm. |
| Duplicates and updates | Matched by event ID (`gcal:<id>`), or by template + booking reference + date. Changed events show "from → to" and update only when you tap *Update pass*, with a warning if you edited the pass. |
| Deleted events | The pass is marked, or deleted if you chose that in settings. |
| Sync | Manual *Sync now*. Optional "sync when I open the app" (off by default, at most every 6 hours). There's **no background sync** of any kind. |
| Disconnect | Calls Google's revoke endpoint, deletes the stored token and its Keystore key, and turns sync off. Saved passes stay, and there's a separate "Delete calendar passes" option. |
| Errors | Offline, 401 expired or revoked, 403 permission or API disabled, 429 rate limit, consent cancelled, and developer error (set-up mismatch) are all shown in plain words. |

## Steps in Google Cloud Console

1. **Project.** Go to <https://console.cloud.google.com/>, then project selector › **New project**. Use one project for the app, for example "Open Wallet".
2. **Enable the API.** *APIs & Services › Library*, search **Google Calendar API**, then **Enable**.
3. **OAuth consent screen** (*APIs & Services › OAuth consent screen*, or *Google Auth Platform › Branding / Audience / Data access*):
   - User type **External**.
   - App name, support email, developer contact, app logo (optional), and the **privacy policy URL**: host `docs/PRIVACY_POLICY.md` somewhere public.
   - *Data access › Add or remove scopes*: add only `.../auth/calendar.events.readonly`.
   - *Audience › Test users*: add the Google accounts that will test. While the app is in **Testing**, only these accounts can connect.
   - Before public release, **publish** the app and complete Google's verification. `calendar.events.readonly` is a *sensitive* scope, so Google reviews the app, asks for a demo video and checks the privacy policy.
4. **Android OAuth client** (*APIs & Services › Credentials › Create credentials › OAuth client ID › Android*). Create **one client per signing certificate**:

   | Client | Package name | SHA-1 certificate fingerprint |
   |---|---|---|
   | Upload key (the APK in `dist/`, and local release builds) | `org.openwallet.app` | `CC:31:6F:5B:CE:EE:51:E5:7D:B4:69:19:9A:FF:69:87:18:CC:A8:8F` |
   | Debug builds on this computer | `org.openwallet.app` | `E9:F3:07:B9:0A:3F:C0:62:7F:B6:EB:8E:15:83:75:A2:49:41:25:EF` |
   | **Google Play app signing key** (installs from the Play Store) | `org.openwallet.app` | Copy it from **Play Console › your app › Test and release › App integrity › App signing key certificate › SHA-1** after the first upload |

   To read a fingerprint yourself:
   `keytool -list -v -keystore keystore/upload-keystore.jks -alias upload` (the password is in `keystore.properties`), or
   `keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android`.

5. **Where to put the client ID in the project: nowhere.** For an Android OAuth client, Google recognises the app by package name + SHA-1, so no client ID or secret goes into the code, `gradle.properties` or Git. Changing the package name or signing key means updating or adding the Android client in step 4. You'd only need a *Web* client ID for server-side access (`requestOfflineAccess`), which Open Wallet doesn't use.

## End-to-end test checklist (do this once the client exists)

Use a phone or emulator **with Google Play** and a **test-user** Google account signed in.

- [ ] Settings › Connections › Google Calendar › **Connect**: Google's account picker and consent screen appear and list only "See events on all your calendars" (read-only).
- [ ] Choose **Cancel** on the consent screen: "You didn’t allow access. Nothing was connected" appears and the status stays *Not connected*.
- [ ] Connect again and **Allow**: status becomes *Connected (read-only)*, and a sync runs.
- [ ] Put a flight, a train, a hotel, a cinema and an ordinary meeting in the test calendar. After *Sync now*, the review screen lists the bookings, not the meeting.
- [ ] **Review & add** one booking and save it. It appears on the home screen and shows "From Google Calendar".
- [ ] *Sync now* again: no duplicate is suggested.
- [ ] Change the flight's time in Google Calendar, then *Sync now*: it shows as *Changed*, and *Update pass* applies it.
- [ ] Delete an imported event, then *Sync now*: the pass is marked "event was deleted" (or deleted, if chosen).
- [ ] Revoke access at <https://myaccount.google.com/permissions>, then *Sync now*: "Access expired or was revoked. Connect again."
- [ ] Turn on airplane mode, then *Sync now*: the "You seem to be offline" message appears. Saved passes still open.
- [ ] **Disconnect**: "Disconnected. Google access revoked". The app no longer appears under Google Account › Security › Third-party access. Nothing syncs on the next launch.
- [ ] With Calendar disconnected, manual pass creation and offline viewing still work.

Record the results in `CHECKLIST.md`. Mark the integration verified only when every box is ticked.
