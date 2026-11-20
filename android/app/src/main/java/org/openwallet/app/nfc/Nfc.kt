package org.openwallet.app.nfc

import android.app.Activity
import android.app.KeyguardManager
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.cardemulation.CardEmulation
import android.nfc.cardemulation.HostApduService
import android.nfc.tech.IsoDep
import android.nfc.tech.Ndef
import android.os.Build
import android.os.Bundle
import org.openwallet.app.data.Keys
import java.io.File
import java.nio.ByteBuffer
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

// =============================================================================================
// Capabilities: what this phone can actually do. Nothing here is assumed.
// =============================================================================================
data class NfcCaps(
    val hasNfc: Boolean, val enabled: Boolean, val hasHce: Boolean, val walletRoleAvailable: Boolean, val walletRoleHeld: Boolean,
    val defaultPaymentIsUs: Boolean, val paymentProvider: PaymentProvider?
)

object NfcInfo {
    const val ROLE_WALLET = "android.app.role.WALLET" // RoleManager.ROLE_WALLET (Android 15+)

    fun caps(ctx: Context): NfcCaps {
        val pm = ctx.packageManager
        val adapter = NfcAdapter.getDefaultAdapter(ctx)
        val hce = pm.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION)
        val roles = if (Build.VERSION.SDK_INT >= 29) ctx.getSystemService(RoleManager::class.java) else null
        val roleAvail = Build.VERSION.SDK_INT >= 35 && roles?.isRoleAvailable(ROLE_WALLET) == true
        val roleHeld = roleAvail && roles?.isRoleHeld(ROLE_WALLET) == true
        // Open Wallet registers no payment service until a certified provider exists, so it can't be the default payment app.
        val defaultPay = adapter != null && hce && PaymentProviders.configured?.paymentService(ctx)?.let { comp ->
            runCatching { CardEmulation.getInstance(adapter).isDefaultServiceForCategory(comp, CardEmulation.CATEGORY_PAYMENT) }.getOrDefault(false)
        } == true
        return NfcCaps(adapter != null, adapter?.isEnabled == true, hce, roleAvail, roleHeld, defaultPay, PaymentProviders.configured)
    }

    /** The Android system dialog for choosing the wallet app. Offered only when a certified provider makes the app eligible. */
    fun walletRoleIntent(ctx: Context) = if (Build.VERSION.SDK_INT >= 35) ctx.getSystemService(RoleManager::class.java)?.createRequestRoleIntent(ROLE_WALLET) else null
}

// =============================================================================================
// Payments: integration point for an issuer/network-approved provider. None is configured.
// =============================================================================================
enum class TokenState { NOT_PROVISIONED, PENDING_VERIFICATION, ACTIVE, SUSPENDED, REMOVED }

/**
 * A certified token service provider / issuer integration. Implementations must come from the
 * provider's own SDK (tokenization, device binding, cryptogram generation, lifecycle). Open Wallet
 * never stores a PAN and never emits a static PAN over NFC.
 */
interface PaymentProvider {
    val name: String
    fun paymentService(ctx: Context): ComponentName?
    suspend fun isEligible(issuerId: String, networkId: String): Boolean
    suspend fun startProvisioning(activity: Activity, cardId: String): TokenState
    suspend fun state(cardId: String): TokenState
    suspend fun suspendToken(cardId: String): TokenState
    suspend fun resumeToken(cardId: String): TokenState
    suspend fun removeToken(cardId: String): TokenState
    /** Only transactions returned by the provider; never generated locally. */
    suspend fun transactions(cardId: String): List<Pair<String, String>>
}

object PaymentProviders {
    /** Stays null until a real, certified partner SDK is integrated and approved. */
    val configured: PaymentProvider? = null
}

// =============================================================================================
// NFC reader mode: NDEF tags only. Protected smart cards (bank, transit, access) are not read.
// =============================================================================================
data class TagRead(val techs: List<String>, val idMasked: String, val records: List<Pair<String, String>>, val protectedCard: Boolean)

object TagReader {
    const val FLAGS = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V

    fun read(tag: Tag): TagRead {
        val techs = tag.techList.map { it.substringAfterLast('.') }
        val id = tag.id.joinToString("") { "%02X".format(it) }
        val masked = if (id.length > 4) "•".repeat(id.length - 4) + id.takeLast(4) else id
        val records = mutableListOf<Pair<String, String>>()
        Ndef.get(tag)?.let { ndef ->
            runCatching { ndef.connect(); val m: NdefMessage? = ndef.ndefMessage ?: ndef.cachedNdefMessage; ndef.close(); m }.getOrNull()?.records?.forEach { r -> decode(r)?.let(records::add) }
        }
        val protected = records.isEmpty() && IsoDep.get(tag) != null
        return TagRead(techs, masked, records, protected)
    }

    fun decode(r: NdefRecord): Pair<String, String>? = when {
        r.tnf == NdefRecord.TNF_WELL_KNOWN && r.type.contentEquals(NdefRecord.RTD_TEXT) -> {
            val p = r.payload; val langLen = p[0].toInt() and 0x3F; val utf16 = (p[0].toInt() and 0x80) != 0
            "Text" to String(p, 1 + langLen, p.size - 1 - langLen, if (utf16) Charsets.UTF_16 else Charsets.UTF_8)
        }
        r.tnf == NdefRecord.TNF_WELL_KNOWN && r.type.contentEquals(NdefRecord.RTD_URI) -> "Link" to (r.toUri()?.toString() ?: "")
        r.tnf == NdefRecord.TNF_MIME_MEDIA -> "Data (${String(r.type)})" to "${r.payload.size} bytes"
        else -> null
    }
}

