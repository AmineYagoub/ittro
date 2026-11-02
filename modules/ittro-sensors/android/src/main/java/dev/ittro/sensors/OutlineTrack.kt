package dev.ittro.sensors

import android.media.Image
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import java.lang.ref.WeakReference
import kotlin.math.abs

// The guided outline follows the shelf on every camera frame. Each
// frame's Y plane is sampled to a 160 px grey copy and the flow says
// how the picture moved; the outline moves with the whole picture.
// It no longer follows the patch under it: a clear bottle gives that
// patch little to match, and in t31 it crept the outline 24 px of 960
// left with the camera still. While the hand is over the outline it
// holds, so an arm outside the hand's box can't drag it (t31: 30 px
// in the second before the touch). JavaScript sends the outline as
// SAM cut it from a still, with the still's number; the still's sensor
// time finds the camera's motion since, in a ring of recent frames, so
// an outline that arrives seconds late still lands on the product. The
// ring holds about 70 s at 30 frames a second: a still is often 11 to
// 16 s old by the time its outline is read (t18), and one older than
// the ring would be drawn where the product was.
private const val GREY_W = 160

private const val RING = 2048

private const val HAND_FRESH_MS = 300L

private const val SHOT_MATCH_NS = 100_000_000L

private const val LOG_EVERY = 30

object OutlineTrack {
  private val lock = Any()
  private val main = Handler(Looper.getMainLooper())
  private val flow = Flow()
  private var grey = IntArray(0)
  private var panX = 0f
  private var panY = 0f
  private val ringTs = LongArray(RING)
  private val ringX = FloatArray(RING)
  private val ringY = FloatArray(RING)
  private var ringAt = 0
  private val shots = LinkedHashMap<Int, Long>()
  private var incoming: Map<String, Any?>? = null
  private var clearing = false
  private var target: OutlineTarget? = null
  private var shownKey: String? = null
  private var handBox: FloatArray? = null
  private var handAt = 0L
  private var view: WeakReference<Outlines>? = null
  private var session = 0
  private var logCount = 0

  fun attach(outlines: Outlines) {
    view = WeakReference(outlines)
  }

  /** A fresh camera: no motion history, and the outline waits for its next still. */
  fun reset() {
    synchronized(lock) {
      session += 1
      flow.reset()
      panX = 0f
      panY = 0f
      ringTs.fill(0L)
      ringAt = 0
      shots.clear()
      target = null
      shownKey = null
      incoming = null
    }
    main.post { view?.get()?.show(null) }
  }

  /** From the view's prop: the outline to draw, or null. The same key is the same SAM cut, already placed. */
  fun setTarget(m: Map<String, Any?>?) {
    synchronized(lock) {
      if (m == null) {
        clearing = true
        incoming = null
        shownKey = null
        return
      }
      val key = m["key"] as? String ?: return
      if (key == shownKey) {
        return
      }
      shownKey = key
      clearing = false
      incoming = m
    }
  }

  fun shot(number: Int, sensorNs: Long) {
    synchronized(lock) {
      shots[number] = sensorNs
      while (shots.size > 32) {
        shots.remove(shots.keys.first())
      }
    }
  }

  /** The camera's motion since it opened, 0 to 1 of the frame, and which opening; null before the first frame. */
  fun pan(): Map<String, Double>? {
    synchronized(lock) {
      if (ringTs[ringAt] == 0L) {
        return null
      }
      return mapOf("x" to panX.toDouble(), "y" to panY.toDouble(), "session" to session.toDouble())
    }
  }

  /** Where the drawn outline is now: its key and how far it moved from where JavaScript placed it, in photo pixels. */
  fun placement(): Map<String, Any>? {
    synchronized(lock) {
      val t = target ?: return null
      return mapOf("outlineKey" to t.key, "outlineDx" to t.dx.toDouble(), "outlineDy" to t.dy.toDouble())
    }
  }

  fun hand(box: FloatArray?) {
    synchronized(lock) {
      handBox = box
      handAt = SystemClock.uptimeMillis()
    }
  }

