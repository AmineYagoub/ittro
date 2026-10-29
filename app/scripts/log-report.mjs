// Turns a saved phone log into the dependability report: timing
// per search (request confirmed, first outline, hand on product,
// verdict), each Meta call, each spoken sentence, link episodes and
// the session's battery, heat and memory. Reads Metro console or
// logcat saves; anything without an [ittro] stamp is ignored.
// Usage: node app/scripts/log-report.mjs <logfile>
import { readFileSync } from 'node:fs';

function stampOf(body) {
  const found = /^\+([0-9.]+)s\s?([\s\S]*)$/.exec(body);
  if (!found) {
    return { t: null, msg: body };
  }
  return { t: Number(found[1]), msg: found[2] };
}

function quoted(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text.replace(/^"|"$/g, '');
  }
}

function seconds(value) {
  return value === null || !Number.isFinite(value) ? '—' : `+${value.toFixed(1)}s`;
}

function delta(value, base) {
  return value === null || base === null ? '—' : `${(value - base).toFixed(1)}s`;
}

export function parseLog(text) {
  const events = [];
  for (const raw of text.split('\n')) {
    const at = raw.indexOf('[ittro]');
    if (at < 0) {
      continue;
    }
    const { t, msg } = stampOf(raw.slice(at + '[ittro]'.length).trim());
    events.push({ t, msg });
  }
  return {
    lines: events.length,
    span: spanOf(events),
    searches: searchesOf(events),
    meta: metaOf(events),
    spoken: spokenOf(events),
    link: linkOf(events),
    session: sessionOf(events),
    heard: events.filter((event) => event.msg.startsWith('heard:')).length,
  };
}

function spanOf(events) {
  const stamped = events.filter((event) => event.t !== null).map((event) => event.t);
  if (stamped.length === 0) {
    return null;
  }
  return Math.max(...stamped) - Math.min(...stamped);
}

function searchesOf(events) {
  const marks = [];
  events.forEach((event, index) => {
    const begin = /^search begin (".*") epoch (\d+)$/.exec(event.msg);
    if (begin) {
      marks.push({ index, kind: 'begin', request: quoted(begin[1]), epoch: Number(begin[2]) });
      return;
    }
    const confirmed = /^search request confirmed (".*")$/.exec(event.msg);
    if (confirmed) {
      marks.push({ index, kind: 'confirmed', request: quoted(confirmed[1]) });
    }
  });
  const searches = [];
  let open = null;
  const close = () => {
    if (open) {
      searches.push(open);
      open = null;
    }
  };
  for (const mark of marks) {
    if (mark.kind === 'begin') {
      close();
      open = { request: mark.request, epoch: mark.epoch, from: mark.index, confirmed: null, outline: null, hand: null, verdict: null };
    } else if (open) {
      open.confirmed = open.confirmed ?? events[mark.index].t;
    } else {
      open = { request: mark.request, epoch: null, from: mark.index, confirmed: events[mark.index].t, outline: null, hand: null, verdict: null };
    }
  }
  close();
  for (const [at, search] of searches.entries()) {
    const next = searches[at + 1];
    const window = events.slice(search.from, next ? next.from : events.length);
    for (const event of window) {
      if (search.outline === null && event.msg.startsWith('search outlined epoch')) {
        search.outline = event.t;
      } else if (search.hand === null && event.msg.startsWith('guide hand on product')) {
        search.hand = event.t;
      } else if (search.verdict === null && event.msg.startsWith('confirm verdict')) {
        const kind = /^confirm verdict (\w+)/.exec(event.msg);
        search.verdict = { kind: kind ? kind[1] : '?', t: event.t };
      }
    }
  }
  return searches;
}

function metaOf(events) {
  const open = new Map();
  const calls = [];
  for (const event of events) {
    const sent = /^meta (\S+) sent$/.exec(event.msg);
    if (sent) {
      const queue = open.get(sent[1]) ?? [];
      queue.push(event.t);
      open.set(sent[1], queue);
      continue;
    }
    const done = /^meta (\S+) ok (\d+)ms$/.exec(event.msg);
    if (done) {
      const queue = open.get(done[1]) ?? [];
      calls.push({ name: done[1], t: queue.shift() ?? null, ms: Number(done[2]), outcome: 'ok' });
      continue;
    }
    const failed = /^meta (\S+) failed (\w+) (\d+)ms$/.exec(event.msg);
    if (failed) {
      const queue = open.get(failed[1]) ?? [];
      calls.push({ name: failed[1], t: queue.shift() ?? null, ms: Number(failed[3]), outcome: failed[2] });
    }
  }
  for (const [name, queue] of open) {
    for (const t of queue) {
      calls.push({ name, t, ms: null, outcome: 'cut' });
    }
  }
  calls.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));
  return calls;
}

function spokenOf(events) {
  const lines = [];
  events.forEach((event, index) => {
    const said = /^say: (".*")$/.exec(event.msg);
    if (said) {
      const next = events[index + 1];
      const took = next && /^said (\d+)ms$/.exec(next.msg);
      lines.push({ t: event.t, text: quoted(said[1]), ms: took ? Number(took[1]) : null });
    }
  });
  const clips = events.filter((event) => event.msg.startsWith('clip:')).length;
  return { lines, clips };
}

