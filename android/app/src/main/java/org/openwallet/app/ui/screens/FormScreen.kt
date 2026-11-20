package org.openwallet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.openwallet.app.data.CardEntity
import org.openwallet.app.data.Catalog
import org.openwallet.app.data.Keys
import org.openwallet.app.data.PassEntity
import org.openwallet.app.data.StoredFile
import org.openwallet.app.domain.CardEngine
import org.openwallet.app.domain.Codes
import org.openwallet.app.domain.Money
import org.openwallet.app.ui.WalletState
import org.openwallet.app.ui.art.CardArt
import org.openwallet.app.ui.art.Illustrations
import org.openwallet.app.ui.art.TicketCard
import org.openwallet.app.ui.components.ConfirmDialog
import org.openwallet.app.ui.components.Field
import org.openwallet.app.ui.components.Ic
import org.openwallet.app.ui.components.Logo
import org.openwallet.app.ui.components.Notice
import org.openwallet.app.ui.components.SearchPill
import org.openwallet.app.ui.components.Select
import org.openwallet.app.ui.components.WTopBar
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Data handed to a new pass form from an import, a calendar booking or a provider directory. */
data class Prefill(
    val template: String, val providerId: String = "", val fields: Map<String, String> = emptyMap(), val code: String = "", val codeFormat: String = "none",
    val codeSource: String = "entered", val source: String = "manual", val sourceRef: String = "", val original: StoredFile? = null, val note: String = ""
)

