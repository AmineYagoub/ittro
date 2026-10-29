package dev.ittro.sensors

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream

// Shelf photos for Ittro. One still becomes the 1280 px photo SAM and
// Spark read plus the 160 px grey the sharpest-frame pick compares;
// each outline is then cut back out at up to 1024 px for its label
// read. Everything runs off the JavaScript thread, so the screen
// never freezes, and each still is deleted once decoded, so no
// picture outlives its answer.
fun decodeSampled(context: Context, uri: String, maxWidth: Int): Bitmap? {
  val parsed = Uri.parse(uri) ?: return null
  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  try {
    context.contentResolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it, null, bounds) }
  } catch (e: Exception) {
    return null
  }
  if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
    return null
  }
  var sample = 1
  while (bounds.outWidth / (sample * 2) >= maxWidth && maxWidth > 0) {
    sample *= 2
  }
  val options = BitmapFactory.Options().apply { inSampleSize = sample }
  return try {
    context.contentResolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it, null, options) }
  } catch (e: Exception) {
    null
  }
}

fun deleteStill(context: Context, uri: String) {
  try {
    val parsed = Uri.parse(uri) ?: return
    if (parsed.scheme == "file") {
      parsed.path?.let { java.io.File(it).delete() }
    } else {
      context.contentResolver.delete(parsed, null, null)
    }
  } catch (e: Exception) {
  }
}

fun upright(context: Context, bitmap: Bitmap, uri: String): Bitmap {
  return try {
    val stream = context.contentResolver.openInputStream(Uri.parse(uri)) ?: return bitmap
    val orientation = stream.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) }
    val angle = when (orientation) {
      3 -> 180f
      6 -> 90f
      8 -> 270f
      else -> 0f
    }
    if (angle == 0f) {
      bitmap
    } else {
      val matrix = Matrix().apply { postRotate(angle) }
      val turned = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      bitmap.recycle()
      turned
    }
  } catch (e: Exception) {
    bitmap
  }
}

fun greyOf(bitmap: Bitmap): ByteArray {
  val width = bitmap.width
  val height = bitmap.height
  val pixels = IntArray(width * height)
  bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
  val grey = ByteArray(width * height)
  for (at in pixels.indices) {
    val pixel = pixels[at]
    val red = (pixel shr 16) and 0xFF
    val green = (pixel shr 8) and 0xFF
    val blue = pixel and 0xFF
    grey[at] = ((red * 77 + green * 150 + blue * 29) shr 8).toByte()
  }
  return grey
}

fun jpegOf(bitmap: Bitmap): ByteArray {
  val out = ByteArrayOutputStream()
  bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
  return out.toByteArray()
}

fun shotPhoto(context: Context, uri: String): Map<String, Any>? {
  val decoded = decodeSampled(context, uri, PHOTO_LONG_SIDE)
  if (decoded == null) {
    deleteStill(context, uri)
    return null
  }
  val bitmap = upright(context, decoded, uri)
  val longest = maxOf(bitmap.width, bitmap.height)
  val photo = if (longest > PHOTO_LONG_SIDE) {
    val factor = PHOTO_LONG_SIDE.toDouble() / longest
    val scaled = Bitmap.createScaledBitmap(bitmap, (bitmap.width * factor).toInt(), (bitmap.height * factor).toInt(), true)
    bitmap.recycle()
    scaled
  } else {
    bitmap
  }
  val greyWidth = 160
  val greyHeight = maxOf(1, (photo.height * greyWidth) / photo.width)
  val small = Bitmap.createScaledBitmap(photo, greyWidth, greyHeight, true)
  val answer = mapOf(
    "photo" to Base64.encodeToString(jpegOf(photo), Base64.NO_WRAP),
    "w" to photo.width,
    "h" to photo.height,
    "grey" to Base64.encodeToString(greyOf(small), Base64.NO_WRAP),
    "gw" to greyWidth,
    "gh" to greyHeight,
  )
  small.recycle()
  photo.recycle()
  deleteStill(context, uri)
  return answer
}

fun shotCrop(photo: String, x1: Int, y1: Int, x2: Int, y2: Int): Map<String, Any>? {
  val bytes = try {
    Base64.decode(photo, Base64.DEFAULT)
  } catch (e: Exception) {
    return null
  }
  val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
  val left = x1.coerceIn(0, bitmap.width - 1)
  val top = y1.coerceIn(0, bitmap.height - 1)
  val right = x2.coerceIn(left + 1, bitmap.width)
  val bottom = y2.coerceIn(top + 1, bitmap.height)
  val cut = try {
    Bitmap.createBitmap(bitmap, left, top, right - left, bottom - top)
  } catch (e: Exception) {
    bitmap.recycle()
    return null
  }
  bitmap.recycle()
  val longest = maxOf(cut.width, cut.height)
  val scaled = if (longest > CROP_LONG_SIDE) {
    val factor = CROP_LONG_SIDE.toDouble() / longest
    Bitmap.createScaledBitmap(cut, (cut.width * factor).toInt(), (cut.height * factor).toInt(), true)
  } else {
    cut
  }
  val answer = mapOf(
    "image" to Base64.encodeToString(jpegOf(scaled), Base64.NO_WRAP),
    "mime" to "image/jpeg",
  )
  if (scaled != cut) {
    scaled.recycle()
  }
  cut.recycle()
  return answer
}

const val PHOTO_LONG_SIDE = 1280

const val CROP_LONG_SIDE = 1024
