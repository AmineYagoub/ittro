package dev.ittro.sensors

import android.app.ActivityManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.PowerManager
import android.os.Process
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

// On-phone sensors for Ittro. The microphone streams 24 kHz PCM frames
// to JavaScript while listening; Meta's realtime endpointing decides
// where sentences end, so there are no fixed-length clips. Listening
// comes first: the mic thread runs at audio priority and emits
// straight from that thread, never queued behind the main thread.
class IttroSensorsModule : Module() {
  private var recorder: AudioRecord? = null
  private var streamThread: Thread? = null
  private var chunkSequence = 0
  private val streaming = AtomicBoolean(false)

  private fun audioManager(): AudioManager? {
    val context = appContext.reactContext ?: return null
    return context.getSystemService(AudioManager::class.java)
  }

  private fun emitChunk(chunk: ByteArray) {
    val payload = Base64.encodeToString(chunk, Base64.NO_WRAP)
    val sequence = chunkSequence
    chunkSequence += 1
    sendEvent("onAudioChunk", mapOf("chunk" to payload, "sequence" to sequence))
  }

  private fun startStream(): Boolean {
    if (streaming.get()) {
      return false
    }
    val channel = AudioFormat.CHANNEL_IN_MONO
    val encoding = AudioFormat.ENCODING_PCM_16BIT
    val minBuf = AudioRecord.getMinBufferSize(STREAM_RATE, channel, encoding)
    if (minBuf <= 0) {
      return false
    }
    val record = try {
      AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, STREAM_RATE, channel, encoding, minBuf * 2)
    } catch (e: Exception) {
      return false
    }
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      return false
    }
    try {
      recorder = record
      chunkSequence = 0
      streaming.set(true)
      record.startRecording()
      streamThread = Thread({
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        val buffer = ByteArray(minBuf)
        val frame = ByteArrayOutputStream(STREAM_FRAME_BYTES * 2)
        while (streaming.get()) {
          val read = record.read(buffer, 0, buffer.size)
          if (read > 0) {
            frame.write(buffer, 0, read)
            while (frame.size() >= STREAM_FRAME_BYTES) {
              val bytes = frame.toByteArray()
              emitChunk(bytes.sliceArray(0 until STREAM_FRAME_BYTES))
              frame.reset()
              frame.write(bytes, STREAM_FRAME_BYTES, bytes.size - STREAM_FRAME_BYTES)
            }
          }
        }
        val tail = frame.toByteArray()
        val even = if (tail.size % 2 == 1) tail.sliceArray(0 until tail.size - 1) else tail
        if (even.size >= 2) {
          emitChunk(even)
        }
        try {
          record.stop()
        } catch (e: Exception) {
        }
        record.release()
      }, "IttroAudio")
      streamThread?.start()
      return true
    } catch (e: Exception) {
      record.release()
      return false
    }
  }

  private fun stopStream(): Boolean {
    if (!streaming.getAndSet(false)) {
      return false
    }
    try {
      streamThread?.join(2000)
    } catch (e: Exception) {
    }
    streamThread = null
    recorder = null
    return true
  }

  override fun definition() = ModuleDefinition {
    Name("IttroSensors")

    Events("onAudioChunk", "onButtonPress", "onEarbudState")

    OnCreate {
      IttroButtons.sink = { name, payload -> sendEvent(name, payload) }
    }

    OnDestroy {
      IttroButtons.sink = null
      IttroButtons.stop()
    }

    Function("getStatus") {
      mapOf(
        "available" to true,
        "module" to "IttroSensors",
      )
    }

    Function("getMediaVolume") {
      val manager = audioManager()
      mapOf(
        "volume" to (manager?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: -1),
        "max" to (manager?.getStreamMaxVolume(AudioManager.STREAM_MUSIC) ?: -1),
      )
    }

    Function("setMediaVolume") { fraction: Double ->
      val manager = audioManager() ?: return@Function false
      val max = manager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      val index = (fraction * max).toInt().coerceIn(0, max)
      manager.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0)
      true
    }

    Function("getThermalStatus") {
      try {
        val context = appContext.reactContext ?: return@Function -1
        val power = context.getSystemService(PowerManager::class.java) ?: return@Function -1
        power.currentThermalStatus
      } catch (e: Exception) {
        -1
      }
    }

    Function("getMemoryStatus") {
      try {
        val context = appContext.reactContext ?: return@Function mapOf("availMb" to -1, "totalMb" to -1)
        val manager = context.getSystemService(ActivityManager::class.java) ?: return@Function mapOf("availMb" to -1, "totalMb" to -1)
        val info = ActivityManager.MemoryInfo()
        manager.getMemoryInfo(info)
        mapOf("availMb" to (info.availMem / 1048576).toInt(), "totalMb" to (info.totalMem / 1048576).toInt())
      } catch (e: Exception) {
        mapOf("availMb" to -1, "totalMb" to -1)
      }
    }

    Function("setButtonsActive") { active: Boolean ->
      val context = appContext.reactContext ?: return@Function false
      if (active) IttroButtons.start(context) else true.also { IttroButtons.stop() }
    }

    Function("getEarbudState") {
      val context = appContext.reactContext
      mapOf("connected" to (context != null && IttroButtons.isConnected(context)))
    }

    Function("startAudioStream") {
      startStream()
    }

    Function("stopAudioStream") {
      stopStream()
    }

    AsyncFunction("prepareShelfPhoto") { uri: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      shotPhoto(context, uri)
    }

    AsyncFunction("cropShelfPhoto") { photo: String, x1: Int, y1: Int, x2: Int, y2: Int ->
      shotCrop(photo, x1, y1, x2, y2)
    }

    Function("setHandDelegate") { delegate: String ->
      IttroCamera.setHandDelegate(delegate)
    }

    AsyncFunction("takeCameraShot") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      IttroCamera.takeShot(context)
    }

    View(IttroCameraView::class) {
      Events("onCameraReady", "onHandFrame", "onTrackPan", "onCameraError")

      Prop("active") { view: IttroCameraView, active: Boolean? ->
        view.setActive(active ?: false)
      }

      OnViewDestroys { view: IttroCameraView ->
        view.shutdown()
      }
    }
  }
}

private const val STREAM_RATE = 24000

private const val STREAM_FRAME_BYTES = 3840
