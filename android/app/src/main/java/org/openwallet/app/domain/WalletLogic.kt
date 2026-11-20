package org.openwallet.app.domain

import org.openwallet.app.data.Catalog
import org.openwallet.app.data.Issuer
import org.openwallet.app.data.Network
import org.openwallet.app.data.Product
import org.openwallet.app.data.Provider
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

// ---------------------------------------------------------------------------------------------
// GCIAE: Global Card Issuer Identification & Artwork Engine.
// Input is at most the first 8 digits plus the person's choices; the full number is never asked for.
// ---------------------------------------------------------------------------------------------
enum class MatchLevel(val text: String) {
    PRODUCT("Issuer and product: Open Wallet design in the issuer’s colours"),
    ISSUER_NETWORK("Issuer and network: Open Wallet design in the issuer’s colours"),
    ISSUER("Issuer only: Open Wallet design in the issuer’s colours"),
    NETWORK("Network only: neutral design"),
    FALLBACK("Not identified: neutral design")
}

data class CardMatch(val issuer: Issuer?, val product: Product?, val network: Network?, val level: MatchLevel, val issuerSource: String, val productNetworkMismatch: Boolean)

object CardEngine {
    fun digits(s: String) = s.filter { it.isDigit() }

    /** Longest matching published network prefix. */
    fun networkFor(cat: Catalog, prefix: String): Network? {
        val d = digits(prefix).take(8)
        if (d.isEmpty()) return null
        var best: Network? = null
        var bestLen = 0
        for (n in cat.networks) for (r in n.ranges) {
            val lo = r.substringBefore('-'); val hi = r.substringAfter('-', lo)
            val len = lo.length
            if (d.length < len) continue
            val head = d.take(len).toLong()
            if (head in lo.toLong()..hi.toLong() && len > bestLen) {
                if (n.id == "rupay" && d.startsWith("6011")) continue
                best = n; bestLen = len
            }
        }
        return best
    }

    fun identify(cat: Catalog, prefix: String = "", issuerId: String? = null, productId: String? = null, networkId: String? = null, learned: Map<String, String> = emptyMap()): CardMatch {
        val d = digits(prefix).take(8)
        var net = if (!networkId.isNullOrEmpty()) cat.network(networkId) else networkFor(cat, d)
        var iss = cat.issuer(issuerId)
        var source = if (iss != null) "chosen" else ""
        if (iss == null && d.length >= 6) {
            for (len in listOf(8, 7, 6)) {
                if (d.length < len) continue
                val p = d.take(len)
                learned[p]?.let { iss = cat.issuer(it); source = "learned" }
                if (iss != null) break
                cat.issuers.firstOrNull { p in it.iins }?.let { iss = it; source = "catalogue" }
                if (iss != null) break
            }
        }
        val locked = iss?.networkLocked
        if (locked != null && networkId.isNullOrEmpty()) net = cat.network(locked)
        val prod = iss?.products?.firstOrNull { it.id == productId }
        val level = when {
            iss != null && prod != null -> MatchLevel.PRODUCT
            iss != null && net != null -> MatchLevel.ISSUER_NETWORK
            iss != null -> MatchLevel.ISSUER
            net != null -> MatchLevel.NETWORK
            else -> MatchLevel.FALLBACK
        }
        val mismatch = prod != null && net != null && prod.networks.isNotEmpty() && net.id !in prod.networks
        return CardMatch(iss, prod, net, level, source, mismatch)
    }
}

// ---------------------------------------------------------------------------------------------
// Pass-type recognition and calendar booking detection. Fills only fields found in the text.
// ---------------------------------------------------------------------------------------------
data class CalEvent(val id: String, val title: String, val description: String = "", val location: String = "", val organizer: String = "",
                    val start: Instant?, val end: Instant? = null, val allDay: Boolean = false, val cancelled: Boolean = false)

data class Booking(val template: String, val provider: String?, val fields: Map<String, String>, val missing: List<String>, val confidence: Int)

