package dev.ittro.sensors

import android.graphics.ImageFormat
import android.media.Image
import android.os.SystemClock
import kotlin.math.abs

// Outline tracking off the JavaScript thread: each live frame's Y
// plane is already grey, so it is sampled down to a 160 px upright
// copy and matched against the previous copy, and outlines follow
// the phone with no stills, no bridge bytes and no JavaScript math.
// The search window (±8 px, every other pixel) is searched coarse
// to fine: the full window at stride two, then the neighbours of
// the best shift. The scene-change score (a mean difference above
// 25) mirrors the tracker the app used to run in JavaScript, which
// took seconds a frame on the phone.
private const val TRACK_WIDTH = 160

private const val PAN_SHIFT = 8

private const val PAN_STRIDE = 2

private const val COARSE_STRIDE = 2

private const val SCENE_SCORE = 25.0

class TrackPan {
  private var previous = ByteArray(0)
  private var next = ByteArray(0)
  private var greyW = 0
  private var greyH = 0

  fun pan(image: Image, rotationDeg: Int): Map<String, Any>? {
    if (image.format != ImageFormat.YUV_420_888 || image.planes.isEmpty()) {
      return null
    }
    val started = SystemClock.uptimeMillis()
    if (!sampleInto(image, rotationDeg)) {
      return null
    }
    if (previous.size != next.size) {
      previous = next.copyOf()
      return zero(started)
    }
    var bestDx = 0
    var bestDy = 0
    var best = Double.POSITIVE_INFINITY
    var dy = -PAN_SHIFT
    while (dy <= PAN_SHIFT) {
      var dx = -PAN_SHIFT
      while (dx <= PAN_SHIFT) {
        val score = frameDiff(previous, next, greyW, greyH, dx, dy)
        if (score < best) {
          best = score
          bestDx = dx
          bestDy = dy
        }
        dx += COARSE_STRIDE
      }
      dy += COARSE_STRIDE
    }
    for (ry in (bestDy - 1)..(bestDy + 1)) {
      for (rx in (bestDx - 1)..(bestDx + 1)) {
        val cx = rx.coerceIn(-PAN_SHIFT, PAN_SHIFT)
        val cy = ry.coerceIn(-PAN_SHIFT, PAN_SHIFT)
        if (cx == bestDx && cy == bestDy) {
          continue
        }
        val score = frameDiff(previous, next, greyW, greyH, cx, cy)
        if (score < best) {
          best = score
          bestDx = cx
          bestDy = cy
        }
      }
    }
    val swap = previous
    previous = next
    next = swap
    return mapOf(
      "dx" to bestDx.toDouble(),
      "dy" to bestDy.toDouble(),
      "score" to best,
      "changed" to (best > SCENE_SCORE),
      "gw" to greyW.toDouble(),
      "panMs" to (SystemClock.uptimeMillis() - started).toDouble(),
    )
  }

  private fun zero(started: Long): Map<String, Any> {
    return mapOf(
      "dx" to 0.0,
      "dy" to 0.0,
      "score" to 0.0,
      "changed" to false,
      "gw" to greyW.toDouble(),
      "panMs" to (SystemClock.uptimeMillis() - started).toDouble(),
    )
  }

  private fun sampleInto(image: Image, rotationDeg: Int): Boolean {
    val srcW = image.width
    val srcH = image.height
    if (srcW <= 0 || srcH <= 0) {
      return false
    }
    val turns = (((rotationDeg % 360) + 360) % 360) / 90
    val swap = turns % 2 == 1
    val longW = if (swap) srcH else srcW
    val longH = if (swap) srcW else srcH
    greyW = TRACK_WIDTH
    greyH = maxOf(1, (longH * TRACK_WIDTH) / longW)
    if (next.size != greyW * greyH) {
      next = ByteArray(greyW * greyH)
    }
    val yPlane = image.planes[0]
    val yBuffer = yPlane.buffer
    val yRow = yPlane.rowStride
    for (oy in 0 until greyH) {
      val uy = (oy * longH) / greyH
      for (ox in 0 until greyW) {
        val ux = (ox * longW) / greyW
        val sx: Int
        val sy: Int
        when (turns) {
          1 -> {
            sx = uy
            sy = srcH - 1 - ux
          }
          2 -> {
            sx = srcW - 1 - ux
            sy = srcH - 1 - uy
          }
          3 -> {
            sx = srcW - 1 - uy
            sy = ux
          }
          else -> {
            sx = ux
            sy = uy
          }
        }
        next[oy * greyW + ox] = yBuffer.get(sy * yRow + sx)
      }
    }
    return true
  }

  private fun frameDiff(a: ByteArray, b: ByteArray, w: Int, h: Int, dx: Int, dy: Int): Double {
    val x0 = maxOf(0, -dx)
    val y0 = maxOf(0, -dy)
    val x1 = minOf(w, w - dx)
    val y1 = minOf(h, h - dy)
    var total = 0L
    var count = 0
    var y = y0
    while (y < y1) {
      var x = x0
      while (x < x1) {
        total += abs((a[y * w + x].toInt() and 0xFF) - (b[(y + dy) * w + (x + dx)].toInt() and 0xFF))
        count += 1
        x += PAN_STRIDE
      }
      y += PAN_STRIDE
    }
    if (count == 0) {
      return Double.POSITIVE_INFINITY
    }
    return total.toDouble() / count
  }
}
