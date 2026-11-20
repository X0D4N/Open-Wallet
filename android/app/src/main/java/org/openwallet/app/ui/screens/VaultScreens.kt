package org.openwallet.app.ui.screens

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import org.openwallet.app.data.Catalog
import org.openwallet.app.data.DocRecord
import org.openwallet.app.data.Keys
import org.openwallet.app.data.StoredFile
import org.openwallet.app.domain.DocChecks
import org.openwallet.app.ui.VaultState
import org.openwallet.app.ui.WalletState
import org.openwallet.app.ui.art.DocCard
import org.openwallet.app.ui.art.fmtDate
import org.openwallet.app.ui.components.ChipRow
import org.openwallet.app.ui.components.ConfirmDialog
import org.openwallet.app.ui.components.Display
import org.openwallet.app.ui.components.Field
import org.openwallet.app.ui.components.Group
import org.openwallet.app.ui.components.GroupRow
import org.openwallet.app.ui.components.Ic
import org.openwallet.app.ui.components.IconCircle
import org.openwallet.app.ui.components.Notice
import org.openwallet.app.ui.components.SearchPill
import org.openwallet.app.ui.components.Select
import org.openwallet.app.ui.components.WTopBar

private fun groupIcon(g: String) = if (g == "health") "health" else if (g == "vehicle") "car" else "id"

