package org.openwallet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.openwallet.app.BuildConfig
import org.openwallet.app.data.Catalog
import org.openwallet.app.data.Proposal
import org.openwallet.app.ui.CalendarState
import org.openwallet.app.ui.WalletState
import org.openwallet.app.ui.art.cardName
import org.openwallet.app.ui.art.fmtDate
import org.openwallet.app.ui.art.fmtTime
import org.openwallet.app.ui.art.passView
import org.openwallet.app.ui.components.ConfirmDialog
import org.openwallet.app.ui.components.Display
import org.openwallet.app.ui.components.Group
import org.openwallet.app.ui.components.GroupRow
import org.openwallet.app.ui.components.Ic
import org.openwallet.app.ui.components.IconCircle
import org.openwallet.app.ui.components.Logo
import org.openwallet.app.ui.components.Notice
import org.openwallet.app.ui.components.RadioDialog
import org.openwallet.app.ui.components.SearchPill
import org.openwallet.app.ui.components.SectionHeader
import org.openwallet.app.ui.components.SettingRow
import org.openwallet.app.ui.components.SwitchRow
import org.openwallet.app.ui.components.WTopBar
import org.openwallet.app.ui.components.WalletIcons
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

private val CAT_NOUN = mapOf("loyalty" to "loyalty programmes", "gift" to "gift cards", "transit" to "transport options", "movie" to "cinemas", "flight" to "airlines",
    "train" to "railways", "bus" to "bus operators", "ferry" to "ferry and cruise operators", "event" to "ticket sellers", "hotel" to "hotels and booking sites",
    "parking" to "parking operators", "taxi" to "taxi and ride companies", "entry" to "venues and attractions", "amusement" to "parks and attractions")
private val CAT_TEMPLATE = mapOf("loyalty" to "loyalty", "gift" to "gift", "transit" to "transit", "movie" to "movie", "flight" to "flight", "train" to "train", "bus" to "bus",
    "ferry" to "ferry", "event" to "event", "hotel" to "hotel", "parking" to "parking", "taxi" to "taxi", "entry" to "entry", "amusement" to "amusement")

@Composable
fun RegionChip(cat: Catalog, region: String, onClick: () -> Unit) {
    FilterChip(false, onClick, { Text(if (region.isEmpty()) "All regions" else cat.regionName(region)) }, leadingIcon = { Ic("globe", size = 18.dp) }, trailingIcon = { Ic("expand", size = 18.dp) })
}

