package dev.ittro.sensors

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

// The camera's motion between two frames, ported from ~/ittro/native
// (Flow.kt): block matching on a 160 px grey copy of each frame. The
// motion is the median of a 4x4 grid of patches clear of the hand, so
// a reaching hand doesn't drag it, and each patch is matched coarse to
// fine (±10 px on a half-size copy, then ±1 px at full size), so a
// brisk pan is still followed. Flat patches (a wall, a clear bottle)
// match anywhere and give no answer rather than a wrong one.
private const val FLAT = 3

private const val COARSE_REACH = 5

class Flow {
  private var prev: IntArray? = null
  private var cur: IntArray? = null
  private var bufA = IntArray(0)
  private var bufB = IntArray(0)
  private var prevHalf: IntArray? = null
  private var curHalf: IntArray? = null
  var w = 0
    private set
  var h = 0
    private set

  fun reset() {
    prev = null
    cur = null
    prevHalf = null
    curHalf = null
  }

  /** `grey` is w x h, upright; `avoid` is the hand's box, 0 to 1, or null. How far the picture moved, 0 to 1. */
  fun update(grey: IntArray, width: Int, height: Int, avoid: FloatArray?): FloatArray? {
    if (width != w || height != h || bufA.size != width * height) {
      w = width
      h = height
      bufA = IntArray(width * height)
      bufB = IntArray(width * height)
      cur = null
      prev = null
      prevHalf = null
    } else {
      prev = cur
      prevHalf = curHalf
    }
    val own = if (cur === bufA) bufB else bufA
    System.arraycopy(grey, 0, own, 0, width * height)
    cur = own
    curHalf = halve(own, width, height)
    val xs = ArrayList<Float>()
    val ys = ArrayList<Float>()
    for (fy in floatArrayOf(0.2f, 0.4f, 0.6f, 0.8f)) {
      for (fx in floatArrayOf(0.15f, 0.38f, 0.62f, 0.85f)) {
        val box = floatArrayOf(fx - 0.09f, fy - 0.09f, fx + 0.09f, fy + 0.09f)
        if (avoid != null && overlaps(box, avoid, 0.05f)) {
          continue
        }
        val m = motion(box) ?: continue
        xs.add(m[0])
        ys.add(m[1])
      }
    }
    // fewer than three can't outvote one bad patch
    return if (xs.size >= 3) floatArrayOf(median(xs), median(ys)) else null
  }

  fun overlaps(a: FloatArray, b: FloatArray, grow: Float): Boolean =
    a[0] < b[2] + grow && a[2] > b[0] - grow && a[1] < b[3] + grow && a[3] > b[1] - grow

  /** How the picture inside `box` (0 to 1) moved since the previous frame, 0 to 1 across the frame. */
  fun motion(box: FloatArray): FloatArray? {
    val p = prev ?: return null
    val c = cur ?: return null
    val ph = prevHalf ?: return null
    val ch = curHalf ?: return null
    val half = floor(max(4f, min(12f, min((box[2] - box[0]) * w / 4, (box[3] - box[1]) * h / 4)))).toInt()
    val cx = Math.round((box[0] + box[2]) / 2 * w)
    val cy = Math.round((box[1] + box[3]) / 2 * h)
    if (flat(p, cx, cy, half)) {
      return null
    }
    val coarse = search(ph, ch, w / 2, h / 2, cx / 2, cy / 2, max(3, half / 2), COARSE_REACH, 0, 0) ?: return null
    val fine = search(p, c, w, h, cx, cy, half, 1, coarse[0] * 2, coarse[1] * 2) ?: return null
    return floatArrayOf(fine[0].toFloat() / w, fine[1].toFloat() / h)
  }

  private fun median(v: List<Float>): Float {
    val s = v.sorted()
    return if (s.size % 2 == 1) s[s.size / 2] else (s[s.size / 2 - 1] + s[s.size / 2]) / 2
  }

  private fun halve(g: IntArray, gw: Int, gh: Int): IntArray {
    val hw = gw / 2
    val hh = gh / 2
    val out = IntArray(hw * hh)
    for (y in 0 until hh) {
      val a = 2 * y * gw
      val b = a + gw
      for (x in 0 until hw) {
        out[y * hw + x] = (g[a + 2 * x] + g[a + 2 * x + 1] + g[b + 2 * x] + g[b + 2 * x + 1]) shr 2
      }
    }
    return out
  }

  private fun flat(g: IntArray, cx: Int, cy: Int, half: Int): Boolean {
    if (cx - half < 0 || cy - half < 0 || cx + half > w || cy + half > h) {
      return true
    }
    var sum = 0
    for (y in cy - half until cy + half) for (x in cx - half until cx + half) sum += g[y * w + x]
    val n = 4 * half * half
    val mean = sum / n
    var dev = 0
    for (y in cy - half until cy + half) for (x in cx - half until cx + half) dev += abs(g[y * w + x] - mean)
    return dev / n < FLAT
  }

  private fun search(p: IntArray, c: IntArray, gw: Int, gh: Int, cx: Int, cy: Int, half: Int, r: Int, ox: Int, oy: Int): IntArray? {
    val reach = half + r + max(abs(ox), abs(oy))
    if (cx - reach < 0 || cy - reach < 0 || cx + reach >= gw || cy + reach >= gh) {
      return null
    }
    var best = Int.MAX_VALUE
    var bx = ox
    var by = oy
    for (dy in oy - r..oy + r) {
      for (dx in ox - r..ox + r) {
        var sad = 0
        var y = -half
        while (y < half && sad < best) {
          val a = (cy + y) * gw + cx
          val b = (cy + y + dy) * gw + cx + dx
          for (x in -half until half) sad += abs(p[a + x] - c[b + x])
          y++
        }
        if (sad < best) {
          best = sad
          bx = dx
          by = dy
        }
      }
    }
    return intArrayOf(bx, by)
  }
}
