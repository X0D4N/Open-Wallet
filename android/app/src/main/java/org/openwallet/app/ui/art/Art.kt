package org.openwallet.app.ui.art

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.openwallet.app.R
import org.openwallet.app.data.CardEntity
import org.openwallet.app.data.Catalog
import org.openwallet.app.data.DocRecord
import org.openwallet.app.data.PassEntity
import org.openwallet.app.data.Provider
import org.openwallet.app.data.Template
import org.openwallet.app.domain.CardEngine
import org.openwallet.app.domain.Codes
import org.openwallet.app.domain.DocChecks
import org.openwallet.app.domain.MatchLevel
import org.openwallet.app.domain.Money
import org.openwallet.app.ui.components.Ic
import org.openwallet.app.ui.components.Logo
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

// =============================================================================================
// Payment cards: one renderer for every issuer (no bank card faces are bundled).
// =============================================================================================
@Composable
fun CardArt(cat: Catalog, c: CardEntity, modifier: Modifier = Modifier) {
    val m = remember(c) { CardEngine.identify(cat, issuerId = c.issuerId, productId = c.productId, networkId = c.networkId) }
    val iss = m.issuer
    val c1 = c.color?.let { Color(it) } ?: iss?.let { Color(it.colors[0]) } ?: Color(0xFF3C4043)
    val c2 = c.color?.let { lerp(Color(it), Color.Black, 0.35f) } ?: iss?.let { b -> Color(b.colors.getOrElse(1) { b.colors[0] }) } ?: Color(0xFF202124)
    val tier = m.product?.tier ?: if (iss != null) "issuer" else if (m.network != null) "network" else "fallback"
    val fg = when { tier == "premium" -> Color(0xFFF1EDE4); c.color != null -> if (c1.luminance() > 0.45f) Color(0xFF1B1B1B) else Color.White; iss != null -> Color(iss.fg); else -> Color.White }
    val bg = when (tier) {
        "premium" -> Brush.linearGradient(listOf(Color(0xFF26262B), Color(0xFF3B3B42), Color(0xFF17171A)))
        "network" -> Brush.linearGradient(listOf(Color(0xFF46484D), Color(0xFF24262A)))
        "fallback" -> Brush.linearGradient(listOf(c1, c2))
        "entry" -> Brush.linearGradient(listOf(c1, c1))
        else -> Brush.linearGradient(listOf(c1, lerp(c1, Color.Black, 0.25f)))
    }
    val name = iss?.name ?: c.issuerName.ifEmpty { m.network?.name ?: "Card" }
    Box(modifier.fillMaxWidth().aspectRatio(1.586f).clip(RoundedCornerShape(14.dp)).background(bg)
        .semantics { contentDescription = "$name card ending ${c.last4}" }) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width; val h = size.height
            when (tier) {
                "premium" -> {
                    drawPath(Path().apply { moveTo(0f, h * .74f); cubicTo(w * .28f, h * .6f, w * .62f, h * 1.04f, w, h * .6f); lineTo(w, h); lineTo(0f, h); close() }, c1.copy(alpha = .55f))
                }
                "mid", "issuer" -> {
                    drawPath(Path().apply { moveTo(w * .47f, 0f); cubicTo(w * .66f, h * .3f, w * .72f, h * .7f, w, h * .84f); lineTo(w, 0f); close() }, c2.copy(alpha = .55f))
                }
                "entry" -> drawPath(Path().apply { moveTo(0f, h * .7f); lineTo(w, h * .2f); lineTo(w, h * .45f); lineTo(0f, h * .95f); close() }, c2.copy(alpha = .45f))
                "network" -> for (i in 0..6) drawLine(Color.White.copy(alpha = .05f), Offset(-w * .12f + i * w * .19f, h), Offset(w * .19f + i * w * .19f, 0f), strokeWidth = w * .056f)
            }
        }
        Column(Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 16.dp)) {
            Row {
                Text(name, Modifier.weight(1f), color = fg, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(c.kind.replaceFirstChar { it.uppercase() }.uppercase(), color = fg.copy(alpha = .82f), fontSize = 11.sp, letterSpacing = .8.sp)
            }
            (m.product?.name ?: c.productId.ifEmpty { null })?.let { Text(it, color = fg.copy(alpha = .88f), fontSize = 12.sp) }
            Spacer(Modifier.weight(1f))
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("•••• ${c.last4}", color = fg, fontSize = 15.sp, letterSpacing = 1.5.sp)
                    val exp = if (c.showExpiry && c.expMonth > 0) "Exp %02d/%02d".format(c.expMonth, c.expYear % 100) else ""
                    val meta = listOf(if (c.showHolder) c.holder else "", exp).filter { it.isNotBlank() }.joinToString(" · ")
                    if (meta.isNotEmpty()) Text(meta, color = fg.copy(alpha = .85f), fontSize = 11.sp)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("DISPLAY ONLY", Modifier.clip(RoundedCornerShape(4.dp)).background(Color.Black.copy(alpha = .24f)).padding(horizontal = 5.dp, vertical = 1.dp),
                        color = Color.White, fontSize = 9.sp, letterSpacing = .6.sp)
                    m.network?.let { Text(it.name, color = fg, fontWeight = FontWeight.Bold, fontSize = 15.sp) }
                }
            }
        }
        if (c.contactless) Ic("contactless", Modifier.align(Alignment.CenterEnd).padding(end = 14.dp), tint = fg.copy(alpha = .9f))
    }
}

