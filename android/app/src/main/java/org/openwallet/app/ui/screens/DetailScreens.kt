package org.openwallet.app.ui.screens

import android.view.WindowManager
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import org.openwallet.app.data.ActivityEntity
import org.openwallet.app.data.CardEntity
import org.openwallet.app.data.Catalog
import org.openwallet.app.data.PassEntity
import org.openwallet.app.domain.Money
import org.openwallet.app.ui.WalletState
import org.openwallet.app.ui.art.CardArt
import org.openwallet.app.ui.art.CodeFull
import org.openwallet.app.ui.art.TicketCard
import org.openwallet.app.ui.art.cardName
import org.openwallet.app.ui.art.matchText
import org.openwallet.app.ui.art.passView
import org.openwallet.app.ui.components.ConfirmDialog
import org.openwallet.app.ui.components.Field
import org.openwallet.app.ui.components.Ic
import org.openwallet.app.ui.components.Notice
import org.openwallet.app.ui.components.SettingRow
import org.openwallet.app.ui.components.WTopBar
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

@Composable
fun ActivityRow(a: ActivityEntity, onClick: () -> Unit) {
    val t = Instant.ofEpochMilli(a.dateMillis).atZone(ZoneId.systemDefault())
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh), contentAlignment = Alignment.Center) { Text(a.merchant.take(1)) }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(a.merchant, style = MaterialTheme.typography.bodyLarge)
            Text(t.format(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)) + if (a.demo) " · Demo" else "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text((if (a.amountCents > 0) "+" else "") + Money.format(a.amountCents / 100.0, a.currency), color = if (a.amountCents > 0) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CardDetailScreen(cat: Catalog, state: WalletState, id: String, onBack: () -> Unit, onPay: () -> Unit, onEdit: () -> Unit, onSetDefault: () -> Unit,
                     onRemove: () -> Unit, onActivity: (ActivityEntity) -> Unit, authenticate: (String, () -> Unit) -> Unit = { _, ok -> ok() }) {
    val c = state.card(id) ?: return
    var details by rememberSaveable { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    val m = org.openwallet.app.domain.CardEngine.identify(cat, issuerId = c.issuerId, productId = c.productId, networkId = c.networkId)
    Column(Modifier.fillMaxSize()) {
        WTopBar(c.nickname.ifEmpty { cardName(cat, c) }, onBack) {
            Box { IconButton({ menu = true }) { Ic("more") }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem({ Text("Edit card") }, { menu = false; onEdit() }, leadingIcon = { Ic("edit") })
                    if (state.settings.defaultCardId != c.id) DropdownMenuItem({ Text("Make default") }, { menu = false; onSetDefault() }, leadingIcon = { Ic("star") })
                    DropdownMenuItem({ Text("Remove card", color = MaterialTheme.colorScheme.error) }, { menu = false; confirm = true }, leadingIcon = { Ic("delete", tint = MaterialTheme.colorScheme.error) })
                }
            }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 32.dp)) {
            Box(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) { CardArt(cat, c) }
            if (state.settings.defaultCardId == c.id) Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                Ic("check", tint = MaterialTheme.colorScheme.tertiary, size = 18.dp); Text("Shown first on your home screen", Modifier.padding(start = 6.dp), color = MaterialTheme.colorScheme.tertiary, fontSize = 13.sp)
            } else Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { TextButton(onSetDefault) { Text("Show first on home screen") } }
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                OutlinedButton(onPay) { Ic("contactless", size = 18.dp); Text("Contactless: not available", Modifier.padding(start = 8.dp)) }
                FilledTonalButton({ if (details) details = false else authenticate("Show card details") { details = true } }) { Text("Card details"); Ic("expand", Modifier.scale(1f, if (details) -1f else 1f), size = 18.dp) }
            }
            AnimatedVisibility(details, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                FlowRow(Modifier.fillMaxWidth().padding(horizontal = 20.dp), maxItemsInEachRow = 2) {
                    listOf("Card number" to "•••• ${c.last4}", "Expires" to (if (c.expMonth > 0) "%02d/%02d".format(c.expMonth, c.expYear % 100) else "Not set"),
                        "Issuer" to (m.issuer?.name ?: c.issuerName.ifEmpty { "Not set" }), "Network" to (m.network?.name ?: "Not set"), "Product" to (m.product?.name ?: "Not set"),
                        "Type" to c.kind.replaceFirstChar { it.uppercase() }, "Name on card" to c.holder.ifEmpty { "—" }).forEach { (k, v) ->
                        Column(Modifier.weight(1f).padding(vertical = 8.dp)) { Text(k, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(v, fontSize = 16.sp) }
                    }
                }
            }
            SettingRow("palette", "Card design", matchText(cat, c) + if (m.productNetworkMismatch) ". This product isn’t usually on this network, so check it" else "", trailing = { Text("Change", color = MaterialTheme.colorScheme.primary) }, onClick = onEdit)
            Notice("Transactions appear here only when an authorized payment provider sends them. None is set up, so there’s no activity to show.")
            Notice("A display copy, not a payment credential. It isn’t verified by your bank and can’t pay. Open Wallet keeps only the last 4 digits, never the full number, CVV or PIN. The design is Open Wallet’s own, in the bank’s colours, not the bank’s card art.")
        }
    }
    if (confirm) ConfirmDialog("Remove this card?", "${cardName(cat, c)} •• ${c.last4} and its demo activity will be removed from this phone.", "Remove", true, { confirm = false }, onRemove)
}

