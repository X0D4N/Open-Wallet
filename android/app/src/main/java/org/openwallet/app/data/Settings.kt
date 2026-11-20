package org.openwallet.app.data

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONObject

private val Context.dataStore by preferencesDataStore(name = "settings")

/** Non-sensitive preferences. Nothing personal is stored here. */
data class WalletSettings(
    val theme: String = "system",
    val defaultCardId: String? = null,
    val confirmBeforeDemoTap: Boolean = true,
    val showNext: Boolean = true,
    val demoPaymentAlerts: Boolean = true,
    val reduceMotion: Boolean = false,
    val onboarded: Boolean = false,
    val region: String = "",
    val sortPasses: String = "upcoming",
    val vaultTimeoutMin: Int = 5,
    val expiryReminders: Boolean = false,
    val calendarConnected: Boolean = false,
    val calendarAutoSync: Boolean = false,
    val calendarOnRemoved: String = "mark",
    val calendarLastSync: Long = 0,
    val calendarLastError: String = "",
    val calendarIgnored: Set<String> = emptySet(),
    val learnedIins: Map<String, String> = emptyMap(),
    val retainSource: Boolean = false,
    val autoCapture: Boolean = true
)

class SettingsStore(private val context: Context) {
    private object K {
        val theme = stringPreferencesKey("theme"); val defaultCard = stringPreferencesKey("default_card")
        val confirm = booleanPreferencesKey("confirm_before_demo_tap"); val showNext = booleanPreferencesKey("upcoming_reminders")
        val alerts = booleanPreferencesKey("demo_payment_alerts"); val reduceMotion = booleanPreferencesKey("reduce_motion")
        val onboarded = booleanPreferencesKey("onboarded"); val region = stringPreferencesKey("region"); val sort = stringPreferencesKey("sort_passes")
        val vaultTimeout = intPreferencesKey("vault_timeout"); val expiry = booleanPreferencesKey("expiry_reminders")
        val calConnected = booleanPreferencesKey("cal_connected"); val calAuto = booleanPreferencesKey("cal_auto")
        val calRemoved = stringPreferencesKey("cal_removed"); val calLast = longPreferencesKey("cal_last"); val calError = stringPreferencesKey("cal_error")
        val calIgnored = stringSetPreferencesKey("cal_ignored"); val learned = stringPreferencesKey("learned_iins")
        val retain = booleanPreferencesKey("retain_source"); val autoCapture = booleanPreferencesKey("auto_capture")
    }

    val settings: Flow<WalletSettings> = context.dataStore.data.map { p: Preferences ->
        WalletSettings(
            theme = p[K.theme] ?: "system", defaultCardId = p[K.defaultCard], confirmBeforeDemoTap = p[K.confirm] ?: true,
            showNext = p[K.showNext] ?: true, demoPaymentAlerts = p[K.alerts] ?: true, reduceMotion = p[K.reduceMotion] ?: false,
            onboarded = p[K.onboarded] ?: false, region = p[K.region] ?: "", sortPasses = p[K.sort] ?: "upcoming",
            vaultTimeoutMin = p[K.vaultTimeout] ?: 5, expiryReminders = p[K.expiry] ?: false,
            calendarConnected = p[K.calConnected] ?: false, calendarAutoSync = p[K.calAuto] ?: false, calendarOnRemoved = p[K.calRemoved] ?: "mark",
            calendarLastSync = p[K.calLast] ?: 0, calendarLastError = p[K.calError] ?: "", calendarIgnored = p[K.calIgnored] ?: emptySet(),
            learnedIins = p[K.learned]?.let { s -> runCatching { val o = JSONObject(s); o.keys().asSequence().associateWith { o.getString(it) } }.getOrNull() } ?: emptyMap(),
            retainSource = p[K.retain] ?: false, autoCapture = p[K.autoCapture] ?: true
        )
    }

    private suspend fun set(block: (MutablePreferences) -> Unit) { context.dataStore.edit { block(it) } }
    suspend fun setTheme(v: String) = set { it[K.theme] = v }
    suspend fun setDefaultCard(id: String?) = set { if (id == null) it.remove(K.defaultCard) else it[K.defaultCard] = id }
    suspend fun setConfirm(v: Boolean) = set { it[K.confirm] = v }
    suspend fun setShowNext(v: Boolean) = set { it[K.showNext] = v }
    suspend fun setAlerts(v: Boolean) = set { it[K.alerts] = v }
    suspend fun setReduceMotion(v: Boolean) = set { it[K.reduceMotion] = v }
    suspend fun setOnboarded(v: Boolean) = set { it[K.onboarded] = v }
    suspend fun setRegion(v: String) = set { it[K.region] = v }
    suspend fun setSort(v: String) = set { it[K.sort] = v }
    suspend fun setVaultTimeout(v: Int) = set { it[K.vaultTimeout] = v }
    suspend fun setExpiryReminders(v: Boolean) = set { it[K.expiry] = v }
    suspend fun setCalendar(connected: Boolean? = null, auto: Boolean? = null, onRemoved: String? = null, lastSync: Long? = null, error: String? = null) = set {
        connected?.let { v -> it[K.calConnected] = v }; auto?.let { v -> it[K.calAuto] = v }; onRemoved?.let { v -> it[K.calRemoved] = v }
        lastSync?.let { v -> it[K.calLast] = v }; error?.let { v -> it[K.calError] = v }
    }
    suspend fun ignoreEvent(ref: String) = set { it[K.calIgnored] = (it[K.calIgnored] ?: emptySet()) + ref }
    suspend fun learnPrefix(prefix: String, issuerId: String) = set {
        val o = it[K.learned]?.let { s -> runCatching { JSONObject(s) }.getOrNull() } ?: JSONObject()
        it[K.learned] = o.put(prefix, issuerId).toString()
    }
    suspend fun setRetainSource(v: Boolean) = set { it[K.retain] = v }
    suspend fun setAutoCapture(v: Boolean) = set { it[K.autoCapture] = v }
    suspend fun clearLearned() = set { it.remove(K.learned) }
    suspend fun resetAll() = set { p -> val region = p[K.region]; p.clear(); p[K.onboarded] = true; region?.let { p[K.region] = it } }
}
