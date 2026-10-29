// Makes a VAPID key pair for helper push tickles and prints it in
// .dev.vars format. Run once per machine, append the output to
// relay/.dev.vars, and never commit the keys.
import { webcrypto } from 'node:crypto';

function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const rawPublic = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
console.log(`VAPID_PUBLIC_KEY=${base64Url(rawPublic)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log('VAPID_SUBJECT=mailto:help@ittro.example');
