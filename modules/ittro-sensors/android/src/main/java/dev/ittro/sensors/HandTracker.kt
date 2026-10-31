package dev.ittro.sensors

import android.content.Context
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import kotlin.math.hypot

// One hand per live frame through MediaPipe's hand landmarker in
// video mode, so the tracker follows the hand instead of finding it
// from scratch on every frame. The choice of processor is one
// setting (CPU until the benchmark says otherwise); the model asset
// ships with this module. Confidence thresholds sit at 0.3, so
// bottles covering the hand don't lose it.
private const val MODEL_ASSET = "hand_landmarker.task"

private const val CONFIDENCE = 0.3f

private const val INDEX_TIP = 8

private const val INDEX_MCP = 5

private const val PINKY_MCP = 17

class HandTracker {
  private var landmarker: HandLandmarker? = null
  private var delegateName = "cpu"
  private val lock = Any()

  fun setDelegate(name: String): Boolean {
    if (name != "cpu" && name != "gpu") {
      return false
    }
    synchronized(lock) {
      if (delegateName != name) {
        delegateName = name
        landmarker?.close()
        landmarker = null
      }
    }
    return true
  }

  private fun ensure(context: Context): HandLandmarker? {
    synchronized(lock) {
      landmarker?.let { return it }
      val delegate = if (delegateName == "gpu") Delegate.GPU else Delegate.CPU
      val base = BaseOptions.builder().setDelegate(delegate).setModelAssetPath(MODEL_ASSET).build()
      val options =
        HandLandmarker.HandLandmarkerOptions
          .builder()
          .setBaseOptions(base)
          .setRunningMode(RunningMode.VIDEO)
          .setNumHands(1)
          .setMinHandDetectionConfidence(CONFIDENCE)
          .setMinHandPresenceConfidence(CONFIDENCE)
          .setMinTrackingConfidence(CONFIDENCE)
          .build()
      return try {
        HandLandmarker.createFromOptions(context, options).also { landmarker = it }
      } catch (e: Exception) {
        null
      }
    }
  }

  fun detectIn(context: Context, bitmap: android.graphics.Bitmap, timestampMs: Long): Map<String, Any>? {
    val tracker = ensure(context.applicationContext) ?: return null
    val started = android.os.SystemClock.uptimeMillis()
    val image = BitmapImageBuilder(bitmap).build()
    val result =
      try {
        synchronized(lock) {
          tracker.detectForVideo(image, timestampMs)
        }
      } catch (e: Exception) {
        return null
      }
    val landmarks = result.landmarks().firstOrNull() ?: return null
    if (landmarks.size <= PINKY_MCP) {
      return null
    }
    val tip = landmarks[INDEX_TIP]
    val index = landmarks[INDEX_MCP]
    val pinky = landmarks[PINKY_MCP]
    val width = hypot(index.x() - pinky.x(), index.y() - pinky.y()).toDouble()
    val score = result.handedness().firstOrNull()?.firstOrNull()?.score()?.toDouble() ?: 0.0
    // The whole hand's box, 0 to 1: a hand wrapped round a bottle touches it even when the fingertip points past it.
    val xs = landmarks.map { it.x() }
    val ys = landmarks.map { it.y() }
    return mapOf(
      "x" to tip.x().toDouble(),
      "y" to tip.y().toDouble(),
      "confidence" to score,
      "handWidth" to width,
      "boxX1" to xs.min().toDouble(),
      "boxY1" to ys.min().toDouble(),
      "boxX2" to xs.max().toDouble(),
      "boxY2" to ys.max().toDouble(),
      "detectMs" to (android.os.SystemClock.uptimeMillis() - started).toDouble(),
    )
  }
}
