// The log report, proven on simulated phone logs: per-search
// timings, Meta calls, spoken sentences, link episodes and session
// samples, and old logs without the new lines still parse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport, parseLog } from '../scripts/log-report.mjs';

const here = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(here, 'fixtures', name), 'utf8');
}

test('a full search reports every milestone', () => {
  const report = parseLog(fixture('search.log'));
  assert.equal(report.searches.length, 1);
  const [search] = report.searches;
  assert.equal(search.request, 'Masaad water');
  assert.equal(search.confirmed, 41.52);
  assert.equal(search.outline, 31.82);
  assert.equal(search.hand, 52.9);
  assert.equal(search.verdict?.kind, 'yes');
  assert.equal(search.verdict?.t, 58.62);
  assert.equal(report.meta.length, 6);
  assert.deepEqual(report.meta.map((call) => call.name), ['understand', 'package-phrase', 'outline', 'read-shelf', 'understand', 'confirm-hand']);
  assert.ok(report.meta.every((call) => call.outcome === 'ok'));
  assert.equal(report.spoken.lines.length, 4);
  assert.equal(report.spoken.clips, 1);
  assert.equal(report.spoken.lines[0].ms, 3300);
  assert.equal(report.link.transitions, 2);
  assert.equal(report.link.episodes.length, 0);
  assert.equal(report.session.samples, 2);
  assert.equal(report.session.battery?.to, 81);
  assert.equal(report.session.mem?.to, 415);
  const text = formatReport(report, 'search.log');
  assert.match(text, /verdict yes 17\.1s/);
  assert.match(text, /outline: 1 ok p50 2390ms/);
});

test('a request started without a confirm turn counts from its start', () => {
  const log = [
    '[ittro] +34.97s search request started "Masaad water" without a confirm turn',
    '[ittro] +34.97s search begin "Masaad water" epoch 1',
    '[ittro] +37.20s search outlined epoch 1 count 2',
  ].join('\n');
  const report = parseLog(log);
  assert.equal(report.searches.length, 1);
  assert.equal(report.searches[0].confirmed, 34.97);
  assert.equal(report.searches[0].outline, 37.2);
});

test('failures report episodes and failed calls', () => {
  const report = parseLog(fixture('failure.log'));
  assert.equal(report.searches.length, 1);
  assert.equal(report.searches[0].verdict, null);
  assert.equal(report.meta.length, 4);
  assert.deepEqual(report.meta.map((call) => call.outcome), ['down', 'down', 'ok', 'limited']);
  assert.equal(report.spoken.lines.length, 2);
  assert.equal(report.link.transitions, 4);
  assert.equal(report.link.episodes.length, 2);
  assert.equal(report.link.episodes[0].kind, 'down');
  assert.equal(report.link.episodes[0].from, 10.61);
  assert.equal(report.link.episodes[0].to, 32.51);
  assert.equal(report.link.episodes[1].kind, 'limited');
  assert.equal(report.link.episodes[1].to, null);
  const text = formatReport(report, 'failure.log');
  assert.match(text, /down \+10\.6s for 21\.9s/);
  assert.match(text, /failed outline down/);
});

test('logs from earlier phases still parse', () => {
  const report = parseLog(fixture('phase3.log'));
  assert.equal(report.searches.length, 0);
  assert.equal(report.meta.length, 0);
  assert.equal(report.spoken.lines.length, 2);
  assert.equal(report.heard, 1);
  assert.match(formatReport(report, 'phase3.log'), /Searches: 0/);
});
