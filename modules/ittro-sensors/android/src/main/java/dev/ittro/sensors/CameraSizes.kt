package dev.ittro.sensors

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.os.Build
import android.util.Size
import android.view.Surface

// Camera size and rotation choices: stills stay near the 1280 px the
// shelf search expects, hand frames stay small and share the stills'
// 4:3 shape so normalized hand points map onto outline boxes, and the
// upright turn comes from the sensor and the display, never a guess.
private const val STILL_MIN_LONG_SIDE = 1280

private const val HAND_MIN_WIDTH = 480

private const val FOUR_THIRDS = 4.0 / 3.0

private const val RATIO_SLACK = 0.05

fun pickStillSize(sizes: Array<Size>?): Size? {
  if (sizes.isNullOrEmpty()) {
    return null
  }
  val big = sizes.filter { maxOf(it.width, it.height) >= STILL_MIN_LONG_SIDE }
  val candidates = big.ifEmpty { sizes.toList() }
  val matched = candidates.filter { isFourThirds(it) }
  return (matched.ifEmpty { candidates }).minByOrNull { it.width * it.height }
}

fun pickHandSize(sizes: Array<Size>?): Size? {
  if (sizes.isNullOrEmpty()) {
    return null
  }
  val near = sizes.filter { isFourThirds(it) && minOf(it.width, it.height) >= HAND_MIN_WIDTH }
  return (near.ifEmpty { sizes.toList() }).minByOrNull { it.width * it.height }
}

fun uprightDeg(context: Context, features: CameraCharacteristics): Int {
  val sensor = features.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
  val displayDeg =
    if (Build.VERSION.SDK_INT >= 30) {
      when (context.display?.rotation) {
        Surface.ROTATION_90 -> 90
        Surface.ROTATION_180 -> 180
        Surface.ROTATION_270 -> 270
        else -> 0
      }
    } else {
      0
    }
  return (sensor - displayDeg + 360) % 360
}

private fun isFourThirds(size: Size): Boolean {
  val odds = maxOf(size.width, size.height).toDouble() / minOf(size.width, size.height).toDouble()
  return odds > FOUR_THIRDS - RATIO_SLACK && odds < FOUR_THIRDS + RATIO_SLACK
}