val COLORS = listOf<Long?>(null, 0xFF1F3A5F, 0xFF0B57D0, 0xFF00796B, 0xFF2E7D32, 0xFF8A5A00, 0xFFC2410C, 0xFFB3261E, 0xFFAD1457, 0xFF6A1B9A, 0xFF37474F, 0xFF1B1B1B)
private val CURRENCIES = listOf("INR", "AED", "SAR", "QAR", "KWD", "BHD", "OMR", "USD", "CAD", "GBP", "EUR", "AUD", "SGD")
fun currencyFor(region: String) = mapOf("IN" to "INR", "AE" to "AED", "SA" to "SAR", "QA" to "QAR", "KW" to "KWD", "BH" to "BHD", "OM" to "OMR", "GB" to "GBP", "EU" to "EUR", "CA" to "CAD", "AU" to "AUD", "SG" to "SGD")[region] ?: "USD"

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PassFormScreen(cat: Catalog, state: WalletState, editId: String?, initial: Prefill, onClose: () -> Unit, onSave: (PassEntity, Boolean) -> Unit) {
    val existing = editId?.let { state.pass(it) }
    var template by remember { mutableStateOf(existing?.template ?: initial.template) }
    val t = cat.template(template)
    val values = remember { mutableStateMapOf<String, String>().apply { putAll(existing?.fields?.filterKeys { !it.startsWith("x:") } ?: initial.fields) } }
    val extras = remember { mutableStateListOf<Pair<String, String>>().apply { addAll(existing?.fields?.filterKeys { it.startsWith("x:") }?.map { it.key.removePrefix("x:") to it.value } ?: emptyList()) } }
    var providerId by remember { mutableStateOf(existing?.providerId ?: initial.providerId) }
    var providerName by remember { mutableStateOf(existing?.providerName ?: "") }
    var color by remember { mutableStateOf(existing?.color) }
    var art by remember { mutableStateOf(existing?.art ?: "") }
    var codeFormat by remember { mutableStateOf(existing?.barcodeFormat ?: initial.codeFormat) }
    var code by remember { mutableStateOf(existing?.barcodeValue ?: initial.code) }
    var currency by remember { mutableStateOf(existing?.currency ?: currencyFor(state.settings.region)) }
    var errors by remember { mutableStateOf(mapOf<String, String>()) }
    var picker by remember { mutableStateOf(false) }
    var dateFor by remember { mutableStateOf<String?>(null) }
    var timeFor by remember { mutableStateOf<String?>(null) }
    var dupe by remember { mutableStateOf<PassEntity?>(null) }
    val prov = cat.provider(providerId)

    fun build(): PassEntity {
        val allowed = t.fields.map { it.k }.toSet() + setOf("date", "time")
        val f = values.filter { it.key in allowed && it.value.isNotBlank() }.mapValues { it.value.trim() } + extras.filter { it.first.isNotBlank() && it.second.isNotBlank() }.associate { "x:${it.first.trim()}" to it.second.trim() }
        val base = existing ?: PassEntity(Keys.newId("pass"), template, source = initial.source, sourceRef = initial.sourceRef, originalFile = initial.original?.fileId ?: "",
            originalMime = initial.original?.mime ?: "", originalName = initial.original?.name ?: "", originalSha = initial.original?.sha256 ?: "")
        return base.copy(template = template, providerId = providerId, providerName = if (providerId.isEmpty()) providerName.trim() else "", color = color, art = art, fields = f,
            barcodeValue = if (codeFormat == "none") "" else code, barcodeFormat = if (code.isEmpty()) "none" else codeFormat,
            barcodeSource = if (existing != null && existing.barcodeValue == code) existing.barcodeSource else if (code == initial.code && initial.code.isNotEmpty()) initial.codeSource else "entered", currency = currency)
    }

    fun validate(): Boolean {
        val e = mutableMapOf<String, String>()
        t.fields.forEach { fd ->
            val v = values[fd.k].orEmpty().trim()
            if (fd.req && v.isEmpty()) e[fd.k] = "Enter ${fd.label.replace(Regex("\\s*\\(.*\\)$"), "").lowercase()}"
            if (v.isNotEmpty() && fd.type == "money") Money.validate(v)?.let { e[fd.k] = it }
            if (v.isNotEmpty() && fd.type == "date" && runCatching { LocalDate.parse(v) }.isFailure) e[fd.k] = "Enter a valid date"
        }
        if (template == "flight") listOf("from", "to").forEach { k -> val v = values[k].orEmpty(); if (v.isNotEmpty() && !Regex("^[A-Z]{3,4}$").matches(v)) e[k] = "Use the 3-letter airport code, like DEL" }
        if (values["checkout"].orEmpty().isNotEmpty() && values["checkout"].orEmpty() < values["date"].orEmpty()) e["checkout"] = "Check-out is before check-in"
        if (codeFormat != "none") { if (code.isEmpty()) e["code"] = "Enter the code text, or choose “No code”" else if (Codes.matrix(code, codeFormat) == null) e["code"] = "This text can’t be drawn as ${Codes.label(codeFormat)}. Try another code type" }
        errors = e
        return e.isEmpty()
    }

    fun save(force: Boolean = false) {
        if (!validate()) return
        val p = build()
        if (existing == null && !force) {
            val d = state.passes.firstOrNull { o -> o.template == p.template && (o.providerId + o.providerName) == (p.providerId + p.providerName) &&
                ((p.f("ref").isNotEmpty() && o.f("ref") == p.f("ref")) || (p.barcodeValue.isNotEmpty() && o.barcodeValue == p.barcodeValue)) && o.f("date") == p.f("date") }
            if (d != null) { dupe = d; return }
        }
        onSave(p, existing == null)
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        WTopBar("${if (existing != null) "Edit" else "Add"} ${t.label.lowercase()}", onClose, "close") { TextButton({ save() }) { Text("Save") } }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            TicketCard(cat, build())
            if (initial.note.isNotEmpty() && existing == null) Notice(initial.note)
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (errors.isNotEmpty()) Text("Check the highlighted fields.", color = MaterialTheme.colorScheme.error)
                Select("Ticket type", template, cat.templates.values.map { it.id to it.label }) { template = it }
                if (t.providerCat != null || template == "generic") {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(4.dp)).clickable { picker = true }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (prov != null) Logo(prov.displayName, Color(prov.color), Color(prov.fg), 36.dp) else Ic(org.openwallet.app.ui.components.WalletIcons.nameFor(template))
                        Column(Modifier.weight(1f).padding(start = 12.dp)) {
                            Text(t.providerLabel, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(prov?.let { if (it.cat == "transit") "${it.sub} · ${it.city}" else it.name } ?: providerName.ifEmpty { "Not set (optional)" })
                        }
                        Text("Change", color = MaterialTheme.colorScheme.primary)
                    }
                    if (prov == null) Field(providerName, { providerName = it }, "${t.providerLabel} name (if not in the list)")
                }
                t.fields.forEach { fd ->
                    val v = values[fd.k].orEmpty()
                    when (fd.type) {
                        "date" -> PickerField(if (v.isEmpty()) "" else org.openwallet.app.ui.art.fmtDate(v), fd.label + if (fd.req) " *" else "", errors[fd.k], "calendar", { dateFor = fd.k }) { values.remove(fd.k) }
                        "time" -> PickerField(if (v.isEmpty()) "" else org.openwallet.app.ui.art.fmtTime(v), fd.label, errors[fd.k], "bell", { timeFor = fd.k }) { values.remove(fd.k) }
                        else -> Field(v, { values[fd.k] = it; errors = errors - fd.k }, fd.label + if (fd.req) " *" else "", error = errors[fd.k], hint = fd.hint,
                            keyboard = if (fd.type == "money") KeyboardType.Decimal else KeyboardType.Text, upper = fd.upper, secret = fd.secret, singleLine = !fd.textarea, minLines = if (fd.textarea) 3 else 1)
                    }
                }
                if (template in setOf("gift", "transit", "purchase")) Select("Currency", currency, CURRENCIES.map { it to it }) { currency = it }
                extras.forEachIndexed { i, (l, v) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Field(l, { extras[i] = it to extras[i].second }, "Label", Modifier.weight(1f))
                        Spacer(Modifier.size(8.dp))
                        Field(v, { extras[i] = extras[i].first to it }, "Value", Modifier.weight(1.4f))
                        IconButton({ extras.removeAt(i) }) { Ic("close") }
                    }
                }
                TextButton({ extras.add("" to "") }) { Ic("add", size = 18.dp); Text("Add another detail", Modifier.padding(start = 6.dp)) }
                Text("Barcode or QR code", style = MaterialTheme.typography.titleMedium)
                Select("Code type", codeFormat, Codes.FORMATS.map { it to Codes.label(it) }) { codeFormat = it }
                if (codeFormat != "none") Field(code, { code = it; errors = errors - "code" }, "Code text, exactly as on your ticket", error = errors["code"],
                    hint = "Kept character for character. Open Wallet never makes up a code", singleLine = false, minLines = 2)
                Text("Illustration", style = MaterialTheme.typography.titleMedium)
                Select("Illustration", art, listOf("" to "Automatic (${Illustrations.label(Illustrations.auto(template, prov) ?: "none")})") + Illustrations.ids.map { it to Illustrations.label(it) } + listOf("none" to "No illustration")) { art = it }
                Text("Colour", style = MaterialTheme.typography.titleMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    COLORS.forEach { c ->
                        Box(Modifier.size(40.dp).clip(CircleShape).background(c?.let { Color(it) } ?: MaterialTheme.colorScheme.surfaceContainerHighest)
                            .border(if (color == c) 3.dp else 0.dp, MaterialTheme.colorScheme.primary, CircleShape).clickable { color = c }, contentAlignment = Alignment.Center) {
                            if (c == null) Text("Auto", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
                Button({ save() }, Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(if (existing != null) "Save changes" else "Add to Wallet") }
            }
        }
    }

    if (picker) ProviderPicker(cat, t.providerCat, state.settings.region, { picker = false }) { id -> picker = false; providerId = id ?: ""; if (id != null) providerName = "" }
    dateFor?.let { k ->
        val st = rememberDatePickerState(runCatching { LocalDate.parse(values[k].orEmpty()).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull())
        DatePickerDialog({ dateFor = null }, confirmButton = { TextButton({ st.selectedDateMillis?.let { values[k] = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString(); errors = errors - k }; dateFor = null }) { Text("OK") } },
            dismissButton = { TextButton({ dateFor = null }) { Text("Cancel") } }) { DatePicker(st) }
    }
    timeFor?.let { k ->
        val parts = values[k].orEmpty().split(":").mapNotNull { it.toIntOrNull() }
        val st = rememberTimePickerState(parts.getOrElse(0) { 9 }, parts.getOrElse(1) { 0 })
        AlertDialog({ timeFor = null }, confirmButton = { TextButton({ values[k] = "%02d:%02d".format(st.hour, st.minute); timeFor = null }) { Text("OK") } },
            dismissButton = { TextButton({ timeFor = null }) { Text("Cancel") } }, text = { TimePicker(st) })
    }
    dupe?.let { ConfirmDialog("Already in your Wallet?", "A pass with the same provider, booking reference and date is already saved.", "Add anyway", false, { dupe = null }) { dupe = null; save(true) } }
}

@Composable
private fun PickerField(shown: String, label: String, error: String?, icon: String, onPick: () -> Unit, onClear: () -> Unit) {
    Box {
        androidx.compose.material3.OutlinedTextField(shown, {}, Modifier.fillMaxWidth(), readOnly = true, label = { Text(label) }, isError = error != null,
            supportingText = error?.let { { Text(it) } }, trailingIcon = { if (shown.isNotEmpty()) IconButton(onClear) { Ic("close") } else Ic(icon) })
        Box(Modifier.matchParentSize().padding(end = 48.dp).clickable(onClick = onPick))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProviderPicker(cat: Catalog, providerCat: String?, region: String, onDismiss: () -> Unit, onPick: (String?) -> Unit) {
    var q by remember { mutableStateOf("") }
    ModalBottomSheet(onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        SearchPill(q, { q = it }, "Search", null)
        val list = (if (providerCat == null) emptyList() else cat.providers(providerCat, q = q)).sortedByDescending { it.region == region }
        LazyColumn(Modifier.fillMaxHeight(.85f)) {
            item { Row(Modifier.fillMaxWidth().clickable { onPick(null) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Ic("edit"); Text("Not in the list. Type the name in the form", Modifier.padding(start = 16.dp)) } }
            items(list) { p ->
                Row(Modifier.fillMaxWidth().clickable { onPick(p.id) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Logo(p.displayName, Color(p.color), Color(p.fg))
                    Column(Modifier.padding(start = 16.dp)) { Text(p.name); Text(p.sub.ifEmpty { cat.regionName(p.region) }, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium) }
                }
            }
        }
    }
}

// =============================================================================================
// Payment card form: never asks for the full number, CVV or PIN.
// =============================================================================================
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CardFormScreen(cat: Catalog, state: WalletState, editId: String?, onClose: () -> Unit, initial: org.openwallet.app.ui.CardPrefill? = null, onSave: (CardEntity, Boolean, String) -> Unit) {
    val existing = editId?.let { state.card(it) }
    var issuerId by remember { mutableStateOf(existing?.issuerId ?: initial?.issuerId ?: "") }
    var issuerName by remember { mutableStateOf(existing?.issuerName ?: "") }
    var productId by remember { mutableStateOf(existing?.productId ?: initial?.productId ?: "") }
    var networkId by remember { mutableStateOf(existing?.networkId ?: initial?.networkId ?: "") }
    var prefix by remember { mutableStateOf(initial?.prefix ?: "") }
    var last4 by remember { mutableStateOf(existing?.last4 ?: initial?.last4 ?: "") }
    var kind by remember { mutableStateOf(existing?.kind ?: initial?.kind ?: "credit") }
    var holder by remember { mutableStateOf(existing?.holder ?: initial?.holder ?: "") }
    var showHolder by remember { mutableStateOf(existing?.showHolder ?: false) }
    var expiry by remember { mutableStateOf(existing?.let { if (it.expMonth > 0) "%02d/%02d".format(it.expMonth, it.expYear % 100) else "" } ?: initial?.expiry ?: "") }
    var showExpiry by remember { mutableStateOf(existing?.showExpiry ?: false) }
    var contactless by remember { mutableStateOf(existing?.contactless ?: false) }
    var nickname by remember { mutableStateOf(existing?.nickname ?: "") }
    var color by remember { mutableStateOf(existing?.color) }
    var errors by remember { mutableStateOf(mapOf<String, String>()) }
    var picker by remember { mutableStateOf(false) }
    var otherName by remember { mutableStateOf<String?>(null) }

    val m = CardEngine.identify(cat, prefix, issuerId.ifEmpty { null }, productId, networkId, state.settings.learnedIins)
    if (issuerId.isEmpty() && m.issuerSource == "learned" && m.issuer != null) issuerId = m.issuer.id
    val iss = cat.issuer(issuerId)
    val exp = Regex("^(\\d{1,2})/(\\d{2})$").find(expiry.trim())?.let { val mo = it.groupValues[1].toInt(); if (mo in 1..12) mo to 2000 + it.groupValues[2].toInt() else null }

    fun card() = (existing ?: CardEntity(Keys.newId("card"), last4 = "0000")).copy(issuerId = issuerId, issuerName = if (iss == null) issuerName.trim() else "", productId = productId,
        networkId = networkId.ifEmpty { m.network?.id ?: "" }, kind = kind, last4 = last4.padStart(4, '•').takeLast(4), holder = holder.trim(), showHolder = showHolder,
        expMonth = exp?.first ?: 0, expYear = exp?.second ?: 0, showExpiry = showExpiry && exp != null, contactless = contactless, color = color, nickname = nickname.trim())

    Column(Modifier.fillMaxSize().imePadding()) {
        WTopBar(if (existing != null) "Edit payment card" else "Add payment card", onClose, "close") {
            TextButton({
                val e = mutableMapOf<String, String>()
                if (iss == null && issuerName.isBlank()) e["issuer"] = "Choose the bank or card issuer"
                if (!Regex("^\\d{4}$").matches(last4)) e["last4"] = "Enter the last 4 digits"
                val d = CardEngine.digits(prefix); if (d.isNotEmpty() && d.length !in 6..8) e["prefix"] = "Enter 6 to 8 digits, or leave it empty"
                if (expiry.isNotBlank() && exp == null) e["expiry"] = "Use MM/YY"
                if (existing == null && state.cards.any { it.last4 == last4 && (it.issuerId + it.issuerName) == (issuerId + issuerName.trim()) }) e["last4"] = "A card from this issuer ending in $last4 is already saved"
                errors = e
                if (e.isEmpty()) onSave(card(), existing == null, prefix)
            }) { Text("Save") }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            CardArt(cat, card())
            if (initial != null && initial.note.isNotEmpty() && existing == null) Notice(initial.note, "photo", modifier = Modifier.padding(0.dp))
            Notice("This is a display copy and can’t pay. Never enter the full card number, the security code (CVV) or your PIN. Open Wallet doesn’t need them.", "lock", warn = true, modifier = Modifier.padding(0.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).border(if (errors.containsKey("issuer")) 2.dp else 1.dp, if (errors.containsKey("issuer")) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outline, RoundedCornerShape(4.dp))
                .clickable { picker = true }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Ic("card")
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text("Bank or card issuer *", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(iss?.name ?: issuerName.ifEmpty { "Choose your bank" })
                    errors["issuer"]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
                Text(if (iss != null || issuerName.isNotEmpty()) "Change" else "Choose", color = MaterialTheme.colorScheme.primary)
            }
            if (iss != null && iss.products.isNotEmpty()) Select("Card product", productId, listOf("" to "Not sure / other") + iss.products.map { it.id to it.name }) { productId = it }
            Field(prefix, { prefix = CardEngine.digits(it).take(8) }, "First 6 to 8 digits (optional)", error = errors["prefix"], hint = "Shows the card network. Only these digits are checked, and they’re never sent anywhere", keyboard = KeyboardType.Number)
            Field(last4, { last4 = CardEngine.digits(it).take(4) }, "Last 4 digits *", error = errors["last4"], keyboard = KeyboardType.Number)
            Select("Card network", networkId, listOf("" to (if (networkId.isEmpty() && m.network != null) "Detected: ${m.network.name}" else "Not sure")) + cat.networks.map { it.id to it.name }) { networkId = it }
            Row(verticalAlignment = Alignment.CenterVertically) { Ic("palette", tint = MaterialTheme.colorScheme.primary, size = 18.dp)
                Text(m.level.text + if (m.productNetworkMismatch) ". This product isn’t usually on that network, so check it" else "", Modifier.padding(start = 8.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Select("Type", kind, listOf("credit" to "Credit", "debit" to "Debit", "prepaid" to "Prepaid")) { kind = it }
            Field(holder, { holder = it }, "Name on card (optional)")
            Field(expiry, { s -> var d = s.filter { it.isDigit() || it == '/' }; if (Regex("^\\d{3,4}$").matches(d)) d = d.take(2) + "/" + d.drop(2); expiry = d.take(5) }, "Expiry MM/YY (optional)", error = errors["expiry"], keyboard = KeyboardType.Number)
            Field(nickname, { nickname = it }, "Nickname (optional)")
            ToggleRow("Show name on the card", showHolder) { showHolder = it }
            ToggleRow("Show expiry on the card", showExpiry) { showExpiry = it }
            ToggleRow("Card has the contactless symbol (only if it’s printed on your card. It doesn’t enable payments)", contactless) { contactless = it }
            Text("Colour", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                COLORS.forEach { c ->
                    Box(Modifier.size(40.dp).clip(CircleShape).background(c?.let { Color(it) } ?: MaterialTheme.colorScheme.surfaceContainerHighest)
                        .border(if (color == c) 3.dp else 0.dp, MaterialTheme.colorScheme.primary, CircleShape).clickable { color = c }, contentAlignment = Alignment.Center) { if (c == null) Text("Auto", style = MaterialTheme.typography.labelMedium) }
                }
            }
            Spacer(Modifier.height(40.dp))
        }
    }
    if (picker) {
        var q by remember { mutableStateOf("") }
        ModalBottomSheet({ picker = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            SearchPill(q, { q = it }, "Search banks and card issuers", null)
            val local = if (state.settings.region.isNotEmpty()) cat.issuersFor(q, state.settings.region) else emptyList()
            val rest = cat.issuersFor(q).filter { it !in local }
            LazyColumn(Modifier.fillMaxHeight(.85f)) {
                item { Row(Modifier.fillMaxWidth().clickable { picker = false; otherName = issuerName }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Ic("add"); Text("My bank isn’t listed", Modifier.padding(start = 16.dp)) } }
                items(local + rest) { b ->
                    Row(Modifier.fillMaxWidth().clickable { picker = false; issuerId = b.id; issuerName = ""; productId = ""; b.networkLocked?.let { networkId = it }; errors = errors - "issuer" }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(b.colors[0]), Color(b.colors.getOrElse(1) { b.colors[0] })))))
                        Column(Modifier.padding(start = 16.dp)) { Text(b.name); Text(cat.regionName(b.country) + if (b.products.isNotEmpty()) " · ${b.products.size} products" else "", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium) }
                    }
                }
            }
        }
    }
    otherName?.let { n ->
        var s by remember { mutableStateOf(n) }
        AlertDialog({ otherName = null }, title = { Text("Bank or issuer name") }, text = { Field(s, { s = it }, "Name") },
            confirmButton = { TextButton({ if (s.isNotBlank()) { issuerId = ""; productId = ""; issuerName = s.trim(); errors = errors - "issuer" }; otherName = null }) { Text("Use this name") } },
            dismissButton = { TextButton({ otherName = null }) { Text("Cancel") } })
    }
}

@Composable
fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f)); Switch(checked, onChange)
    }
}
