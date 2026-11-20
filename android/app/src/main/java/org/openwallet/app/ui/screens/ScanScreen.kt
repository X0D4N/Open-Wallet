package org.openwallet.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import org.openwallet.app.domain.Codes
import org.openwallet.app.scan.ImageTools
import org.openwallet.app.scan.Quality
import org.openwallet.app.ui.components.Ic
import java.util.concurrent.Executors
import kotlin.math.abs

/** What the scanner hands back: images stay in memory; nothing is written to disk here. */
data class ScanOutput(val front: Bitmap?, val back: Bitmap?, val code: Codes.Read?)

private const val CARD_RATIO = 1.586f
private const val GUIDE_W = 0.86f

/**
 * mode = "card": card scanner (front, optional back). mode = "code": live QR / barcode scanner.
 */
@Composable
fun ScanScreen(mode: String, autoCapture: Boolean, onClose: () -> Unit, onChooseImage: () -> Unit, onDone: (ScanOutput) -> Unit) {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var asked by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it; asked = true }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }

    var side by remember { mutableStateOf("front") }
    var front by remember { mutableStateOf<Bitmap?>(null) }
    var review by remember { mutableStateOf<Bitmap?>(null) }
    var straightened by remember { mutableStateOf<Bitmap?>(null) }
    var torch by remember { mutableStateOf(false) }
    var quality by remember { mutableStateOf<Quality?>(null) }
    var steady by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val exec = remember { Executors.newSingleThreadExecutor() }
    val capture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).build() }
    var camera by remember { mutableStateOf<Camera?>(null) }
    val previewView = remember { PreviewView(ctx).apply { scaleType = PreviewView.ScaleType.FILL_CENTER; implementationMode = PreviewView.ImplementationMode.COMPATIBLE } }
    var codeFound by remember { mutableStateOf<Codes.Read?>(null) }

    fun shoot() {
        if (busy) return
        busy = true
        capture.takePicture(exec, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val raw = image.toBitmap()
                val rotated = ImageTools.rotate(raw, image.imageInfo.rotationDegrees.toFloat()).also { if (it !== raw) raw.recycle() }
                image.close()
                // Keep what was inside the on-screen frame (plus a margin), then try to straighten the card.
                val gw = GUIDE_W + 0.08f
                val ghFrac = (rotated.width * gw / CARD_RATIO) / rotated.height + 0.08f
                val cropped = ImageTools.crop(rotated, (1 - gw) / 2, (1 - ghFrac) / 2, 1 - (1 - gw) / 2, 1 - (1 - ghFrac) / 2)
                if (cropped !== rotated) rotated.recycle()
                val corners = runCatching { ImageTools.detectCard(cropped) }.getOrNull()
                val flat = corners?.let { runCatching { ImageTools.warp(cropped, it) }.getOrNull() }
                previewView.post { review = cropped; straightened = flat; busy = false }
            }
            override fun onError(exception: ImageCaptureException) { previewView.post { busy = false } }
        })
    }

    DisposableEffect(granted) {
        if (!granted) return@DisposableEffect onDispose { }
        val future = ProcessCameraProvider.getInstance(ctx)
        val barcode = if (mode == "code") BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS).build()) else null
        var lastThumb: IntArray? = null
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
            val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(exec) { img ->
                if (barcode != null) {
                    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
                    val media = img.image
                    if (media == null || codeFound != null) { img.close(); return@setAnalyzer }
                    barcode.process(InputImage.fromMediaImage(media, img.imageInfo.rotationDegrees))
                        .addOnSuccessListener { list -> list.firstOrNull { it.rawValue != null }?.let { b ->
                            codeFound = Codes.Read(b.rawValue!!, when (b.format) { Barcode.FORMAT_CODE_128 -> "code128"; Barcode.FORMAT_PDF417 -> "pdf417"; Barcode.FORMAT_AZTEC -> "aztec"; else -> "qr" }) } }
                        .addOnCompleteListener { img.close() }
                    return@setAnalyzer
                }
                // Card mode: judge only the guide-frame region of the luminance plane.
                val plane = img.planes[0]; val buf = plane.buffer; val stride = plane.rowStride
                val w = img.width; val h = img.height
                val rw = (w * 0.6).toInt(); val rh = (h * 0.4).toInt(); val x0 = (w - rw) / 2; val y0 = (h - rh) / 2
                val lum = IntArray(rw * rh)
                for (y in 0 until rh step 1) { val row = (y0 + y) * stride + x0; for (x in 0 until rw) lum[y * rw + x] = buf.get(row + x).toInt() and 0xFF }
                val q = ImageTools.quality(lum, rw, rh)
                val thumb = IntArray(64) { i -> lum[((i / 8) * rh / 8) * rw + (i % 8) * rw / 8] }
                val still = lastThumb?.let { prev -> prev.indices.sumOf { abs(prev[it] - thumb[it]) } / 64 < 6 } ?: false
                lastThumb = thumb
                quality = q
                steady = if (q.ok && still) steady + 1 else 0
                img.close()
            }
            runCatching {
                provider.unbindAll()
                camera = provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture, analysis)
            }
        }, ContextCompat.getMainExecutor(ctx))
        onDispose { runCatching { future.get().unbindAll() }; barcode?.close() }
    }
    LaunchedEffect(steady) { if (mode == "card" && autoCapture && steady >= 10 && review == null && !busy) { steady = 0; shoot() } }
    LaunchedEffect(codeFound) { codeFound?.let { onDone(ScanOutput(null, null, it)) } }
    LaunchedEffect(torch, camera) { camera?.cameraControl?.enableTorch(torch) }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        val shown = review
        if (!granted) {
            Column(Modifier.fillMaxSize().statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Ic("photo", tint = Color.White, size = 48.dp)
                Text("Camera permission is needed to scan. The camera is used only while this screen is open, and images stay on this phone.", Modifier.padding(16.dp), color = Color.White, textAlign = TextAlign.Center)
                if (asked) Button({ permission.launch(Manifest.permission.CAMERA) }) { Text("Allow camera") }
                TextButton(onChooseImage) { Text("Choose an image instead", color = Color.White) }
                TextButton(onClose) { Text("Cancel", color = Color.White) }
            }
        } else if (shown == null) {
            AndroidView({ previewView }, Modifier.fillMaxSize())
            // Guide frame with a dimmed surround.
            Canvas(Modifier.fillMaxSize().graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }) {
                val gw = size.width * GUIDE_W; val gh = if (mode == "card") gw / CARD_RATIO else gw
                val tl = Offset((size.width - gw) / 2, (size.height - gh) / 2.4f)
                drawRect(Color.Black.copy(alpha = .55f))
                drawRoundRect(Color.Transparent, tl, Size(gw, gh), CornerRadius(36f), blendMode = BlendMode.Clear)
                drawRoundRect(if (mode == "card" && steady > 3) Color(0xFF6DD58C) else Color.White, tl, Size(gw, gh), CornerRadius(36f), style = Stroke(5f))
            }
            Column(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClose, Modifier.semantics { contentDescription = "Close scanner" }) { Ic("close", tint = Color.White) }
                    Text(if (mode == "code") "Scan a QR code or barcode" else if (side == "front") "Scan the front of the card" else "Now scan the back", Modifier.weight(1f), color = Color.White, fontSize = 18.sp)
                    IconButton({ torch = !torch }, Modifier.semantics { contentDescription = if (torch) "Turn flash off" else "Turn flash on" }) { Ic("flash", tint = if (torch) Color(0xFFFFD54F) else Color.White) }
                }
            }
            Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                val warn = quality?.warnings().orEmpty()
                Text(when {
                    mode == "code" -> "Point at the code. It’s read on this phone and kept exactly."
                    warn.isNotEmpty() -> warn.first()
                    autoCapture -> "Hold steady: it captures automatically"
                    else -> "Fit the card inside the frame"
                }, Modifier.clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = .6f)).padding(horizontal = 14.dp, vertical = 8.dp), color = Color.White, textAlign = TextAlign.Center)
                Spacer(Modifier.height(16.dp))
                if (mode == "card") Box(Modifier.size(76.dp).clip(CircleShape).border(4.dp, Color.White, CircleShape).background(Color.White.copy(alpha = .25f))
                    .clickable(enabled = !busy) { shoot() }.semantics { contentDescription = "Take photo" }, contentAlignment = Alignment.Center) { if (busy) CircularProgressIndicator(color = Color.White) }
                TextButton(onChooseImage) { Text("Choose an image instead", color = Color.White) }
                Text("Images stay on this phone. Card numbers are read only to find the network and last 4 digits; the full number and security code are never saved.", color = Color.White.copy(alpha = .8f), fontSize = 12.sp, textAlign = TextAlign.Center)
            }
        } else {
            // Review: straighten, rotate, retake, use.
            var useFlat by remember(shown) { mutableStateOf(straightened != null) }
            var rotation by remember(shown) { mutableStateOf(0f) }
            val current = (if (useFlat) straightened else null) ?: shown
            val q = remember(current) { ImageTools.quality(current) }
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(if (side == "front") "Check the photo" else "Check the back", color = Color.White, fontSize = 20.sp)
                Spacer(Modifier.height(12.dp))
                Image(current.asImageBitmap(), "Captured card", Modifier.fillMaxWidth().weight(1f).graphicsLayer { rotationZ = rotation })
                q.warnings().forEach { Text(it, color = Color(0xFFFFD54F), fontSize = 13.sp) }
                Row(Modifier.padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (straightened != null) FilledTonalButton({ useFlat = !useFlat }) { Text(if (useFlat) "Undo straighten" else "Straighten") }
                    FilledTonalButton({ rotation = (rotation + 90f) % 360f }) { Text("Rotate") }
                    OutlinedButton({ review = null; straightened = null }) { Text("Retake", color = Color.White) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    fun finalImage(): Bitmap = if (rotation == 0f) current else ImageTools.rotate(current, rotation)
                    if (side == "front") {
                        OutlinedButton({ front = finalImage(); review = null; straightened = null; side = "back" }) { Text("Scan the back too", color = Color.White) }
                        Button({ onDone(ScanOutput(finalImage(), null, null)) }) { Text("Use this photo") }
                    } else Button({ onDone(ScanOutput(front, finalImage(), null)) }) { Text("Use both sides") }
                }
            }
        }
    }
}
