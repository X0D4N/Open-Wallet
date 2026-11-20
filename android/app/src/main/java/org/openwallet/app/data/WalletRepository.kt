package org.openwallet.app.data

import org.json.JSONArray
import org.json.JSONObject
import org.openwallet.app.domain.Booking
import org.openwallet.app.domain.BookingEngine
import org.openwallet.app.domain.CalEvent

/** A booking found in a calendar, waiting for the person's review. */
data class Proposal(val ref: String, val booking: Booking, val title: String, val start: Long?, val state: String, val existingId: String?, val changes: List<Triple<String, String, String>>)

object Proposals {
    /** Turns events into proposals: new or changed bookings; meetings, cancelled, ignored and already-saved ones are skipped. */
    fun from(cat: Catalog, events: List<CalEvent>, passes: List<PassEntity>, ignored: Set<String>): List<Proposal> = events.mapNotNull { ev ->
        if (ev.cancelled || ev.id in ignored) return@mapNotNull null
        val b = BookingEngine.detect(cat, ev) ?: return@mapNotNull null
        val existing = passes.firstOrNull { it.sourceRef == ev.id }
            ?: passes.firstOrNull { p -> b.fields["ref"]?.let { it == p.f("ref") } == true && p.template == b.template && p.f("date") == b.fields["date"] }
        val changes = existing?.let { p -> b.fields.filter { (k, v) -> p.f(k) != v }.map { (k, v) -> Triple(k, p.f(k), v) } } ?: emptyList()
        val state = when { existing == null -> "new"; changes.isEmpty() -> "saved"; else -> "changed" }
        if (state == "saved") null else Proposal(ev.id, b, ev.title, ev.start?.toEpochMilli(), state, existing?.id, changes)
    }
}

/** Cards and passes as JSON (ID documents are never included: they stay in the vault). */
object Backup {
    fun toJson(cards: List<CardEntity>, passes: List<PassEntity>): String {
        val o = JSONObject().put("app", "open-wallet").put("version", 2)
        o.put("cards", JSONArray().apply {
            cards.forEach { c -> put(JSONObject().put("id", c.id).put("issuerId", c.issuerId).put("issuerName", c.issuerName).put("productId", c.productId).put("networkId", c.networkId)
                .put("kind", c.kind).put("last4", c.last4).put("holder", c.holder).put("showHolder", c.showHolder).put("expMonth", c.expMonth).put("expYear", c.expYear)
                .put("showExpiry", c.showExpiry).put("contactless", c.contactless).put("color", c.color ?: JSONObject.NULL).put("nickname", c.nickname).put("position", c.position).put("addedAt", c.addedAt)) }
        })
        o.put("passes", JSONArray().apply {
            passes.forEach { p -> put(JSONObject().put("id", p.id).put("template", p.template).put("providerId", p.providerId).put("providerName", p.providerName).put("color", p.color ?: JSONObject.NULL).put("art", p.art)
                .put("fields", JSONObject(p.fields)).put("barcodeValue", p.barcodeValue).put("barcodeFormat", p.barcodeFormat).put("barcodeSource", p.barcodeSource).put("source", p.source)
                .put("sourceRef", p.sourceRef).put("favorite", p.favorite).put("archived", p.archived).put("edited", p.edited).put("currency", p.currency).put("createdAt", p.createdAt).put("updatedAt", p.updatedAt)) }
        })
        return o.toString(2)
    }

    fun fromJson(s: String, cat: Catalog): Pair<List<CardEntity>, List<PassEntity>> {
        val o = JSONObject(s)
        require(o.optString("app") == "open-wallet") { "That file isn’t an Open Wallet backup" }
        val cards = o.optJSONArray("cards")?.let { a -> (0 until a.length()).mapNotNull { i ->
            val c = a.getJSONObject(i); val last4 = c.optString("last4").filter { it.isDigit() }
            if (last4.length != 4) null else CardEntity(c.getString("id"), c.optString("issuerId"), c.optString("issuerName"), c.optString("productId"), c.optString("networkId"), c.optString("kind", "credit"),
                last4, c.optString("holder"), c.optBoolean("showHolder"), c.optInt("expMonth"), c.optInt("expYear"), c.optBoolean("showExpiry"), c.optBoolean("contactless"),
                if (c.isNull("color")) null else c.optLong("color"), c.optString("nickname"), c.optInt("position"), c.optLong("addedAt"))
        } } ?: emptyList()
        val passes = o.optJSONArray("passes")?.let { a -> (0 until a.length()).map { i ->
            val p = a.getJSONObject(i); val f = p.optJSONObject("fields") ?: JSONObject()
            val t = p.optString("template").takeIf { it in cat.templates } ?: "generic"
            val allowed = cat.template(t).fields.map { it.k }.toSet() + setOf("date", "time")
            PassEntity(p.getString("id"), t, p.optString("providerId"), p.optString("providerName"), if (p.isNull("color")) null else p.optLong("color"),
                fields = f.keys().asSequence().filter { it in allowed || it.startsWith("x:") }.associateWith { f.getString(it) }, barcodeValue = p.optString("barcodeValue"), barcodeFormat = p.optString("barcodeFormat", "none"),
                barcodeSource = p.optString("barcodeSource", "entered"), art = p.optString("art"), source = p.optString("source", "manual"), sourceRef = p.optString("sourceRef"), favorite = p.optBoolean("favorite"),
                archived = p.optBoolean("archived"), edited = p.optBoolean("edited"), currency = p.optString("currency", "USD"), createdAt = p.optLong("createdAt"), updatedAt = p.optLong("updatedAt"))
        } } ?: emptyList()
        return cards to passes
    }
}
