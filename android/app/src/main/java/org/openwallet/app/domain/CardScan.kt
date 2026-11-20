package org.openwallet.app.domain

import org.openwallet.app.data.Catalog
import org.openwallet.app.data.Issuer
import org.openwallet.app.data.Provider
import java.time.Instant

/**
 * Turns on-device OCR text (and any barcode found) from a photographed card or document into
 * confidence-ranked suggestions. Everything here is a suggestion the person confirms; nothing is
 * a verification.
 *
 * Payment cards: a Luhn-valid number is used only in memory to derive the network prefix (first
 * 6–8 digits) and the last 4 digits. The full number is never returned. Security codes (CVV/CVC/
 * CID) are never extracted: any digits next to those labels are removed before parsing.
 */
enum class ScanKind(val label: String) {
    PAYMENT("Payment card"), LOYALTY("Loyalty or membership card"), GIFT("Gift card"), TRANSIT("Transport card"),
    ID_DOCUMENT("ID or document"), TICKET("Ticket or booking"), UNKNOWN("Something else")
}

data class PaymentGuess(
    val prefix: String, val last4: String, val networkId: String?, val expMonth: Int?, val expYear: Int?, val holder: String?,
    val issuers: List<Pair<Issuer, Int>>, val productId: String?, val kind: String?
)

data class ScanResult(
    val kind: ScanKind, val confidence: Int, val payment: PaymentGuess? = null, val provider: Provider? = null, val providerConfidence: Int = 0,
    val memberNumber: String? = null, val holder: String? = null, val expiry: String? = null, val docTypeId: String? = null,
    val docNumber: String? = null, val booking: Booking? = null, val barcode: Codes.Read? = null, val reasons: List<String> = emptyList()
)

object CardScan {
    private val PAN = Regex("(?<![\\d])(?:\\d[ \\-]?){12,18}\\d(?![\\d])")
    private val EXP_LABELLED = Regex("(?:VALID\\s*THRU|VALID\\s*TILL|GOOD\\s*THRU|EXP(?:IRY|IRES)?|VALID\\s*UPTO|VALID\\s*UNTIL)[^0-9]{0,12}(0[1-9]|1[0-2])\\s*[/\\-]\\s*(\\d{2,4})", RegexOption.IGNORE_CASE)
    private val EXP_ANY = Regex("(?<![\\d/])(0[1-9]|1[0-2])\\s*/\\s*(\\d{2}|20\\d{2})(?![\\d/])")
    private val CVV = Regex("(?:CVV2?|CVC2?|CID|CSC|SECURITY\\s*CODE)\\s*[:#]?\\s*\\d{3,4}", RegexOption.IGNORE_CASE)
    private val NETWORK_WORDS = listOf("visa" to "visa", "mastercard" to "mastercard", "rupay" to "rupay", "american express" to "amex", "amex" to "amex",
        "discover" to "discover", "jcb" to "jcb", "unionpay" to "unionpay", "diners club" to "diners", "maestro" to "maestro")
    private val NAME_STOP = setOf("VALID", "THRU", "FROM", "DEBIT", "CREDIT", "PREPAID", "BANK", "CARD", "PLATINUM", "GOLD", "TITANIUM", "SIGNATURE", "WORLD", "ELITE",
        "INFINITE", "MEMBER", "SINCE", "VISA", "MASTERCARD", "RUPAY", "EXPRESS", "AMERICAN", "INTERNATIONAL", "CLASSIC", "BUSINESS", "CORPORATE", "ELECTRONIC", "USE", "ONLY")

    fun luhn(d: String): Boolean {
        if (d.length !in 12..19) return false
        var sum = 0; var dbl = false
        for (i in d.length - 1 downTo 0) { var n = d[i] - '0'; if (dbl) { n *= 2; if (n > 9) n -= 9 }; sum += n; dbl = !dbl }
        return sum % 10 == 0
    }