@Composable
fun CardsScreen(cat: Catalog, state: WalletState, onBack: () -> Unit, onOpen: (String) -> Unit, onAdd: () -> Unit, onMove: (String, Int) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        WTopBar("Payment cards", onBack) { IconButton(onAdd) { Ic("add") } }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 32.dp)) {
            Text("Tap a card to open it. Use the arrows to change the order on your home screen.", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.cards.forEachIndexed { i, c ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.weight(1f).clickable { onOpen(c.id) }) { CardArt(cat, c) }
                    Column(Modifier.weight(.9f).padding(start = 14.dp)) {
                        Text(cardName(cat, c), style = MaterialTheme.typography.titleMedium)
                        Text("•••• ${c.last4}" + if (state.settings.defaultCardId == c.id) " · Default" else "", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row { IconButton({ onMove(c.id, -1) }, enabled = i > 0) { Ic("arrowUp") }; IconButton({ onMove(c.id, 1) }, enabled = i < state.cards.lastIndex) { Ic("arrowDown") } }
                    }
                }
            }
            if (state.cards.isEmpty()) Text("No payment cards yet.", Modifier.padding(24.dp))
        }
    }
}

private val SOURCE_NOTE = mapOf(
    "manual" to ("edit" to "Manual record. You entered these details on this phone."),
    "import" to ("upload" to "Imported copy. The original file is kept unchanged and encrypted on this phone."),
    "calendar" to ("calendar" to "From Google Calendar. Only details found in the event, or that you added, are shown."),
    "sample" to ("info" to "Sample pass with made-up details. Its code is a demo and won’t work at a gate or scanner.")
)