object BookingEngine {
    private fun rx(s: String) = Regex(s, RegexOption.IGNORE_CASE)
    private val FLIGHT = rx("\\b(flight|boarding|airlines?|airways|PNR|e-?ticket|baggage)\\b")
    private val FLIGHT_NO = Regex("\\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\\s?(\\d{2,4})\\b")
    private val IATA = Regex("\\b([A-Z]{3})\\s*(?:→|->|–|-|to)\\s*([A-Z]{3})\\b")
    private val TRAIN = rx("\\b(train|rail(way)?|coach\\s?[A-Z]?\\d|berth|platform|IRCTC|express|shatabdi|rajdhani|vande bharat|amtrak|eurostar)\\b")
    private val BUS = rx("\\b(bus|coach ticket|RTC|redbus|flixbus|greyhound|megabus|boarding point)\\b")
    private val FERRY = rx("\\b(ferry|cruise|vessel|embark(ation)?|port)\\b")
    private val MOVIE = rx("\\b(movie|cinema|film|screen\\s?\\d+|IMAX|4DX|PVR|INOX|showtime|audi(torium)?)\\b")
    private val HOTEL = rx("\\b(hotel|check-?in|check-?out|reservation at|stay at|resort|room type|nights?)\\b")
    private val SPORTS = rx("\\b(match|vs\\.?|stadium|kick-?off|fixture|cricket|football|IPL)\\b")
    private val EVENT = rx("\\b(concert|festival|tickets?|theatre|theater|show|gig|exhibition|museum|live)\\b")
    private val PARKING = rx("\\b(parking|car park|valet)\\b")
    private val TAXI = rx("\\b(taxi|cab|uber|careem|ola|rapido|lyft|bolt|indrive|ride to|pick-?up)\\b")
    private val AMUSE = rx("\\b(theme park|amusement|water ?park|roller ?coaster|funfair|adventure park)\\b")
    private val ENTRY = rx("\\b(entry|admission|museum|monument|zoo|gallery|observation deck|aquarium)\\b")
    private val REF = rx("\\b(?:PNR|booking\\s*(?:id|ref(?:erence)?|no\\.?|number)|confirmation\\s*(?:code|no\\.?|number|#)?|ref(?:erence)?\\s*(?:no\\.?|#)?|order\\s*(?:id|no\\.?|#))\\s*[:#-]?\\s*([A-Z0-9]{5,12})\\b")
    private val SEAT = rx("\\bseats?\\s*[:#-]?\\s*([A-Z]?\\d{1,3}[A-Z]?(?:\\s*,\\s*[A-Z]?\\d{1,3}[A-Z]?)*)\\b")
    private val GATE = rx("\\bgate\\s*[:#-]?\\s*([A-Z]?\\d{1,3}[A-Z]?)\\b")
    private val TERMINAL = rx("\\bterminal\\s*[:#-]?\\s*([A-Z0-9]{1,3})\\b")
    private val TRAIN_NO = rx("\\b(?:train\\s*(?:no\\.?|number|#)?\\s*[:#-]?\\s*)(\\d{4,5})\\b")
    private val ROW = rx("\\brow\\s*[:#-]?\\s*([A-Z]{1,2}|\\d{1,3})\\b")
    private val SCREEN = rx("\\b(screen|audi(?:torium)?)\\s*[:#-]?\\s*(\\d{1,2}|[A-Z])\\b")
    private val ROUTE = rx("(.+?)\\s+(?:to|→|->)\\s+(.+)")
    private val MEETING = rx("\\b(meeting|sync|standup|stand-up|1:1|one-on-one|call|zoom|teams|google meet|interview|review|lunch with|catch ?up|webinar|class|lecture|dentist|doctor|appointment|birthday|reminder)\\b")

    data class Recognition(val best: String?, val score: Int, val provider: Provider?)