// ---- Add to Wallet chooser (reference layout: grouped 28dp list, 52dp icon circles) ----------
@Composable
fun AddScreen(cat: Catalog, state: WalletState, onBack: () -> Unit, onHelp: () -> Unit, onRegion: () -> Unit, onCategory: (String) -> Unit, onProvider: (String, String) -> Unit, onDoc: (String) -> Unit,
              onScanCard: () -> Unit = {}, onScanCode: () -> Unit = {}, onImage: () -> Unit = {}, onPdf: () -> Unit = {}, onCalendar: () -> Unit = {}) {
    var q by rememberSaveable { mutableStateOf("") }
    val region = state.settings.region
    val cats = cat.categories.filter { it.regions.isEmpty() || region.isEmpty() || region in it.regions }
    val nq = Catalog.norm(q)
    Column(Modifier.fillMaxSize()) {
        WTopBar("", onBack) { IconButton(onHelp) { Ic("feedback") } }
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item { Display("Add to Wallet") }
            item {
                Row(Modifier.fillMaxWidth().padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    SearchPill(q, { q = it }, "Search categories and providers", null, Modifier.weight(1f)); RegionChip(cat, region, onRegion)
                }
            }
            if (nq.isEmpty()) {
                item {
                    Group {
                        item { GroupRow("Scan a card with the camera", "Bank, loyalty, gift, transport or ID card. Read on this phone, front and back", { IconCircle("photo") }, onClick = onScanCard) }
                        item { GroupRow("Scan a QR code or barcode", "Tickets, boarding passes, memberships. The code is kept exactly", { IconCircle("qr") }, onClick = onScanCode) }
                        item { GroupRow("Choose an image or screenshot", "Recognised automatically and sent to the right form", { IconCircle("upload") }, onClick = onImage) }
                        item { GroupRow("Import a PDF", "E-tickets, boarding passes, e-Aadhaar and other documents", { IconCircle("generic") }, onClick = onPdf) }
                        item { GroupRow("From your calendar", "Bookings in Google Calendar or a calendar file", { IconCircle("calendar") }, onClick = onCalendar) }
                    }
                }
                item { SectionHeader("Or choose what to add") }
            }
            val hits = if (nq.isEmpty()) cats else cats.filter { Catalog.norm(it.label + " " + it.hint).contains(nq) }
            if (hits.isNotEmpty()) item { Group { hits.forEach { c -> item { GroupRow(c.label, c.hint, { IconCircle(WalletIcons.nameFor(c.icon.let { if (it == "boarding") "flight" else it })) }) { onCategory(c.id) } } } } }
            if (nq.length >= 2) {
                val provs = cat.providers.filter { CAT_TEMPLATE.containsKey(it.cat) && Catalog.norm(it.name + " " + it.sub + " " + (it.city ?: "")).contains(nq) }.take(20)
                val docs = cat.docs.filter { Catalog.norm(it.name + " " + it.authority).contains(nq) }.take(8)
                if (provs.isNotEmpty()) { item { SectionHeader("Providers") }; item { Group { provs.forEach { p -> item { GroupRow(p.name, "${p.sub.ifEmpty { cat.regionName(p.region) }} · ${cat.template(CAT_TEMPLATE.getValue(p.cat)).label}", { Logo(p.displayName, Color(p.color), Color(p.fg), 52.dp) }) { onProvider(CAT_TEMPLATE.getValue(p.cat), p.id) } } } } } }
                if (docs.isNotEmpty()) { item { SectionHeader("Documents") }; item { Group { docs.forEach { d -> item { GroupRow(d.name, "${d.authority} · ${cat.regionName(d.region)}", { IconCircle(if (d.group == "health") "health" else if (d.group == "vehicle") "car" else "id") }) { onDoc(d.id) } } } } } }
                if (hits.isEmpty() && provs.isEmpty() && docs.isEmpty()) item { Text("Nothing matches “$q”. Try “Everything else” to add any pass.", Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(16.dp).padding(top = 12.dp).clip(RoundedCornerShape(28.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(24.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Got a ticket as a photo, PDF or calendar booking?", style = MaterialTheme.typography.titleMedium.copy(fontSize = 20.sp, lineHeight = 28.sp))
                        Text("Import it. Nothing is uploaded.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                        TextButton(onHelp, contentPadding = PaddingValues(0.dp)) { Text("Learn how to add to Wallet") }
                    }
                    Box(Modifier.size(96.dp).clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) { Ic("qr", tint = MaterialTheme.colorScheme.onSecondaryContainer, size = 52.dp) }
                }
            }
        }
    }
}

@Composable
fun TemplatesScreen(cat: Catalog, categoryId: String, onBack: () -> Unit, onPick: (String) -> Unit, onCustom: () -> Unit) {
    val c = cat.categories.first { it.id == categoryId }
    val hints = mapOf("movie" to "Cinema, show time, seats and booking code", "flight" to "Route, gate, seat and boarding pass code", "train" to "Stations, coach, seat or berth and PNR",
        "bus" to "Boarding point, seat and booking reference", "taxi" to "Pick-up, drop-off and booking reference", "ferry" to "Ports, embarkation and cabin",
        "event" to "Concerts, theatre and festivals", "sports" to "Matches and fixtures, stand and seat", "amusement" to "Theme parks, water parks and attractions",
        "entry" to "Museums, monuments, exhibitions and entry or exit passes", "hotel" to "Check-in, check-out and booking reference", "parking" to "Car park, vehicle and validity")
    Column(Modifier.fillMaxSize()) {
        WTopBar("", onBack)
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item { Box(Modifier.padding(start = 24.dp, top = 8.dp)) { IconCircle(WalletIcons.nameFor(if (c.icon == "boarding") "flight" else c.icon)) } }
            item { Display(if (categoryId == "travel") "What are you travelling with?" else "What’s the ticket for?") }
            item { Group { c.templates.forEach { k -> val t = cat.template(k); item { GroupRow(t.label, hints[k] ?: "", { IconCircle(WalletIcons.nameFor(k)) }) { onPick(k) } } } } }
            item { TextButton(onCustom, Modifier.padding(16.dp)) { Text("Can’t see it? Add a custom pass") } }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProvidersScreen(cat: Catalog, state: WalletState, providerCat: String, onBack: () -> Unit, onRegionInfo: () -> Unit, onPick: (String) -> Unit, onCustom: () -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }
    val region = state.settings.region
    var filter by rememberSaveable { mutableStateOf(region) }
    val label = mapOf("loyalty" to "Search loyalty programmes", "gift" to "Search gift cards", "transit" to "Search city or transport agency")[providerCat] ?: "Search ${CAT_NOUN[providerCat] ?: "providers"}"
    val popular = if (q.isEmpty() && region.isNotEmpty()) cat.providers(providerCat, region) else emptyList()
    val all = cat.providers(providerCat, filter.ifEmpty { null }, q)
    val regions = cat.providers.filter { it.cat == providerCat }.map { it.region }.distinct()
    @Composable fun row(p: org.openwallet.app.data.Provider) = GroupRow(p.name, if (providerCat == "transit") p.sub else p.sub.takeIf { it.isNotEmpty() && it != "Tickets" && it != "Cinemas" } ?: cat.regionName(p.region),
        { Logo(p.displayName, Color(p.color), Color(p.fg), 52.dp) }) { onPick(p.id) }
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.statusBarsPadding()) { SearchPill(q, { q = it }, label, onBack) }
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            if (providerCat == "transit" && q.isEmpty()) item { Display("Choose a transport operator") }
            if (popular.isNotEmpty()) {
                item { SectionHeader("Popular in ${cat.regionName(region)}") { IconButton(onRegionInfo) { Ic("info") } } }
                item { Group { popular.take(6).forEach { p -> item { row(p) } } } }
            }
            item { SectionHeader(if (q.isNotEmpty()) "Results for “$q”" else "All ${CAT_NOUN[providerCat] ?: "providers"}") }
            if (q.isEmpty()) item {
                FlowRow(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    (listOf("" to "All regions") + regions.map { it to cat.regionName(it) }).forEach { (k, l) -> FilterChip(filter == k, { filter = k }, { Text(l) }) }
                }
            }
            if (all.isNotEmpty()) item { Group { all.forEach { p -> item { row(p) } } } } else item { Text("No ${CAT_NOUN[providerCat]} match here.", Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            item { Spacer(Modifier.height(12.dp)); Group { item { GroupRow("Add another ${cat.template(CAT_TEMPLATE[providerCat] ?: "generic").providerLabel.lowercase()}", "Type the name yourself", { IconCircle("add") }, onClick = onCustom) } } }
            item { Notice("Open Wallet keeps your own copy of the card or ticket. It doesn’t sign in to or connect with any provider. Names identify the provider; no logos are used.") }
        }
    }
}

/** "Everything else": photo, camera, file or custom pass. */
@Composable
fun OtherScreen(onBack: () -> Unit, onImport: () -> Unit, onCamera: () -> Unit, onCustom: () -> Unit, onIcs: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        WTopBar("", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            Box(Modifier.padding(start = 24.dp, top = 8.dp)) { IconCircle("photo") }
            Display("Everything else")
            Text("Keep any pass, card, ticket or receipt. The original file is kept unchanged and encrypted on this phone.", Modifier.padding(horizontal = 24.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Group {
                item { GroupRow("Import a photo, screenshot or PDF", "Codes in photos are read on this phone. You confirm everything", { IconCircle("upload") }, onClick = onImport) }
                item { GroupRow("Take a photo", "Uses your camera app", { IconCircle("photo") }, onClick = onCamera) }
                item { GroupRow("Create a custom pass", "Your own title, details, colour and code", { IconCircle("edit") }, onClick = onCustom) }
                item { GroupRow("Find bookings in a calendar file", "Reads an .ics file on this phone", { IconCircle("calendar") }, onClick = onIcs) }
            }
            Notice("Open Wallet reads barcodes and QR codes from pictures on this phone, but not other text. You type the details yourself, nothing is guessed, and nothing is sent to an online service.")
        }
    }
}

@Composable
fun SearchScreen(cat: Catalog, state: WalletState, time: (org.openwallet.app.data.PassEntity) -> Long?, onBack: () -> Unit, onCard: (String) -> Unit, onPass: (String) -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("all") }
    var sort by rememberSaveable { mutableStateOf(state.settings.sortPasses) }
    val words = Catalog.norm(q).split(' ').filter { it.isNotEmpty() }
    fun hit(s: String) = words.all { Catalog.norm(s).contains(it) }
    val cards = if (filter == "all" || filter == "payment") state.cards.filter { hit(cardName(cat, it) + " " + it.nickname + " " + it.last4) } else emptyList()
    val members = PASS_GROUPS.firstOrNull { it.first == filter }?.third ?: emptyList()
    val passes = if (filter == "payment") emptyList() else sortedPasses(state.passes, sort, time).filter { p ->
        val v = passView(cat, p); (members.isEmpty() || p.template in members) && hit(listOf(v.title, v.sub, v.provName, v.t.label).joinToString(" ") + " " + p.fields.filterKeys { it !in setOf("number", "pin") }.values.joinToString(" "))
    }
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.statusBarsPadding()) { SearchPill(q, { q = it }, "Search your Wallet", onBack) }
        org.openwallet.app.ui.components.ChipRow(listOf("all" to "All", "payment" to "Payment") + PASS_GROUPS.drop(1).map { it.first to it.second } + listOf("sort" to if (sort == "recent") "Recently added" else "Upcoming first"), filter) {
            if (it == "sort") sort = if (sort == "recent") "upcoming" else "recent" else filter = it
        }
        LazyColumn(contentPadding = PaddingValues(vertical = 8.dp, horizontal = 0.dp)) {
            items(cards, key = { it.id }) { c -> ResultRow(cardName(cat, c), "•••• ${c.last4}", Color(cat.issuer(c.issuerId)?.colors?.first() ?: 0xFF3C4043), "card") { onCard(c.id) } }
            items(passes, key = { it.id }) { p -> val v = passView(cat, p); ResultRow(v.title + if (p.archived) " (archived)" else "", v.sub.ifEmpty { v.t.label }, v.accent, WalletIcons.nameFor(p.template)) { onPass(p.id) } }
            if (cards.isEmpty() && passes.isEmpty()) item { Text(if (q.isNotEmpty()) "Nothing in your wallet matches “$q”." else "Nothing of this type yet.", Modifier.padding(32.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            item { Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.Center) { Ic("lock", size = 16.dp); Text(" ID documents are searched inside the locked vault, not here.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
        }
    }
}

@Composable
private fun ResultRow(title: String, sub: String, color: Color, icon: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(color), contentAlignment = Alignment.Center) { Ic(icon, tint = Color.White, size = 20.dp) }
        Column(Modifier.weight(1f).padding(start = 14.dp)) { Text(title, style = MaterialTheme.typography.bodyLarge); Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Ic("chevron", tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

// ---- Settings -----------------------------------------------------------------------------
@Composable
fun SettingsScreen(cat: Catalog, state: WalletState, vm: org.openwallet.app.ui.WalletViewModel, go: (String) -> Unit, onBack: () -> Unit, onRegion: () -> Unit, onExport: () -> Unit, onImport: () -> Unit, onIcs: () -> Unit) {
    val s = state.settings
    var dialog by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize()) {
        WTopBar("Settings", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            Sub("Appearance")
            SettingRow("palette", "Theme", mapOf("system" to "System default", "light" to "Light", "dark" to "Dark")[s.theme] ?: "") { dialog = "theme" }
            SwitchRow("motion", "Reduce motion", "Turn off card and page animations", s.reduceMotion, onChange = vm::setReduceMotion)
            SettingRow("globe", "Country or region", (if (s.region.isEmpty()) "All regions" else cat.regionName(s.region)) + ". Suggests providers and ID types. Your location isn’t used", onClick = onRegion)
            Sub("Payment cards")
            SettingRow("card", "First card on home screen", state.defaultCard?.let { "${cardName(cat, it)} •• ${it.last4}" } ?: "No cards yet") { dialog = "default" }
            SettingRow("refresh", "Card prefixes you confirmed", if (s.learnedIins.isEmpty()) "None saved" else "${s.learnedIins.size} saved on this phone. Tap to forget", onClick = vm::clearLearned)
            Sub("Payments & NFC")
            SettingRow("contactless", "Payments & NFC", "NFC status, contactless payments (needs an issuer partner), NFC tags and access credentials") { go("payments") }
            Sub("Card scanning")
            val ctx = androidx.compose.ui.platform.LocalContext.current
            val cam = androidx.core.content.ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED
            SettingRow("photo", "Camera permission", if (cam) "Allowed. Used only while the scanner is open" else "Not allowed yet. Asked when you first scan") {
                ctx.startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", ctx.packageName, null)))
            }
            SwitchRow("check", "Automatic capture", "Take the photo by itself when the card is steady and sharp", s.autoCapture, onChange = vm::setAutoCapture)
            SwitchRow("photo", "Keep source photos", "Keep an encrypted copy of loyalty, gift and ticket photos. Payment-card photos are never kept, and ID photos go only into the vault", s.retainSource, onChange = vm::setRetainSource)
            SettingRow("shield", "Processing", "On this phone only. Text is read for Latin script (English, French, Spanish and similar); barcodes for any language. No cloud processing is offered, so nothing is uploaded") { dialog = "processing" }
            Sub("Passes")
            SettingRow("sort", "Sort passes", if (s.sortPasses == "recent") "Recently added first" else "Upcoming first") { dialog = "sort" }
            SwitchRow("bell", "Show what’s next", "Feature the next trip or event on the home screen", s.showNext, onChange = vm::setShowNext)
            Sub("IDs & documents")
            SettingRow("lock", "Open the document vault", "Unlocks with your fingerprint, face or screen lock") { go("vault") }
            SettingRow("lock", "Lock automatically", "After ${s.vaultTimeoutMin} minute${if (s.vaultTimeoutMin == 1) "" else "s"}") { dialog = "timeout" }
            SwitchRow("bell", "Expiry reminders", "Show documents that expire within 60 days in the vault", s.expiryReminders, onChange = vm::setExpiryReminders)
            Sub("Connections")
            SettingRow("calendar", "Google Calendar", if (s.calendarConnected) "Connected (read-only)" + if (s.calendarAutoSync) " · syncs when you open the app" else "" else "Off. Optional") { go("calendar") }
            SettingRow("upload", "Import from a calendar file", "Find bookings in an .ics file, offline", onClick = onIcs)
            Sub("Your data")
            SettingRow("archive", "Archived passes", "${state.passes.count { it.archived }} archived") { go("archived") }
            SettingRow("download", "Export a backup", "Cards and passes as a JSON file. ID documents stay in the vault", onClick = onExport)
            SettingRow("upload", "Import a backup", "Replaces cards and passes", onClick = onImport)
            SettingRow("add", "Add sample passes", "Made-up cards and tickets to try the app, marked as samples", onClick = vm::addSamples)
            SettingRow("delete", "Delete all cards and passes", "The vault is separate (Vault › Reset)") { dialog = "delete" }
            Sub("About")
            SettingRow("info", "About Open Wallet", "Version ${BuildConfig.VERSION_NAME} · catalogue ${cat.version}") { go("about") }
        }
    }
    when (dialog) {
        "theme" -> RadioDialog("Theme", listOf("system" to "System default", "light" to "Light", "dark" to "Dark"), s.theme, { dialog = null }) { vm.setTheme(it); dialog = null }
        "sort" -> RadioDialog("Sort passes", listOf("upcoming" to "Upcoming first", "recent" to "Recently added first"), s.sortPasses, { dialog = null }) { vm.setSort(it); dialog = null }
        "timeout" -> RadioDialog("Lock the vault after", listOf("1" to "1 minute", "5" to "5 minutes", "15" to "15 minutes", "60" to "1 hour"), s.vaultTimeoutMin.toString(), { dialog = null }) { vm.setVaultTimeout(it.toInt()); dialog = null }
        "default" -> RadioDialog("First card on home screen", state.cards.map { it.id to "${cardName(cat, it)} •• ${it.last4}" }, s.defaultCardId ?: "", { dialog = null }) { vm.setDefault(it); dialog = null }
        "processing" -> ConfirmDialog("How scanning works", "Text and barcodes are recognised by models built into the app (ML Kit, bundled) and ZXing. They run on this phone with no network connection. Card numbers are used only in memory to find the network and the last 4 digits; the full number and security code are never saved. Temporary photos are discarded after reading unless you turn on Keep source photos.", "OK", false, { dialog = null }) {}
        "delete" -> ConfirmDialog("Delete all cards and passes?", "Every card, pass and imported original is removed from this phone. This can’t be undone.", "Delete all", true, { dialog = null }, vm::deleteEverything)
    }
}

@Composable private fun Sub(t: String) = Text(t, Modifier.padding(start = 16.dp, top = 20.dp, bottom = 4.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)

// ---- Google Calendar -------------------------------------------------------------------------
@Composable
fun CalendarScreen(state: WalletState, cal: CalendarState, onBack: () -> Unit, onConnect: () -> Unit, onSync: () -> Unit, onAuto: (Boolean) -> Unit,
                   onRemoved: (String) -> Unit, onDisconnect: () -> Unit, onDeleteImported: () -> Unit, onIcs: () -> Unit, onSetup: () -> Unit) {
    val s = state.settings
    val imported = state.passes.count { it.source == "calendar" }
    var confirm by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize()) {
        WTopBar("Google Calendar", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            Row(Modifier.fillMaxWidth().padding(16.dp).clip(RoundedCornerShape(16.dp)).background(if (s.calendarConnected) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Ic(if (s.calendarConnected) "check" else "calendar")
                Column(Modifier.padding(start = 12.dp)) {
                    Text(if (s.calendarConnected) "Connected (read-only)" else "Not connected", fontWeight = FontWeight.Medium)
                    Text((if (s.calendarLastSync > 0) "Last synced " + Instant.ofEpochMilli(s.calendarLastSync).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)) else "Never synced") +
                        if (s.calendarLastError.isNotEmpty()) " · ${s.calendarLastError}" else "", style = MaterialTheme.typography.bodyMedium)
                }
            }
            Notice("What’s read: the title, time, place, organiser name and description of events from yesterday to 6 months ahead, in your main Google calendar. Only events that look like bookings are suggested, and you review each one. Open Wallet keeps only the passes you save, encrypted on this phone, plus each event’s ID to avoid duplicates. It can’t create, change or delete your events. Nothing runs in the background.")
            if (!s.calendarConnected) {
                Button(onConnect, Modifier.fillMaxWidth().padding(16.dp)) { Ic("calendar", size = 18.dp); Text("Connect Google Calendar", Modifier.padding(start = 8.dp)) }
                TextButton(onSetup, Modifier.padding(horizontal = 8.dp)) { Text("Setup guide for developers (OAuth client)") }
            } else {
                SettingRow("refresh", if (cal.busy) "Syncing…" else "Sync now", "Look for new and changed bookings", enabled = !cal.busy, onClick = onSync)
                SwitchRow("sync", "Sync when I open the app", "At most every 6 hours, only while connected. Off by default", s.calendarAutoSync, onChange = onAuto)
                SettingRow("delete", "If an event is deleted", if (s.calendarOnRemoved == "delete") "Delete its pass too" else "Keep the pass and mark it") { confirm = "removed" }
                SettingRow("link", "Disconnect Google Calendar", "Revokes access, deletes the stored token and stops syncing. Saved passes stay") { confirm = "disconnect" }
            }
            if (imported > 0) SettingRow("delete", "Delete $imported pass${if (imported == 1) "" else "es"} imported from the calendar", "Your calendar events aren’t touched") { confirm = "deleteImported" }
            Sub("Without Google")
            SettingRow("upload", "Import a calendar file (.ics)", "Export a file from any calendar app and find bookings in it, offline", onClick = onIcs)
        }
    }
    when (confirm) {
        "disconnect" -> ConfirmDialog("Disconnect Google Calendar?", "Open Wallet asks Google to revoke its access, deletes the token from this phone and stops all syncing. Passes you saved stay.", "Disconnect", true, { confirm = null }, onDisconnect)
        "deleteImported" -> ConfirmDialog("Delete calendar passes?", "Passes imported from your calendar are removed from Open Wallet. Your calendar events aren’t touched.", "Delete", true, { confirm = null }, onDeleteImported)
        "removed" -> RadioDialog("If an event is deleted", listOf("mark" to "Keep the pass and mark it", "delete" to "Delete its pass too"), s.calendarOnRemoved, { confirm = null }) { onRemoved(it); confirm = null }
    }
}

@Composable
fun ReviewScreen(cat: Catalog, cal: CalendarState, onBack: () -> Unit, onAdd: (Proposal) -> Unit, onIgnore: (Proposal) -> Unit, onUpdate: (Proposal) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        WTopBar("Review bookings", onBack)
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item { Text("${cal.checked} events checked in ${cal.sourceLabel}. ${cal.proposals.size} look like bookings. Meetings and personal events are skipped.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(cal.proposals, key = { it.ref }) { p ->
                val t = cat.template(p.booking.template)
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainerLow).padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconCircle(WalletIcons.nameFor(p.booking.template), 40.dp)
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text(p.title.ifEmpty { t.label }, fontWeight = FontWeight.Medium)
                            Text(listOfNotNull(t.label, cat.provider(p.booking.provider)?.name, p.start?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) }).joinToString(" · "),
                                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (p.state == "changed") Text("Changed", color = MaterialTheme.colorScheme.tertiary)
                    }
                    @OptIn(ExperimentalLayoutApi::class)
                    FlowRow(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        p.booking.fields.forEach { (k, v) ->
                            val fd = t.fields.firstOrNull { it.k == k }
                            val shown = when (fd?.type) { "date" -> fmtDate(v); "time" -> fmtTime(v); else -> v }
                            Text("${fd?.label ?: k}  $shown", Modifier.clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceContainerHighest).padding(horizontal = 8.dp, vertical = 4.dp), fontSize = 13.sp)
                        }
                    }
                    if (p.state == "changed") Text(p.changes.joinToString("\n") { (k, a, b) -> "${t.fields.firstOrNull { it.k == k }?.label ?: k}: ${a.ifEmpty { "—" }} → $b" }, Modifier.padding(top = 8.dp), fontSize = 13.sp)
                    if (p.booking.missing.isNotEmpty()) Text("Missing: " + p.booking.missing.joinToString { k -> t.fields.firstOrNull { it.k == k }?.label ?: k } + ". You can add them before saving",
                        Modifier.padding(top = 8.dp), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.End) {
                        TextButton({ onIgnore(p) }) { Text("Ignore") }
                        if (p.state == "changed") FilledTonalButton({ onUpdate(p) }) { Text("Update pass") } else Button({ onAdd(p) }) { Text("Review & add") }
                    }
                }
            }
            if (cal.proposals.isEmpty()) item { Text("All done. No more bookings to review.", Modifier.padding(32.dp)) }
        }
    }
}

