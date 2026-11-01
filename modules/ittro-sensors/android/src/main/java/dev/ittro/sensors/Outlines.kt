package dev.ittro.sensors

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.View
import kotlin.math.max
import kotlin.math.min

// The guided product's outline, drawn natively over the preview at the
// camera's frame rate, as ~/ittro/native drew it (26 Oct: drawn from
// JavaScript the outlines moved a few times a second, behind the
// picture). SAM's mask when there is one, else its box, with the name
// pill over the top. Hidden from TalkBack; the voice carries it.
class OutlineTarget(
  val key: String,
  val name: String,
  val box: FloatArray,
  val points: FloatArray?,
  val frameW: Float,
  val frameH: Float,
) {
  var dx = 0f
  var dy = 0f

  fun copy(): OutlineTarget = OutlineTarget(key, name, box, points, frameW, frameH).also {
    it.dx = dx
    it.dy = dy
  }
}

class Outlines(context: Context) : View(context) {
  private var target: OutlineTarget? = null
  private val d = resources.displayMetrics.density
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(56, 43, 217, 138); style = Paint.Style.FILL }
  private val shadow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.argb(115, 0, 0, 0)
    style = Paint.Style.STROKE
    strokeWidth = 9 * d
    strokeJoin = Paint.Join.ROUND
  }
  private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(43, 217, 138)
    style = Paint.Style.STROKE
    strokeWidth = 4.5f * d
    strokeJoin = Paint.Join.ROUND
  }
  private val pill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(43, 217, 138) }
  private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(11, 14, 19)
    textSize = 16 * d
    typeface = Typeface.DEFAULT_BOLD
  }
  private val path = Path()

  init {
    importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
  }

  /** On the main thread: the target as moved to the newest frame, or null to clear. */
  fun show(next: OutlineTarget?) {
    target = next
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val t = target ?: return
    // object-fit: cover, as the preview
    val k = max(width / t.frameW, height / t.frameH)
    val ox = (width - t.frameW * k) / 2 + t.dx * k
    val oy = (height - t.frameH * k) / 2 + t.dy * k
    path.reset()
    var topX = (t.box[0] + t.box[2]) / 2
    var topY = t.box[1]
    val s = t.points
    if (s != null && s.size >= 6) {
      topY = Float.MAX_VALUE
      var left = Float.MAX_VALUE
      var right = -Float.MAX_VALUE
      for (i in s.indices step 2) {
        if (s[i + 1] < topY) topY = s[i + 1]
      }
      for (i in s.indices step 2) {
        val x = s[i]
        val y = s[i + 1]
        if (y <= topY + 6) {
          left = min(left, x)
          right = max(right, x)
        }
        if (i == 0) path.moveTo(ox + x * k, oy + y * k) else path.lineTo(ox + x * k, oy + y * k)
      }
      path.close()
      topX = (left + right) / 2
    } else {
      path.addRect(ox + t.box[0] * k, oy + t.box[1] * k, ox + t.box[2] * k, oy + t.box[3] * k, Path.Direction.CW)
    }
    canvas.drawPath(path, fill)
    canvas.drawPath(path, shadow)
    canvas.drawPath(path, line)
    if (t.name.isNotEmpty()) {
      val w = text.measureText(t.name) + 24 * d
      val cx = ox + topX * k
      val left = min(max(8 * d, cx - w / 2), max(8 * d, width - w - 8 * d))
      val top = max(8 * d, oy + topY * k - 40 * d)
      canvas.drawRoundRect(RectF(left, top, left + w, top + 30 * d), 15 * d, 15 * d, pill)
      canvas.drawText(t.name, left + 12 * d, top + 21 * d, text)
    }
  }
}