function linkOf(events) {
  let transitions = 0;
  const episodes = [];
  let bad = null;
  for (const event of events) {
    if (!event.msg.startsWith('state ')) {
      continue;
    }
    transitions += 1;
    let value = null;
    try {
      value = JSON.parse(event.msg.slice('state '.length));
    } catch {
      continue;
    }
    const link = value?.live?.link ?? null;
    if (link && link !== 'ok' && !bad) {
      bad = { kind: link, from: event.t };
    } else if (link === 'ok' && bad) {
      episodes.push({ ...bad, to: event.t });
      bad = null;
    } else if (link && link !== 'ok' && bad && bad.kind !== link) {
      episodes.push({ ...bad, to: event.t });
      bad = { kind: link, from: event.t };
    }
  }
  if (bad) {
    episodes.push({ ...bad, to: null });
  }
  return { transitions, episodes };
}

function sampleOf(msg) {
  const found = /^session battery (\S+) thermal (\S+) mem (\S+) uptime (\S+)$/.exec(msg);
  if (!found) {
    return null;
  }
  const battery = /^(\d+)%$/.exec(found[1]);
  const mem = /^(\d+)\/(\d+)MB$/.exec(found[3]);
  return {
    battery: battery ? Number(battery[1]) : null,
    thermal: found[2] === 'unknown' ? null : Number(found[2]),
    usedMb: mem ? Number(mem[1]) : null,
    totalMb: mem ? Number(mem[2]) : null,
  };
}

function sessionOf(events) {
  const samples = events.map((event) => ({ ...sampleOf(event.msg), t: event.t })).filter((sample) => sample.battery !== undefined);
  if (samples.length === 0) {
    return { samples: 0 };
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  return {
    samples: samples.length,
    battery: { from: first.battery, to: last.battery },
    thermalMax: Math.max(...samples.map((sample) => sample.thermal ?? -1)),
    mem: { from: first.usedMb, to: last.usedMb, total: last.totalMb },
  };
}

export function formatReport(report, name) {
  const out = [`Ittro log report: ${name}`, `${report.lines} ittro lines over ${report.span === null ? '?' : `${Math.round(report.span)}s`}, ${report.heard} heard`];
  out.push('');
  out.push(`Searches: ${report.searches.length}`);
  report.searches.forEach((search, at) => {
    out.push(`  ${at + 1}. ${JSON.stringify(search.request)}${search.epoch === null ? '' : ` epoch ${search.epoch}`}`);
    out.push(`     confirmed ${seconds(search.confirmed)}, first outline ${delta(search.outline, search.confirmed)}, hand on product ${delta(search.hand, search.confirmed)}, verdict ${search.verdict ? `${search.verdict.kind} ${delta(search.verdict.t, search.confirmed)}` : 'none'}`);
  });
  out.push('');
  const byName = new Map();
  for (const call of report.meta) {
    const row = byName.get(call.name) ?? { ok: 0, ms: [], failed: 0 };
    if (call.outcome === 'ok') {
      row.ok += 1;
      if (call.ms !== null) {
        row.ms.push(call.ms);
      }
    } else if (call.outcome !== 'cut') {
      row.failed += 1;
    }
    byName.set(call.name, row);
  }
  out.push(`Meta calls: ${report.meta.length}`);
  for (const [name, row] of [...byName].sort()) {
    const p50 = row.ms.length > 0 ? row.ms.sort((a, b) => a - b)[Math.floor(row.ms.length / 2)] : null;
    out.push(`  ${name}: ${row.ok} ok${p50 === null ? '' : ` p50 ${p50}ms`}${row.failed > 0 ? `, ${row.failed} failed` : ''}`);
  }
  for (const call of report.meta.filter((call) => call.outcome !== 'ok' && call.outcome !== 'cut')) {
    out.push(`  failed ${call.name} ${call.outcome} ${seconds(call.t)}`);
  }
  out.push('');
  out.push(`Spoken: ${report.spoken.lines.length} sentences, ${report.spoken.clips} clips`);
  for (const line of report.spoken.lines) {
    out.push(`  ${seconds(line.t)} ${line.ms === null ? '' : `${line.ms}ms `}${JSON.stringify(line.text.slice(0, 90))}`);
  }
  out.push('');
  out.push(`State changes: ${report.link.transitions}, link episodes: ${report.link.episodes.length}`);
  for (const episode of report.link.episodes) {
    out.push(`  ${episode.kind} ${seconds(episode.from)}${episode.to === null ? ' to end' : ` for ${delta(episode.to, episode.from)}`}`);
  }
  out.push('');
  if (report.session.samples === 0) {
    out.push('Session samples: none');
  } else {
    const battery = report.session.battery.from === null ? 'unknown' : `${report.session.battery.from}% to ${report.session.battery.to}%`;
    const mem = report.session.mem.from === null ? 'unknown' : `${report.session.mem.from} to ${report.session.mem.to}MB of ${report.session.mem.total}MB`;
    out.push(`Session samples: ${report.session.samples}, battery ${battery}, thermal max ${report.session.thermalMax}, mem used ${mem}`);
  }
  return `${out.join('\n')}\n`;
}

const invoked = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`, 'file:///').href;
if (invoked) {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: node app/scripts/log-report.mjs <logfile>');
    process.exit(1);
  }
  const report = parseLog(readFileSync(file, 'utf8'));
  process.stdout.write(formatReport(report, file));
}
