package org.openwallet.app.ui

import org.openwallet.app.data.Catalog
import org.openwallet.app.data.StoredFile
import org.openwallet.app.domain.Codes
import org.openwallet.app.domain.ScanKind
import org.openwallet.app.domain.ScanResult
import org.openwallet.app.ui.screens.Prefill

/** Pre-filled payment card from a scan. `prefix` lives only in memory until the form is saved. */
data class CardPrefill(
    val issuerId: String = "", val productId: String = "", val networkId: String = "", val prefix: String = "", val last4: String = "", val holder: String = "",
    val expiry: String = "", val kind: String = "credit", val note: String = "", val alternatives: List<Pair<String, Int>> = emptyList()
)

/** Pre-filled vault document from a scan or import. Images are encrypted into the vault only when saved. */
data class DocPrefill(val typeId: String, val number: String = "", val holder: String = "", val images: List<Pair<String, ByteArray>> = emptyList(), val note: String = "")

sealed class Route {
    data class Card(val p: CardPrefill) : Route()
    data class Pass(val p: Prefill) : Route()
    data class Doc(val p: DocPrefill) : Route()
    data class Choose(val p: Prefill) : Route()
}

object ScanFlow {
    /** Builds the next screen's data from a recognition result. Every value is a suggestion shown for review. */
    fun route(cat: Catalog, r: ScanResult, original: StoredFile?, docImages: List<Pair<String, ByteArray>>, sourceLabel: String): Route {
        val codeNote = r.barcode?.let { " A ${Codes.label(it.format)} was read and kept exactly." } ?: ""
        return when (r.kind) {
            ScanKind.PAYMENT -> {
                val g = r.payment!!
                val top = g.issuers.firstOrNull()
                Route.Card(CardPrefill(
                    issuerId = top?.takeIf { it.second >= 80 }?.first?.id ?: "", productId = if ((top?.second ?: 0) >= 80) g.productId ?: "" else "",
                    networkId = g.networkId ?: "", prefix = g.prefix, last4 = g.last4, holder = g.holder ?: "",
                    expiry = if (g.expMonth != null && g.expYear != null) "%02d/%02d".format(g.expMonth, g.expYear % 100) else "", kind = g.kind ?: "credit",
                    note = "Read from your $sourceLabel on this phone. Check every field. The full card number and security code weren’t kept, and the photo wasn’t saved." +
                        (if (top != null && top.second < 80) " The bank looked like ${top.first.name}, but that isn’t certain, so choose it yourself." else "") +
                        " This is a display copy: it isn’t verified by your bank and can’t pay.",
                    alternatives = g.issuers.map { it.first.id to it.second }))
            }
            ScanKind.ID_DOCUMENT -> Route.Doc(DocPrefill(r.docTypeId ?: "XX.other", r.docNumber.orEmpty(), r.holder.orEmpty(), docImages,
                "Looks like a ${cat.docType(r.docTypeId)?.name ?: "document"}. Read on this phone: check every detail. It’s saved as a personal copy, not a verified ID."))
            ScanKind.GIFT, ScanKind.LOYALTY, ScanKind.TRANSIT -> {
                val t = when (r.kind) { ScanKind.GIFT -> "gift"; ScanKind.TRANSIT -> "transit"; else -> "loyalty" }
                val f = buildMap {
                    r.memberNumber?.let { put("number", it) }
                    if (t == "loyalty") r.holder?.let { put("member", it) }
                    if (t == "transit") put("passType", "Card")
                    r.expiry?.let { put("validTo", it) }
                }
                Route.Pass(Prefill(t, r.provider?.takeIf { r.providerConfidence >= 60 }?.id ?: "", f, r.barcode?.text ?: "", r.barcode?.format ?: "none", "import", "import", "", original,
                    "Read from your $sourceLabel on this phone.$codeNote Check the details. Balances and points aren’t read: add them yourself if you want."))
            }
            ScanKind.TICKET -> {
                val b = r.booking
                val bcbp = r.barcode?.let { Bcbp.parse(it.text) }
                val template = if (bcbp != null) "flight" else b?.template ?: "generic"
                val fields = (b?.fields ?: emptyMap()) + (bcbp ?: emptyMap())
                Route.Pass(Prefill(template, b?.provider ?: bcbp?.get("_carrier")?.let { c -> cat.providers.firstOrNull { it.cat == "flight" && it.iata == c }?.id } ?: "",
                    fields.filterKeys { !it.startsWith("_") }, r.barcode?.text ?: "", r.barcode?.format ?: "none", "import", "import", "", original,
                    "Read from your $sourceLabel on this phone.$codeNote Only details found on the ticket are filled in. Check them before saving."))
            }
            else -> Route.Choose(Prefill("generic", code = r.barcode?.text ?: "", codeFormat = r.barcode?.format ?: "none", codeSource = "import", source = "import", original = original,
                note = "We couldn’t tell what this is.$codeNote Choose the type and add the details."))
        }
    }

    /** A code scanned on its own (camera or image): boarding-pass barcodes are parsed; other payloads are kept as they are. */
    fun routeCode(cat: Catalog, code: Codes.Read): Route {
        val bcbp = Bcbp.parse(code.text)
        if (bcbp != null) return Route.Pass(Prefill("flight", cat.providers.firstOrNull { it.cat == "flight" && it.iata == bcbp["_carrier"] }?.id ?: "", bcbp.filterKeys { !it.startsWith("_") },
            code.text, code.format, "import", "import", note = "Boarding-pass barcode read on this phone and kept exactly. Date, gate and times aren’t in the barcode: add them from your pass."))
        return Route.Choose(Prefill("generic", code = code.text, codeFormat = code.format, codeSource = "import", source = "import",
            note = "${Codes.label(code.format)} read and kept exactly. Choose what it is and add the details."))
    }
}

/** IATA Bar Coded Boarding Pass (Resolution 792) mandatory fields, first leg. */
object Bcbp {
    fun parse(s: String): Map<String, String>? {
        if (s.length < 58 || s[0] != 'M' || !s[1].isDigit()) return null
        val name = s.substring(2, 22).trim(); val pnr = s.substring(23, 30).trim()
        val from = s.substring(30, 33); val to = s.substring(33, 36); val carrier = s.substring(36, 39).trim()
        val flight = s.substring(39, 44).trim().trimStart('0'); val seat = s.substring(48, 52).trim().trimStart('0')
        if (!from.all { it.isLetter() } || !to.all { it.isLetter() }) return null
        val (last, first) = name.split('/').let { (it.getOrNull(0) ?: "") to (it.getOrNull(1) ?: "") }
        return buildMap {
            put("passenger", listOf(first, last).filter { it.isNotBlank() }.joinToString(" ") { w -> w.lowercase().split(' ').joinToString(" ") { it.replaceFirstChar(Char::uppercase) } })
            put("ref", pnr); put("from", from); put("to", to); put("flightNo", "$carrier $flight".trim()); if (seat.isNotEmpty()) put("seat", seat); put("_carrier", carrier)
        }
    }
}
