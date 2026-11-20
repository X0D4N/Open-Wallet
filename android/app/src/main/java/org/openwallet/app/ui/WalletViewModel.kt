package org.openwallet.app.ui

import android.app.Application
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.openwallet.app.data.ActivityEntity
import org.openwallet.app.data.Backup
import org.openwallet.app.data.CardEntity
import org.openwallet.app.data.Catalog
import org.openwallet.app.data.DocRecord
import org.openwallet.app.data.FileStore
import org.openwallet.app.data.GoogleCalendar
import org.openwallet.app.data.Keys
import org.openwallet.app.data.PassEntity
import org.openwallet.app.data.Proposal
import org.openwallet.app.data.Proposals
import org.openwallet.app.data.SampleData
import org.openwallet.app.data.SettingsStore
import org.openwallet.app.data.StoredFile
import org.openwallet.app.data.Vault
import org.openwallet.app.data.WalletDatabase
import org.openwallet.app.data.WalletSettings
import org.openwallet.app.domain.BookingEngine
import org.openwallet.app.domain.CalEvent
import org.openwallet.app.domain.CardEngine
import org.openwallet.app.domain.Codes
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

data class WalletState(
    val loading: Boolean = true,
    val settings: WalletSettings = WalletSettings(),
    val cards: List<CardEntity> = emptyList(),
    val passes: List<PassEntity> = emptyList(),
    val activity: List<ActivityEntity> = emptyList()
) {
    fun card(id: String) = cards.firstOrNull { it.id == id }
    fun pass(id: String) = passes.firstOrNull { it.id == id }
    val defaultCard get() = card(settings.defaultCardId ?: "") ?: cards.firstOrNull()
}

data class Message(val text: String, val undo: (suspend () -> Unit)? = null, val action: String? = null, val onAction: (() -> Unit)? = null)

data class VaultState(val unlocked: Boolean = false, val docs: List<DocRecord> = emptyList(), val revealed: Set<String> = emptySet())

data class CalendarState(val busy: Boolean = false, val proposals: List<Proposal> = emptyList(), val checked: Int = 0, val sourceLabel: String = "")

/** Result of importing a picture or PDF: the encrypted original and any code read from it (a suggestion). */
data class ImportResult(val file: StoredFile, val code: Codes.Read?)

class WalletViewModel(app: Application) : AndroidViewModel(app) {
    val cat: Catalog = Catalog.get(app)
    private val db by lazy { WalletDatabase.get(app) }
    private val dao get() = db.dao()
    private val prefs = SettingsStore(app)
    val originals = FileStore(app, File(app.noBackupFilesDir, "originals"), "originals")
    private val vaultStore = Vault(app)

    private val _state = MutableStateFlow(WalletState())
    val state: StateFlow<WalletState> = _state.asStateFlow()
    private val _messages = MutableStateFlow<Message?>(null)
    val messages: StateFlow<Message?> = _messages.asStateFlow()
    private val _vault = MutableStateFlow(VaultState())
    val vault: StateFlow<VaultState> = _vault.asStateFlow()
    private val _calendar = MutableStateFlow(CalendarState())
    val calendar: StateFlow<CalendarState> = _calendar.asStateFlow()