// =============================================================================================
// Developer test access credential (Host Card Emulation).
// Proprietary test AID (F0 prefix = unregistered/proprietary range). Works only with a reader
// you program with this credential's key. It is not accepted by any real door, transit, hotel or
// payment reader, and no such reader should be configured to trust it in production.
// =============================================================================================
object AccessProtocol {
    val AID: ByteArray = hex("F04F50454E57414C4C4554") // F0 + "OPENWALLET"
    val OK = byteArrayOf(0x90.toByte(), 0x00)
    val WRONG_LENGTH = hex("6700")
    val NOT_SUPPORTED = hex("6D00")
    val CONDITIONS = hex("6985")
    val SECURITY = hex("6982")
    val NOT_FOUND = hex("6A82")

    fun hex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    /**
     * SELECT (00 A4 04 00 Lc AID) -> credentialId(8) || counter(4) || 9000
     * AUTHENTICATE (80 10 00 00 08 challenge(8)) -> counter(4) || HMAC-SHA256(key, challenge||counter||id)[0..16] || 9000
     * The counter increases on every authentication so a reader can reject replays.
     */
    class Session(private val id: ByteArray, private val key: ByteArray, private var counter: Int, private val saveCounter: (Int) -> Unit) {
        private var selected = false
        fun process(apdu: ByteArray, allowed: Boolean): ByteArray {
            if (apdu.size < 4) return WRONG_LENGTH
            val cla = apdu[0].toInt() and 0xFF; val ins = apdu[1].toInt() and 0xFF
            if (cla == 0x00 && ins == 0xA4) {
                if (apdu.size < 5) return WRONG_LENGTH
                val lc = apdu[4].toInt() and 0xFF
                if (apdu.size < 5 + lc) return WRONG_LENGTH
                if (!apdu.copyOfRange(5, 5 + lc).contentEquals(AID)) return NOT_FOUND
                if (!allowed) return SECURITY
                selected = true
                return id + ByteBuffer.allocate(4).putInt(counter).array() + OK
            }
            if (cla == 0x80 && ins == 0x10) {
                if (!selected) return CONDITIONS
                if (!allowed) return SECURITY
                if (apdu.size < 13 || (apdu[4].toInt() and 0xFF) != 8) return WRONG_LENGTH
                val challenge = apdu.copyOfRange(5, 13)
                counter += 1; saveCounter(counter)
                val c = ByteBuffer.allocate(4).putInt(counter).array()
                val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(challenge + c + id).copyOf(16)
                return c + mac + OK
            }
            return NOT_SUPPORTED
        }
        fun deactivate() { selected = false }
    }
}

/** Stores the test credential (id, key, counter) encrypted with an Android Keystore key. */
object TestCredential {
    private fun file(ctx: Context) = File(ctx.noBackupFilesDir, "hce-test.bin")
    data class Cred(val id: ByteArray, val key: ByteArray, val counter: Int)

    fun load(ctx: Context): Cred? = runCatching {
        val b = ByteBuffer.wrap(Keys.decrypt("hce", file(ctx).readBytes()))
        val id = ByteArray(8).also { b.get(it) }; val key = ByteArray(32).also { b.get(it) }; Cred(id, key, b.int)
    }.getOrNull()

    fun save(ctx: Context, c: Cred) = file(ctx).writeBytes(Keys.encrypt("hce", ByteBuffer.allocate(44).put(c.id).put(c.key).putInt(c.counter).array()))

    fun create(ctx: Context): Cred = Cred(ByteArray(8).also { SecureRandom().nextBytes(it) }, ByteArray(32).also { SecureRandom().nextBytes(it) }, 0).also { save(ctx, it) }

    fun delete(ctx: Context) { file(ctx).delete(); Keys.delete("hce"); setEnabled(ctx, false) }

    /** The HCE service (and its AID) is registered with Android only while the test credential is switched on. */
    fun setEnabled(ctx: Context, on: Boolean) {
        ctx.packageManager.setComponentEnabledSetting(ComponentName(ctx, AccessHceService::class.java),
            if (on) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
    }

    fun isEnabled(ctx: Context) = ctx.packageManager.getComponentEnabledSetting(ComponentName(ctx, AccessHceService::class.java)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
}

class AccessHceService : HostApduService() {
    private var session: AccessProtocol.Session? = null

    override fun processCommandApdu(apdu: ByteArray, extras: Bundle?): ByteArray {
        val cred = TestCredential.load(this) ?: return AccessProtocol.NOT_FOUND
        val s = session ?: AccessProtocol.Session(cred.id, cred.key, cred.counter) { n -> TestCredential.save(this, cred.copy(counter = n)) }.also { session = it }
        // Device must be unlocked: the system also enforces this (requireDeviceUnlock), this is a second check.
        val unlocked = !(getSystemService(KeyguardManager::class.java)?.isKeyguardLocked ?: true)
        return s.process(apdu, unlocked)
    }

    override fun onDeactivated(reason: Int) { session?.deactivate(); session = null }
}
