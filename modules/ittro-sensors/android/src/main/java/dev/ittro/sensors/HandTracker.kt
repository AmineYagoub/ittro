package dev.ittro.sensors

import android.content.Context
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import kotlin.math.hypot

// One hand per still through MediaPipe's hand landmarker. The choice
// of processor is one setting (CPU until the benchmark says
// otherwise); the model asset ships with this module. Confidence
// thresholds sit at 0.3, so bottles covering the hand don't lose it.
// The still is never deleted here: the caller deletes it after its
// own decode, so every picture still outlives nothing.
private const val MODEL_ASSET = "hand_landmarker.task"

private const val HAND_LONG_SIDE = 480

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
          .setRunningMode(RunningMode.IMAGE)
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

  fun findIn(context: Context, uri: String): Map<String, Any>? {
    val decoded = decodeSampled(context, uri, HAND_LONG_SIDE) ?: return null
    val bitmap = upright(context, decoded, uri)
    val tracker = ensure(context.applicationContext)
    if (tracker == null) {
      bitmap.recycle()
      return null
    }
    val started = android.os.SystemClock.uptimeMillis()
    val image = BitmapImageBuilder(bitmap).build()
    val result =
      try {
        tracker.detect(image)
      } catch (e: Exception) {
        bitmap.recycle()
        return null
      }
    bitmap.recycle()
    val landmarks = result.landmarks().firstOrNull() ?: return null
    if (landmarks.size <= PINKY_MCP) {
      return null
    }
    val tip = landmarks[INDEX_TIP]
    val index = landmarks[INDEX_MCP]
    val pinky = landmarks[PINKY_MCP]
    val width = hypot(index.x() - pinky.x(), index.y() - pinky.y()).toDouble()
    val score = result.handedness().firstOrNull()?.firstOrNull()?.score()?.toDouble() ?: 0.0
    return mapOf(
      "x" to tip.x().toDouble(),
      "y" to tip.y().toDouble(),
      "confidence" to score,
      "handWidth" to width,
      "detectMs" to (android.os.SystemClock.uptimeMillis() - started).toDouble(),
    )
  }
}
