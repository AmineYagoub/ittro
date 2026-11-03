# ittro-sensors

Ittro's local Expo native module, in Kotlin. The app links it as `ittro-sensors` and talks to it from `app/src`.

- **Microphone:** a 24 kHz mono stream for Muse Voice Transcribe.
- **Camera:** the preview, photos for the relay, and live grey frames for tracking.
- **Hands:** MediaPipe's hand landmarker on those frames (`HandTracker.kt`). Fetch its model with `node app/scripts/fetch-hand-model.mjs`.
- **The outline:** drawn natively and kept on the product as the phone turns and steps closer, from the gyroscope (`Gyro.kt`) and the camera's own motion (`Flow.kt`).
- **Buttons:** earbud presses and a held volume-down key.

`npm run lint` checks the JavaScript shim; the Kotlin is compiled by the app's Android build.
