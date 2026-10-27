# ittro-sensors

Skeleton of Ittro's local native module (camera frames, microphone, hand tracking).

Status: skeleton only. Wiring lands next, with the dev-client build:

1. Add `"ittro-sensors": "file:../modules/ittro-sensors"` to `app/package.json`.
2. Run `npx expo prebuild` and compile the dev client.
3. Install on the real phone over wireless adb and test: module status,
   frame IDs and timestamps, hand results with capture-to-use age.

Nothing here is compiled or linked yet; `index.js` reports `available: false`
until then.
