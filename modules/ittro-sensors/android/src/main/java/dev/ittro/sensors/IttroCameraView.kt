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
    // ExpoView is a LinearLayout, which stacks its children: the outline goes over the preview in a FrameLayout
    val layers = FrameLayout(context)
    layers.addView(preview, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
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
