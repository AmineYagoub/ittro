// Test register: installs the loader and the React Native globals the
// app expects, before any test file loads.
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);

globalThis.__DEV__ = true;
