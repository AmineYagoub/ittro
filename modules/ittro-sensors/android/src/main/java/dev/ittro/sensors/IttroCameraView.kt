package dev.ittro.sensors

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.FrameLayout
import android.widget.LinearLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

// Ittro's camera on screen: a preview surface with no controls, and
// the four view events the app listens for. The surface opening
// starts the one camera; the view leaving starts nothing and closes
// everything, so a pause, a lock or another app never leaves the
// camera running behind them. Frame and pan events emit straight
// from the camera thread, never queued behind the main thread. The
// guided outline is drawn over the preview by a native layer that
// the camera moves every frame (OutlineTrack).
class IttroCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onCameraReady by EventDispatcher<Unit>()
  private val onHandFrame by EventDispatcher()
  private val onTrackPan by EventDispatcher()
  private val onCameraError by EventDispatcher()

  private val preview = SurfaceView(context)
  private val outlines = Outlines(context)
  private var active = false
  private var surface: android.view.Surface? = null

  init {
    // ExpoView is a LinearLayout, which stacks its children: the outline goes over the preview in a FrameLayout.
    // The preview is a 4:3 stream laid out to cover the screen, centred and cropped: the same mapping the
    // outline draws with.
    val layers = CoverLayout(context, preview)
    try {
      pickPreviewSize(context)?.let { preview.holder.setFixedSize(it.width, it.height) }
    } catch (e: Exception) {
    }
    layers.addView(preview)
    layers.addView(outlines, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    addView(layers, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT))
    OutlineTrack.attach(outlines)
    preview.holder.addCallback(
      object : SurfaceHolder.Callback {
        override fun surfaceCreated(holder: SurfaceHolder) {
          surface = holder.surface
          maybeOpen()
        }

        override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
          surface = holder.surface
          maybeOpen()
        }

        override fun surfaceDestroyed(holder: SurfaceHolder) {
          surface = null
          IttroCamera.close()
        }
      },
    )
  }

  fun setActive(wanted: Boolean) {
    active = wanted
    if (wanted) {
      maybeOpen()
    } else {
      IttroCamera.close()
    }
  }

  fun setOutline(outline: Map<String, Any?>?) {
    OutlineTrack.setTarget(outline)
  }

  fun shutdown() {
    IttroCamera.close()
  }

  private fun maybeOpen() {
    val target = surface ?: return
    if (!active || !target.isValid) {
      return
    }
    if (IttroCamera.isOpen()) {
      onCameraReady(Unit)
      return
    }
    IttroCamera.open(
      context,
      target,
      onReady = { onCameraReady(Unit) },
      onHandFrame = { frame -> onHandFrame(frame) },
      onPan = { pan -> onTrackPan(pan) },
      onError = { message -> onCameraError(mapOf("message" to message)) },
    )
  }
}

// Lays the preview out at 3:4, large enough to cover the view and
// centred, so its edges crop off screen as the outline's mapping
// assumes; every other child fills the view.
private class CoverLayout(context: Context, private val preview: SurfaceView) : FrameLayout(context) {
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val w = MeasureSpec.getSize(widthMeasureSpec)
    val h = MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(w, h)
    for (i in 0 until childCount) {
      val child = getChildAt(i)
      val (cw, ch) = if (child === preview) cover(w, h) else Pair(w, h)
      child.measure(MeasureSpec.makeMeasureSpec(cw, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(ch, MeasureSpec.EXACTLY))
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val w = right - left
    val h = bottom - top
    for (i in 0 until childCount) {
      val child = getChildAt(i)
      val x = (w - child.measuredWidth) / 2
      val y = (h - child.measuredHeight) / 2
      child.layout(x, y, x + child.measuredWidth, y + child.measuredHeight)
    }
  }

  private fun cover(w: Int, h: Int): Pair<Int, Int> {
    if (w <= 0 || h <= 0) {
      return Pair(w, h)
    }
    // upright frames are 3 wide by 4 tall
    return if (w * 4 >= h * 3) Pair(w, w * 4 / 3) else Pair(h * 3 / 4, h)
  }
}
