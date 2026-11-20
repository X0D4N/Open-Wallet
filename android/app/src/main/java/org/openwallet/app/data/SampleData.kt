package org.openwallet.app.data

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Optional demo content, added only when the person taps "Add sample passes" in Settings.
 * A new install starts empty. Every person, booking and code here is made up, every pass is
 * marked as a sample, and every code is a labelled demo that is not valid anywhere.
 */
object SampleData {
    private fun day(n: Long) = LocalDate.now().plusDays(n).toString()
    private fun ms(daysAgo: Long, h: Int, m: Int) = LocalDateTime.now().minusDays(daysAgo).withHour(h).withMinute(m).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    private fun demo(v: String, f: String = "qr") = Triple(v, f, "demo")

    fun build(): Triple<List<CardEntity>, List<PassEntity>, List<ActivityEntity>> {
        val y = LocalDate.now().year
        val cards = listOf(
            CardEntity("card_enbd", issuerId = "enbd", networkId = "mastercard", kind = "credit", last4 = "0937", expMonth = 3, expYear = y + 2, contactless = true, position = 0),
            CardEntity("card_hdfc", issuerId = "hdfc", productId = "millennia", networkId = "visa", kind = "credit", last4 = "5512", expMonth = 11, expYear = y + 4, contactless = true, position = 1),
            CardEntity("card_visa", issuerName = "Sample Credit Union", networkId = "visa", kind = "debit", last4 = "4821", expMonth = 8, expYear = y + 3, showExpiry = true, position = 2)
        )
        fun pass(id: String, t: String, prov: String, fields: Map<String, String>, code: Triple<String, String, String>? = null, currency: String = "INR") =
            PassEntity(id, t, providerId = prov, fields = fields, barcodeValue = code?.first ?: "", barcodeFormat = code?.second ?: "none", barcodeSource = code?.third ?: "entered", source = "sample", currency = currency)
        val passes = listOf(
            pass("s_flight", "flight", "flight.airindia", mapOf("flightNo" to "AI 000", "from" to "DEL", "fromName" to "Delhi", "to" to "BOM", "toName" to "Mumbai", "date" to day(3), "time" to "20:05",
                "terminal" to "1", "gate" to "24", "passenger" to "Sample Passenger", "seat" to "2F", "zone" to "1", "ref" to "DEMO42", "fare" to "Business"), demo("DEMO-BOARDING-PASS", "pdf417")),
            pass("s_movie", "movie", "movie.pvrinox", mapOf("branch" to "Sample Mall, Delhi", "title" to "Sample Film", "format" to "IMAX", "date" to day(1), "time" to "19:00", "section" to "232", "row" to "12", "seat" to "2", "ref" to "DEMOBK7731"), demo("DEMO-CINEMA-TICKET")),
            pass("s_train", "train", "train.ir", mapOf("trainName" to "Sample Express", "trainNo" to "00000", "from" to "New Delhi", "to" to "Agra Cantt", "date" to day(12), "time" to "06:10", "arrive" to "08:05", "coach" to "C2", "class" to "Chair car", "seat" to "34", "passenger" to "Sample Passenger", "ref" to "DEMOPNR001"), demo("DEMO-RAIL-TICKET", "aztec")),
            pass("s_bus", "bus", "bus.upsrtc", mapOf("route" to "Sample route", "from" to "Lucknow", "to" to "Kanpur", "date" to day(5), "time" to "08:30", "seat" to "14", "ref" to "DEMOBUS9")),
            pass("s_taxi", "taxi", "taxi.careem", mapOf("from" to "Home", "to" to "Airport, Terminal 3", "date" to day(3), "time" to "16:30", "ref" to "DEMORIDE")),
            pass("s_ship", "ferry", "ferry.dubaiferry", mapOf("vessel" to "Sample vessel", "from" to "Marina", "to" to "Al Ghubaiba", "date" to day(8), "time" to "11:00", "seat" to "Gold class"), currency = "AED"),
            pass("s_park", "amusement", "amusement.wonderla", mapOf("title" to "Sample theme park", "venue" to "Bengaluru", "date" to day(15), "ticketType" to "Day pass", "admits" to "2"), demo("DEMO-PARK-ENTRY")),
            pass("s_entry", "entry", "entry.asi", mapOf("title" to "Sample monument", "venue" to "Agra", "date" to day(13), "time" to "09:00", "gate" to "East gate", "admits" to "1"), demo("DEMO-ENTRY-PASS")),
            pass("s_loyalty", "loyalty", "loyalty.yesbank", mapOf("member" to "Sample Member", "number" to "7730019922", "points" to "1,240", "tier" to "Gold"), demo("7730019922", "code128")),
            pass("s_gift", "gift", "gift.pvrinox", mapOf("number" to "6006491200553", "balance" to "1500"), demo("6006491200553", "code128"))
        )
        // No sample transactions: activity is shown only when an authorized payment provider returns it.
        val acts = emptyList<ActivityEntity>()
        return Triple(cards, passes, acts)
    }
}