@Composable
fun PassDetailScreen(cat: Catalog, state: WalletState, id: String, onBack: () -> Unit, onEdit: () -> Unit, onCode: () -> Unit, onOriginal: () -> Unit,
                     onFavorite: () -> Unit, onArchive: (Boolean) -> Unit, onDelete: () -> Unit, onSetBalance: (String) -> Unit, onAddValue: (Double) -> Unit,
                     onActivity: (ActivityEntity) -> Unit) {
    val p = state.pass(id) ?: return
    val v = passView(cat, p)
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    var reveal by remember { mutableStateOf(false) }
    var balanceDialog by remember { mutableStateOf(false) }
    var topUp by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        WTopBar(v.t.label, onBack) {
            IconButton(onFavorite) { Ic(if (p.favorite) "star" else "starOutline") }
            Box { IconButton({ menu = true }) { Ic("more") }
                DropdownMenu(menu, { menu = false }) {
                    DropdownMenuItem({ Text("Edit") }, { menu = false; onEdit() }, leadingIcon = { Ic("edit") })
                    if (p.barcodeValue.isNotEmpty()) DropdownMenuItem({ Text("Show code full screen") }, { menu = false; onCode() }, leadingIcon = { Ic("fullscreen") })
                    DropdownMenuItem({ Text(if (p.archived) "Unarchive" else "Archive") }, { menu = false; onArchive(!p.archived) }, leadingIcon = { Ic("archive") })
                    DropdownMenuItem({ Text("Delete", color = MaterialTheme.colorScheme.error) }, { menu = false; confirm = true }, leadingIcon = { Ic("delete", tint = MaterialTheme.colorScheme.error) })
                }
            }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            if (p.archived) Notice("This pass is archived, so it’s hidden from your home screen.", "archive")
            if (p.sourceStatus == "removed") Notice("The calendar event for this pass was deleted. The pass is kept until you delete it.", "calendar", warn = true)
            Spacer(Modifier.height(8.dp))
            TicketCard(cat, p, reveal, onCode, p.fields.filterKeys { it.startsWith("x:") }.map { it.key.removePrefix("x:") to it.value })
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                if (p.f("number").isNotEmpty() || p.f("pin").isNotEmpty()) FilledTonalButton({ reveal = !reveal }) { Text(if (reveal) "Hide numbers" else "Show numbers") }
                if (p.originalFile.isNotEmpty()) FilledTonalButton(onOriginal) { Text("Original file") }
                if (p.template == "gift") FilledTonalButton({ balanceDialog = true }) { Text("Update balance") }
                OutlinedButton(onEdit) { Text("Edit") }
            }
            val mode = when {
                p.barcodeValue.isNotEmpty() && p.barcodeSource == "import" -> "Barcode pass: the code is kept exactly as read from your ticket. Whether a gate or scanner accepts it is up to the operator."
                p.barcodeValue.isNotEmpty() -> "Barcode pass: redrawn from the code text you entered. Whether a gate or scanner accepts it is up to the operator."
                else -> "Visual pass: shows your ticket details. There’s no code for a scanner to read."
            }
            Notice(mode + if (p.template in setOf("transit", "flight", "train", "bus", "ferry", "entry", "amusement", "event", "sports", "hotel")) " NFC: not available. The operator hasn’t authorised Open Wallet to issue tap-to-ride or tap-to-enter credentials." else "", "qr")
            val (ic, text) = SOURCE_NOTE[p.source] ?: SOURCE_NOTE.getValue("manual")
            Notice(text, ic)
            if (p.barcodeValue.isNotEmpty() && p.barcodeSource != "demo") Notice("The code text is kept exactly as ${if (p.barcodeSource == "import") "read from your ticket" else "you entered it"}. If a scanner won’t read it (for example a code that changes every few seconds), show the original ticket or the issuer’s app.", "qr")
            if (p.template in setOf("transit", "loyalty", "gift")) Notice("Balances and points are your own notes. Open Wallet doesn’t connect to ${v.t.providerLabel.lowercase()}s, so it can’t show live values or pay fares.")
        }
    }
    if (confirm) ConfirmDialog("Delete this pass?", "“${v.title}” will be removed from this phone" + (if (p.originalFile.isNotEmpty()) ", with its imported original file." else "."), "Delete", true, { confirm = false }, onDelete)
    if (balanceDialog) {
        var s by remember { mutableStateOf(p.f("balance")) }
        val err = Money.validate(s, allowEmpty = false)
        AlertDialog(onDismissRequest = { balanceDialog = false }, title = { Text("Update balance") },
            text = { Column { Text("Enter the balance from your latest receipt or the store’s app. Open Wallet can’t check it."); Spacer(Modifier.height(12.dp)); Field(s, { s = it }, "Balance (${p.currency})", error = if (s.isNotEmpty()) err else null, keyboard = androidx.compose.ui.text.input.KeyboardType.Decimal) } },
            confirmButton = { TextButton({ if (err == null) { balanceDialog = false; onSetBalance(s.trim()) } }) { Text("Save") } }, dismissButton = { TextButton({ balanceDialog = false }) { Text("Cancel") } })
    }
    if (topUp) AlertDialog(onDismissRequest = { topUp = false }, title = { Text("Add value (demo)") },
        text = { Column { Text("Demo only. Nothing is charged and the operator isn’t contacted. This only updates the balance note you keep here.")
            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf(50.0, 100.0, 500.0).forEach { a -> OutlinedButton({ topUp = false; onAddValue(a) }) { Text(Money.format(a, p.currency)) } } } } },
        confirmButton = { TextButton({ topUp = false }) { Text("Close") } })
}