fun matchText(cat: Catalog, c: CardEntity) = CardEngine.identify(cat, issuerId = c.issuerId, productId = c.productId, networkId = c.networkId).level.text
fun cardName(cat: Catalog, c: CardEntity): String {
    val m = CardEngine.identify(cat, issuerId = c.issuerId, productId = c.productId, networkId = c.networkId)
    return (m.issuer?.name ?: c.issuerName.ifEmpty { m.network?.name ?: "Card" }) + (m.product?.let { " ${it.name}" } ?: "")
}
val MatchLevel.isIssuer get() = this != MatchLevel.NETWORK && this != MatchLevel.FALLBACK

// =============================================================================================
// Passes
// =============================================================================================
/** The owner-supplied illustration templates. Muted slate palette; artwork sits in the lower third. */
object Illustrations {
    val ids = listOf("flight", "train", "bus", "taxi", "ship", "entry", "amusement", "movie")
    fun label(id: String) = when (id) { "flight" -> "Flight"; "train" -> "Train"; "bus" -> "Bus"; "taxi" -> "Taxi"; "ship" -> "Ship or cruise"
        "entry" -> "Entry / exit"; "amusement" -> "Amusement & entertainment"; "movie" -> "Movies"; "none" -> "No illustration"; else -> "Automatic" }
    fun res(id: String?) = when (id) {
        "flight" -> R.drawable.tpl_flight; "train" -> R.drawable.tpl_train; "bus" -> R.drawable.tpl_bus; "taxi" -> R.drawable.tpl_taxi
        "ship" -> R.drawable.tpl_ship; "entry" -> R.drawable.tpl_entry; "amusement" -> R.drawable.tpl_amusement; "movie" -> R.drawable.tpl_movie; else -> null
    }
    /** Automatic choice by category (the person can override it per pass). */
    fun auto(template: String, provider: Provider?): String? = when (template) {
        "flight" -> "flight"; "train" -> "train"; "bus" -> "bus"; "taxi" -> "taxi"; "ferry" -> "ship"; "movie" -> "movie"
        "amusement", "event", "sports" -> "amusement"; "entry", "parking" -> "entry"
        "transit" -> if (provider != null && Regex("bus|rtc|best|mwasalat|kptc", RegexOption.IGNORE_CASE).containsMatchIn(provider.sub + " " + provider.name)) "bus" else "train"
        else -> null // purchases, gift, loyalty, hotel, generic: no supplied illustration yet
    }
    fun forPass(p: PassEntity, provider: Provider?) = when (p.art) { "" -> auto(p.template, provider); "none" -> null; else -> p.art }
    val SLATE = Color(0xFF626B8A)       // flat top colour measured from the supplied artwork
    val INK = Color(0xFFF4F5FA)
}

data class PassView(val t: Template, val prov: Provider?, val provName: String, val title: String, val sub: String, val accent: Color, val illustration: String?)

