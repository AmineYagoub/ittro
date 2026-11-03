package dev.ittro.sensors

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// The camera's motion, ported from ~/ittro/native (Flow.kt): block
// matching on a 160 px grey copy of each frame. The motion is the
// median of a 4x4 grid of patches clear of the hand, so a reaching
// hand doesn't drag it. Each patch of a key frame is found again in
// the newest frame near where it was last seen, coarse to fine (±10
// px on a half-size copy, then ±1 px at full size), then to a fraction
// of a pixel from the match's neighbours; the key is renewed after
// 4 px or a second. Matching each frame to the one before in whole
// pixels read a slow drift as none: in t31 the shelf drifted 6 px of
// 160 during a 7 s search while the pan stayed at -0.041. Replayed
// from the t31 screen recording, the key frame read that drift as 6.1
// px and the pan after it as 28.5 of 31, where the old flow read 0
// and 5.5. A patch votes only on an axis its match is sharp along, at
// least a quarter as sharp as across it: a cable says nothing about
// motion along it. While the exposure moves (the picture's mean more
// than 3 levels from the key's), the newest frame is matched to the
// one before and becomes the key: a camera opened for t32's search
// brightened for a second, the key frame read that as a tenth of the
// frame of motion, and the found outline was drawn a bottle off.
// Replayed, that second reads as the old flow does. Flat patches (a
// wall, a clear bottle) give no answer rather than a wrong one. The
// picture growing is read from the same patches: stepping closer moves
// those left of the middle left and those right of it right, so the
// median over each row's mirrored pairs of how far apart they moved
// for how far apart they sit is the growth since the key, and the
// motion is what is left without it. A turn moves both edges a little
// more than the middle, which a mirrored pair cancels: replaying t40's
// swing to a wall and back, all pairs read 15% of growth that was not
// there, mirrored ones 6%; t39's step back, where the outline kept its
// size 1.7 times too tall, read 0.80 of the bottles' 0.735. Growth
// under 0.6% since the key is none, so a still phone does not breathe;
// a key is renewed after 7%, before the edge patches leave their search.
private const val FLAT = 3

private const val COARSE_REACH = 5

private const val REKEY_PX = 4f

private const val REKEY_FRAMES = 30

private const val SHARP_ACROSS = 0.25f

private const val EXPOSURE_STEP = 3f

private const val ZOOM_FLOOR = 0.006f

private const val ZOOM_REKEY = 0.07f

private const val ZOOM_MAX = 0.12f

private const val ZOOM_PAIRS = 3

private val COLS = floatArrayOf(0.15f, 0.38f, 0.62f, 0.85f)

private val ROWS = floatArrayOf(0.2f, 0.4f, 0.6f, 0.8f)

class Flow {
  private var key = IntArray(0)
  private var cur = IntArray(0)
  private var prev = IntArray(0)
  private var keyHalf: IntArray? = null
  private var curHalf: IntArray? = null
  private var prevHalf: IntArray? = null
  private var keyed = false
  private var keyMean = 0f
  private var age = 0
  private var lastX = 0f
  private var lastY = 0f
  private var lastZ = 0f
  var w = 0
    private set
  var h = 0
    private set

  /** How many patches voted on the last frame's motion across. */
  var votesX = 0
    private set

  /** How many patches voted on the last frame's motion up and down. */
  var votesY = 0
    private set

  fun reset() {
    keyed = false
  }

  /** `grey` is w x h, upright; `avoid` is the hand's box, 0 to 1, or null. How far the picture moved since the last frame, 0 to 1 at its middle, and how much it grew about the middle, as x, y and a ratio. */
  fun update(grey: IntArray, width: Int, height: Int, avoid: FloatArray?): FloatArray? {
    if (width != w || height != h || cur.size != width * height) {
      w = width
      h = height
      cur = IntArray(width * height)
      prev = IntArray(width * height)
      key = IntArray(width * height)
      keyed = false
    }
    val older = prev
    prev = cur
    cur = older
    prevHalf = curHalf
    System.arraycopy(grey, 0, cur, 0, width * height)
    curHalf = halve(cur, width, height)
    val mean = cur.sum().toFloat() / cur.size
    votesX = 0
    votesY = 0
    if (!keyed) {
      rekey(mean)
      return null
    }
    val exposed = abs(mean - keyMean) > EXPOSURE_STEP
    val ref = if (exposed) prev else key
    val refHalf = (if (exposed) prevHalf else keyHalf) ?: return null
    if (exposed) {
      lastX = 0f
      lastY = 0f
      lastZ = 0f
    }
    val xs = ArrayList<Float>()
    val xAt = ArrayList<Float>()
    val ys = ArrayList<Float>()
    val yAt = ArrayList<Float>()
    val across = FloatArray(16) { Float.NaN }
    for (row in 0..3) {
      for (col in 0..3) {
        val box = floatArrayOf(COLS[col] - 0.09f, ROWS[row] - 0.09f, COLS[col] + 0.09f, ROWS[row] + 0.09f)
        if (avoid != null && overlaps(box, avoid, 0.05f)) {
          continue
        }
        val ax = (COLS[col] - 0.5f) * w
        val ay = (ROWS[row] - 0.5f) * h
        val m = shift(ref, refHalf, box, (lastX + lastZ * ax).roundToInt(), (lastY + lastZ * ay).roundToInt()) ?: continue
        if (!m[0].isNaN()) {
          xs.add(m[0])
          xAt.add(ax)
          across[row * 4 + col] = m[0]
        }
        if (!m[1].isNaN()) {
          ys.add(m[1])
          yAt.add(ay)
        }
      }
    }
    votesX = xs.size
    votesY = ys.size
    // fewer than three can't outvote one bad patch
    if (xs.size < 3 && ys.size < 3) {
      rekey(mean)
      return null
    }
    val z = zoom(across)
    val x = if (xs.size >= 3) median(xs.indices.map { xs[it] - z * xAt[it] }) else lastX
    val y = if (ys.size >= 3) median(ys.indices.map { ys[it] - z * yAt[it] }) else lastY
    val grew = (1 + z) / (1 + lastZ)
    val step = floatArrayOf((x - grew * lastX) / w, (y - grew * lastY) / h, grew)
    lastX = x
    lastY = y
    lastZ = z
    age += 1
    if (exposed || age >= REKEY_FRAMES || abs(x) > REKEY_PX || abs(y) > REKEY_PX || abs(z) > ZOOM_REKEY) {
      rekey(mean)
    }
    return step
  }

