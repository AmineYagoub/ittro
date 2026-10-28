package dev.ittro.sensors

import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean

// On-phone sensors for Ittro. Owned grayscale frame buffers and hand
// tracking land here in a later phase; volume and thermal status are
// needed now for the real-phone rules.
class IttroSensorsModule : Module() {
  private var recorder: AudioRecord? = null
  private var recordThread: Thread? = null
  private var recordFile: File? = null
  private val capturing = AtomicBoolean(false)

  private fun audioManager(): AudioManager? {
    val context = appContext.reactContext ?: return null
    return context.getSystemService(AudioManager::class.java)
  }

  private fun startCapture(): Boolean {
    if (capturing.get()) {
      return false
    }
    val channel = AudioFormat.CHANNEL_IN_MONO
    val encoding = AudioFormat.ENCODING_PCM_16BIT
    val minBuf = AudioRecord.getMinBufferSize(CAPTURE_RATE, channel, encoding)
    if (minBuf <= 0) {
      return false
    }
    val record = try {
      AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, CAPTURE_RATE, channel, encoding, minBuf * 2)
    } catch (e: Exception) {
      return false
    }
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      return false
    }
    val dir = appContext.cacheDirectory ?: return false
    val file = File(dir, "ittro-clip.wav")
    try {
      val stream = FileOutputStream(file)
      stream.write(wavHeader(0))
      recorder = record
      recordFile = file
      capturing.set(true)
      record.startRecording()
      recordThread = Thread {
        val buffer = ByteArray(minBuf)
        while (capturing.get()) {
          val read = record.read(buffer, 0, buffer.size)
          if (read > 0) {
            try {
              stream.write(buffer, 0, read)
            } catch (e: Exception) {
              break
            }
          }
        }
        try {
          stream.close()
        } catch (e: Exception) {
        }
        try {
          val fix = RandomAccessFile(file, "rw")
          fix.write(wavHeader((file.length() - 44).toInt()))
          fix.close()
        } catch (e: Exception) {
        }
        try {
          record.stop()
        } catch (e: Exception) {
        }
        record.release()
      }
      recordThread?.start()
      return true
    } catch (e: Exception) {
      record.release()
      return false
    }
  }

  private fun stopCapture(): String? {
    if (!capturing.getAndSet(false)) {
      return null
    }
    try {
      recordThread?.join(2000)
    } catch (e: Exception) {
    }
    recordThread = null
    recorder = null
    val file = recordFile
    recordFile = null
    if (file == null || !file.exists() || file.length() <= 44) {
      return null
    }
    return file.absolutePath
  }

  override fun definition() = ModuleDefinition {
    Name("IttroSensors")

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

    Function("startAudioCapture") {
      startCapture()
    }

    Function("stopAudioCapture") {
      stopCapture()
    }
  }
}

private const val CAPTURE_RATE = 16000

private fun wavHeader(dataBytes: Int): ByteArray {
  val total = 36 + dataBytes
  val out = java.nio.ByteBuffer.allocate(44).order(java.nio.ByteOrder.LITTLE_ENDIAN)
  out.put("RIFF".toByteArray())
  out.putInt(total)
  out.put("WAVE".toByteArray())
  out.put("fmt ".toByteArray())
  out.putInt(16)
  out.putShort(1)
  out.putShort(1)
  out.putInt(CAPTURE_RATE)
  out.putInt(CAPTURE_RATE * 2)
  out.putShort(2)
  out.putShort(16)
  out.put("data".toByteArray())
  out.putInt(dataBytes)
  return out.array()
}
