package dev.ittro.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.camera2.CameraCharacteristics
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.SystemClock
import android.util.Log
import kotlin.math.abs

// The phone's turn, from its gyroscope, as the picture's motion. The
// flow reads motion from the picture, and a reaching hand is part of
// the picture: in t33 the phone turned a quarter of the frame as the
// hand came in, the flow read 0.07 of it, then read 0.12 of motion
// while only the hand moved, and the outline ended a bottle beside the
// Masaad. The gyroscope never sees the hand. While a hand is in view,
// or the flow finds nothing to match, the outline and the pan move by
// the turn on each axis where the turn has agreed with the flow on
// hand-free frames. A fast turn (over 1.2% of the frame a frame) moves
// them by the turn too: in t34 a swing blurred the frames, the flow
// read it backwards, and the outline left the picture for a second.
// How far a radian moves the picture comes from the lens and the
// sensor; the agreement checks the axes and scales that figure (0.6
// to 1.6 of it, or the turn is not used). Readings come 100 times a
// second, the most an app may ask without a permission, and each
// frame takes the turn at its own sensor time. The phone shifting
// without turning is the flow's alone. The gyroscope also creeps: in
// t41 the phone held still while the hand reached, the turn read about
// 1% of the frame a second right and down, and the outline slid a
// third of a bottle off the Guedila in 4 s. On hand-free frames where
// the phone barely turns, what the turn reads beyond the flow is that
// creep; it is learned there and taken off every turn.
private const val RING = 512

private const val SAMPLE_US = 10_000

private const val MOVING = 0.003f

private const val FAST_TURN = 0.012f

private const val AGREE_FRAMES = 10

private const val SCALE_MIN = 0.6

private const val SCALE_MAX = 1.6

private const val CREEP_LEARN = 1.0 / 150

private const val CREEP_MAX = 0.003

object Gyro : SensorEventListener {
  private val lock = Any()
  private val ringTs = LongArray(RING)
  private val ringX = DoubleArray(RING)
  private val ringY = DoubleArray(RING)
  private var ringAt = 0
  private var readings = 0
  private var lastNs = 0L
  private var turnX = 0.0
  private var turnY = 0.0
  private var perRadX = 0.0
  private var perRadY = 0.0
  private var cameraRealtime = true
  private var previous: DoubleArray? = null
  private val flowTimesTurn = DoubleArray(2)
  private val turnSquared = DoubleArray(2)
  private val agreed = IntArray(2)
  private val creep = DoubleArray(2)
  private val crept = IntArray(2)
  private var frameAt = 0L
  private var frameSec = 0.0
  private var manager: SensorManager? = null

