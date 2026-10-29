/* eslint-disable @typescript-eslint/no-require-imports -- config plugins run in plain node at prebuild */
// Expo config plugin: a volume-down hold means "stop" in Ittro.
// Only the activity sees the volume key, so this injects a
// dispatchKeyEvent override into MainActivity at prebuild time. A
// short press still changes the volume; holding for 0.8 s notifies
// IttroButtons and swallows the repeats, costing one volume step.
const { withMainActivity } = require('@expo/config-plugins');

const MARKER = 'ittro-volume-hold';

const IMPORTS = [
  'import android.os.Handler',
  'import android.os.Looper',
  'import android.view.KeyEvent',
  'import dev.ittro.sensors.IttroButtons',
];

const BODY = `
  // ittro-volume-hold: forward a volume-down hold to the sensors module.
  private var volumeHoldFired = false;
  private val volumeHoldHandler = Handler(Looper.getMainLooper());
  private val volumeHoldTask = Runnable {
    volumeHoldFired = true;
    IttroButtons.volumeHold();
  };

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
      if (event.action == KeyEvent.ACTION_DOWN) {
        if (event.repeatCount == 0) {
          volumeHoldFired = false;
          volumeHoldHandler.postDelayed(volumeHoldTask, 800);
          return super.dispatchKeyEvent(event);
        }
        return true;
      }
      if (event.action == KeyEvent.ACTION_UP) {
        volumeHoldHandler.removeCallbacks(volumeHoldTask);
        if (volumeHoldFired) {
          return true;
        }
      }
    }
    return super.dispatchKeyEvent(event);
  }
`;

function patchMainActivity(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }
  let next = contents;
  for (const line of IMPORTS) {
    if (!next.includes(line)) {
      next = next.replace('import expo.modules.ReactActivityDelegateWrapper', `${line}\nimport expo.modules.ReactActivityDelegateWrapper`);
    }
  }
  const anchor = 'class MainActivity : ReactActivity() {';
  next = next.replace(anchor, `${anchor}${BODY}`);
  return next;
}

module.exports = function withIttroButtons(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language === 'kt') {
      mod.modResults.contents = patchMainActivity(mod.modResults.contents);
    }
    return mod;
  });
};
