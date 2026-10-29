package dev.ittro.sensors

import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.Surface
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

// The one camera: preview, stills and hand frames from a single
// Camera2 session, written fresh against the framework API. The
// preview draws the shelf, the still reader feeds the shelf search
// exactly the files it expects, and the hand reader analyses every
// frame it can keep up with on its own thread. Opening twice or
// shooting before ready never crashes; it reports and carries on.
private const val SHOT_TIMEOUT_MS = 5000L

object IttroCamera {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val tracker = HandTracker()
  private val lock = Any()

  private var cameraThread: HandlerThread? = null
  private var handsThread: HandlerThread? = null
  private var device: CameraDevice? = null
  private var session: CameraCaptureSession? = null
  private var handReader: ImageReader? = null
  private var stillReader: ImageReader? = null
  private var shotBytes: ByteArray? = null
  private var shotLatch: CountDownLatch? = null
  private var shotCounter = 0
  private var jpegDeg = 90
  private var opening = AtomicBoolean(false)

  fun setHandDelegate(name: String): Boolean {
    return tracker.setDelegate(name)
  }

  fun isOpen(): Boolean {
    synchronized(lock) {
      return device != null && session != null
    }
  }

  fun open(
    context: Context,
    preview: Surface,
    onReady: () -> Unit,
    onHandFrame: (Map<String, Any>) -> Unit,
    onError: (String) -> Unit,
  ) {
    synchronized(lock) {
      if (device != null || !opening.compareAndSet(false, true)) {
        return
      }
    }
    val app = context.applicationContext
    try {
      val manager = app.getSystemService(CameraManager::class.java) ?: throw Exception("no camera service")
      val id = backCameraId(manager) ?: throw Exception("no back camera")
      val features = manager.getCameraCharacteristics(id)
      val map = features.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP) ?: throw Exception("no stream map")
      val cameraHandler = thread("IttroCamera")
      val handsHandler = thread("IttroHands")
      val handSize = pickHandSize(map.getOutputSizes(ImageFormat.YUV_420_888)) ?: throw Exception("no hand size")
      val stillSize = pickStillSize(map.getOutputSizes(ImageFormat.JPEG)) ?: throw Exception("no still size")
      val hands = ImageReader.newInstance(handSize.width, handSize.height, ImageFormat.YUV_420_888, 2)
      val stills = ImageReader.newInstance(stillSize.width, stillSize.height, ImageFormat.JPEG, 2)
      val rotation = uprightDeg(app, features)
      synchronized(lock) {
        jpegDeg = rotation
      }
      HandFrames(app, tracker, rotation, handsHandler, onHandFrame).attach(hands)
      stills.setOnImageAvailableListener({ reader ->
        val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
        val plane = image.planes[0]
        val bytes = ByteArray(plane.buffer.remaining())
        plane.buffer.get(bytes)
        image.close()
        synchronized(lock) {
          shotBytes = bytes
          shotLatch?.countDown()
        }
      }, cameraHandler)
      manager.openCamera(
        id,
        object : CameraDevice.StateCallback() {
          override fun onOpened(opened: CameraDevice) {
            startSession(app, opened, preview, hands, stills, cameraHandler, onReady, onError)
          }

          override fun onDisconnected(closed: CameraDevice) {
            closed.close()
            fail("camera disconnected", onError)
          }

          override fun onError(closed: CameraDevice, error: Int) {
            closed.close()
            fail("camera error $error", onError)
          }
        },
        cameraHandler,
      )
      synchronized(lock) {
        cameraThread = cameraHandler.looper.thread as HandlerThread
        handsThread = handsHandler.looper.thread as HandlerThread
        handReader = hands
        stillReader = stills
      }
    } catch (e: Exception) {
      fail(e.message ?: "camera open failed", onError)
    }
  }

  fun takeShot(context: Context): String? {
    val captureSession: CameraCaptureSession
    val stills: ImageReader
    val handler: Handler
    val orientation: Int
    synchronized(lock) {
      captureSession = session ?: return null
      stills = stillReader ?: return null
      val thread = cameraThread ?: return null
      handler = Handler(thread.looper)
      orientation = jpegDeg
    }
    val latch = CountDownLatch(1)
    synchronized(lock) {
      shotBytes = null
      shotLatch = latch
    }
    try {
      val request = captureSession.device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
      request.addTarget(stills.surface)
      request.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
      request.set(CaptureRequest.JPEG_ORIENTATION, orientation)
      captureSession.capture(request.build(), null, handler)
    } catch (e: Exception) {
      return null
    }
    try {
      if (!latch.await(SHOT_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
        return null
      }
    } catch (e: InterruptedException) {
      return null
    }
    val bytes: ByteArray
    synchronized(lock) {
      bytes = shotBytes ?: return null
      shotBytes = null
      shotLatch = null
      shotCounter += 1
    }
    return try {
      val file = File(context.cacheDir, "ittro-shot-$shotCounter.jpg")
      file.writeBytes(bytes)
      "file://${file.absolutePath}"
    } catch (e: Exception) {
      null
    }
  }

  fun close() {
    synchronized(lock) {
      try {
        session?.close()
      } catch (e: Exception) {
      }
      try {
        device?.close()
      } catch (e: Exception) {
      }
      try {
        handReader?.close()
      } catch (e: Exception) {
      }
      try {
        stillReader?.close()
      } catch (e: Exception) {
      }
      session = null
      device = null
      handReader = null
      stillReader = null
      shotLatch?.countDown()
      shotLatch = null
      cameraThread?.quitSafely()
      handsThread?.quitSafely()
      cameraThread = null
      handsThread = null
      opening.set(false)
    }
  }

  private fun startSession(
    context: Context,
    opened: CameraDevice,
    preview: Surface,
    hands: ImageReader,
    stills: ImageReader,
    handler: Handler,
    onReady: () -> Unit,
    onError: (String) -> Unit,
  ) {
    try {
      opened.createCaptureSession(
        listOf(preview, hands.surface, stills.surface),
        object : CameraCaptureSession.StateCallback() {
          override fun onConfigured(configured: CameraCaptureSession) {
            try {
              val request = opened.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
              request.addTarget(preview)
              request.addTarget(hands.surface)
              request.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
              request.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)
              configured.setRepeatingRequest(request.build(), null, handler)
            } catch (e: Exception) {
              fail(e.message ?: "repeating request failed", onError)
              return
            }
            synchronized(lock) {
              device = opened
              session = configured
            }
            mainHandler.post { onReady() }
          }

          override fun onConfigureFailed(failed: CameraCaptureSession) {
            fail("session configure failed", onError)
          }
        },
        handler,
      )
    } catch (e: Exception) {
      fail(e.message ?: "session failed", onError)
    }
  }

  private fun fail(message: String, onError: (String) -> Unit) {
    close()
    mainHandler.post { onError(message) }
  }

  private fun thread(name: String): Handler {
    val started = HandlerThread(name)
    started.start()
    return Handler(started.looper)
  }

  private fun backCameraId(manager: CameraManager): String? {
    for (id in manager.cameraIdList) {
      val facing = manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING)
      if (facing == CameraCharacteristics.LENS_FACING_BACK) {
        return id
      }
    }
    return manager.cameraIdList.firstOrNull()
  }

}