    /** Removes security-code digits before anything else looks at the text. */
    fun scrub(text: String) = CVV.replace(text, "[security code removed]")

    private val DOC_RULES: List<Pair<String, List<Regex>>> = listOf(
        "IN.aadhaar" to listOf(Regex("aadhaar|unique identification authority|आधार", RegexOption.IGNORE_CASE)),
        "IN.pan" to listOf(Regex("income tax department|permanent account number", RegexOption.IGNORE_CASE)),
        "IN.voter" to listOf(Regex("election commission of india", RegexOption.IGNORE_CASE)),
        "IN.abha" to listOf(Regex("ayushman bharat|\\bABHA\\b", RegexOption.IGNORE_CASE)),
        "IN.rc" to listOf(Regex("registration certificate", RegexOption.IGNORE_CASE)),
        "IN.dl" to listOf(Regex("driving licen[cs]e", RegexOption.IGNORE_CASE), Regex("india|union of india|transport department", RegexOption.IGNORE_CASE)),
        "AE.eid" to listOf(Regex("united arab emirates", RegexOption.IGNORE_CASE), Regex("identity card|resident identity|ID Number", RegexOption.IGNORE_CASE)),
        "AE.dl" to listOf(Regex("united arab emirates|dubai|abu dhabi", RegexOption.IGNORE_CASE), Regex("driving licen[cs]e", RegexOption.IGNORE_CASE)),
        "SA.iqama" to listOf(Regex("kingdom of saudi arabia", RegexOption.IGNORE_CASE), Regex("resident identity|iqama", RegexOption.IGNORE_CASE)),
        "SA.nid" to listOf(Regex("kingdom of saudi arabia", RegexOption.IGNORE_CASE), Regex("national id", RegexOption.IGNORE_CASE)),
        "QA.qid" to listOf(Regex("state of qatar", RegexOption.IGNORE_CASE), Regex("residency|ID card|identity", RegexOption.IGNORE_CASE)),
        "KW.civil" to listOf(Regex("state of kuwait|kuwait", RegexOption.IGNORE_CASE), Regex("civil id", RegexOption.IGNORE_CASE)),
        "BH.cpr" to listOf(Regex("kingdom of bahrain", RegexOption.IGNORE_CASE), Regex("identity card|CPR", RegexOption.IGNORE_CASE)),
        "OM.civil" to listOf(Regex("sultanate of oman", RegexOption.IGNORE_CASE), Regex("resident card|civil|identity", RegexOption.IGNORE_CASE)),
        "US.dl" to listOf(Regex("driver'?s? licen[cs]e", RegexOption.IGNORE_CASE), Regex("\\b(DLN|CLASS|DOB)\\b", RegexOption.IGNORE_CASE)),
        "GB.dl" to listOf(Regex("driving licence", RegexOption.IGNORE_CASE), Regex("DVLA|UK|United Kingdom", RegexOption.IGNORE_CASE)),
        "XX.passport" to listOf(Regex("passport|P<[A-Z]{3}", RegexOption.IGNORE_CASE)),
        "XX.health" to listOf(Regex("health insurance|medical insurance|insurance card|member id|policy (no|number)", RegexOption.IGNORE_CASE)),
        "XX.nid" to listOf(Regex("national identity card|identity card|carte d'identit", RegexOption.IGNORE_CASE))
    )