    fun recognise(cat: Catalog, text: String): Recognition {
        val s = mutableMapOf<String, Int>()
        fun bump(k: String, n: Int) { s[k] = (s[k] ?: 0) + n }
        if (FLIGHT.containsMatchIn(text)) bump("flight", 2)
        if (IATA.containsMatchIn(text)) bump("flight", 2)
        if (TRAIN.containsMatchIn(text)) bump("train", 3)
        if (BUS.containsMatchIn(text)) bump("bus", 3)
        if (FERRY.containsMatchIn(text)) bump("ferry", 2)
        if (MOVIE.containsMatchIn(text)) bump("movie", 3)
        if (HOTEL.containsMatchIn(text)) bump("hotel", 3)
        if (SPORTS.containsMatchIn(text)) bump("sports", 2)
        if (EVENT.containsMatchIn(text)) bump("event", 2)
        if (PARKING.containsMatchIn(text)) bump("parking", 3)
        if (TAXI.containsMatchIn(text)) bump("taxi", 3)
        if (AMUSE.containsMatchIn(text)) bump("amusement", 4)
        if (ENTRY.containsMatchIn(text)) bump("entry", 2)
        val nt = " ${Catalog.norm(text)} "
        var prov: Provider? = null
        for (p in cat.providers) {
            if (p.cat !in setOf("flight", "train", "bus", "ferry", "movie", "hotel", "event", "parking", "taxi", "entry", "amusement")) continue
            val n = Catalog.norm(p.name)
            if (n.length > 2 && nt.contains(" $n ")) {
                bump(p.cat, 4)
                if (prov == null || n.length > Catalog.norm(prov.name).length) prov = p
            }
        }
        val best = s.maxByOrNull { it.value }
        return Recognition(best?.key, best?.value ?: 0, prov)
    }

    private val DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    private val TIME = DateTimeFormatter.ofPattern("HH:mm")

    fun detect(cat: Catalog, ev: CalEvent, zone: ZoneId = ZoneId.systemDefault()): Booking? {
        val text = listOf(ev.title, ev.description, ev.location, ev.organizer).filter { it.isNotBlank() }.joinToString("\n")
        val rec = recognise(cat, text)
        val ref = REF.find(text)?.groupValues?.get(1).orEmpty()
        val meeting = MEETING.containsMatchIn(ev.title)
        val confidence = rec.score + (if (ref.isNotEmpty()) 3 else 0) + (if (rec.provider != null) 1 else 0) - (if (meeting) 6 else 0)
        val template = rec.best ?: return null
        if (confidence < 4) return null
        val f = linkedMapOf<String, String>()
        ev.start?.let { val t = LocalDateTime.ofInstant(it, if (ev.allDay) ZoneOffset.UTC else zone); f["date"] = t.format(DATE); if (!ev.allDay) f["time"] = t.format(TIME) }
        if (ref.isNotEmpty()) f["ref"] = ref.uppercase()
        SEAT.find(text)?.let { f["seat"] = it.groupValues[1].uppercase() }
        val endLocal = ev.end?.let { LocalDateTime.ofInstant(it, if (ev.allDay) ZoneOffset.UTC else zone) }
        val route = ROUTE.find(ev.title)
        when (template) {
            "flight" -> {
                IATA.find(text)?.let { f["from"] = it.groupValues[1]; f["to"] = it.groupValues[2] }
                (FLIGHT_NO.find(ev.title) ?: FLIGHT_NO.find(text))?.let { f["flightNo"] = it.groupValues[1] + it.groupValues[2] }
                GATE.find(text)?.let { f["gate"] = it.groupValues[1].uppercase() }
                TERMINAL.find(text)?.let { f["terminal"] = it.groupValues[1].uppercase() }
                if (endLocal != null && !ev.allDay) f["arrive"] = endLocal.format(TIME)
            }
            "train" -> {
                TRAIN_NO.find(text)?.let { f["trainNo"] = it.groupValues[1] }
                route?.let { f["from"] = it.groupValues[1].replace(Regex("^.*(train|rail)\\s*", RegexOption.IGNORE_CASE), "").trim(); f["to"] = it.groupValues[2].trim() }
                if (endLocal != null && !ev.allDay) f["arrive"] = endLocal.format(TIME)
            }
            "taxi" -> route?.let { f["from"] = it.groupValues[1].replace(Regex("^.*(taxi|cab|ride)\\s*(from)?\\s*", RegexOption.IGNORE_CASE), "").trim(); f["to"] = it.groupValues[2].trim() }
            "entry", "amusement" -> { f["title"] = ev.title.trim(); if (ev.location.isNotBlank()) f["venue"] = ev.location }
            "bus", "ferry" -> route?.let { f["from"] = it.groupValues[1].replace(Regex("^.*(bus|ferry)\\s*", RegexOption.IGNORE_CASE), "").trim(); f["to"] = it.groupValues[2].trim() }
            "movie" -> {
                f["title"] = ev.title.replace(Regex("^(movie|cinema)\\s*[:\\-–]\\s*", RegexOption.IGNORE_CASE), "").replace(Regex("\\s*[@|].*$"), "").trim()
                if (ev.location.isNotBlank()) f["branch"] = ev.location
                SCREEN.find(text)?.let { f["screen"] = it.groupValues[2] }
                ROW.find(text)?.let { f["row"] = it.groupValues[1] }
            }
            "hotel" -> {
                f["property"] = ev.title.replace(Regex("^(stay at|hotel|reservation at)\\s*[:\\-–]?\\s*", RegexOption.IGNORE_CASE), "").trim()
                if (ev.location.isNotBlank()) f["address"] = ev.location
                endLocal?.let { f["checkout"] = it.format(DATE) }
            }
            "event", "sports" -> { f["title"] = ev.title.trim(); if (ev.location.isNotBlank()) f["venue"] = ev.location }
            "parking" -> f["facility"] = ev.location.ifBlank { ev.title }
        }
        val req = cat.template(template).fields.filter { it.req }.map { it.k }
        return Booking(template, rec.provider?.id, f.filterValues { it.isNotBlank() }, req.filter { f[it].isNullOrBlank() }, minOf(10, confidence))
    }

