package dev.ittro.sensors

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.SystemClock

// Live hand frames off the JavaScript thread. Each available image is
// copied to an upright bitmap and closed at once, so the camera
// session never stalls behind detection; the landmarker then runs on
// the copy and only its small result crosses to the app. Frames the
// detector cannot keep up with are skipped by taking the latest
// image, and the skips are estimated from the timestamp gaps against
// a nominal 30 frames a second.
private const val NOMINAL_FRAME_MS = 1000.0 / 30.0

private const val MAX_SKIP_ESTIMATE = 30

class HandFrames(
  private val context: Context,
  private val tracker: HandTracker,
  private val rotationDeg: Int,
  private val handler: Handler,
  private val onFrame: (Map<String, Any>) -> Unit,
) {
  private var frameId = 0L
  private var dropped = 0L
  private var lastTimestampMs = -1L

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
      val bitmap = upright(image, rotationDeg)
      image.close()
      if (bitmap == null) {
        return@setOnImageAvailableListener
      }
      val found = tracker.detectIn(context, bitmap, timestampMs)
      bitmap.recycle()
      frameId += 1
      val payload = mutableMapOf<String, Any>(
        "present" to (found != null),
        "frame" to frameId.toDouble(),
        "detectMs" to 0.0,
        "frameMs" to (SystemClock.uptimeMillis() - arrived).toDouble(),
        "dropped" to dropped.toDouble(),
      )
      if (found != null) {
        payload.putAll(found)
      }
      onFrame(payload)
    }, handler)
  }
}

private fun upright(image: Image, rotationDeg: Int): Bitmap? {
  val argb = yuvToArgb(image) ?: return null
  if (rotationDeg % 360 == 0) {
    return argb
  }
  val matrix = Matrix().apply { postRotate((rotationDeg % 360).toFloat()) }
  return try {
    val turned = Bitmap.createBitmap(argb, 0, 0, argb.width, argb.height, matrix, false)
    argb.recycle()
    turned
  } catch (e: Exception) {
    argb.recycle()
    null
  }
}

private fun yuvToArgb(image: Image): Bitmap? {
  if (image.format != android.graphics.ImageFormat.YUV_420_888) {
    return null
  }
  val width = image.width
  val height = image.height
  val planes = image.planes
  if (planes.size < 3) {
    return null
  }
  val yPlane = planes[0]
  val uPlane = planes[1]
  val vPlane = planes[2]
  val yBuffer = yPlane.buffer
  val uBuffer = uPlane.buffer
  val vBuffer = vPlane.buffer
  val yRow = yPlane.rowStride
  val uvRow = uPlane.rowStride
  val uvStep = uPlane.pixelStride
  val yBytes = ByteArray(yBuffer.remaining())
  val uBytes = ByteArray(uBuffer.remaining())
  val vBytes = ByteArray(vBuffer.remaining())
  yBuffer.get(yBytes)
  uBuffer.get(uBytes)
  vBuffer.get(vBytes)
  val out = IntArray(width * height)
  for (row in 0 until height) {
    val yOffset = row * yRow
    val uvOffset = (row / 2) * uvRow
    for (col in 0 until width) {
      val y = (yBytes[yOffset + col].toInt() and 0xFF) - 16
      val uvIndex = uvOffset + (col / 2) * uvStep
      val u = (uBytes[uvIndex].toInt() and 0xFF) - 128
      val v = (vBytes[uvIndex].toInt() and 0xFF) - 128
      var red = (298 * y + 409 * v + 128) / 256
      var green = (298 * y - 100 * u - 208 * v + 128) / 256
      var blue = (298 * y + 516 * u + 128) / 256
      red = red.coerceIn(0, 255)
      green = green.coerceIn(0, 255)
      blue = blue.coerceIn(0, 255)
      out[row * width + col] = -16777216 or (red shl 16) or (green shl 8) or blue
    }
  }
  return try {
    Bitmap.createBitmap(out, width, height, Bitmap.Config.ARGB_8888)
  } catch (e: Exception) {
    null
  }
}
