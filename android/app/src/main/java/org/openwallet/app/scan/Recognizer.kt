package org.openwallet.app.scan

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.openwallet.app.domain.Codes
import java.io.File
import kotlin.coroutines.resume

/**
 * On-device recognition only: ML Kit's bundled Latin text model and bundled barcode model run
 * inside the app, with no network calls. ZXing is a second barcode reader.
 * Nothing is uploaded.
 */
object Recognizer {
    private val text by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    private val codes by lazy {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE, Barcode.FORMAT_CODE_128, Barcode.FORMAT_PDF417,
            Barcode.FORMAT_AZTEC, Barcode.FORMAT_EAN_13, Barcode.FORMAT_CODE_39, Barcode.FORMAT_DATA_MATRIX).build())
    }

    private suspend fun <T> Task<T>.await(): T? = suspendCancellableCoroutine { c ->
        addOnSuccessListener { c.resume(it) }; addOnFailureListener { c.resume(null) }
    }

    data class Read(val text: String, val code: Codes.Read?)

    suspend fun read(bmp: Bitmap): Read = withContext(Dispatchers.Default) {
        val img = InputImage.fromBitmap(bmp, 0)
        val t = text.process(img).await()?.text.orEmpty()
        val b = codes.process(img).await()?.firstOrNull { it.rawValue != null }
        val code = b?.let { Codes.Read(it.rawValue!!, when (it.format) { Barcode.FORMAT_CODE_128 -> "code128"; Barcode.FORMAT_PDF417 -> "pdf417"; Barcode.FORMAT_AZTEC -> "aztec"; else -> "qr" }) }
            ?: runCatching { Codes.read(bmp) }.getOrNull()
        Read(t, code)
    }

    /** Renders up to 3 PDF pages (Android PdfRenderer) and reads them. Password-protected PDFs throw and are reported. */
    suspend fun readPdf(file: File): Pair<Read, Bitmap?> = withContext(Dispatchers.IO) {
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { r ->
                var allText = ""; var code: Codes.Read? = null; var first: Bitmap? = null
                for (i in 0 until minOf(3, r.pageCount)) {
                    r.openPage(i).use { p ->
                        val scale = 2f
                        val bmp = Bitmap.createBitmap((p.width * scale).toInt(), (p.height * scale).toInt(), Bitmap.Config.ARGB_8888).apply { eraseColor(Color.WHITE) }
                        p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        val rd = read(bmp)
                        allText += rd.text + "\n"; if (code == null) code = rd.code
                        if (first == null) first = bmp else bmp.recycle()
                    }
                }
                Read(allText, code) to first
            }
        }
    }
}
