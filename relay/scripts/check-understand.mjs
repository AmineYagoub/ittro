// Live check for /understand: runs the fixed utterance set in
// understand-cases.json against the relay and Meta, one paced call
// at a time. Local worker by default; --remote <base> with
// ITTRO_ACCESS_CODE reruns the same set against a deployed relay.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CALL_TIMEOUT_MS = 30000;

function devVar(name) {
  const line = readFileSync(join(root, '.dev.vars'), 'utf8')
    .split('\n')
    .map((row) => row.trim())
    .find((row) => row.startsWith(`${name}=`));
  if (!line) {
    throw new Error(`missing ${name} in relay/.dev.vars`);
  }
  return line.slice(name.length + 1).replace(/^"|"$/g, '');
}

function loadFixture() {
  const raw = JSON.parse(readFileSync(join(root, 'scripts', 'understand-cases.json'), 'utf8'));
  return { pauseMs: raw.pauseMs, effort: raw.effort, cases: raw.cases };
}

async function withTimeout(promise) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('call timed out')), CALL_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function localCaller() {
  const worker = (await import('../src/index.ts')).default;
  const env = {
    META_API_BASE: 'https://api.meta.ai/v1',
    META_API_KEY: devVar('META_API_KEY'),
    APP_ACCESS_CODE: 'proof',
  };
  return (payload) =>
    worker.fetch(
      new Request('http://relay.local/understand', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer proof' },
        body: JSON.stringify(payload),
      }),
      env,
    );
}

function remoteCaller(base) {
  const code = process.env['ITTRO_ACCESS_CODE'] ?? '';
  if (!code) {
    throw new Error('missing ITTRO_ACCESS_CODE for --remote');
  }
  return (payload) =>
    fetch(`${base}/understand`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${code}` },
      body: JSON.stringify(payload),
    });
}

const started = Date.now();
const stamp = () => `+${((Date.now() - started) / 1000).toFixed(2)}s`;

const remoteAt = process.argv.indexOf('--remote');
const call = remoteAt >= 0 ? remoteCaller(process.argv[remoteAt + 1]) : await localCaller();
const { pauseMs, effort, cases } = loadFixture();
console.log(`# understand live check — ${cases.length} cases (${remoteAt >= 0 ? 'remote' : 'local worker'} + Meta)`);

let failures = 0;
let lastStart = 0;
for (const row of cases) {
  const wait = lastStart === 0 ? 0 : Math.max(0, pauseMs - (Date.now() - lastStart));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastStart = Date.now();
  let intent = 'transport-error';
  let product = '';
  try {
    const res = await withTimeout(
      call({
        transcript: row.transcript,
        language: row.language,
        step: row.step,
        pending_question: row.pending_question,
        pending_request: row.pending_request,
        last_line: row.last_line,
        effort,
      }),
    );
    const body = await res.json();
    if (body.ok && body.answer) {
      intent = body.answer.intent;
      product = body.answer.product_text ?? '';
    }
  } catch {
    intent = 'transport-error';
  }
  const productOk = row.want_product === undefined || product === row.want_product;
  const ok = row.expect.includes(intent) && productOk;
  if (!ok) {
    failures += 1;
  }
  const ms = ((Date.now() - lastStart) / 1000).toFixed(2);
  const productPart = row.want_product === undefined ? '' : ` product=${JSON.stringify(product)} want=${JSON.stringify(row.want_product)}`;
  console.log(`${stamp()} ${ok ? 'PASS' : 'FAIL'} ${row.id} got=${intent} want=${row.expect.join('|')}${productPart} ${ms}s`);
}
console.log(`${stamp()} DONE failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