    init {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { WalletDatabase.migrateLegacy(app, db) }
            combine(prefs.settings, dao.cards(), dao.passes(), dao.activity()) { s, c, p, a -> WalletState(false, s, c, p, a) }
                .collect { _state.value = it }
        }
    }

    fun notify(text: String, undo: (suspend () -> Unit)? = null) { _messages.value = Message(text, undo) }
    fun notifyAction(text: String, action: String, onAction: () -> Unit) { _messages.value = Message(text, action = action, onAction = onAction) }
    fun consumeMessage() { _messages.value = null }
    fun runUndo(m: Message) { m.undo?.let { u -> viewModelScope.launch { u() } } }
    private fun io(block: suspend () -> Unit) = viewModelScope.launch(Dispatchers.IO) { block() }

    // ---- Settings ----------------------------------------------------------------------------
    fun setTheme(v: String) = io { prefs.setTheme(v) }
    fun setReduceMotion(v: Boolean) = io { prefs.setReduceMotion(v) }
    fun setConfirm(v: Boolean) = io { prefs.setConfirm(v) }
    fun setShowNext(v: Boolean) = io { prefs.setShowNext(v) }
    fun setAlerts(v: Boolean) = io { prefs.setAlerts(v) }
    fun setOnboarded() = io { prefs.setOnboarded(true) }
    fun setRegion(v: String) = io { prefs.setRegion(v) }
    fun setSort(v: String) = io { prefs.setSort(v) }
    fun setVaultTimeout(v: Int) = io { prefs.setVaultTimeout(v) }
    fun setExpiryReminders(v: Boolean) = io { prefs.setExpiryReminders(v) }
    fun clearLearned() = io { prefs.clearLearned(); notify("Card prefixes forgotten") }

    // ---- Cards -------------------------------------------------------------------------------
    fun saveCard(card: CardEntity, isNew: Boolean, prefix: String) = io {
        val pos = if (isNew) dao.maxPosition() + 1 else card.position
        dao.upsertCard(card.copy(position = pos))
        val d = CardEngine.digits(prefix)
        if (d.length >= 6 && card.issuerId.isNotEmpty()) prefs.learnPrefix(d.take(6), card.issuerId)
        if (isNew && _state.value.settings.defaultCardId == null) prefs.setDefaultCard(card.id)
        notify(if (isNew) "Card added" else "Card updated")
    }

    fun setDefault(id: String) = io { prefs.setDefaultCard(id); notify("Default card for demo tap updated") }

    fun removeCard(id: String) = io {
        val c = _state.value.card(id) ?: return@io
        val acts = _state.value.activity.filter { it.ownerId == id }
        val wasDefault = _state.value.settings.defaultCardId == id
        dao.deleteCard(id); dao.deleteActivityFor(id)
        if (wasDefault) prefs.setDefaultCard(_state.value.cards.firstOrNull { it.id != id }?.id)
        notify("Card removed") { dao.upsertCard(c); dao.insertActivity(acts); if (wasDefault) prefs.setDefaultCard(c.id) }
    }

    fun moveCard(id: String, dir: Int) = io {
        val list = _state.value.cards.toMutableList()
        val i = list.indexOfFirst { it.id == id }; val j = i + dir
        if (i < 0 || j !in list.indices) return@io
        val c = list.removeAt(i); list.add(j, c)
        dao.insertCards(list.mapIndexed { k, x -> x.copy(position = k) })
    }

    fun recordDemoPayment(cardId: String, cents: Long) = io {
        dao.upsertActivity(ActivityEntity(Keys.newId("tx"), cardId, "Demo reader", -cents, "USD", System.currentTimeMillis(), category = "Demo"))
    }

    fun removeActivity(id: String) = io {
        val a = _state.value.activity.firstOrNull { it.id == id } ?: return@io
        dao.deleteActivity(id); notify("Removed from activity") { dao.upsertActivity(a) }
    }

    // ---- Passes ------------------------------------------------------------------------------
    fun savePass(p: PassEntity, isNew: Boolean) = io {
        dao.upsertPass(p.copy(updatedAt = System.currentTimeMillis(), edited = if (isNew) p.edited else true))
        if (isNew) notify("Added to Wallet") else notify("Pass updated")
    }

    fun deletePass(id: String) = io {
        val p = _state.value.pass(id) ?: return@io
        dao.deletePass(id)
        var undone = false
        notify("Pass deleted") { undone = true; dao.upsertPass(p) }
        if (p.originalFile.isNotEmpty()) { delay(8000); if (!undone) originals.remove(p.originalFile) }
    }

    fun setArchived(id: String, v: Boolean) = io {
        val p = _state.value.pass(id) ?: return@io
        dao.upsertPass(p.copy(archived = v))
        notify(if (v) "Pass archived" else "Pass moved back to your wallet") { dao.upsertPass(p) }
    }

    fun toggleFavorite(id: String) = io { _state.value.pass(id)?.let { dao.upsertPass(it.copy(favorite = !it.favorite)) } }

    fun setFields(id: String, change: Map<String, String>) = io {
        _state.value.pass(id)?.let { dao.upsertPass(it.copy(fields = it.fields + change, updatedAt = System.currentTimeMillis())) }
    }

    fun addTransitValue(id: String, amount: Double) = io {
        val p = _state.value.pass(id) ?: return@io
        val bal = (p.f("balance").toDoubleOrNull() ?: 0.0) + amount
        dao.upsertPass(p.copy(fields = p.fields + ("balance" to "%.2f".format(bal))))
        dao.upsertActivity(ActivityEntity(Keys.newId("th"), id, "Added value (demo)", (amount * 100).toLong(), p.currency, System.currentTimeMillis(), category = "Demo"))
        notify("Balance note updated (demo)")
    }

    /** Encrypts the original unchanged and tries to read a barcode from it (images only). */
    suspend fun importOriginal(uri: Uri, name: String): Result<ImportResult> = withContext(Dispatchers.IO) {
        originals.add(uri, name).map { f ->
            val code = if (f.mime.startsWith("image/")) runCatching {
                val bytes = originals.read(f.fileId)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let { Codes.read(it) }
            }.getOrNull() else null
            ImportResult(f, code)
        }
    }

    fun addSamples() = io {
        val (c, p, a) = SampleData.build()
        dao.insertCards(c); dao.insertPasses(p); dao.insertActivity(a)
        if (_state.value.settings.defaultCardId == null) prefs.setDefaultCard(c.first().id)
        notify("Sample cards and passes added. They’re marked as samples")
    }

    fun deleteEverything() = io {
        dao.replaceAll(emptyList(), emptyList(), emptyList()); originals.clear(); prefs.resetAll()
        notify("All cards and passes deleted")
    }

    fun exportBackup(uri: Uri) = io {
        val json = Backup.toJson(_state.value.cards, _state.value.passes)
        getApplication<Application>().contentResolver.openOutputStream(uri, "wt")?.use { it.write(json.toByteArray()) }
        notify("Backup saved. It isn’t encrypted, so keep it somewhere safe")
    }

    fun importBackup(uri: Uri) = io {
        runCatching {
            val s = getApplication<Application>().contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() }
            val (c, p) = Backup.fromJson(s, cat)
            dao.replaceAll(c, p, emptyList())
        }.onSuccess { notify("Backup imported") }.onFailure { notify(it.message ?: "Couldn’t read that backup") }
    }

    // ---- Vault -------------------------------------------------------------------------------
    private var lockJob: Job? = null
    fun unlockVault() = io {
        val docs = runCatching { vaultStore.load() }.getOrElse { notify("The vault couldn’t be opened on this device"); return@io }
        _vault.value = VaultState(true, docs)
        touchVault()
    }
    fun touchVault() {
        lockJob?.cancel()
        lockJob = viewModelScope.launch { delay(_state.value.settings.vaultTimeoutMin * 60_000L); lockVault("Vault locked after inactivity") }
    }
    /** True while Open Wallet itself has opened a system picker or viewer from the vault, so leaving the app briefly doesn't lock it. */
    var externalFlow = false
    fun lockVault(message: String? = null) {
        lockJob?.cancel(); _vault.value = VaultState(); FileStore.clearTemp(getApplication())
        message?.let { notify(it) }
    }
    fun revealDoc(id: String, on: Boolean) = _vault.update { it.copy(revealed = if (on) it.revealed + id else it.revealed - id) }
    fun saveDoc(d: DocRecord, removedFiles: List<String>) = io {
        val list = _vault.value.docs.filter { it.id != d.id } + d.copy(updatedAt = System.currentTimeMillis())
        vaultStore.save(list); removedFiles.forEach { vaultStore.files.remove(it) }
        _vault.update { it.copy(docs = list) }; notify("Saved to your vault"); touchVault()
    }
    fun deleteDoc(id: String) = io {
        val d = _vault.value.docs.firstOrNull { it.id == id } ?: return@io
        d.files.forEach { vaultStore.files.remove(it.second.fileId) }
        val list = _vault.value.docs.filter { it.id != id }
        vaultStore.save(list); _vault.update { it.copy(docs = list) }; notify("Document deleted")
    }
    fun toggleDocFavorite(id: String) = io {
        val list = _vault.value.docs.map { if (it.id == id) it.copy(favorite = !it.favorite) else it }
        vaultStore.save(list); _vault.update { it.copy(docs = list) }
    }
    suspend fun addDocFile(uri: Uri, name: String): Result<StoredFile> = withContext(Dispatchers.IO) { vaultStore.files.add(uri, name) }
    fun docFile(id: String): ByteArray = vaultStore.files.read(id)
    fun docTempFile(id: String, name: String): File = vaultStore.files.tempCopy(id, name)
    fun resetVault() = io { vaultStore.reset(); _vault.value = VaultState(); notify("Vault reset") }
    val docCount get() = _vault.value.docs.size

    // ---- Calendar ----------------------------------------------------------------------------
    fun calendarConnected(token: String) = io {
        GoogleCalendar.remember(getApplication(), token)
        prefs.setCalendar(connected = true, error = "")
        notify("Google Calendar connected (read-only)")
        sync(token)
    }

    fun calendarError(message: String) = io { prefs.setCalendar(error = message); notify(message) }

    /** Fetches events with a token from AuthorizationClient and builds proposals for review. */
    fun sync(token: String) = io {
        _calendar.update { it.copy(busy = true) }
        GoogleCalendar.remember(getApplication(), token)
        when (val r = GoogleCalendar.events(token)) {
            is GoogleCalendar.Fetch.Ok -> {
                val passes = dao.allPasses()
                val ids = r.events.map { it.id }.toSet()
                val now = System.currentTimeMillis() - 86_400_000L
                val gone = passes.filter { it.source == "calendar" && it.sourceRef.startsWith("gcal:") && it.sourceRef !in ids && (passTime(it) ?: 0L) >= now }
                gone.forEach { if (_state.value.settings.calendarOnRemoved == "delete") dao.deletePass(it.id) else dao.upsertPass(it.copy(sourceStatus = "removed")) }
                val props = Proposals.from(cat, r.events, passes, _state.value.settings.calendarIgnored)
                prefs.setCalendar(lastSync = System.currentTimeMillis(), error = "")
                _calendar.value = CalendarState(false, props, r.events.size, "Google Calendar")
                if (props.isEmpty()) notify("${r.events.size} events checked. No new bookings" + if (gone.isNotEmpty()) ", ${gone.size} marked as deleted" else "")
            }
            is GoogleCalendar.Fetch.Error -> {
                _calendar.update { it.copy(busy = false) }
                prefs.setCalendar(error = r.message, connected = if (r.kind == "expired") _state.value.settings.calendarConnected else null)
                notify(r.message)
            }
        }
    }

    fun importIcs(uri: Uri) = io {
        val text = runCatching { getApplication<Application>().contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() } }.getOrElse { notify("Couldn’t read that file"); return@io }
        val events = BookingEngine.parseIcs(text)
        if (events.isEmpty()) { notify("No calendar events found in that file"); return@io }
        val props = Proposals.from(cat, events, dao.allPasses(), _state.value.settings.calendarIgnored)
        _calendar.value = CalendarState(false, props, events.size, "the calendar file")
        if (props.isEmpty()) notify("${events.size} events checked. None looked like new bookings")
    }

    fun proposeFromEvents(events: List<CalEvent>, label: String) = io {
        _calendar.value = CalendarState(false, Proposals.from(cat, events, dao.allPasses(), _state.value.settings.calendarIgnored), events.size, label)
    }

    fun ignoreProposal(p: Proposal) = io { prefs.ignoreEvent(p.ref); _calendar.update { it.copy(proposals = it.proposals - p) } }
    fun proposalDone(ref: String) = _calendar.update { c -> c.copy(proposals = c.proposals.filter { it.ref != ref }) }
    fun clearProposals() { _calendar.value = CalendarState() }

    fun applyUpdate(p: Proposal) = io {
        val pass = p.existingId?.let { dao.allPasses().firstOrNull { x -> x.id == it } } ?: return@io
        dao.upsertPass(pass.copy(fields = pass.fields + p.booking.fields, sourceStatus = "", updatedAt = System.currentTimeMillis()))
        proposalDone(p.ref); notify("Pass updated from the calendar")
    }

    fun setCalendarAuto(v: Boolean) = io { prefs.setCalendar(auto = v) }
    fun setCalendarOnRemoved(v: String) = io { prefs.setCalendar(onRemoved = v) }

    /** Revokes Google's authorization, deletes the stored token and stops all syncing. Saved passes stay. */
    fun disconnectCalendar() = io {
        val revoked = GoogleCalendar.revokeAndForget(getApplication())
        prefs.setCalendar(connected = false, auto = false, error = "")
        _calendar.value = CalendarState()
        notify(if (revoked) "Disconnected. Google access revoked" else "Disconnected. Token deleted (Google couldn’t be reached to revoke it)")
    }

    fun deleteCalendarPasses() = io { dao.deleteCalendarPasses(); notify("Calendar passes deleted. Your calendar wasn’t changed") }

    fun passTime(p: PassEntity): Long? {
        val d = runCatching { LocalDate.parse(p.f("date")) }.getOrNull() ?: return null
        val t = p.f("time").split(":").mapNotNull { it.toIntOrNull() }
        return LocalDateTime.of(d.year, d.month, d.dayOfMonth, t.getOrElse(0) { 0 }, t.getOrElse(1) { 0 }).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    }

    suspend fun currentSettings() = prefs.settings.first()

    // ---- Scanning and import -------------------------------------------------------------------
    var cardPrefill: CardPrefill? = null
    var docPrefill: DocPrefill? = null
    fun setRetainSource(v: Boolean) = io { prefs.setRetainSource(v) }
    fun setAutoCapture(v: Boolean) = io { prefs.setAutoCapture(v) }

    private fun jpeg(b: android.graphics.Bitmap): ByteArray = java.io.ByteArrayOutputStream().use { b.compress(android.graphics.Bitmap.CompressFormat.JPEG, 92, it); it.toByteArray() }

    /** Camera scan: recognition runs on the phone; images stay in memory unless kept on purpose. */
    suspend fun analyseScan(out: org.openwallet.app.ui.screens.ScanOutput): Route = withContext(Dispatchers.Default) {
        if (out.front == null && out.code != null) return@withContext ScanFlow.routeCode(cat, out.code)
        val reads = listOfNotNull(out.front, out.back).map { org.openwallet.app.scan.Recognizer.read(it) }
        val code = out.code ?: reads.firstNotNullOfOrNull { it.code }
        val r = org.openwallet.app.domain.CardScan.analyse(cat, reads.joinToString("\n") { it.text }, code)
        val sensitive = r.kind == org.openwallet.app.domain.ScanKind.PAYMENT || r.kind == org.openwallet.app.domain.ScanKind.ID_DOCUMENT
        val original = if (_state.value.settings.retainSource && !sensitive && out.front != null) runCatching { originals.addBytes(jpeg(out.front), "Card photo.jpg") }.getOrNull() else null
        val docImages = if (r.kind == org.openwallet.app.domain.ScanKind.ID_DOCUMENT) listOfNotNull(out.front?.let { "front" to jpeg(it) }, out.back?.let { "back" to jpeg(it) }) else emptyList()
        // Bitmaps are left to the garbage collector: the scanner screen may still be drawing them while it closes.
        ScanFlow.route(cat, r, original, docImages, "card photo")
    }

    /** Imported picture or PDF: the original is kept encrypted for passes; never for payment cards; moved into the vault for IDs. */
    suspend fun analyseFile(uri: Uri, name: String): Result<Route> = withContext(Dispatchers.IO) {
        runCatching {
            val stored = originals.add(uri, name).getOrThrow()
            val bytes = originals.read(stored.fileId)
            val read = if (stored.mime == "application/pdf") {
                val tmp = File(getApplication<Application>().cacheDir, "scan-${System.nanoTime()}.pdf").apply { writeBytes(bytes) }
                try { org.openwallet.app.scan.Recognizer.readPdf(tmp).let { (rd, bmp) -> bmp?.recycle(); rd } }
                catch (e: SecurityException) { throw IllegalStateException("This PDF is password-protected. Open it, save an unprotected copy or a screenshot, and import that.") }
                finally { tmp.writeBytes(ByteArray(tmp.length().toInt())); tmp.delete() }
            } else {
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: error("That image couldn’t be opened")
                org.openwallet.app.scan.Recognizer.read(bmp).also { bmp.recycle() }
            }
            val r = org.openwallet.app.domain.CardScan.analyse(cat, read.text, read.code)
            val kind = r.kind
            val docImages = if (kind == org.openwallet.app.domain.ScanKind.ID_DOCUMENT) listOf((if (stored.mime == "application/pdf") "page" else "front") to bytes) else emptyList()
            if (kind == org.openwallet.app.domain.ScanKind.PAYMENT || kind == org.openwallet.app.domain.ScanKind.ID_DOCUMENT) originals.remove(stored.fileId)
            val keep = if (kind == org.openwallet.app.domain.ScanKind.PAYMENT || kind == org.openwallet.app.domain.ScanKind.ID_DOCUMENT) null else stored
            if (r.kind == org.openwallet.app.domain.ScanKind.UNKNOWN && read.code != null && read.text.isBlank()) ScanFlow.routeCode(cat, read.code)
            else ScanFlow.route(cat, r, keep, docImages, if (stored.mime == "application/pdf") "PDF" else "picture")
        }
    }

    suspend fun addDocImage(bytes: ByteArray, name: String): StoredFile = withContext(Dispatchers.IO) { vaultStore.files.addBytes(bytes, name) }
}
