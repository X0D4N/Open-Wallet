package org.openwallet.app.domain

import android.graphics.Bitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.MultiFormatWriter
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.BitMatrix
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/**
 * Barcodes are drawn from the exact text the person entered or that was read from their own
 * ticket. The payload is never changed, shortened or invented.
 */
object Codes {
    val FORMATS = listOf("none", "qr", "code128", "pdf417", "aztec")
    fun label(f: String) = when (f) { "qr" -> "QR code"; "code128" -> "Barcode (Code 128)"; "pdf417" -> "PDF417 (boarding passes)"; "aztec" -> "Aztec (rail and transit)"; else -> "No code" }

    private fun zx(f: String) = when (f) { "code128" -> BarcodeFormat.CODE_128; "pdf417" -> BarcodeFormat.PDF_417; "aztec" -> BarcodeFormat.AZTEC; else -> BarcodeFormat.QR_CODE }

    /** Returns null when the text can't be drawn in that format (too long, or unsupported characters). */
    fun matrix(value: String, format: String): BitMatrix? = runCatching {
        if (format == "code128" && !value.all { it.code in 32..126 }) return null
        val hints = mutableMapOf<EncodeHintType, Any>(EncodeHintType.CHARACTER_SET to "UTF-8", EncodeHintType.MARGIN to (if (format == "qr" || format == "aztec") 2 else 4))
        if (format == "qr") hints[EncodeHintType.ERROR_CORRECTION] = ErrorCorrectionLevel.M
        val (w, h) = when (format) { "code128" -> 600 to 160; "pdf417" -> 800 to 260; else -> 0 to 0 }
        MultiFormatWriter().encode(value, zx(format), w, h, hints)
    }.getOrNull()

    fun bitmap(value: String, format: String): Bitmap? {
        val m = matrix(value, format) ?: return null
        val bmp = Bitmap.createBitmap(m.width, m.height, Bitmap.Config.ARGB_8888)
        val px = IntArray(m.width * m.height)
        for (y in 0 until m.height) for (x in 0 until m.width) px[y * m.width + x] = if (m[x, y]) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
        bmp.setPixels(px, 0, m.width, 0, 0, m.width, m.height)
        return bmp
    }

    data class Read(val text: String, val format: String)

    /** Finds a barcode in an imported picture. Used only as a suggestion the person confirms. */
    fun read(bitmap: Bitmap): Read? {
        val scaled = if (bitmap.width * bitmap.height > 4_000_000) {
            val f = Math.sqrt(4_000_000.0 / (bitmap.width * bitmap.height))
            Bitmap.createScaledBitmap(bitmap, (bitmap.width * f).toInt(), (bitmap.height * f).toInt(), true)
        } else bitmap
        val px = IntArray(scaled.width * scaled.height)
        scaled.getPixels(px, 0, scaled.width, 0, 0, scaled.width, scaled.height)
        val src = RGBLuminanceSource(scaled.width, scaled.height, px)
        val hints = mapOf(DecodeHintType.TRY_HARDER to true, DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC))
        for (bin in listOf(HybridBinarizer(src), HybridBinarizer(src.invert()))) {
            val r = runCatching { MultiFormatReader().decode(BinaryBitmap(bin), hints) }.getOrNull() ?: continue
            val f = when (r.barcodeFormat) { BarcodeFormat.CODE_128 -> "code128"; BarcodeFormat.PDF_417 -> "pdf417"; BarcodeFormat.AZTEC -> "aztec"; else -> "qr" }
            return Read(r.text, f)
        }
        return null
    }
}