    fun analyse(cat: Catalog, rawText: String, barcode: Codes.Read? = null, now: Instant = Instant.now()): ScanResult {
        val text = scrub(rawText)
        val norm = " ${Catalog.norm(text)} "
        val upper = text.uppercase()
        val reasons = mutableListOf<String>()

        // ---- Payment card -------------------------------------------------------------------
        val pan = PAN.findAll(text).map { it.value.filter(Char::isDigit) }.firstOrNull { luhn(it) }
        val netWord = NETWORK_WORDS.firstOrNull { (w, _) -> norm.contains(" $w ") }?.second
        val payScore = (if (pan != null) 6 else 0) + (if (netWord != null) 2 else 0) +
            (if (Regex("valid\\s*thru|good\\s*thru|debit|credit|prepaid", RegexOption.IGNORE_CASE).containsMatchIn(text)) 2 else 0)

        // ---- Documents ----------------------------------------------------------------------
        val doc = DOC_RULES.firstOrNull { (_, rules) -> rules.all { it.containsMatchIn(text) } }?.first
        val docScore = if (doc != null) 7 else 0

        // ---- Providers: loyalty / gift / transport ----------------------------------------
        fun bestProvider(cats: Set<String>): Pair<Provider, Int>? = cat.providers.filter { it.cat in cats }.mapNotNull { p ->
            val n = Catalog.norm(p.name.replace(" (India)", "").replace(Regex("gift card", RegexOption.IGNORE_CASE), ""))
            val s = Catalog.norm(p.sub)
            when {
                n.length > 2 && norm.contains(" $n ") -> p to 80
                s.length > 3 && norm.contains(" $s ") -> p to 60
                else -> null
            }
        }.maxByOrNull { it.second }
        val gift = Regex("gift\\s*card|gift\\s*voucher|e-?gift|store credit", RegexOption.IGNORE_CASE).containsMatchIn(text)
        val loyaltyWords = Regex("rewards?|loyalty|member(ship)?|points|club|privilege|frequent flyer|card no", RegexOption.IGNORE_CASE).containsMatchIn(text)
        val transitWords = Regex("metro|transit|nol|oyster|travel card|smart card|tap on|bus pass", RegexOption.IGNORE_CASE).containsMatchIn(text)

        // ---- Tickets ------------------------------------------------------------------------
        val ticketWords = Regex("boarding pass|e-?ticket|pnr|gate|seat|admit|show ?time|booking (id|ref)|platform|coach|departure|check-?in", RegexOption.IGNORE_CASE)
        val ticketScore = ticketWords.findAll(text).count() * 2
        val booking = if (ticketScore >= 2) {
            val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
            BookingEngine.detect(cat, CalEvent("scan", lines.firstOrNull().orEmpty(), lines.drop(1).joinToString("\n"), start = null))
        } else null

        // ---- Choose ------------------------------------------------------------------------
        val scores = mapOf(
            ScanKind.PAYMENT to payScore,
            ScanKind.ID_DOCUMENT to docScore,
            ScanKind.GIFT to (if (gift) 5 else 0) + (if (bestProvider(setOf("gift")) != null) 2 else 0),
            ScanKind.LOYALTY to (if (loyaltyWords) 3 else 0) + (if (bestProvider(setOf("loyalty")) != null) 3 else 0),
            ScanKind.TRANSIT to (if (transitWords) 3 else 0) + (if (bestProvider(setOf("transit")) != null) 3 else 0),
            ScanKind.TICKET to ticketScore + (if (booking != null) 3 else 0) + (if (barcode?.format == "pdf417" || barcode?.format == "aztec") 2 else 0)
        )
        val (kind, score) = scores.maxByOrNull { it.value }!!.let { if (it.value < 3) ScanKind.UNKNOWN to it.value else it.key to it.value }
        reasons += "Scores: " + scores.entries.joinToString { "${it.key.name.lowercase()} ${it.value}" }

        return when (kind) {
            ScanKind.PAYMENT -> {
                val prefix = pan?.take(minOf(8, pan.length - 4)).orEmpty()
                val last4 = pan?.takeLast(4).orEmpty()
                val net = if (prefix.isNotEmpty()) CardEngine.networkFor(cat, prefix)?.id ?: netWord else netWord
                val exp = (EXP_LABELLED.find(text) ?: EXP_ANY.find(text))?.let { m ->
                    val mo = m.groupValues[1].toInt(); val y = m.groupValues[2].toInt().let { if (it < 100) 2000 + it else it }; mo to y
                }
                val issuers = cat.issuers.mapNotNull { b ->
                    val names = listOf(b.name) + b.aliases
                    val hit = names.map { Catalog.norm(it) }.filter { it.length > 2 }.maxByOrNull { if (norm.contains(" $it ")) it.length else 0 }
                    if (hit != null && norm.contains(" $hit ")) b to (if (Catalog.norm(b.name) == hit) 85 else 65) else null
                }.sortedByDescending { it.second }.take(3)
                val product = issuers.firstOrNull()?.first?.products?.firstOrNull { p -> norm.contains(" ${Catalog.norm(p.name)} ") }?.id
                val kindWord = when { Regex("\\bdebit\\b", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "debit"; Regex("\\bprepaid\\b", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "prepaid"
                    Regex("\\bcredit\\b", RegexOption.IGNORE_CASE).containsMatchIn(text) -> "credit"; else -> null }
                ScanResult(kind, score, PaymentGuess(prefix, last4, net, exp?.first, exp?.second, holderName(upper), issuers, product, kindWord), reasons = reasons)
            }
            ScanKind.ID_DOCUMENT -> {
                val type = cat.docType(doc)
                val number = type?.pattern?.let { p ->
                    val r = Regex(p.removePrefix("^").removeSuffix("$"))
                    text.lines().asSequence().map { it.replace(" ", "").uppercase() }.mapNotNull { r.find(it)?.value }.firstOrNull()
                        ?: r.find(upper.replace(Regex("\\s+"), ""))?.value
                } ?: if (doc == "IN.aadhaar") Regex("\\d{4}\\s\\d{4}\\s\\d{4}").find(text)?.value?.replace(" ", "") else null
                ScanResult(kind, score, docTypeId = doc, docNumber = number, holder = holderName(upper), reasons = reasons)
            }
            ScanKind.GIFT, ScanKind.LOYALTY, ScanKind.TRANSIT -> {
                val cats = when (kind) { ScanKind.GIFT -> setOf("gift"); ScanKind.TRANSIT -> setOf("transit"); else -> setOf("loyalty") }
                val prov = bestProvider(cats)
                val number = barcode?.text?.takeIf { it.length in 6..40 && it.all { c -> c.isLetterOrDigit() } }
                    ?: Regex("(?<![\\dA-Z])[A-Z0-9]{0,4}\\d{6,19}(?![\\d])").findAll(upper).map { it.value }.firstOrNull { !luhn(it.filter(Char::isDigit)) || it.length < 13 }
                val exp = (EXP_LABELLED.find(text) ?: EXP_ANY.find(text))?.let { "%04d-%02d-01".format(it.groupValues[2].toInt().let { y -> if (y < 100) 2000 + y else y }, it.groupValues[1].toInt()) }
                ScanResult(kind, score, provider = prov?.first, providerConfidence = prov?.second ?: 0, memberNumber = number, holder = holderName(upper), expiry = exp, barcode = barcode, reasons = reasons)
            }
            ScanKind.TICKET -> ScanResult(kind, score, booking = booking, barcode = barcode, reasons = reasons)
            else -> ScanResult(ScanKind.UNKNOWN, score, barcode = barcode, reasons = reasons)
        }
    }

    /** A line of 2–4 alphabetic words in capitals that isn't bank or network wording. */
    fun holderName(upper: String): String? = upper.lines().map { it.trim() }.firstOrNull { line ->
        val words = line.split(Regex("\\s+")).filter { it.isNotEmpty() }
        words.size in 2..4 && words.all { w -> w.length in 1..20 && w.all { it in 'A'..'Z' || it == '.' || it == '\'' || it == '-' } } && words.none { it in NAME_STOP } && line.length in 5..32
    }?.split(Regex("\\s+"))?.joinToString(" ") { w -> w.lowercase().replaceFirstChar { it.uppercase() } }
}