    /** Minimal RFC 5545 reader: VEVENT UID, SUMMARY, DESCRIPTION, LOCATION, DTSTART, DTEND, ORGANIZER, STATUS. */
    fun parseIcs(text: String, zone: ZoneId = ZoneId.systemDefault()): List<CalEvent> {
        val lines = text.replace(Regex("\r?\n[ \t]"), "").split(Regex("\r?\n"))
        val out = mutableListOf<CalEvent>()
        var cur: MutableMap<String, String>? = null
        var allDay = false
        fun unesc(v: String) = v.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
        fun time(v: String): Instant? {
            val m = Regex("^(\\d{4})(\\d{2})(\\d{2})(?:T(\\d{2})(\\d{2})(\\d{2})?(Z)?)?$").find(v) ?: return null
            val g = m.groupValues
            if (g[4].isEmpty()) return LocalDate.of(g[1].toInt(), g[2].toInt(), g[3].toInt()).atStartOfDay(ZoneOffset.UTC).toInstant()
            val ldt = LocalDateTime.of(g[1].toInt(), g[2].toInt(), g[3].toInt(), g[4].toInt(), g[5].toInt(), g[6].ifEmpty { "0" }.toInt())
            return if (g[7] == "Z") ldt.toInstant(ZoneOffset.UTC) else ldt.atZone(zone).toInstant()
        }
        for (line in lines) {
            if (line == "BEGIN:VEVENT") { cur = mutableMapOf(); allDay = false; continue }
            if (line == "END:VEVENT") {
                cur?.let { c ->
                    val id = c["UID"]; val start = c["DTSTART"]?.let(::time)
                    if (id != null && start != null) out += CalEvent("ics:$id", unesc(c["SUMMARY"].orEmpty()), unesc(c["DESCRIPTION"].orEmpty()).take(2000),
                        unesc(c["LOCATION"].orEmpty()), c["ORGANIZER"].orEmpty(), start, c["DTEND"]?.let(::time), allDay, c["STATUS"] == "CANCELLED")
                }
                cur = null; continue
            }
            val c = cur ?: continue
            val i = line.indexOf(':'); if (i < 0) continue
            val head = line.substring(0, i); val v = line.substring(i + 1)
            val name = head.substringBefore(';'); val params = head.substringAfter(';', "")
            when (name) {
                "DTSTART" -> { c[name] = v; allDay = !v.contains('T') }
                "ORGANIZER" -> c[name] = Regex("CN=([^;:]+)").find(params)?.groupValues?.get(1).orEmpty()
                "UID", "SUMMARY", "DESCRIPTION", "LOCATION", "DTEND", "STATUS" -> c[name] = v
            }
        }
        return out
    }
}