@Composable
fun ArchivedScreen(cat: Catalog, state: WalletState, onBack: () -> Unit, onOpen: (String) -> Unit, onUnarchive: (String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        WTopBar("Archived passes", onBack)
        val list = state.passes.filter { it.archived }
        LazyColumn {
            items(list, key = { it.id }) { p -> val v = passView(cat, p)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f)) { ResultRow(v.title, v.sub.ifEmpty { v.t.label }, v.accent, WalletIcons.nameFor(p.template)) { onOpen(p.id) } }
                    IconButton({ onUnarchive(p.id) }) { Ic("archive") }
                }
            }
            if (list.isEmpty()) item { Text("No archived passes. Passes you archive move here, out of your home screen.", Modifier.padding(32.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
fun AboutScreen(cat: Catalog, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        WTopBar("About", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Open Wallet ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.headlineSmall)
            Text("An independent, local-first wallet for cards, passes, tickets and personal documents. Not made by, endorsed by or affiliated with Google, any bank, airline, cinema, transport operator or government. Provider names identify whose card or ticket it is. No logos are included.")
            Text("What works and what’s simulated", style = MaterialTheme.typography.titleMedium)
            listOf("Cards, passes, tickets: add, edit, favourite, archive, delete" to "Works", "Ticket illustrations for flight, train, bus, taxi, ship, entry, amusement and movies" to "Works",
                "QR, Code 128, PDF417 and Aztec drawn from the exact text, and read from imported photos" to "Works", "Encrypted database and document vault (Android Keystore, biometrics or screen lock)" to "Works",
                "Calendar file (.ics) import with review" to "Works", "Google Calendar (read-only, optional)" to "Needs OAuth set-up, not yet verified",
                "Tap to pay, transit top-ups, card activity" to "Demo only", "Real payments, NFC, payment tokens" to "Not possible", "Official or verified digital IDs" to "Not possible").forEach { (a, b) ->
                Row { Text(a, Modifier.weight(1f)); Text(b, Modifier.padding(start = 8.dp), color = MaterialTheme.colorScheme.primary) }; HorizontalDivider()
            }
            Text("Catalogue ${cat.version}: ${cat.issuers.size} banks, ${cat.networks.size} card networks, ${cat.providers.size} providers, ${cat.docs.size} document types. Brand colours are approximations, not verified.")
            Text("Privacy", style = MaterialTheme.typography.titleMedium)
            Text("No account, no analytics, no ads, no tracking. Everything is stored encrypted on this phone and excluded from cloud backups. The only network use is the optional Google Calendar connection.")
            Text("Credits", style = MaterialTheme.typography.titleMedium)
            Text("Ticket illustrations: supplied by the app owner. Icons follow the Material Icons set (Apache 2.0). Barcodes: ZXing (Apache 2.0). Database encryption: SQLCipher (BSD-style licence).")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegionSheet(cat: Catalog, current: String, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    ModalBottomSheet(onDismiss) {
        Text("Country or region", Modifier.padding(horizontal = 24.dp), style = MaterialTheme.typography.titleLarge)
        Text("Used to suggest providers and document types. You can still add anything from anywhere. Your location isn’t used.", Modifier.padding(24.dp, 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        LazyColumn(Modifier.fillMaxHeight(.7f)) {
            items(listOf("" to "All regions") + cat.regions.map { it.code to it.name }) { (k, l) ->
                Row(Modifier.fillMaxWidth().clickable { onPick(k) }.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) { RadioButton(current == k, { onPick(k) }); Text(l) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InfoSheet(title: String, body: String, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismiss) {
        Text(title, Modifier.padding(horizontal = 24.dp), style = MaterialTheme.typography.titleLarge)
        Text(body, Modifier.padding(24.dp).padding(bottom = 24.dp), style = MaterialTheme.typography.bodyLarge)
    }
}