/** Locked screen: unlocking uses the phone's own biometrics or screen lock. */
@Composable
fun VaultLockScreen(canAuth: Boolean, onBack: () -> Unit, onUnlock: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        WTopBar("IDs & documents", onBack)
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            IconCircle("lock", 64.dp)
            Text("Your document vault", style = MaterialTheme.typography.headlineSmall)
            Text("Personal copies of IDs, health and vehicle documents, encrypted with a key kept in this phone’s secure hardware. They open only after your fingerprint, face or screen lock.",
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (canAuth) Button(onUnlock, Modifier.fillMaxWidth()) { Ic("lock", size = 18.dp); Text("Unlock", Modifier.padding(start = 8.dp)) }
            else Notice("Set a screen lock (PIN, pattern or password) in your phone’s settings to use the vault.", "lock", warn = true, modifier = Modifier.padding(0.dp))
            Text("Nothing in the vault is uploaded, backed up to the cloud or shown in other apps. While it’s open, screenshots and the recent-apps preview are blocked.",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun VaultScreen(cat: Catalog, state: WalletState, vault: VaultState, onBack: () -> Unit, onLock: () -> Unit, onAdd: () -> Unit, onOpen: (String) -> Unit, onReset: () -> Unit) {
    var q by rememberSaveable { mutableStateOf("") }
    var group by rememberSaveable { mutableStateOf("all") }
    var menu by remember { mutableStateOf(false) }
    var confirmReset by remember { mutableStateOf(false) }
    val nq = Catalog.norm(q)
    val docs = vault.docs.filter { d -> val t = cat.docType(d.typeId); (group == "all" || t?.group == group) &&
        (nq.isEmpty() || Catalog.norm("${d.label} ${t?.name} ${d.holder} ${t?.authority} ${cat.regionName(d.region)}").contains(nq)) }
        .sortedWith(compareByDescending<DocRecord> { it.favorite }.thenByDescending { it.createdAt })
    val soon = if (state.settings.expiryReminders) vault.docs.filter { d -> runCatching { java.time.LocalDate.parse(d.expiry) }.getOrNull()?.let { it.isBefore(java.time.LocalDate.now().plusDays(60)) } == true } else emptyList()
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            WTopBar("IDs & documents", onBack) {
                IconButton(onLock) { Ic("lock") }
                Box { IconButton({ menu = true }) { Ic("more") }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem({ Text("Lock now") }, { menu = false; onLock() })
                        DropdownMenuItem({ Text("Reset vault", color = MaterialTheme.colorScheme.error) }, { menu = false; confirmReset = true })
                    }
                }
            }
            LazyColumn(contentPadding = PaddingValues(bottom = 120.dp)) {
                item { SearchPill(q, { q = it }, "Search documents", null) }
                item { ChipRow(listOf("all" to "All", "identity" to "IDs", "health" to "Health", "vehicle" to "Vehicle"), group) { group = it } }
                if (soon.isNotEmpty()) item { Notice(soon.joinToString("\n") { "${it.label.ifEmpty { cat.docType(it.typeId)?.name ?: "" }}: valid until ${fmtDate(it.expiry)}" }, "bell", warn = true) }
                items(docs, key = { it.id }) { d -> Box(Modifier.padding(horizontal = 16.dp, vertical = 6.dp).clickable { onOpen(d.id) }) { DocCard(cat, d, false) } }
                if (docs.isEmpty()) item { Text(if (vault.docs.isEmpty()) "No documents yet. Keep copies of IDs, licences, health and vehicle documents here." else "No documents match.", Modifier.padding(32.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                item { Notice("Personal copies for your own reference. Open Wallet doesn’t verify documents, and a stored copy isn’t an official digital ID. Numbers are hidden until you show them.", "shield") }
            }
        }
        ExtendedFloatingActionButton(onClick = onAdd, modifier = Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(16.dp).semantics { contentDescription = "Add document" }, icon = { Ic("add") }, text = { Text("Add document") })
    }
    if (confirmReset) ConfirmDialog("Reset the vault?", "Every document and file in the vault is permanently deleted.", "Reset", true, { confirmReset = false }, onReset)
}

/** "Choose what to add" — document types for the chosen region. */
@Composable
fun IdsScreen(cat: Catalog, state: WalletState, initialGroup: String, onBack: () -> Unit, onRegion: () -> Unit, onPick: (String) -> Unit) {
    var group by rememberSaveable { mutableStateOf(initialGroup) }
    val region = state.settings.region.ifEmpty { "XX" }
    Column(Modifier.fillMaxSize()) {
        WTopBar("", onBack)
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item { Box(Modifier.padding(start = 24.dp, top = 8.dp)) { IconCircle(groupIcon(group)) } }
            item { Display("Choose what to add") }
            item { Row(Modifier.padding(start = 16.dp)) { RegionChip(cat, state.settings.region, onRegion) } }
            item { ChipRow(listOf("identity" to "IDs & personal info", "health" to "Health", "vehicle" to "Vehicle"), group, Modifier.padding(vertical = 8.dp)) { group = it } }
            item { Group { cat.docsFor(region, group).forEach { t -> item { GroupRow(t.name, t.sub ?: t.authority.ifEmpty { "Personal copy" }, { IconCircle(groupIcon(t.group)) },
                trailing = if (t.official != null) ({ Ic("external", tint = MaterialTheme.colorScheme.onSurfaceVariant) }) else null) { onPick(t.id) } } } } }
            item { Notice("Shown for ${if (state.settings.region.isEmpty()) "all regions" else cat.regionName(region)}, plus types that exist everywhere. Where an official digital version exists, you can open its website.") }
        }
    }
}

@Composable
fun DocFormScreen(cat: Catalog, vault: VaultState, typeId: String?, editId: String?, region: String, onClose: () -> Unit, onPickFile: (side: String, onResult: (StoredFile) -> Unit) -> Unit,
                  preNumber: String = "", preHolder: String = "", preFiles: List<Pair<String, StoredFile>> = emptyList(), preNote: String = "", onSave: (DocRecord, List<String>) -> Unit) {
    val existing = editId?.let { id -> vault.docs.firstOrNull { it.id == id } }
    val t = cat.docType(existing?.typeId ?: typeId) ?: return
    var holder by remember { mutableStateOf(existing?.holder ?: preHolder) }
    var number by remember { mutableStateOf(existing?.number ?: preNumber) }
    var expiry by remember { mutableStateOf(existing?.expiry ?: "") }
    var authority by remember { mutableStateOf(existing?.authority ?: "") }
    var label by remember { mutableStateOf(existing?.label ?: "") }
    var docRegion by remember { mutableStateOf(existing?.region ?: if (t.region == "XX") region.ifEmpty { "XX" } else t.region) }
    val fields = remember { mutableStateMapOf<String, String>().apply { putAll(existing?.fields ?: emptyMap()) } }
    val files = remember { mutableStateListOf<Pair<String, StoredFile>>().apply { addAll(existing?.files ?: preFiles) } }
    val removed = remember { mutableStateListOf<String>() }
    var warn by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val sides = if (t.sides == 2) listOf("front" to "Front", "back" to "Back") else listOf("page" to "Document")

    fun save(force: Boolean) {
        if (number.isBlank() && files.isEmpty() && holder.isBlank()) { error = "Enter the ${t.numberLabel.lowercase()}, or add the original file"; return }
        if (expiry.isNotBlank() && runCatching { java.time.LocalDate.parse(expiry.trim()) }.isFailure) { error = "Use the date format YYYY-MM-DD for “Valid until”"; return }
        val w = DocChecks.check(t, number)
        if (w.isNotEmpty() && !force) { warn = w; return }
        onSave(DocRecord(existing?.id ?: Keys.newId("doc"), t.id, docRegion, label.trim(), holder.trim(), number.trim().uppercase(), expiry.trim(), authority.trim(),
            fields.filterValues { it.isNotBlank() }, files.toList(), existing?.favorite ?: false, existing?.createdAt ?: System.currentTimeMillis()), removed.toList())
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        WTopBar("${if (existing != null) "Edit" else "Add"} ${t.name}", onClose, "close") { TextButton({ save(false) }) { Text("Save") } }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Notice("A personal copy for your reference. It isn’t an official or verified ID." + (t.warn?.let { " $it" } ?: ""), "shield", warn = true, modifier = Modifier.padding(0.dp))
            if (existing == null && preNote.isNotEmpty()) Notice(preNote, "photo", modifier = Modifier.padding(0.dp))
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (t.region == "XX") Select("Issuing country or region", docRegion, cat.regions.map { it.code to it.name }) { docRegion = it }
            Field(holder, { holder = it }, "Name on the document")
            Field(number, { number = it }, t.numberLabel, hint = "Hidden in lists. Shown only after you unlock it", upper = true)
            if (t.expiry) Field(expiry, { expiry = it }, "Valid until (YYYY-MM-DD, only if it’s on the document)")
            Field(authority, { authority = it }, "Issued by" + if (t.authority.isNotEmpty()) " (e.g. ${t.authority})" else "")
            t.fields.forEach { k -> Field(fields[k].orEmpty(), { fields[k] = it }, (cat.docFieldLabels[k] ?: k) + if (k == "dob" || k == "validTo") " (YYYY-MM-DD)" else "") }
            Field(label, { label = it }, "Your own label (optional)")
            Text("Original document", style = MaterialTheme.typography.titleMedium)
            sides.forEach { (side, name) ->
                val f = files.firstOrNull { it.first == side }?.second
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Ic(if (f == null) "upload" else if (f.mime == "application/pdf") "generic" else "photo")
                    Column(Modifier.weight(1f).padding(start = 12.dp)) { Text(name); Text(f?.let { "${it.name} · ${(it.size + 1023) / 1024} KB" } ?: "No file yet", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    TextButton({ onPickFile(side) { sf -> files.firstOrNull { it.first == side }?.let { removed += it.second.fileId; files.remove(it) }; files += side to sf } }) { Text(if (f == null) "Add photo or PDF" else "Replace") }
                    if (f != null) IconButton({ removed += f.fileId; files.removeAll { it.first == side } }) { Ic("close") }
                }
            }
            Text("Files are kept exactly as they are, encrypted. Nothing is cropped or edited, and text isn’t read automatically, so type in the details yourself.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button({ save(false) }, Modifier.fillMaxWidth()) { Text(if (existing != null) "Save changes" else "Save to vault") }
            Spacer(Modifier.height(32.dp))
        }
    }
    warn?.let { ConfirmDialog("Check the number", "$it. Open Wallet only checks the format. It doesn’t verify documents.", "Save anyway", false, { warn = null }) { warn = null; save(true) } }
}

@Composable
fun DocDetailScreen(cat: Catalog, vault: VaultState, id: String, onBack: () -> Unit, onEdit: () -> Unit, onReveal: (Boolean) -> Unit, onFavorite: () -> Unit,
                    onOpenFile: (StoredFile) -> Unit, readFile: (String) -> ByteArray?, onExport: (StoredFile) -> Unit, onDelete: () -> Unit, onOfficial: (String) -> Unit) {
    val d = vault.docs.firstOrNull { it.id == id } ?: return
    val t = cat.docType(d.typeId) ?: return
    val shown = id in vault.revealed
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        WTopBar(d.label.ifEmpty { t.name }, onBack) {
            IconButton(onFavorite) { Ic(if (d.favorite) "star" else "starOutline") }
            Box { IconButton({ menu = true }) { Ic("more") }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem({ Text("Edit") }, { menu = false; onEdit() })
                    d.files.forEach { (side, f) -> DropdownMenuItem({ Text("Export ${if (side == "page") "file" else side}") }, { menu = false; onExport(f) }) }
                    DropdownMenuItem({ Text("Delete", color = MaterialTheme.colorScheme.error) }, { menu = false; confirm = true })
                }
            }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            Box(Modifier.padding(16.dp)) { DocCard(cat, d, shown) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                FilledTonalButton({ onReveal(!shown) }) { Ic(if (shown) "eyeOff" else "eye", size = 18.dp); Text(if (shown) "Hide details" else "Show details", Modifier.padding(start = 8.dp)) }
                OutlinedButton(onEdit) { Text("Edit") }
            }
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("Type" to t.name, "Country or region" to cat.regionName(d.region.ifEmpty { t.region }), "Name" to d.holder,
                    t.numberLabel to (if (shown) d.number else DocChecks.mask(d.number, t.mask)), "Valid until" to (if (d.expiry.isNotEmpty()) fmtDate(d.expiry) else ""),
                    "Issued by" to d.authority.ifEmpty { t.authority }).plus(d.fields.map { (k, v) -> (cat.docFieldLabels[k] ?: k) to (if (shown) v else "••••") })
                    .filter { it.second.isNotBlank() }.forEach { (k, v) -> Column { Text(k, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v, style = MaterialTheme.typography.bodyLarge) } }
            }
            Text("Original document", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleMedium)
            if (d.files.isEmpty()) Text("No file yet. Add the PDF or photos so you always have the original.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            d.files.forEach { (side, f) ->
                Column(Modifier.fillMaxWidth().padding(16.dp, 6.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable { onOpenFile(f) }) {
                    if (f.mime.startsWith("image/")) {
                        val bmp = remember(f.fileId) { readFile(f.fileId)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }?.asImageBitmap() }
                        bmp?.let { Image(it, "$side of the document", Modifier.fillMaxWidth().aspectRatio(it.width.toFloat() / it.height)) }
                    }
                    Text("${if (side == "page") "Document" else side.replaceFirstChar { it.uppercase() }} · ${if (f.mime == "application/pdf") "PDF, tap to open" else "Image"} · ${(f.size + 1023) / 1024} KB", Modifier.padding(12.dp))
                }
            }
            Notice((if (d.files.isNotEmpty()) "Imported copy. " else "Manual record. ") + "Not verified. Open Wallet can’t check that a document is genuine or still valid.", if (d.files.isNotEmpty()) "upload" else "edit")
            t.official?.let { o -> TextButton({ onOfficial(o.url) }, Modifier.padding(horizontal = 8.dp)) { Ic("external", size = 18.dp); Text(o.label, Modifier.padding(start = 8.dp)) } }
        }
    }
    if (confirm) ConfirmDialog("Delete this document?", "The record and its files are deleted from this phone. This can’t be undone.", "Delete", true, { confirm = false }, onDelete)
}
