package dev.ittro.sensors

import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

// On-phone sensors for Ittro. The microphone streams 24 kHz PCM frames
// to JavaScript while listening; Meta's realtime endpointing decides
// where sentences end, so there are no fixed-length clips.
class IttroSensorsModule : Module() {
  private var recorder: AudioRecord? = null
  private var streamThread: Thread? = null
  private var chunkSequence = 0
  private val streaming = AtomicBoolean(false)
  private val mainHandler = Handler(Looper.getMainLooper())

  private fun audioManager(): AudioManager? {
    val context = appContext.reactContext ?: return null
    return context.getSystemService(AudioManager::class.java)
  }

  private fun emitChunk(chunk: ByteArray) {
    val payload = Base64.encodeToString(chunk, Base64.NO_WRAP)
    val sequence = chunkSequence
    chunkSequence += 1
    mainHandler.post {
      sendEvent("onAudioChunk", mapOf("chunk" to payload, "sequence" to sequence))
    }
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
      streamThread = Thread {
        val buffer = ByteArray(minBuf)
        var frame = ByteArray(0)
        while (streaming.get()) {
          val read = record.read(buffer, 0, buffer.size)
          if (read > 0) {
            frame += buffer.sliceArray(0 until read)
            while (frame.size >= STREAM_FRAME_BYTES) {
              emitChunk(frame.sliceArray(0 until STREAM_FRAME_BYTES))
              frame = frame.sliceArray(STREAM_FRAME_BYTES until frame.size)
            }
          }
        }
        val tail = if (frame.size % 2 == 1) frame.sliceArray(0 until frame.size - 1) else frame
        if (tail.size >= 2) {
          emitChunk(tail)
        }
        try {
          record.stop()
        } catch (e: Exception) {
        }
        record.release()
      }
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

    Events("onAudioChunk")

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

    Function("startAudioStream") {
      startStream()
    }

    Function("stopAudioStream") {
      stopStream()
    }
  }
}

private const val STREAM_RATE = 24000

private const val STREAM_FRAME_BYTES = 3840
