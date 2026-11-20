package org.openwallet.app.data

import android.app.Activity
import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import com.google.android.gms.tasks.Task
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.openwallet.app.domain.CalEvent
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.net.UnknownHostException
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import kotlin.coroutines.resume

/**
 * Optional Google Calendar reader.
 *
 * Authorization uses Google Identity Services for Android (AuthorizationClient), the official
 * native flow: Google shows its own account picker and consent screen, and the app receives a
 * short-lived access token for the read-only events scope. No client secret exists in the app;
 * Google matches the app to the Android OAuth client by package name and signing-certificate
 * SHA-1 (see docs/GOOGLE_CALENDAR_SETUP.md). The latest access token is kept encrypted with an
 * Android Keystore key only so it can be revoked on disconnect, then deleted.
 */
object GoogleCalendar {
    const val SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly"
    private const val EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

    sealed class Auth {
        data class Granted(val token: String) : Auth()
        data class NeedsConsent(val result: AuthorizationResult) : Auth()
        data class Failed(val message: String) : Auth()
    }

    private val request get() = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(SCOPE))).build()

    private suspend fun <T> Task<T>.await(): Result<T> = suspendCancellableCoroutine { c ->
        addOnSuccessListener { c.resume(Result.success(it)) }
        addOnFailureListener { c.resume(Result.failure(it)) }
        addOnCanceledListener { c.resume(Result.failure(IllegalStateException("Cancelled"))) }
    }

    /** Asks Google for authorization. Without prior consent this returns NeedsConsent (the UI then shows Google's screen). */
    suspend fun authorize(activityOrContext: Context): Auth {
        val r = Identity.getAuthorizationClient(activityOrContext).authorize(request).await()
        val res = r.getOrElse { return Auth.Failed(friendly(it)) }
        if (res.hasResolution()) return Auth.NeedsConsent(res)
        val token = res.accessToken ?: return Auth.Failed("Google didn’t return an access token")
        if (SCOPE !in res.grantedScopes) return Auth.Failed("Read-only calendar access wasn’t granted")
        return Auth.Granted(token)
    }

    /** Result of Google's consent screen. */
    fun fromConsent(activity: Activity, data: Intent?): Auth = runCatching {
        val res = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data)
        val token = res.accessToken ?: return Auth.Failed("Google didn’t return an access token")
        if (SCOPE !in res.grantedScopes) return Auth.Failed("Read-only calendar access wasn’t granted")
        Auth.Granted(token)
    }.getOrElse { Auth.Failed(friendly(it)) }

    private fun friendly(t: Throwable): String {
        val m = t.message.orEmpty()
        return when {
            "10:" in m || "DEVELOPER_ERROR" in m -> "Google sign-in isn’t set up for this app build yet (OAuth client, package name or SHA-1 doesn’t match). See the setup guide."
            "16:" in m || "Cancel" in m -> "You didn’t allow access. Nothing was connected."
            "7:" in m || t is UnknownHostException -> "You seem to be offline. Try again when you’re connected."
            else -> "Google couldn’t authorize the app ($m)"
        }
    }

    // ---- Token kept only for revocation ------------------------------------------------------
    private fun tokenFile(c: Context) = File(c.noBackupFilesDir, "calendar.token")
    fun remember(c: Context, token: String) = tokenFile(c).writeBytes(Keys.encrypt("calendar", token.toByteArray()))
    private fun stored(c: Context): String? = runCatching { String(Keys.decrypt("calendar", tokenFile(c).readBytes())) }.getOrNull()
    fun forget(c: Context) { tokenFile(c).wipe(); Keys.delete("calendar") }

    // ---- Calendar API -----------------------------------------------------------------------
    sealed class Fetch {
        data class Ok(val events: List<CalEvent>) : Fetch()
        data class Error(val kind: String, val message: String) : Fetch()
    }

    /** Events from yesterday to 180 days ahead in the primary calendar, all pages, minimal fields. */
    suspend fun events(token: String): Fetch = withContext(Dispatchers.IO) {
        val out = mutableListOf<CalEvent>()
        var page: String? = null
        val enc = { s: String -> URLEncoder.encode(s, "UTF-8") }
        val from = Instant.now().minusSeconds(86_400).toString(); val to = Instant.now().plusSeconds(180L * 86_400).toString()
        try {
            do {
                val q = "timeMin=${enc(from)}&timeMax=${enc(to)}&singleEvents=true&orderBy=startTime&maxResults=250&showDeleted=false" +
                    "&fields=${enc("nextPageToken,items(id,status,summary,description,location,start,end,organizer/displayName)")}" + (page?.let { "&pageToken=${enc(it)}" } ?: "")
                val con = (URL("$EVENTS?$q").openConnection() as HttpURLConnection).apply {
                    setRequestProperty("Authorization", "Bearer $token"); connectTimeout = 15_000; readTimeout = 20_000
                }
                when (val code = con.responseCode) {
                    200 -> {}
                    401 -> return@withContext Fetch.Error("expired", "Access expired or was revoked. Connect again.")
                    403 -> return@withContext Fetch.Error("permission", "Google refused access (permission, or the Calendar API isn’t enabled for the project).")
                    429 -> return@withContext Fetch.Error("rate", "Too many requests. Try again in a few minutes.")
                    else -> return@withContext Fetch.Error("http", "Google answered $code.")
                }
                val json = JSONObject(con.inputStream.bufferedReader().use { it.readText() })
                val items = json.optJSONArray("items")
                if (items != null) for (i in 0 until items.length()) {
                    val e = items.getJSONObject(i)
                    val s = e.optJSONObject("start"); val en = e.optJSONObject("end")
                    val allDay = s?.has("date") == true && s.has("dateTime").not()
                    out += CalEvent("gcal:" + e.getString("id"), e.optString("summary"), e.optString("description").take(2000), e.optString("location"),
                        e.optJSONObject("organizer")?.optString("displayName").orEmpty(), parse(s), parse(en), allDay, e.optString("status") == "cancelled")
                }
                page = json.optString("nextPageToken").ifEmpty { null }
            } while (page != null && out.size < 2500)
            Fetch.Ok(out)
        } catch (e: java.io.IOException) {
            Fetch.Error("offline", "You seem to be offline. Try again when you’re connected.")
        }
    }

    private fun parse(o: JSONObject?): Instant? = when {
        o == null -> null
        o.has("dateTime") -> runCatching { OffsetDateTime.parse(o.getString("dateTime")).toInstant() }.getOrNull()
        o.has("date") -> runCatching { LocalDate.parse(o.getString("date")).atStartOfDay().toInstant(ZoneOffset.UTC) }.getOrNull()
        else -> null
    }

    /** Asks Google to revoke the app's access, then deletes the stored token. Returns whether Google confirmed. */
    suspend fun revokeAndForget(c: Context): Boolean = withContext(Dispatchers.IO) {
        val token = stored(c)
        val ok = token != null && runCatching {
            val con = (URL("https://oauth2.googleapis.com/revoke").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; doOutput = true; connectTimeout = 15_000; setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            }
            con.outputStream.use { it.write("token=${URLEncoder.encode(token, "UTF-8")}".toByteArray()) }
            con.responseCode == 200
        }.getOrDefault(false)
        forget(c)
        ok
    }
}