private val DATE_FMT = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
fun fmtDate(s: String): String = runCatching { LocalDate.parse(s).format(DATE_FMT) }.getOrDefault(s)
fun fmtTime(s: String): String = runCatching { LocalTime.parse(s).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)) }.getOrDefault(s)

fun passView(cat: Catalog, p: PassEntity): PassView {
    val t = cat.template(p.template)
    val prov = cat.provider(p.providerId)
    val provName = prov?.displayName ?: p.providerName
    fun route() = if (p.f("from").isNotEmpty() || p.f("to").isNotEmpty()) "${p.f("from").ifEmpty { "—" }} → ${p.f("to").ifEmpty { "—" }}" else ""
    val (title, sub) = when (p.template) {
        "flight" -> route() to listOf(provName, p.f("flightNo")).filter { it.isNotEmpty() }.joinToString(" · ")
        "train" -> route() to listOf(provName, p.f("trainName"), p.f("trainNo")).filter { it.isNotEmpty() }.joinToString(" · ")
        "bus", "ferry", "taxi" -> route() to listOf(provName, p.f("route"), p.f("vessel")).filter { it.isNotEmpty() }.joinToString(" · ")
        "transit" -> provName.ifEmpty { "Transport pass" } to listOf(p.f("passType"), prov?.city ?: "").filter { it.isNotEmpty() }.joinToString(" · ")
        "hotel" -> p.f("property").ifEmpty { provName.ifEmpty { "Hotel" } } to provName
        "parking" -> p.f("facility").ifEmpty { provName.ifEmpty { "Parking" } } to listOf(provName, p.f("vehicle")).filter { it.isNotEmpty() }.joinToString(" · ")
        "loyalty" -> provName.ifEmpty { "Loyalty card" } to listOf(prov?.sub ?: "", p.f("points").let { if (it.isEmpty()) "" else "$it pts" }).filter { it.isNotEmpty() }.joinToString(" · ")
        "gift" -> provName.ifEmpty { "Gift card" } to (p.f("balance").toDoubleOrNull()?.let { "${Money.format(it, p.currency)} (your note)" } ?: "Gift card")
        "movie" -> p.f("title").ifEmpty { "Movie" } to listOf(provName, p.f("branch")).filter { it.isNotEmpty() }.joinToString(" · ")
        else -> p.f("title").ifEmpty { provName.ifEmpty { t.label } } to listOf(p.f("venue"), p.f("subtitle"), provName).filter { it.isNotEmpty() }.joinToString(" · ")
    }
    val accent = p.color?.let { Color(it) } ?: prov?.let { Color(it.color) } ?: Illustrations.SLATE
    return PassView(t, prov, provName, title.ifEmpty { t.label }, sub, accent, Illustrations.forPass(p, prov))
}

