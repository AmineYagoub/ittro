package dev.ittro.sensors

import android.content.Context
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.LinearLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

// Ittro's camera on screen: a preview surface with no controls, and
// the three view events the app listens for. The surface opening
// starts the one camera; the view leaving starts nothing and closes
// everything, so a pause, a lock or another app never leaves the
// camera running behind them.
class IttroCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onCameraReady by EventDispatcher<Unit>()
  private val onHandFrame by EventDispatcher()
  private val onCameraError by EventDispatcher()

  private val preview = SurfaceView(context)
  private var active = false
  private var surface: android.view.Surface? = null

  init {
    addView(preview, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT))
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
      onHandFrame = { frame -> post { onHandFrame(frame) } },
      onError = { message -> onCameraError(mapOf("message" to message)) },
    )
  }
}