  /** Starts the readings for a camera opening, scaled by its lens; false without a gyroscope or a lens the camera describes. */
  fun start(context: Context, handler: Handler, features: CameraCharacteristics, rotationDeg: Int): Boolean {
    val focal = features.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull() ?: return false
    val chip = features.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE) ?: return false
    val sensors = context.getSystemService(SensorManager::class.java) ?: return false
    val gyroscope = sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE) ?: return false
    if (chip.width <= 0f || chip.height <= 0f) {
      return false
    }
    val sideways = (rotationDeg / 90) % 2 == 1
    val realtime = features.get(CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE) == CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE_REALTIME
    synchronized(lock) {
      perRadX = (focal / if (sideways) chip.height else chip.width).toDouble()
      perRadY = (focal / if (sideways) chip.width else chip.height).toDouble()
      cameraRealtime = realtime
      readings = 0
      lastNs = 0L
      previous = null
      frameAt = 0L
      manager = sensors
      Log.i("IttroOutline", "gyro lens ${"%.3f".format(perRadX)},${"%.3f".format(perRadY)} of the frame per radian, camera time realtime $realtime")
    }
    return sensors.registerListener(this, gyroscope, SAMPLE_US, handler)
  }

  /** Stops the readings as the camera closes. */
  fun stop() {
    val sensors = synchronized(lock) { manager.also { manager = null } }
    sensors?.unregisterListener(this)
  }

  override fun onSensorChanged(event: SensorEvent) {
    synchronized(lock) {
      if (lastNs != 0L) {
        val dt = (event.timestamp - lastNs) / 1e9
        if (dt > 0.0 && dt < 0.1) {
          turnX += event.values[0] * dt
          turnY += event.values[1] * dt
        }
      }
      lastNs = event.timestamp
      ringAt = (ringAt + 1) % RING
      ringTs[ringAt] = event.timestamp
      ringX[ringAt] = turnX
      ringY[ringAt] = turnY
      readings = minOf(readings + 1, RING)
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  /** How the picture moved with the phone's turn since the previous frame, 0 to 1 of the frame, x right and y down; null until two frames had readings. */
  fun step(frameNs: Long): FloatArray? {
    synchronized(lock) {
      if (readings < 2 || perRadX <= 0.0 || perRadY <= 0.0) {
        return null
      }
      val at = if (cameraRealtime) frameNs else frameNs + SystemClock.elapsedRealtimeNanos() - System.nanoTime()
      val turn = turnAt(at)
      val before = previous
      previous = turn
      frameSec = if (frameAt != 0L) (at - frameAt) / 1e9 else 0.0
      frameAt = at
      before ?: return null
      return floatArrayOf(((turn[1] - before[1]) * perRadX).toFloat(), ((turn[0] - before[0]) * perRadY).toFloat())
    }
  }

  /** The frame's motion: the flow's, but the turn's less its creep on each axis it has agreed on while a hand is in view, the phone turns fast or the flow is lost. Slower hand-free frames teach the agreement as the phone turns and the creep as it barely does. */
  fun choose(flow: FloatArray?, turn: FloatArray?, hand: Boolean): FloatArray? {
    turn ?: return flow
    synchronized(lock) {
      val fast = abs(turn[0]) >= FAST_TURN || abs(turn[1]) >= FAST_TURN
      if (flow != null && !hand && !fast) {
        for (axis in 0..1) {
          learnCreep(axis, turn[axis], flow[axis])
          val own = turn[axis] - creep[axis] * frameSec
          if (abs(own) >= MOVING) {
            flowTimesTurn[axis] += flow[axis] * own
            turnSquared[axis] += own * own
            agreed[axis] += 1
          }
        }
        return flow
      }
      val chosen = FloatArray(2)
      var turned = false
      for (axis in 0..1) {
        val k = scale(axis)
        if (k != null) {
          chosen[axis] = ((turn[axis] - creep[axis] * frameSec) * k).toFloat()
          turned = true
        } else {
          chosen[axis] = flow?.get(axis) ?: 0f
        }
      }
      return if (turned || flow != null) chosen else null
    }
  }

  /** The turn's scale on each axis against the flow, or "-" before it agrees, and its creep in frames a second, for the log. */
  fun agreement(): String {
    synchronized(lock) {
      val scales = listOf(0, 1).joinToString("/") { axis -> scale(axis)?.let { "%.2f".format(it) } ?: "-" }
      val creeps = listOf(0, 1).joinToString(",") { axis -> "%.4f".format(creep[axis] * (scale(axis) ?: 1.0)) }
      return "$scales creep $creeps"
    }
  }

  private fun learnCreep(axis: Int, turn: Float, flow: Float) {
    val k = scale(axis) ?: return
    if (frameSec <= 0.0 || abs(turn) >= MOVING) {
      return
    }
    crept[axis] += 1
    val beyond = (turn - flow / k).coerceIn(-CREEP_MAX, CREEP_MAX) / frameSec
    creep[axis] += (beyond - creep[axis]) * maxOf(1.0 / crept[axis], CREEP_LEARN)
  }

  // Under the lock: the turn's scale on an axis, once enough hand-free frames compared it with the flow and it fell in range.
  private fun scale(axis: Int): Double? {
    if (agreed[axis] < AGREE_FRAMES || turnSquared[axis] <= 0.0) {
      return null
    }
    val k = flowTimesTurn[axis] / turnSquared[axis]
    return if (k in SCALE_MIN..SCALE_MAX) k else null
  }

  // Under the lock: the turn so far at a sensor time, between the readings around it; the newest past the ring's end.
  private fun turnAt(ns: Long): DoubleArray {
    var after = ringAt
    for (back in 0 until readings) {
      val i = (ringAt - back + RING) % RING
      if (ringTs[i] <= ns) {
        if (i == after) {
          return doubleArrayOf(ringX[i], ringY[i])
        }
        val share = (ns - ringTs[i]).toDouble() / (ringTs[after] - ringTs[i]).coerceAtLeast(1L)
        return doubleArrayOf(ringX[i] + (ringX[after] - ringX[i]) * share, ringY[i] + (ringY[after] - ringY[i]) * share)
      }
      after = i
    }
    return doubleArrayOf(ringX[after], ringY[after])
  }
}
