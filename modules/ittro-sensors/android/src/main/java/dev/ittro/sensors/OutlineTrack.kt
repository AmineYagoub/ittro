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
// how the picture moved and grew; the outline moves with the whole
// picture and grows about its middle, and the ring below keeps both,
// so a cut of a still taken further back is drawn at the size the
// product is now (t39: 1.7 times too tall after a step back).
// It no longer follows the patch under it: a clear bottle gives that
// patch little to match, and in t31 it crept the outline 24 px of 960
// left with the camera still. While a hand is in view the phone's turn
// moves it instead (Gyro), and it never holds: in t33 it held under
// the reaching hand while the phone turned a quarter of the frame,
// and the hand was led to the wall beside the Masaad. JavaScript
// sends the outline as SAM cut it from a still, with the still's
// number; the still's sensor time finds the camera's motion since, in
// a ring of recent frames, so an outline that arrives seconds late
// still lands on the product. The ring holds about 70 s at 30 frames a
// second: a still is often 11 to 16 s old by the time its outline is
// read (t18), and one older than the ring would be drawn where the
// product was. The same ring tells JavaScript where the camera pointed
// for a still, so a move since is known even for a still taken as the
// camera opened (t32), and JavaScript sends that back with the outline,
// which places it however old the still: t39 guided to a Masaad cut
// 100 s before, carried over from the last request.
private const val GREY_W = 160

private const val RING = 2048

private const val HAND_FRESH_MS = 300L

private const val SHOT_MATCH_NS = 100_000_000L

private const val LOG_EVERY = 30

object OutlineTrack {
  private val lock = Any()
  private val main = Handler(Looper.getMainLooper())
  private val flow = Flow()
  private val frame = GreyFrame(GREY_W)
  private var panX = 0f
  private var panY = 0f
  private var panS = 1f
  private val ringTs = LongArray(RING)
  private val ringX = FloatArray(RING)
  private val ringY = FloatArray(RING)
  private val ringS = FloatArray(RING)
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
      panS = 1f
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

  /** The camera's motion since it opened: where its first middle is now, 0 to 1 of the frame, how much the picture grew, and which opening; null before the first frame. */
  fun pan(): Map<String, Double>? {
    synchronized(lock) {
      if (ringTs[ringAt] == 0L) {
        return null
      }
      return mapOf("x" to panX.toDouble(), "y" to panY.toDouble(), "s" to panS.toDouble(), "session" to session.toDouble())
    }
  }

  /** Where the camera pointed as still `number` was taken, in pan()'s terms; null when no frame of this opening was near it. */
  fun shotPan(number: Int): Map<String, Double>? {
    synchronized(lock) {
      val shotNs = shots[number] ?: return null
      val (best, gap) = nearest(shotNs)
      if (best < 0 || gap > SHOT_MATCH_NS) {
        return null
      }
      return mapOf("x" to ringX[best].toDouble(), "y" to ringY[best].toDouble(), "s" to ringS[best].toDouble(), "session" to session.toDouble())
    }
  }

  /** Where the drawn outline is now: its key, how far it moved from where JavaScript placed it, in photo pixels, and how much it grew about the middle. */
  fun placement(): Map<String, Any>? {
    synchronized(lock) {
      val t = target ?: return null
      return mapOf("outlineKey" to t.key, "outlineDx" to t.dx.toDouble(), "outlineDy" to t.dy.toDouble(), "outlineScale" to t.scale.toDouble())
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
    val size = frame.sample(image, rotationDeg) ?: return
    val fw = size[0]
    val fh = size[1]
    val avoid: FloatArray?
    synchronized(lock) {
      avoid = handBox?.takeIf { SystemClock.uptimeMillis() - handAt < HAND_FRESH_MS }
    }
    val seen = flow.update(frame.grey, fw, fh, avoid)
    val turn = Gyro.step(image.timestamp)
    val global = Gyro.choose(seen, turn, avoid != null)
    val grew = if (global != null && global.size > 2) global[2] else 1f
    val drawn: OutlineTarget?
    synchronized(lock) {
      if (global != null) {
        panX = grew * panX + global[0]
        panY = grew * panY + global[1]
        panS *= grew
      }
      ringAt = (ringAt + 1) % RING
      ringTs[ringAt] = image.timestamp
      ringX[ringAt] = panX
      ringY[ringAt] = panY
      ringS[ringAt] = panS
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
        t.dx = grew * t.dx + global[0] * t.frameW
        t.dy = grew * t.dy + global[1] * t.frameH
        t.scale *= grew
      }
      logCount += 1
      if (logCount % LOG_EVERY == 0) {
        Log.i("IttroOutline", "pan ${"%.3f".format(panX)},${"%.3f".format(panY)} grew ${"%.3f".format(panS)} step ${steps(global)} flow ${steps(seen)} turn ${steps(turn)} agree ${Gyro.agreement()} votes ${flow.votesX}/${flow.votesY} hand ${avoid != null} key ${target?.key ?: "-"} dx ${target?.dx?.toInt()} dy ${target?.dy?.toInt()} scale ${target?.scale?.let { "%.3f".format(it) }}")
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
    val atX = (m["panX"] as? Number)?.toFloat()
    val atY = (m["panY"] as? Number)?.toFloat()
    if (atX != null && atY != null && (m["panSession"] as? Number)?.toInt() == session) {
      t.scale = panS / ((m["panS"] as? Number)?.toFloat() ?: 1f)
      t.dx = (panX - t.scale * atX) * frameW
      t.dy = (panY - t.scale * atY) * frameH
      Log.i("IttroOutline", "placed ${t.key} from its pan dx ${t.dx.toInt()} dy ${t.dy.toInt()} scale ${"%.3f".format(t.scale)}")
      return t
    }
    val shotNs = (m["shot"] as? Number)?.toInt()?.let { shots[it] } ?: return t.also { Log.i("IttroOutline", "placed ${t.key} no shot time") }
    val (best, gap) = nearest(shotNs)
    if (best >= 0 && gap <= SHOT_MATCH_NS) {
      t.scale = panS / ringS[best]
      t.dx = (panX - t.scale * ringX[best]) * frameW
      t.dy = (panY - t.scale * ringY[best]) * frameH
    }
    Log.i("IttroOutline", "placed ${t.key} shot gap ${gap / 1_000_000}ms dx ${t.dx.toInt()} dy ${t.dy.toInt()}")
    return t
  }

  private fun steps(step: FloatArray?): String = step?.let { "%.4f,%.4f".format(it[0], it[1]) } ?: "none"

  private fun nearest(shotNs: Long): Pair<Int, Long> {
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
    return best to gap
  }
}