/** Home-grid tile: brand colour, wordmark, title, and a small preview of the pass's illustration. */
@Composable
fun PassTile(cat: Catalog, p: PassEntity, badge: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val v = passView(cat, p)
    val bg = v.accent
    val fg = if (bg.luminance() > 0.45f) Color(0xFF1B1B1B) else Color.White
    Box(modifier.clip(RoundedCornerShape(20.dp)).background(bg).clickable(onClick = onClick).heightIn(min = 136.dp)) {
        Ic(org.openwallet.app.ui.components.WalletIcons.nameFor(p.template),
            Modifier.align(Alignment.BottomEnd).offset(x = 10.dp, y = 14.dp), tint = fg.copy(alpha = .13f), size = 84.dp)
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Logo(v.provName.ifEmpty { v.title }, lerp(bg, if (bg.luminance() > .4f) Color.Black else Color.White, .16f), fg, 32.dp)
                Spacer(Modifier.weight(1f))
                if (p.favorite) Ic("star", tint = fg.copy(alpha = .9f), size = 16.dp)
                if (badge.isNotEmpty()) Text(badge, Modifier.padding(start = 6.dp).clip(RoundedCornerShape(10.dp)).background(Color.Black.copy(alpha = .2f)).padding(horizontal = 8.dp, vertical = 2.dp),
                    color = fg, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            }
            Spacer(Modifier.height(30.dp))
            Text(v.title, color = fg, fontSize = 16.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(v.sub.ifEmpty { v.t.label }, color = fg.copy(alpha = .86f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Wide "next up" card on the home screen, drawn on the pass's illustration when it has one. */
@Composable
fun FeaturedPass(cat: Catalog, p: PassEntity, badge: String, onClick: () -> Unit) {
    val v = passView(cat, p)
    // Text never sits on artwork: the "next up" card uses the provider colour; the full illustration is on the ticket itself.
    val res: Int? = null
    Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(24.dp)).background(v.accent).clickable(onClick = onClick)) {
        val fg = if (res != null) Illustrations.INK else if (v.accent.luminance() > .45f) Color(0xFF1B1B1B) else Color.White
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Logo(v.provName.ifEmpty { v.title }, if (res != null) v.accent else lerp(v.accent, Color.White, .18f), size = 32.dp)
                Text(v.sub, Modifier.padding(start = 10.dp).weight(1f), color = fg.copy(alpha = .9f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(badge.ifEmpty { "Upcoming" }, Modifier.clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = .22f)).padding(horizontal = 10.dp, vertical = 4.dp), color = fg, fontSize = 12.sp)
            }
            Text(v.title, Modifier.padding(top = 10.dp), color = fg, fontSize = 30.sp, lineHeight = 36.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val bits = listOfNotNull(p.f("gate").ifEmpty { null }?.let { "Gate $it" }, p.f("terminal").ifEmpty { null }?.let { "Terminal $it" },
                p.f("coach").ifEmpty { null }?.let { "Coach $it" }, p.f("row").ifEmpty { null }?.let { "Row $it" }, p.f("seat").ifEmpty { null }?.let { "Seat $it" })
            val time = listOf(fmtDate(p.f("date")), fmtTime(p.f("time"))).filter { it.isNotBlank() }.joinToString(" · ")
            Text((bits.joinToString(" · ") + if (bits.isNotEmpty() && time.isNotEmpty()) "\n" else "") + time, Modifier.padding(top = 6.dp), color = fg.copy(alpha = .92f), fontSize = 13.sp, lineHeight = 18.sp)
        }
    }
}


// ---- The ticket: supplied illustration + native text overlay ---------------------------------
private class Cell(val label: String, val value: String)

private fun cells(vararg c: Pair<String, String>) = c.filter { it.second.isNotBlank() }.map { Cell(it.first, it.second) }

/** Which fields appear on each category's ticket, in rows. Only fields the person (or their ticket) supplied are shown. */
private fun layout(p: PassEntity, reveal: Boolean): Triple<String, String, List<List<Cell>>> {
    fun m(k: String) = if (reveal) p.f(k) else DocChecks.mask(p.f(k))
    fun d(k: String) = if (p.f(k).isEmpty()) "" else fmtDate(p.f(k))
    fun t(k: String) = if (p.f(k).isEmpty()) "" else fmtTime(p.f(k))
    fun dt(dk: String, tk: String) = listOf(d(dk), t(tk)).filter { it.isNotEmpty() }.joinToString(" · ")
    return when (p.template) {
        "flight" -> Triple(listOf(p.f("fromName"), p.f("toName")).filter { it.isNotEmpty() }.joinToString(" to "), "ROUTE", listOf(
            cells("Date" to dt("date", "time"), (if (p.f("terminal").isNotEmpty() && p.f("gate").isNotEmpty()) "Terminal / Gate" else if (p.f("gate").isNotEmpty()) "Gate" else "Terminal") to listOf(p.f("terminal"), p.f("gate")).filter { it.isNotEmpty() }.joinToString(" / ")),
            cells("Passenger" to p.f("passenger"), "Seat" to p.f("seat")),
            cells("Boarding" to t("boarding"), "Group" to p.f("zone"), "Arrives" to t("arrive")),
            cells("Fare" to p.f("fare"), "Booking (PNR)" to p.f("ref"))))
        "train" -> Triple(listOf(p.f("trainName"), p.f("trainNo")).filter { it.isNotEmpty() }.joinToString(" · "), "ROUTE", listOf(
            cells("Date" to d("date"), "Departs" to t("time"), "Arrives" to t("arrive")),
            cells("Coach" to p.f("coach"), "Class" to p.f("class"), "Seat / berth" to p.f("seat")),
            cells("Passenger" to p.f("passenger"), "Platform" to p.f("platform")),
            cells("PNR" to p.f("ref"))))
        "bus", "taxi", "ferry" -> Triple(listOf(p.f("route"), p.f("vessel"), p.f("vehicle")).filter { it.isNotEmpty() }.joinToString(" · "), "ROUTE", listOf(
            cells("Date" to d("date"), (if (p.template == "taxi") "Pick-up" else "Departs") to t("time")),
            cells("Seat" to p.f("seat"), "Terminal" to p.f("terminal"), "Passenger" to p.f("passenger")),
            cells("Fare" to p.f("fare"), "Booking" to p.f("ref"))))
        "movie" -> Triple(p.f("branch"), p.f("title"), listOf(
            cells("Date" to d("date"), "Time" to t("time")), cells("Section" to p.f("section"), "Row" to p.f("row"), "Seat" to p.f("seat")),
            cells("Screen" to p.f("screen"), "Format" to p.f("format"), "Language" to p.f("language")), cells("Booking ID" to p.f("ref"))))
        "event", "sports", "amusement", "entry" -> Triple(p.f("venue"), p.f("title"), listOf(
            cells("Date" to d("date"), "Time" to t("time")), cells("Gate" to p.f("gate"), "Section" to p.f("section"), "Row" to p.f("row"), "Seat" to p.f("seat")),
            cells("Ticket" to p.f("ticketType"), (if (p.template == "amusement") "Guests" else "Admits") to p.f("admits"), "Valid until" to d("validTo")), cells("Reference" to p.f("ref"))))
        "hotel" -> Triple(p.f("address"), p.f("property"), listOf(cells("Check-in" to dt("date", "time"), "Check-out" to d("checkout")), cells("Guest" to p.f("guest"), "Room" to p.f("room")), cells("Booking" to p.f("ref"))))
        "parking" -> Triple("", p.f("facility"), listOf(cells("From" to dt("date", "time"), "Valid until" to d("validTo")), cells("Vehicle" to p.f("vehicle"), "Bay / level" to p.f("space")), cells("Reference" to p.f("ref"))))
        "transit" -> Triple("", p.f("passType"), listOf(cells("Zones or route" to p.f("zones"), "Fare" to p.f("fare")), cells("Valid from" to d("validFrom"), "Valid until" to d("validTo")),
            cells("Card number" to m("number"), "Balance (your note)" to (p.f("balance").toDoubleOrNull()?.let { Money.format(it, p.currency) } ?: ""))))
        "loyalty" -> Triple("", p.f("points").let { if (it.isEmpty()) "" else "$it points" }, listOf(cells("Member" to p.f("member"), "Tier" to p.f("tier")), cells("Member number" to m("number"))))
        "gift" -> Triple("", p.f("balance").toDoubleOrNull()?.let { Money.format(it, p.currency) } ?: "", listOf(cells("Card number" to m("number"), "PIN" to if (p.f("pin").isEmpty()) "" else if (reveal) p.f("pin") else "••••"), cells("Expires" to d("validTo"))))
        "purchase" -> Triple(p.providerName, p.f("title"), listOf(cells("Date" to d("date"), "Amount (your note)" to (p.f("amount").toDoubleOrNull()?.let { Money.format(it, p.currency) } ?: "")), cells("Order number" to p.f("ref"))))
        else -> Triple(p.f("subtitle"), p.f("title"), listOf(cells("Date" to d("date"), "Time" to t("time")), cells("Number" to p.f("number"))))
    }
}

/**
 * The ticket. The supplied illustration is the background, shown whole across the width and
 * anchored at the bottom (only its flat top margin is trimmed, so its rounded corners never show).
 * Text sits in the empty space above the artwork and never over it: if a pass has many details,
 * the card grows upwards in the illustration's own flat colour.
 */
@Composable
fun TicketCard(cat: Catalog, p: PassEntity, reveal: Boolean = false, onCode: () -> Unit = {}, extra: List<Pair<String, String>> = emptyList()) {
    val v = passView(cat, p)
    val res = Illustrations.res(v.illustration)
    val bg = if (res != null) Illustrations.SLATE else v.accent
    val fg = if (res != null) Illustrations.INK else if (bg.luminance() > .45f) Color(0xFF1B1B1B) else Color.White
    val (kicker, bigText, rows) = layout(p, reveal)
    BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 16.dp).widthIn(max = 520.dp)) {
        val w = maxWidth
        val imgH = w * (1536f / 1024f) * 0.92f
        val artH = w * 0.60f          // the illustrated band (≈ lower 40% of the template) is never covered
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(w * 0.066f)).background(bg).heightIn(min = if (res != null) imgH else 0.dp)) {
            if (res != null) Image(painterResource(res), "${Illustrations.label(v.illustration ?: "")} illustration",
                Modifier.fillMaxWidth().aspectRatio(1024f / (1536f * 0.92f)).align(Alignment.BottomCenter),
                contentScale = ContentScale.Crop, alignment = Alignment.BottomCenter)
            Column(Modifier.fillMaxWidth().padding(bottom = if (res != null) artH else 12.dp)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Logo(v.provName.ifEmpty { v.t.label }, if (res != null) v.accent else lerp(bg, Color.White, .18f), size = 40.dp)
                    Text(v.provName.ifEmpty { v.t.label }, Modifier.padding(start = 12.dp).weight(1f), color = fg, fontSize = 18.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val right = p.f("flightNo").ifEmpty { p.f("trainNo") }
                    if (right.isNotEmpty()) Text(right, color = fg, fontSize = 22.sp)
                }
                HorizontalDivider(color = fg.copy(alpha = .18f))
                if (kicker.isNotEmpty()) Text(kicker, Modifier.padding(start = 20.dp, end = 20.dp, top = 16.dp), color = fg.copy(alpha = .85f), fontSize = 16.sp)
                if (bigText == "ROUTE") {
                    Row(Modifier.padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        val long = p.f("from").length > 4 || p.f("to").length > 4
                        Text(p.f("from").ifEmpty { "—" }, color = fg, fontSize = if (long) 24.sp else 42.sp, modifier = Modifier.weight(1f, fill = false))
                        Ic(if (p.template == "flight") "flight" else "arrowRight", Modifier.padding(horizontal = 12.dp).rotate(if (p.template == "flight") 90f else 0f), tint = fg, size = if (long) 24.dp else 32.dp)
                        Text(p.f("to").ifEmpty { "—" }, color = fg, fontSize = if (long) 24.sp else 42.sp, modifier = Modifier.weight(1f, fill = false))
                    }
                } else if (bigText.isNotEmpty()) Text(bigText, Modifier.padding(horizontal = 20.dp, vertical = 4.dp), color = fg, fontSize = 30.sp, lineHeight = 36.sp)
                (rows + listOf(extra.filter { it.second.isNotBlank() }.map { Cell(it.first, it.second) })).filter { it.isNotEmpty() }.forEach { r ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
                        r.forEachIndexed { i, c ->
                            Column(Modifier.weight(1f), horizontalAlignment = when { r.size == 1 -> Alignment.Start; i == 0 -> Alignment.Start; i == r.lastIndex -> Alignment.End; else -> Alignment.CenterHorizontally }) {
                                Text(c.label, color = fg.copy(alpha = .75f), fontSize = 14.sp)
                                Text(c.value, color = fg, fontSize = 19.sp, textAlign = if (i == r.lastIndex && r.size > 1) TextAlign.End else TextAlign.Start)
                            }
                        }
                    }
                }
                if (p.barcodeValue.isNotEmpty() && p.barcodeFormat != "none") CodeBlock(p, fg, onCode)
                if (p.template == "generic" && p.f("notes").isNotEmpty()) Text(p.f("notes"), Modifier.padding(20.dp), color = fg.copy(alpha = .9f), fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun CodeBlock(p: PassEntity, fg: Color, onCode: () -> Unit) {
    val bmp = remember(p.barcodeValue, p.barcodeFormat) { Codes.bitmap(p.barcodeValue, p.barcodeFormat)?.asImageBitmap() }
    Column(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        val square = p.barcodeFormat == "qr" || p.barcodeFormat == "aztec"
        Box(Modifier.fillMaxWidth(if (square) .58f else .86f).clip(RoundedCornerShape(20.dp)).background(Color.White).clickable(onClick = onCode).padding(14.dp)) {
            if (bmp != null) Image(bmp, "Code. Tap to show full screen", Modifier.fillMaxWidth().aspectRatio(bmp.width.toFloat() / bmp.height), filterQuality = FilterQuality.None)
            else Text("This code can’t be drawn in this format. The text is kept exactly as entered.", color = Color(0xFF1B1B1B), fontSize = 13.sp)
        }
        Text(if (p.barcodeValue.length > 40) p.barcodeValue.take(40) + "…" else p.barcodeValue, Modifier.padding(top = 6.dp, start = 20.dp, end = 20.dp),
            color = fg.copy(alpha = .85f), fontSize = 12.sp, fontFamily = FontFamily.Monospace, textAlign = TextAlign.Center)
        when (p.barcodeSource) {
            "demo" -> Text("Sample code: not valid for entry", Modifier.padding(top = 6.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFFFFE08A)).padding(horizontal = 10.dp, vertical = 3.dp),
                color = Color(0xFF3F2E00), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            "import" -> Text("Read from your imported ticket", Modifier.padding(top = 4.dp), color = fg.copy(alpha = .7f), fontSize = 11.sp)
            else -> Text("Redrawn from the code you entered", Modifier.padding(top = 4.dp), color = fg.copy(alpha = .7f), fontSize = 11.sp)
        }
    }
}

/** Big, high-contrast code for scanners. */
@Composable
fun CodeFull(p: PassEntity, modifier: Modifier = Modifier) {
    val bmp = remember(p.barcodeValue, p.barcodeFormat) { Codes.bitmap(p.barcodeValue, p.barcodeFormat)?.asImageBitmap() }
    if (bmp != null) Image(bmp, "Code", modifier.aspectRatio(bmp.width.toFloat() / bmp.height), filterQuality = FilterQuality.None)
}

// =============================================================================================
// Identity documents: a clean summary, always labelled as a personal copy.
// =============================================================================================
@Composable
fun DocCard(cat: Catalog, d: DocRecord, reveal: Boolean, modifier: Modifier = Modifier) {
    val t = cat.docType(d.typeId) ?: cat.docType("XX.other")!!
    val c = Color(t.color)
    Box(modifier.fillMaxWidth().aspectRatio(1.586f).clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(c, lerp(c, Color.Black, .38f))))) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = .2f)).padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(cat.regionName(d.region.ifEmpty { t.region }).uppercase(), Modifier.weight(1f), color = Color.White, fontSize = 11.sp, letterSpacing = .6.sp, maxLines = 1)
                Text("Personal copy · not verified", Modifier.clip(RoundedCornerShape(4.dp)).background(Color.White.copy(alpha = .18f)).padding(horizontal = 7.dp, vertical = 1.dp), color = Color.White, fontSize = 11.sp)
            }
            Column(Modifier.padding(16.dp).weight(1f)) {
                Text(d.label.ifEmpty { t.name }, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Medium)
                Text(d.authority.ifEmpty { t.authority }, color = Color.White.copy(alpha = .8f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.weight(1f))
                if (d.holder.isNotEmpty()) Text(d.holder, color = Color.White, fontSize = 15.sp)
                if (d.number.isNotEmpty()) Text(if (reveal) d.number else DocChecks.mask(d.number, t.mask), color = Color.White, fontSize = 16.sp, fontFamily = FontFamily.Monospace, letterSpacing = 1.5.sp)
                if (d.expiry.isNotEmpty()) Text("Valid until ${fmtDate(d.expiry)}", color = Color.White.copy(alpha = .85f), fontSize = 12.sp)
            }
        }
        Ic(if (t.group == "health") "health" else if (t.group == "vehicle") "car" else "id", Modifier.align(Alignment.BottomEnd).padding(14.dp), tint = Color.White.copy(alpha = .3f), size = 44.dp)
    }
}
