package org.openwallet.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.openwallet.app.data.Catalog
import org.openwallet.app.domain.CardScan
import org.openwallet.app.domain.Codes
import org.openwallet.app.domain.ScanKind
import org.openwallet.app.nfc.AccessProtocol
import org.openwallet.app.ui.Bcbp
import org.openwallet.app.ui.Route
import org.openwallet.app.ui.ScanFlow
import java.io.File
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Synthetic OCR text and published test card numbers only. */
class ScanAndNfcTest {
    private val cat = Catalog(File("src/main/assets/catalog.json").readText())

    @Test fun paymentCardKeepsOnlyPrefixAndLast4AndNeverCvv() {
        val text = "HDFC BANK\nMillennia\n4111 1111 1111 1111\nVALID THRU 08/29\nALEX MORGAN\nVISA\nCVV 123"
        val r = CardScan.analyse(cat, text)
        assertEquals(ScanKind.PAYMENT, r.kind)
        val p = r.payment!!
        assertEquals("1111", p.last4); assertEquals("41111111", p.prefix); assertEquals("visa", p.networkId)
        assertEquals(8, p.expMonth); assertEquals(2029, p.expYear); assertEquals("Alex Morgan", p.holder)
        assertEquals("hdfc", p.issuers.first().first.id); assertEquals("millennia", p.productId)
        val all = r.toString()
        assertFalse("full number must not appear", all.contains("4111111111111111"))
        assertFalse("CVV must not appear", all.contains("123") && Regex("\\b123\\b").containsMatchIn(all))
        val route = ScanFlow.route(cat, r, null, emptyList(), "card photo") as Route.Card
        assertFalse(route.p.toString().contains("4111111111111111"))
        assertEquals("08/29", route.p.expiry)
    }

    @Test fun cvvIsScrubbedBeforeParsing() {
        assertFalse(CardScan.scrub("CVV: 987 and CVC2 4321").contains("987"))
        assertFalse(CardScan.scrub("Security code 4321").contains("4321"))
    }

    @Test fun unknownIssuerIsNotGuessed() {
        val r = CardScan.analyse(cat, "SOME LOCAL BANK\n5555 5555 5555 4444\nMASTERCARD\n12/30")
        assertEquals(ScanKind.PAYMENT, r.kind)
        assertTrue(r.payment!!.issuers.isEmpty()); assertEquals("mastercard", r.payment!!.networkId)
    }

    @Test fun loyaltyGiftAndDocumentsAreClassified() {
        val loyalty = CardScan.analyse(cat, "Tesco\nClubcard\nMember 6340 0012 3456 78\nRewards", Codes.Read("634000123456", "code128"))
        assertEquals(ScanKind.LOYALTY, loyalty.kind); assertEquals("loyalty.tesco", loyalty.provider?.id); assertEquals("634000123456", loyalty.memberNumber)
        val gift = CardScan.analyse(cat, "Westside\nGift Card\nCard No 6001 2345 6789\nValid till 12/27")
        assertEquals(ScanKind.GIFT, gift.kind)
        val aadhaar = CardScan.analyse(cat, "Government of India\nUnique Identification Authority of India\nAlex Morgan\n9999 0000 1231")
        assertEquals(ScanKind.ID_DOCUMENT, aadhaar.kind); assertEquals("IN.aadhaar", aadhaar.docTypeId)
        val eid = CardScan.analyse(cat, "United Arab Emirates\nResident Identity Card\nID Number 784-1990-1234567-1")
        assertEquals("AE.eid", eid.docTypeId)
        assertEquals(ScanKind.UNKNOWN, CardScan.analyse(cat, "hello world").kind)
    }

    @Test fun boardingPassBarcodeIsParsed() {
        val s = "M1MORGAN/ALEX         EDEMO42 DELBOMAI 0588 320Y002F0001 100"
        val m = Bcbp.parse(s)!!
        assertEquals("DEL", m["from"]); assertEquals("BOM", m["to"]); assertEquals("DEMO42", m["ref"]); assertEquals("AI 588", m["flightNo"]); assertEquals("2F", m["seat"]); assertEquals("Alex Morgan", m["passenger"])
        val route = ScanFlow.routeCode(cat, Codes.Read(s, "pdf417")) as Route.Pass
        assertEquals("flight.airindia", route.p.providerId); assertEquals(s, route.p.code)
        assertNull(Bcbp.parse("https://example.com/ticket/123"))
    }

    @Test fun hceTestProtocol() {
        val id = ByteArray(8) { it.toByte() }; val key = ByteArray(32) { (it * 7).toByte() }
        var saved = 0
        val s = AccessProtocol.Session(id, key, 5) { saved = it }
        val select = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, AccessProtocol.AID.size.toByte()) + AccessProtocol.AID
        val auth = byteArrayOf(0x80.toByte(), 0x10, 0x00, 0x00, 0x08) + ByteArray(8) { 0x11 }
        assertArrayEquals(AccessProtocol.CONDITIONS, s.process(auth, true))           // must SELECT first
        assertArrayEquals(AccessProtocol.SECURITY, s.process(select, false))          // locked phone: refused
        val sel = s.process(select, true)
        assertArrayEquals(id + byteArrayOf(0, 0, 0, 5) + AccessProtocol.OK, sel)
        val r1 = s.process(auth, true); val r2 = s.process(auth, true)
        assertEquals(7, saved)                                                        // counter persisted after each authentication
        assertFalse("same challenge gives a different answer (anti-replay counter)", r1.contentEquals(r2))
        val expected = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(ByteArray(8) { 0x11 } + byteArrayOf(0, 0, 0, 6) + id).copyOf(16)
        assertArrayEquals(byteArrayOf(0, 0, 0, 6) + expected + AccessProtocol.OK, r1)
        val other = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, 0x07, 0xA0.toByte(), 0, 0, 0, 0x03, 0x10, 0x10)       // a payment AID: never answered
        assertArrayEquals(AccessProtocol.NOT_FOUND, s.process(other, true))
        assertArrayEquals(AccessProtocol.WRONG_LENGTH, s.process(byteArrayOf(0x00), true))
        assertNotNull(s.process(byteArrayOf(0x00, 0xB0.toByte(), 0, 0), true))
    }
}
