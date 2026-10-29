package dev.ittro.sensors

import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothHeadset
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.session.MediaSession
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent

// Earbud button and earbud connection for Ittro. While active, a
// platform media session receives the earbud button, wired and
// Bluetooth alike; presses classify into single, double, triple and
// hold, with next track as double and previous track as triple. A
// headset receiver reports connection changes. Volume-down holds
// arrive from MainActivity, which sees the key first.
object IttroButtons {
  private const val PRESS_WINDOW_MS = 450L
  private const val HOLD_MS = 800L

  var sink: ((String, Map<String, Any>) -> Unit)? = null

  private var session: MediaSession? = null
  private var receiver: BroadcastReceiver? = null
  private var appContext: Context? = null
  private val handler = Handler(Looper.getMainLooper())
  private var pressCount = 0
  private var holdFired = false

  private val windowTask = Runnable {
    val gesture = when (pressCount) {
      2 -> "double"
      3 -> "triple"
      else -> "single"
    }
    pressCount = 0
    holdFired = false
    sink?.invoke("onButtonPress", mapOf("gesture" to gesture))
  }

  private val holdTask = Runnable {
    holdFired = true
    pressCount = 0
    handler.removeCallbacks(windowTask)
    sink?.invoke("onButtonPress", mapOf("gesture" to "hold"))
  }

  private fun resetPresses() {
    handler.removeCallbacks(windowTask)
    handler.removeCallbacks(holdTask)
    pressCount = 0
    holdFired = false
  }

  private fun onClickDown() {
    if (pressCount == 0) {
      holdFired = false
      handler.postDelayed(holdTask, HOLD_MS)
    } else {
      handler.removeCallbacks(holdTask)
    }
    pressCount += 1
    if (pressCount >= 3) {
      resetPresses()
      sink?.invoke("onButtonPress", mapOf("gesture" to "triple"))
    }
  }

  private fun onClickUp() {
    if (holdFired) {
      resetPresses()
      return
    }
    handler.removeCallbacks(holdTask)
    handler.removeCallbacks(windowTask)
    handler.postDelayed(windowTask, PRESS_WINDOW_MS)
  }

  fun start(context: Context): Boolean {
    if (session != null) {
      return true
    }
    val session = MediaSession(context, "IttroButtons")
    session.setCallback(
      object : MediaSession.Callback() {
        override fun onMediaButtonEvent(intent: Intent): Boolean {
          val event = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
            ?: return super.onMediaButtonEvent(intent)
          return handleKey(event)
        }
      },
    )
    session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
    session.isActive = true
    this.session = session
    appContext = context.applicationContext
    resetPresses()
    val seen = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        emitState(context)
      }
    }
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_HEADSET_PLUG)
      addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED)
      addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
      addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
    }
    try {
      context.registerReceiver(seen, filter)
    } catch (e: Exception) {
      session.release()
      this.session = null
      return false
    }
    receiver = seen
    emitState(context)
    return true
  }

  fun stop() {
    resetPresses()
    try {
      session?.release()
    } catch (e: Exception) {
    }
    session = null
    try {
      receiver?.let { appContext?.unregisterReceiver(it) }
    } catch (e: Exception) {
    }
    receiver = null
    appContext = null
  }

  fun handleKey(event: KeyEvent): Boolean {
    when (event.keyCode) {
      KeyEvent.KEYCODE_MEDIA_NEXT -> {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
          resetPresses()
          sink?.invoke("onButtonPress", mapOf("gesture" to "double"))
        }
        return true
      }
      KeyEvent.KEYCODE_MEDIA_PREVIOUS -> {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
          resetPresses()
          sink?.invoke("onButtonPress", mapOf("gesture" to "triple"))
        }
        return true
      }
      KeyEvent.KEYCODE_VOICE_ASSIST -> {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
          resetPresses()
          sink?.invoke("onButtonPress", mapOf("gesture" to "hold"))
        }
        return true
      }
      KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
      KeyEvent.KEYCODE_MEDIA_PLAY,
      KeyEvent.KEYCODE_MEDIA_PAUSE,
      KeyEvent.KEYCODE_HEADSETHOOK,
      KeyEvent.KEYCODE_MEDIA_STOP,
      -> {
        if (event.repeatCount > 0) {
          return true
        }
        if (event.action == KeyEvent.ACTION_DOWN) {
          onClickDown()
        } else if (event.action == KeyEvent.ACTION_UP) {
          onClickUp()
        }
        return true
      }
      else -> return false
    }
  }

  fun volumeHold() {
    sink?.invoke("onButtonPress", mapOf("gesture" to "volumeHold"))
  }

  fun isConnected(context: Context): Boolean {
    val manager = context.getSystemService(AudioManager::class.java) ?: return false
    val outputs = try {
      manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    } catch (e: Exception) {
      return false
    }
    return outputs.any { device ->
      device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
        device.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
        device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
        device.type == AudioDeviceInfo.TYPE_USB_HEADSET ||
        device.type == AudioDeviceInfo.TYPE_USB_DEVICE
    }
  }

  private fun emitState(context: Context) {
    sink?.invoke("onEarbudState", mapOf("connected" to isConnected(context)))
  }
}
