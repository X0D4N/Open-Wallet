package org.openwallet.app.ui.screens

import android.app.Activity
import android.content.Intent
import android.nfc.NfcAdapter
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.openwallet.app.nfc.NfcCaps
import org.openwallet.app.nfc.TagRead
import org.openwallet.app.nfc.TagReader
import org.openwallet.app.nfc.TestCredential
import org.openwallet.app.ui.components.ConfirmDialog
import org.openwallet.app.ui.components.Ic
import org.openwallet.app.ui.components.Notice
import org.openwallet.app.ui.components.SettingRow
import org.openwallet.app.ui.components.SwitchRow
import org.openwallet.app.ui.components.WTopBar

@Composable
private fun Status(label: String, value: String, good: Boolean?) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Text(value, color = when (good) { true -> MaterialTheme.colorScheme.tertiary; false -> MaterialTheme.colorScheme.error; else -> MaterialTheme.colorScheme.onSurfaceVariant }, fontWeight = FontWeight.Medium)
    }
}

@Composable private fun Head(t: String) = Text(t, Modifier.padding(start = 16.dp, top = 20.dp, bottom = 4.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)

/** Settings › Payments & NFC: shows what this phone can really do. No switch here pretends to work. */
@Composable
fun PaymentsNfcScreen(act: Activity, caps: NfcCaps, onBack: () -> Unit, onReader: () -> Unit, onRefresh: () -> Unit, authenticate: (String, () -> Unit) -> Unit) {
    var testOn by remember { mutableStateOf(TestCredential.isEnabled(act)) }
    var cred by remember { mutableStateOf(TestCredential.load(act)) }
    var showKey by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        WTopBar("Payments & NFC", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 40.dp)) {
            Head("This phone")
            Status("NFC hardware", if (caps.hasNfc) "Yes" else "Not available", caps.hasNfc)
            if (caps.hasNfc) Status("NFC", if (caps.enabled) "On" else "Off", caps.enabled)
            if (caps.hasNfc && !caps.enabled) TextButton({ act.startActivity(Intent(Settings.ACTION_NFC_SETTINGS)) }, Modifier.padding(horizontal = 8.dp)) { Text("Open NFC settings") }
            Status("Card emulation (HCE)", if (caps.hasHce) "Supported" else "Not supported", caps.hasHce)
            Status("Wallet app role", if (!caps.walletRoleAvailable) "Not on this Android version" else if (caps.walletRoleHeld) "Open Wallet" else "Another app", if (caps.walletRoleAvailable) caps.walletRoleHeld else null)
            Status("Default contactless payment app", if (caps.defaultPaymentIsUs) "Open Wallet" else "Not Open Wallet", null)
            Head("Contactless bank payments")
            Box(Modifier.fillMaxWidth().padding(16.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(16.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Not yet available: issuer or partner integration required", fontWeight = FontWeight.Medium)
                    Text("Paying by tapping your phone needs a payment token issued for this phone by your bank through a certified token service provider, payment-network (Visa, Mastercard, RuPay, Amex…) approval, security certification and a commercial agreement. A photo or the printed card number can’t be used to pay, and Open Wallet will never send a card number over NFC.",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Payment provider: ${caps.paymentProvider?.name ?: "none configured"}", style = MaterialTheme.typography.bodyMedium)
                    Button({}, enabled = false) { Text("Set up contactless payments") }
                    OutlinedButton({}, enabled = false) { Text("Make Open Wallet the default wallet app") }
                    Text("These turn on only when a certified payment partner is integrated. Becoming the default wallet app alone wouldn’t enable payments.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Head("NFC tags")
            SettingRow("search", "Read an NFC tag", if (caps.hasNfc) "Shows the text or link stored on a tag (NDEF). Bank, transit and access cards aren’t read" else "This phone has no NFC", enabled = caps.hasNfc && caps.enabled, onClick = onReader)
            Head("NFC access credentials")
            Text("Real door, hotel, campus or transit credentials work only when their operator issues them to Open Wallet. No operator is connected yet.", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SwitchRow("lock", "Developer test credential", if (caps.hasHce) "For testing with a reader you program yourself. Not accepted by any real reader" else "Needs card emulation, which this phone doesn’t support",
                testOn, enabled = caps.hasHce) { on ->
                authenticate(if (on) "Turn on the test credential" else "Turn off the test credential") {
                    if (on && cred == null) cred = TestCredential.create(act)
                    TestCredential.setEnabled(act, on); testOn = on; onRefresh()
                }
            }
            cred?.let { c ->
                Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Test AID F04F50454E57414C4C4554 · responds only while the phone is unlocked", style = MaterialTheme.typography.bodySmall)
                    Text("Credential ID ${c.id.joinToString("") { "%02X".format(it) }} · counter ${c.counter}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
                    if (showKey) Text("Reader key ${c.key.joinToString("") { "%02X".format(it) }}", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
                    Row {
                        TextButton({ if (showKey) showKey = false else authenticate("Show the reader key") { showKey = true } }) { Text(if (showKey) "Hide reader key" else "Show reader key") }
                        TextButton({ confirmDelete = true }) { Text("Delete credential", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
            Notice("Device authentication: protected actions need your fingerprint, face or screen lock, and NFC credentials answer only while the phone is unlocked. Nothing is sent over NFC unless you turn a credential on. Tags are read only while the reader screen is open.", "shield")
        }
    }
    if (confirmDelete) ConfirmDialog("Delete the test credential?", "Its key is erased from this phone. Readers you programmed with it will stop accepting it.", "Delete", true, { confirmDelete = false }) {
        TestCredential.delete(act); cred = null; testOn = false; showKey = false; onRefresh()
    }
}

/** NFC reader mode, active only while this screen is open. */
@Composable
fun NfcReaderScreen(act: Activity, onBack: () -> Unit, onSave: (TagRead) -> Unit) {
    var read by remember { mutableStateOf<TagRead?>(null) }
    DisposableEffect(Unit) {
        val adapter = NfcAdapter.getDefaultAdapter(act)
        adapter?.enableReaderMode(act, { tag -> val r = runCatching { TagReader.read(tag) }.getOrNull(); act.runOnUiThread { read = r } }, TagReader.FLAGS, null)
        onDispose { adapter?.disableReaderMode(act) }
    }
    Column(Modifier.fillMaxSize()) {
        WTopBar("Read an NFC tag", onBack)
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val r = read
            if (r == null) {
                Ic("search", size = 48.dp)
                Text("Hold an NFC tag (for example a sticker or poster tag) against the back of your phone.", style = MaterialTheme.typography.titleMedium)
                Text("Reading a tag only shows what’s stored on it. It isn’t the same as storing a credential or making a payment.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text("Tag found", style = MaterialTheme.typography.titleLarge)
                Text("Type: ${r.techs.joinToString()} · ID ${r.idMasked}", style = MaterialTheme.typography.bodyMedium)
                if (r.protectedCard) Notice("This looks like a protected smart card (for example a bank, transit or access card). Open Wallet doesn’t read or copy these: its contents and keys belong to the card’s issuer.", "lock", warn = true, modifier = Modifier.padding(0.dp))
                r.records.forEach { (k, v) -> Column { Text(k, style = MaterialTheme.typography.labelMedium); Text(v, style = MaterialTheme.typography.bodyLarge) } }
                if (r.records.isEmpty() && !r.protectedCard) Text("This tag has no readable content.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (r.records.isNotEmpty()) Button({ onSave(r) }) { Text("Save as a pass") }
                    OutlinedButton({ read = null }) { Text("Read another") }
                }
            }
        }
    }
}
