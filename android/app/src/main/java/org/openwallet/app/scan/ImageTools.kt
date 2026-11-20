package org.openwallet.app.scan

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PointF
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.tan

/** Image quality numbers for a camera frame or photo (all computed on the phone). */
data class Quality(val brightness: Double, val sharpness: Double, val glare: Double) {
    val tooDark get() = brightness < 55
    val blurry get() = sharpness < 60
    val glary get() = glare > 0.045
    val ok get() = !tooDark && !blurry && !glary
    fun warnings(): List<String> = buildList {
        if (tooDark) add("Too dark: add light or turn on the flash")
        if (blurry) add("Blurry: hold the phone steady")
        if (glary) add("Glare: tilt the card away from the light")
    }
}

object ImageTools {
    /** Grayscale luminance array of a bitmap scaled to `targetW` wide. */
    fun gray(src: Bitmap, targetW: Int = 360): Triple<IntArray, Int, Int> {
        val w = min(targetW, src.width); val h = max(1, src.height * w / src.width)
        val s = Bitmap.createScaledBitmap(src, w, h, true)
        val px = IntArray(w * h); s.getPixels(px, 0, w, 0, 0, w, h)
        if (s !== src) s.recycle()
        return Triple(IntArray(w * h) { val c = px[it]; ((c shr 16 and 255) * 299 + (c shr 8 and 255) * 587 + (c and 255) * 114) / 1000 }, w, h)
    }

    /** Brightness (mean), sharpness (variance of the Laplacian) and glare (share of blown-out pixels) of a luminance plane. */
    fun quality(lum: IntArray, w: Int, h: Int, rowStride: Int = w): Quality {
        var sum = 0L; var bright = 0; var n = 0
        var lapSum = 0.0; var lapSq = 0.0; var ln = 0
        for (y in 1 until h - 1 step 2) for (x in 1 until w - 1 step 2) {
            val v = lum[y * rowStride + x]; sum += v; n++; if (v > 248) bright++
            val l = 4 * v - lum[(y - 1) * rowStride + x] - lum[(y + 1) * rowStride + x] - lum[y * rowStride + x - 1] - lum[y * rowStride + x + 1]
            lapSum += l; lapSq += l.toDouble() * l; ln++
        }
        val mean = lapSum / max(1, ln)
        return Quality(sum.toDouble() / max(1, n), lapSq / max(1, ln) - mean * mean, bright.toDouble() / max(1, n))
    }

    fun quality(b: Bitmap): Quality { val (g, w, h) = gray(b); return quality(g, w, h) }

    /**
     * Finds the card's four edges: for each side it searches nearby lines (with a small tilt)
     * for the strongest brightness edge, then intersects them. Returns corners in source-bitmap
     * coordinates (top-left, top-right, bottom-right, bottom-left), or null if no card-like
     * quadrilateral is found.
     */
    fun detectCard(src: Bitmap): List<PointF>? {
        val (g, w, h) = gray(src, 400)
        val grad = IntArray(w * h)
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val gx = g[y * w + x + 1] - g[y * w + x - 1]; val gy = g[(y + 1) * w + x] - g[(y - 1) * w + x]
            grad[y * w + x] = abs(gx) + abs(gy)
        }
        val angles = (-6..6).map { tan(Math.toRadians(it.toDouble())) }
        fun hLine(y0: Int, y1: Int): Pair<Double, Double>? { // y = a + b*x
            var best = 0L; var res: Pair<Double, Double>? = null
            for (y in y0 until y1) for (t in angles) {
                var s = 0L; val a = y - t * w / 2
                var x = (w * 0.15).toInt()
                while (x < w * 0.85) { val yy = (a + t * x).toInt(); if (yy in 1 until h - 1) s += grad[yy * w + x]; x += 2 }
                if (s > best) { best = s; res = a to t }
            }
            return res
        }
        fun vLine(x0: Int, x1: Int): Pair<Double, Double>? { // x = a + b*y
            var best = 0L; var res: Pair<Double, Double>? = null
            for (x in x0 until x1) for (t in angles) {
                var s = 0L; val a = x - t * h / 2
                var y = (h * 0.15).toInt()
                while (y < h * 0.85) { val xx = (a + t * y).toInt(); if (xx in 1 until w - 1) s += grad[y * w + xx]; y += 2 }
                if (s > best) { best = s; res = a to t }
            }
            return res
        }
        val top = hLine(2, h / 3) ?: return null; val bottom = hLine(h * 2 / 3, h - 2) ?: return null
        val left = vLine(2, w / 3) ?: return null; val right = vLine(w * 2 / 3, w - 2) ?: return null
        fun meet(hl: Pair<Double, Double>, vl: Pair<Double, Double>): PointF { // y = ha + hb x ; x = va + vb y
            val y = (hl.first + hl.second * vl.first) / (1 - hl.second * vl.second); val x = vl.first + vl.second * y
            return PointF(x.toFloat(), y.toFloat())
        }
        val pts = listOf(meet(top, left), meet(top, right), meet(bottom, right), meet(bottom, left))
        val scale = src.width.toFloat() / w
        val wTop = hypot((pts[1].x - pts[0].x).toDouble(), (pts[1].y - pts[0].y).toDouble()); val hLeft = hypot((pts[3].x - pts[0].x).toDouble(), (pts[3].y - pts[0].y).toDouble())
        if (wTop < w * 0.45 || hLeft < h * 0.35) return null
        return pts.map { PointF(it.x * scale, it.y * scale) }
    }

    /** Perspective correction: maps the four corners to a flat rectangle. Pixels are resampled, not altered. */
    fun warp(src: Bitmap, c: List<PointF>): Bitmap {
        val outW = ((hypot((c[1].x - c[0].x).toDouble(), (c[1].y - c[0].y).toDouble()) + hypot((c[2].x - c[3].x).toDouble(), (c[2].y - c[3].y).toDouble())) / 2).toInt().coerceIn(200, 2400)
        val outH = ((hypot((c[3].x - c[0].x).toDouble(), (c[3].y - c[0].y).toDouble()) + hypot((c[2].x - c[1].x).toDouble(), (c[2].y - c[1].y).toDouble())) / 2).toInt().coerceIn(120, 2400)
        val m = Matrix()
        m.setPolyToPoly(floatArrayOf(c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y), 0,
            floatArrayOf(0f, 0f, outW.toFloat(), 0f, outW.toFloat(), outH.toFloat(), 0f, outH.toFloat()), 0, 4)
        val out = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
        Canvas(out).drawBitmap(src, m, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        return out
    }

    fun rotate(src: Bitmap, deg: Float): Bitmap = Bitmap.createBitmap(src, 0, 0, src.width, src.height, Matrix().apply { postRotate(deg) }, true)

    /** Crops to the on-screen guide frame (fractions of the image). */
    fun crop(src: Bitmap, l: Float, t: Float, r: Float, b: Float): Bitmap {
        val x = (src.width * l).toInt().coerceIn(0, src.width - 1); val y = (src.height * t).toInt().coerceIn(0, src.height - 1)
        return Bitmap.createBitmap(src, x, y, ((src.width * r).toInt() - x).coerceIn(1, src.width - x), ((src.height * b).toInt() - y).coerceIn(1, src.height - y))
    }
}
