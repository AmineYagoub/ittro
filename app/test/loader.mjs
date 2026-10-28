// Test loader: resolves the app's extensionless imports under node and
// swaps every native module for the in-memory stub, so the real
// statechart runs on the Mac with no phone and no new dependencies.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STUBS = new URL('./stubs.mjs', import.meta.url).href;

const NATIVE = new Set([
  'ittro-sensors',
  'react-native',
  'expo-speech',
  'expo-audio',
  'expo-constants',
  '@react-native-async-storage/async-storage',
]);

function isStubbed(specifier) {
  if (NATIVE.has(specifier)) {
    return true;
  }
  const base = specifier.split('/').pop() ?? '';
  return base === 'voiceClips' || base === 'soundBank' || base === 'voiceClips.ts' || base === 'soundBank.ts';
}

export async function resolve(specifier, context, nextResolve) {
  if (isStubbed(specifier)) {
    return { url: STUBS, shortCircuit: true };
  }
  if (specifier.startsWith('.')) {
    const parentPath = dirname(fileURLToPath(context.parentURL));
    for (const candidate of [specifier, `${specifier}.ts`, `${specifier}.tsx`]) {
      const path = join(parentPath, candidate);
      if (existsSync(path)) {
        return nextResolve(`./${candidate}`, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
