// Fetches the MediaPipe hand landmarker model from Google's official
// model storage into the sensor module's assets. Approved download
// (Apache 2.0): the model is a tool, not event work, and is logged in
// docs/BUILD_LOG.md under what was not built during the event.
// Run: node scripts/fetch-hand-model.mjs
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';
import { createHash } from 'node:crypto';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = join(root, 'modules', 'ittro-sensors', 'android', 'src', 'main', 'assets', 'hand_landmarker.task');

function download(url, file) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`hand model http ${res.statusCode}`));
        return;
      }
      const out = createWriteStream(file);
      const hash = createHash('sha256');
      res.on('data', (chunk) => hash.update(chunk));
      res.pipe(out);
      out.on('finish', () => resolve(hash.digest('hex')));
      out.on('error', reject);
    }).on('error', reject);
  });
}

mkdirSync(dirname(target), { recursive: true });
if (existsSync(target) && statSync(target).size > 1000000) {
  console.log(`hand model already present: ${target}`);
} else {
  const sha = await download(MODEL_URL, target);
  console.log(`hand model saved: ${target} (${statSync(target).size} bytes, sha256 ${sha})`);
}
