package org.openwallet.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openwallet.app.data.Catalog
import org.openwallet.app.data.PassEntity
import org.openwallet.app.data.Proposals
import org.openwallet.app.domain.BookingEngine
import org.openwallet.app.domain.CalEvent
import org.openwallet.app.domain.CardEngine
import org.openwallet.app.domain.DocChecks
import org.openwallet.app.domain.MatchLevel
import java.io.File
import java.time.Instant
import java.time.ZoneOffset

class WalletLogicTest {
    private val cat = Catalog(File("src/main/assets/catalog.json").readText())

    @Test fun catalogueLoads() {
        assertTrue(cat.providers.size > 200)
        listOf("flight", "train", "bus", "taxi", "ferry", "movie", "entry", "amusement", "purchase").forEach { assertNotNull(it, cat.templates[it]) }
        assertNotNull(cat.provider("flight.airindia")); assertNotNull(cat.docType("IN.aadhaar"))
    }

    @Test fun networksFromPrefix() {
        mapOf("411111" to "visa", "555555" to "mastercard", "222100" to "mastercard", "378282" to "amex", "601111" to "discover", "652150" to "rupay", "352800" to "jcb", "620000" to "unionpay")
            .forEach { (p, id) -> assertEquals(p, id, CardEngine.networkFor(cat, p)?.id) }
        assertNull(CardEngine.networkFor(cat, "99"))
    }

    @Test fun matchLevelsNeverGuessIssuer() {
        assertEquals(MatchLevel.NETWORK, CardEngine.identify(cat, "411111").level)
        assertNull(CardEngine.identify(cat, "411111").issuer)
        assertEquals(MatchLevel.PRODUCT, CardEngine.identify(cat, "411111", "axis", "magnus").level)
        assertEquals("hdfc", CardEngine.identify(cat, "411111", learned = mapOf("411111" to "hdfc")).issuer?.id)
        assertEquals("amex", CardEngine.identify(cat, "", "amex").network?.id)
    }

    private fun ev(id: String, title: String, desc: String = "", loc: String = "", start: String = "2030-03-04T09:00:00Z", end: String? = null, allDay: Boolean = false) =
        CalEvent(id, title, desc, loc, "", Instant.parse(start), end?.let(Instant::parse), allDay)

    @Test fun bookingDetection() {
        val f = BookingEngine.detect(cat, ev("1", "Flight EK 512 DXB → BOM", "Emirates booking reference: QX7P2L Seat 32A", end = "2030-03-04T11:00:00Z"), ZoneOffset.UTC)!!
        assertEquals("flight", f.template); assertEquals("DXB", f.fields["from"]); assertEquals("QX7P2L", f.fields["ref"]); assertEquals("flight.emirates", f.provider); assertNull(f.fields["gate"])
        assertEquals("movie", BookingEngine.detect(cat, ev("2", "Movie: Night Train", "Screen 7 Row F Booking ID: VX88213", "VOX Cinemas Mall"))!!.template)
        assertEquals("taxi", BookingEngine.detect(cat, ev("3", "Careem ride to Airport", "Booking ID: CRM12345"))!!.template)
        assertEquals("amusement", BookingEngine.detect(cat, ev("4", "Theme park day", "Wonderla tickets, booking ref: WND55555"))!!.template)
        assertNull(BookingEngine.detect(cat, ev("5", "Weekly team sync")))
        assertNull(BookingEngine.detect(cat, ev("6", "Lunch with Sam", loc = "Hotel cafe")))
    }

    @Test fun icsAndDuplicates() {
        val ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20300304T090000Z\r\nDTEND:20300304T110000Z\r\nSUMMARY:Flight EK 512 DXB → BOM\r\nDESCRIPTION:Booking reference: QX7P2L\r\nEND:VEVENT\r\n" +
            "BEGIN:VEVENT\r\nUID:a2\r\nDTSTART:20300305T100000Z\r\nSUMMARY:Team\r\n  standup\r\nEND:VEVENT\r\nEND:VCALENDAR"
        val events = BookingEngine.parseIcs(ics, ZoneOffset.UTC)
        assertEquals(2, events.size); assertEquals("Team standup", events[1].title)
        val props = Proposals.from(cat, events, emptyList(), emptySet())
        assertEquals(1, props.size)
        val saved = PassEntity("p1", "flight", fields = props[0].booking.fields, sourceRef = "ics:a1", source = "calendar")
        assertEquals(0, Proposals.from(cat, events, listOf(saved), emptySet()).size)
        assertEquals(0, Proposals.from(cat, events, emptyList(), setOf("ics:a1")).size)
    }

    @Test fun maskingAndChecks() {
        assertEquals("XXXX XXXX 9012", DocChecks.mask("123456789012"))
        assertEquals("", DocChecks.check(cat.docType("IN.pan")!!, "ABCDE1234F"))
        assertTrue(DocChecks.check(cat.docType("IN.pan")!!, "ABC").isNotEmpty())
        val good = (0..9).map { "99990000123$it" }.first { DocChecks.verhoeffValid(it) }
        assertEquals("", DocChecks.check(cat.docType("IN.aadhaar")!!, good))
    }
}
