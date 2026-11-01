package dev.ittro.sensors

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.SystemClock
import java.util.concurrent.atomic.AtomicBoolean

// Live hand frames off the JavaScript thread. Every camera frame
// moves the guided outline (OutlineTrack) on the frame thread; the
// frame is then sampled straight to a half-size upright bitmap for
// the landmarker, which runs on its own thread, so detection (about
// 120 ms on the OPPO) never holds the outline back. A frame that
// arrives while the landmarker is busy only moves the outline. Every
// buffer is reused, so frames cost no garbage; the skips are
// estimated from the timestamp gaps against a nominal 30 frames a
// second. The same image feeds the outline tracker JavaScript reads
// at most every 200 ms.
private const val NOMINAL_FRAME_MS = 1000.0 / 30.0

private const val MAX_SKIP_ESTIMATE = 30

private const val PAN_EVERY_MS = 200L

class HandFrames(
  private val context: Context,
  private val tracker: HandTracker,
  private val rotationDeg: Int,
  private val frameHandler: Handler,
  private val handler: Handler,
  private val onFrame: (Map<String, Any>) -> Unit,
  private val onPan: (Map<String, Any>) -> Unit,
) {
  private var frameId = 0L
  private var dropped = 0L
  private var lastTimestampMs = -1L
  private var converter: FrameConverter? = null
  private val pan = TrackPan()
  private var lastPanAt = 0L
  private val detecting = AtomicBoolean(false)

  fun attach(reader: ImageReader) {
    reader.setOnImageAvailableListener({ source ->
      val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
      val arrived = SystemClock.uptimeMillis()
      val timestampMs = image.timestamp / 1_000_000L
      if (lastTimestampMs > 0 && timestampMs > lastTimestampMs) {
        val gap = (timestampMs - lastTimestampMs) / NOMINAL_FRAME_MS - 1.0
        dropped += gap.toLong().coerceIn(0L, MAX_SKIP_ESTIMATE.toLong())
      }
      lastTimestampMs = timestampMs
      if (image.format == ImageFormat.YUV_420_888) {
        OutlineTrack.onImage(image, rotationDeg)
      }
      if (arrived - lastPanAt >= PAN_EVERY_MS) {
        lastPanAt = arrived
        pan.pan(image, rotationDeg)?.let { onPan(it) }
      }
      if (!detecting.compareAndSet(false, true)) {
        image.close()
        return@setOnImageAvailableListener
      }
      if (converter == null) {
        converter = FrameConverter(image.width, image.height, rotationDeg)
      }
      val started = SystemClock.uptimeMillis()
      val bitmap = converter?.convert(image)
      val convertMs = (SystemClock.uptimeMillis() - started).toDouble()
      image.close()
      if (bitmap == null) {
        detecting.set(false)
        return@setOnImageAvailableListener
      }
      handler.post {
        val found = tracker.detectIn(context, bitmap, timestampMs)
        detecting.set(false)
        OutlineTrack.hand(
          found?.let {
            floatArrayOf(
              (it["boxX1"] as Double).toFloat(),
              (it["boxY1"] as Double).toFloat(),
              (it["boxX2"] as Double).toFloat(),
              (it["boxY2"] as Double).toFloat(),
            )
          },
        )
        frameId += 1
        val payload = mutableMapOf<String, Any>(
          "present" to (found != null),
          "frame" to frameId.toDouble(),
          "convertMs" to convertMs,
          "detectMs" to 0.0,
          "frameMs" to (SystemClock.uptimeMillis() - arrived).toDouble(),
          "dropped" to dropped.toDouble(),
        )
        if (found != null) {
          payload.putAll(found)
        }
        OutlineTrack.placement()?.let { payload.putAll(it) }
        onFrame(payload)
      }
    }, frameHandler)
  }
}

private class FrameConverter(srcW: Int, srcH: Int, rotationDeg: Int) {
  private val halfW = srcW / 2
  private val halfH = srcH / 2
  private val outW: Int
  private val outH: Int
  private val turns = (((rotationDeg % 360) + 360) % 360) / 90
  private var yBytes = ByteArray(0)
  private var uBytes = ByteArray(0)
  private var vBytes = ByteArray(0)
  private val out: IntArray
  private val bitmap: Bitmap

  init {
    val swap = turns % 2 == 1
    outW = if (swap) halfH else halfW
    outH = if (swap) halfW else halfH
    out = IntArray(outW * outH)
    bitmap = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
  }

  fun convert(image: Image): Bitmap? {
    if (image.format != ImageFormat.YUV_420_888 || image.planes.size < 3) {
      return null
    }
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]
    val yBuffer = yPlane.buffer
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer
    val yCount = yBuffer.remaining()
    val uCount = uBuffer.remaining()
    val vCount = vBuffer.remaining()
    if (yBytes.size < yCount) {
      yBytes = ByteArray(yCount)
    }
    if (uBytes.size < uCount) {
      uBytes = ByteArray(uCount)
    }
    if (vBytes.size < vCount) {
      vBytes = ByteArray(vCount)
    }
    yBuffer.get(yBytes, 0, yCount)
    uBuffer.get(uBytes, 0, uCount)
    vBuffer.get(vBytes, 0, vCount)
    val yRow = yPlane.rowStride
    val uvRow = uPlane.rowStride
    val uvStep = uPlane.pixelStride
    for (oy in 0 until outH) {
      for (ox in 0 until outW) {
        val sx: Int
        val sy: Int
        when (turns) {
          1 -> {
            sx = oy
            sy = halfH - 1 - ox
          }
          2 -> {
            sx = halfW - 1 - ox
            sy = halfH - 1 - oy
          }
          3 -> {
            sx = halfW - 1 - oy
            sy = ox
          }
          else -> {
            sx = ox
            sy = oy
          }
        }
        val y = (yBytes[sy * 2 * yRow + sx * 2].toInt() and 0xFF) - 16
        val uvIndex = sy * uvRow + sx * uvStep
        val u = (uBytes[uvIndex].toInt() and 0xFF) - 128
        val v = (vBytes[uvIndex].toInt() and 0xFF) - 128
        var red = (298 * y + 409 * v + 128) / 256
        var green = (298 * y - 100 * u - 208 * v + 128) / 256
        var blue = (298 * y + 516 * u + 128) / 256
        red = red.coerceIn(0, 255)
        green = green.coerceIn(0, 255)
        blue = blue.coerceIn(0, 255)
        out[oy * outW + ox] = -16777216 or (red shl 16) or (green shl 8) or blue
      }
    }
    bitmap.setPixels(out, 0, outW, 0, 0, outW, outH)
    return bitmap
  }
}