// ---------------------------------------------------------------------------------------------
// Masking and document-number checks (format only: never a verification).
// ---------------------------------------------------------------------------------------------
object DocChecks {
    fun mask(value: String, rule: String = "last4"): String {
        if (value.isEmpty() || rule == "none") return value
        val clean = value.replace(Regex("[\\s-]"), "")
        if (clean.length <= 4) return "•".repeat(clean.length)
        val groups = (clean.length - 4 + 3) / 4
        return List(groups) { "XXXX" }.joinToString(" ") + " " + clean.takeLast(4)
    }

    private val D = arrayOf(intArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 9), intArrayOf(1, 2, 3, 4, 0, 6, 7, 8, 9, 5), intArrayOf(2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
        intArrayOf(3, 4, 0, 1, 2, 8, 9, 5, 6, 7), intArrayOf(4, 0, 1, 2, 3, 9, 5, 6, 7, 8), intArrayOf(5, 9, 8, 7, 6, 0, 4, 3, 2, 1), intArrayOf(6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
        intArrayOf(7, 6, 5, 9, 8, 2, 1, 0, 4, 3), intArrayOf(8, 7, 6, 5, 9, 3, 2, 1, 0, 4), intArrayOf(9, 8, 7, 6, 5, 4, 3, 2, 1, 0))
    private val P = arrayOf(intArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 9), intArrayOf(1, 5, 7, 6, 2, 8, 3, 0, 9, 4), intArrayOf(5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
        intArrayOf(8, 9, 1, 6, 0, 4, 3, 5, 2, 7), intArrayOf(9, 4, 5, 3, 1, 2, 6, 8, 7, 0), intArrayOf(4, 2, 8, 6, 5, 7, 3, 9, 0, 1), intArrayOf(2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
        intArrayOf(7, 0, 4, 6, 9, 1, 3, 2, 5, 8))

    fun verhoeffValid(num: String): Boolean {
        val d = num.filter { it.isDigit() }
        if (d.isEmpty()) return false
        var c = 0
        d.reversed().forEachIndexed { i, ch -> c = D[c][P[i % 8][ch - '0']] }
        return c == 0
    }

    /** "" when fine, otherwise a message. */
    fun check(type: org.openwallet.app.data.DocType, value: String): String {
        val v = value.trim().uppercase()
        if (v.isEmpty()) return ""
        if (type.pattern != null && !Regex(type.pattern).matches(v)) return "This doesn’t look like a ${type.numberLabel.lowercase()}. Check it and try again"
        if (type.check == "verhoeff" && !verhoeffValid(v)) return "This number fails the Aadhaar check digit. Check it for typing mistakes"
        return ""
    }
}

object Money {
    fun format(amount: Double, currency: String): String = runCatching {
        java.text.NumberFormat.getCurrencyInstance().apply { this.currency = java.util.Currency.getInstance(currency) }.format(amount)
    }.getOrDefault("%.2f %s".format(amount, currency))

    /** null when OK. */
    fun validate(s: String, allowEmpty: Boolean = true): String? {
        val t = s.trim()
        if (t.isEmpty()) return if (allowEmpty) null else "Enter an amount"
        if (!Regex("^\\d+(\\.\\d{1,2})?$").matches(t)) return "Use a number like 25 or 25.50"
        if (t.toDouble() > 10_000_000) return "That amount is too large"
        return null
    }
}