/** Full-screen, maximum-brightness code for scanners. */
@Composable
fun CodeViewer(cat: Catalog, p: PassEntity, onClose: () -> Unit) {
    val activity = androidx.compose.ui.platform.LocalContext.current as? android.app.Activity
    DisposableEffect(Unit) {
        val w = activity?.window; val old = w?.attributes?.screenBrightness
        w?.attributes = w?.attributes?.apply { screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL }
        onDispose { w?.attributes = w?.attributes?.apply { screenBrightness = old ?: WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE } }
    }
    val v = passView(cat, p)
    Box(Modifier.fillMaxSize().background(Color.White).clickable(onClick = onClose)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(v.title, color = Color(0xFF1B1B1B), fontSize = 22.sp, textAlign = TextAlign.Center)
            Text(v.sub, color = Color(0xFF444746), textAlign = TextAlign.Center)
            Spacer(Modifier.height(24.dp))
            CodeFull(p, Modifier.fillMaxWidth(if (p.barcodeFormat == "qr" || p.barcodeFormat == "aztec") .8f else 1f))
            Text(p.barcodeValue, Modifier.padding(top = 12.dp), color = Color(0xFF1B1B1B), fontFamily = FontFamily.Monospace, fontSize = 14.sp, textAlign = TextAlign.Center)
            if (p.barcodeSource == "demo") Text("Sample code: not valid for entry", Modifier.padding(top = 8.dp), color = Color(0xFF8C1D18))
            Text("Brightness is turned up for scanners. Tap anywhere to close.", Modifier.padding(top = 16.dp), color = Color(0xFF444746), fontSize = 13.sp)
        }
        IconButton(onClose, Modifier.statusBarsPadding().padding(8.dp)) { Ic("close", tint = Color(0xFF444746)) }
    }
}

/** Demo tap-to-pay: shows the flow only. Nothing is sent and no payment is made. */
@Composable
fun PayDemoScreen(cat: Catalog, card: CardEntity, reduce: Boolean, onClose: () -> Unit, onPaid: (Long) -> Unit) {
    var stage by remember { mutableStateOf("waiting") }
    val cents = remember { (200..4000).random().toLong() }
    LaunchedEffect(stage) {
        if (stage == "processing") { delay(if (reduce) 10 else 1400); stage = "done"; onPaid(cents) }
        if (stage == "waiting") { delay(30_000); if (stage == "waiting") stage = "timeout" }
    }
    val pulse = rememberInfiniteTransition(label = "pulse")
    val s by pulse.animateFloat(1f, 1.35f, infiniteRepeatable(tween(1000), RepeatMode.Restart), label = "s")
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding().navigationBarsPadding()) {
        WTopBar("${cardName(cat, card)} •• ${card.last4}", onClose, "close")
        Notice("Demo mode. Open Wallet can’t make real payments.", warn = true)
        Box(Modifier.padding(horizontal = 32.dp, vertical = 12.dp)) { CardArt(cat, card) }
        AnimatedContent(stage, transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(150)) }, label = "pay", modifier = Modifier.fillMaxWidth()) { st ->
            Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(96.dp), contentAlignment = Alignment.Center) {
                    if (st == "waiting" && !reduce) Box(Modifier.size(72.dp).scale(s).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = (1.35f - s) * 0.6f)))
                    Box(Modifier.size(72.dp).clip(CircleShape).background(if (st == "done") MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                        if (st == "processing") CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary)
                        else Ic(if (st == "done") "check" else if (st == "timeout") "info" else "contactless", tint = MaterialTheme.colorScheme.onPrimary, size = 36.dp)
                    }
                }
                val (title, body) = when (st) {
                    "processing" -> "Connecting…" to "Demo only. No bank or card network is contacted."
                    "done" -> "Demo complete" to "${Money.format(cents / 100.0, "USD")} at Demo reader. No money moved. The entry is added to the card’s activity, marked as a demo."
                    "timeout" -> "No reader found" to "The demo timed out. Try again when you’re ready."
                    else -> "Hold near the reader" to "This is a demonstration. Your phone doesn’t send anything. Tap the button to act out a reader tap."
                }
                Text(title, Modifier.padding(top = 16.dp), style = MaterialTheme.typography.headlineSmall)
                Text(body, Modifier.padding(top = 8.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(16.dp))
                when (st) {
                    "waiting" -> Button({ stage = "processing" }) { Text("Simulate reader tap") }
                    "done" -> Button(onClose) { Text("Done") }
                    "timeout" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { OutlinedButton(onClose) { Text("Close") }; Button({ stage = "waiting" }) { Text("Try again") } }
                }
            }
        }
    }
}
