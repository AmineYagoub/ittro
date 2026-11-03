// Fetches the MediaPipe hand landmarker model from Google's official
// model storage into the sensor module's assets. Approved download
// (Apache 2.0): the model is a tool, not event work, and is logged in
// docs/BUILD_LOG.md under what was not built during the event. The
// model's hash is pinned: a file that does not match it, downloaded or
// already present, fails the script, so no APK is built without it.
// Run: node scripts/fetch-hand-model.mjs
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';
import { createHash } from 'node:crypto';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

const MODEL_SHA256 = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';

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
let sha;
if (existsSync(target)) {
  sha = createHash('sha256').update(readFileSync(target)).digest('hex');
  console.log(`hand model already present: ${target}`);
} else {
  sha = await download(MODEL_URL, target);
  console.log(`hand model saved: ${target} (${statSync(target).size} bytes)`);
}
if (sha !== MODEL_SHA256) {
  console.error(`hand model sha256 ${sha} is not the pinned ${MODEL_SHA256}`);
  process.exit(1);
}