  /** On the frame thread, every camera frame. */
  fun onImage(image: Image, rotationDeg: Int) {
    val size = sample(image, rotationDeg) ?: return
    val fw = size[0]
    val fh = size[1]
    val avoid: FloatArray?
    synchronized(lock) {
      avoid = handBox?.takeIf { SystemClock.uptimeMillis() - handAt < HAND_FRESH_MS }
    }
    val global = flow.update(grey, fw, fh, avoid)
    val drawn: OutlineTarget?
    synchronized(lock) {
      if (global != null) {
        panX += global[0]
        panY += global[1]
      }
      ringAt = (ringAt + 1) % RING
      ringTs[ringAt] = image.timestamp
      ringX[ringAt] = panX
      ringY[ringAt] = panY
      if (clearing) {
        clearing = false
        target = null
      }
      incoming?.let {
        incoming = null
        target = placed(it)
      }
      val t = target
      if (t != null && global != null) {
        val box = floatArrayOf(
          (t.box[0] + t.dx) / t.frameW,
          (t.box[1] + t.dy) / t.frameH,
          (t.box[2] + t.dx) / t.frameW,
          (t.box[3] + t.dy) / t.frameH,
        )
        if (avoid == null || !flow.overlaps(box, avoid, 0.02f)) {
          t.dx += global[0] * t.frameW
          t.dy += global[1] * t.frameH
        }
      }
      logCount += 1
      if (logCount % LOG_EVERY == 0) {
        Log.i("IttroOutline", "pan ${"%.3f".format(panX)},${"%.3f".format(panY)} step ${global?.let { "%.4f,%.4f".format(it[0], it[1]) } ?: "none"} votes ${flow.votesX}/${flow.votesY} hand ${avoid != null} key ${target?.key ?: "-"} dx ${target?.dx?.toInt()} dy ${target?.dy?.toInt()}")
      }
      drawn = target?.copy()
    }
    main.post { view?.get()?.show(drawn) }
  }

  // Under the lock: the outline from JavaScript, moved from its still to now.
  private fun placed(m: Map<String, Any?>): OutlineTarget? {
    fun f(k: String): Float = (m[k] as? Number)?.toFloat() ?: 0f
    val frameW = f("w")
    val frameH = f("h")
    if (frameW <= 0f || frameH <= 0f) {
      return null
    }
    @Suppress("UNCHECKED_CAST")
    val points = (m["points"] as? List<Any?>)?.mapNotNull { (it as? Number)?.toFloat() }?.toFloatArray()?.takeIf { it.size >= 6 }
    val t = OutlineTarget(m["key"] as String, m["name"] as? String ?: "", floatArrayOf(f("x1"), f("y1"), f("x2"), f("y2")), points, frameW, frameH)
    val shotNs = (m["shot"] as? Number)?.toInt()?.let { shots[it] } ?: return t.also { Log.i("IttroOutline", "placed ${t.key} no shot time") }
    var best = -1
    var gap = Long.MAX_VALUE
    for (i in 0 until RING) {
      if (ringTs[i] == 0L) continue
      val g = abs(ringTs[i] - shotNs)
      if (g < gap) {
        gap = g
        best = i
      }
    }
    if (best >= 0 && gap <= SHOT_MATCH_NS) {
      t.dx = (panX - ringX[best]) * frameW
      t.dy = (panY - ringY[best]) * frameH
    }
    Log.i("IttroOutline", "placed ${t.key} shot gap ${gap / 1_000_000}ms dx ${t.dx.toInt()} dy ${t.dy.toInt()}")
    return t
  }

  // The Y plane, upright, averaged down to 160 px wide; returns its size.
  private fun sample(image: Image, rotationDeg: Int): IntArray? {
    if (image.planes.isEmpty()) {
      return null
    }
    val srcW = image.width
    val srcH = image.height
    val turns = (((rotationDeg % 360) + 360) % 360) / 90
    val swap = turns % 2 == 1
    val longW = if (swap) srcH else srcW
    val longH = if (swap) srcW else srcH
    val gw = GREY_W
    val gh = maxOf(1, (longH * GREY_W) / longW)
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
