package dev.ittro.sensors

import android.media.Image

// A camera frame's Y plane for the flow: turned upright from the
// sensor's rotation and averaged down to `width` px wide, four samples
// a pixel, into one array reused frame after frame.
internal class GreyFrame(private val width: Int) {
  var grey = IntArray(0)
    private set

  /** Samples the Y plane of `image`, turned upright; returns its size as w, h, or null with no planes. */
  fun sample(image: Image, rotationDeg: Int): IntArray? {
    if (image.planes.isEmpty()) {
      return null
    }
    val srcW = image.width
    val srcH = image.height
    val turns = (((rotationDeg % 360) + 360) % 360) / 90
    val swap = turns % 2 == 1
    val longW = if (swap) srcH else srcW
    val longH = if (swap) srcW else srcH
    val gw = width
    val gh = maxOf(1, (longH * width) / longW)
    if (grey.size != gw * gh) {
      grey = IntArray(gw * gh)
    }
    val plane = image.planes[0]
    val buffer = plane.buffer
    val row = plane.rowStride
    val step = maxOf(1, longW / gw / 2)
    for (oy in 0 until gh) {
      val uy = (oy * longH) / gh
      for (ox in 0 until gw) {
        val ux = (ox * longW) / gw
        var sum = 0
        for (j in 0..1) {
          for (i in 0..1) {
            val px = minOf(longW - 1, ux + i * step)
            val py = minOf(longH - 1, uy + j * step)
            val sx: Int
            val sy: Int
            when (turns) {
              1 -> {
                sx = py
                sy = srcH - 1 - px
              }
              2 -> {
                sx = srcW - 1 - px
                sy = srcH - 1 - py
              }
              3 -> {
                sx = srcW - 1 - py
                sy = px
              }
              else -> {
                sx = px
                sy = py
              }
            }
            sum += buffer.get(sy * row + sx).toInt() and 0xFF
          }
        }
        grey[oy * gw + ox] = sum shr 2
      }
    }
    return intArrayOf(gw, gh)
  }
}