  private fun zoom(across: FloatArray): Float {
    val slopes = ArrayList<Float>()
    for (row in 0..3) for (pair in 0..1) {
      val left = across[row * 4 + pair]
      val right = across[row * 4 + 3 - pair]
      if (!left.isNaN() && !right.isNaN()) slopes.add((right - left) / ((COLS[3 - pair] - COLS[pair]) * w))
    }
    val z = if (slopes.size < ZOOM_PAIRS) return lastZ else median(slopes)
    return if (abs(z) > ZOOM_MAX) lastZ else if (abs(z) < ZOOM_FLOOR) 0f else z
  }

  private fun overlaps(a: FloatArray, b: FloatArray, grow: Float): Boolean =
    a[0] < b[2] + grow && a[2] > b[0] - grow && a[1] < b[3] + grow && a[3] > b[1] - grow

  private fun rekey(mean: Float) {
    System.arraycopy(cur, 0, key, 0, cur.size)
    keyHalf = curHalf
    keyMean = mean
    keyed = true
    age = 0
    lastX = 0f
    lastY = 0f
    lastZ = 0f
  }

  private fun shift(ref: IntArray, refHalf: IntArray, box: FloatArray, px: Int, py: Int): FloatArray? {
    val ch = curHalf ?: return null
    val half = floor(max(4f, min(12f, min((box[2] - box[0]) * w / 4, (box[3] - box[1]) * h / 4)))).toInt()
    val cx = Math.round((box[0] + box[2]) / 2 * w)
    val cy = Math.round((box[1] + box[3]) / 2 * h)
    if (flat(ref, cx, cy, half)) {
      return null
    }
    val coarse = search(refHalf, ch, w / 2, h / 2, cx / 2, cy / 2, max(3, half / 2), COARSE_REACH, px / 2, py / 2) ?: return null
    val fine = search(ref, cur, w, h, cx, cy, half, 1, coarse[0] * 2, coarse[1] * 2) ?: return null
    val bx = fine[0]
    val by = fine[1]
    if (!inside(w, h, cx, cy, half + 1 + max(abs(bx), abs(by)))) {
      return null
    }
    val s0 = sad(ref, cur, w, cx, cy, half, bx, by).toFloat()
    val xm = sad(ref, cur, w, cx, cy, half, bx - 1, by).toFloat()
    val xp = sad(ref, cur, w, cx, cy, half, bx + 1, by).toFloat()
    val ym = sad(ref, cur, w, cx, cy, half, bx, by - 1).toFloat()
    val yp = sad(ref, cur, w, cx, cy, half, bx, by + 1).toFloat()
    return floatArrayOf(fit(s0, xm, xp, min(ym, yp) - s0, bx), fit(s0, ym, yp, min(xm, xp) - s0, by))
  }

  private fun fit(s0: Float, m: Float, p: Float, across: Float, at: Int): Float {
    val rise = min(m, p) - s0
    if (rise <= 0f || rise < SHARP_ACROSS * across) {
      return Float.NaN
    }
    return at + ((m - p) / (2 * (max(m, p) - s0))).coerceIn(-0.5f, 0.5f)
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

  private fun inside(gw: Int, gh: Int, cx: Int, cy: Int, reach: Int): Boolean =
    cx - reach >= 0 && cy - reach >= 0 && cx + reach < gw && cy + reach < gh

  private fun sad(p: IntArray, c: IntArray, gw: Int, cx: Int, cy: Int, half: Int, dx: Int, dy: Int): Int {
    var sum = 0
    for (y in -half until half) {
      val a = (cy + y) * gw + cx
      val b = (cy + y + dy) * gw + cx + dx
      for (x in -half until half) sum += abs(p[a + x] - c[b + x])
    }
    return sum
  }

  private fun search(p: IntArray, c: IntArray, gw: Int, gh: Int, cx: Int, cy: Int, half: Int, r: Int, ox: Int, oy: Int): IntArray? {
    if (!inside(gw, gh, cx, cy, half + r + max(abs(ox), abs(oy)))) {
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
