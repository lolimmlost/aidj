// Offline render of a saved Lab set through the Lab's own engine (#392).
// node tools/lab-render/render.mjs <set.json> <out.wav> [--tracks N] [--cache DIR]
// Env: NAVIDROME_URL (default http://10.0.0.30:4533), NN / NP (Navidrome user / password) to fetch the songs.
// Writes <out.wav> (44.1 kHz 16-bit stereo) and <out.wav>.json (the report: transitions as planned, tracklist).
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : dflt;
};
const maxTracks = Number(opt('tracks', Infinity));
const cache = opt('cache', path.join(here, '.cache'));
const [setFile, outFile] = args;
if (!setFile || !outFile) {
  console.error('usage: render.mjs <set.json> <out.wav> [--tracks N] [--cache DIR]');
  process.exit(2);
}
const set = JSON.parse(fs.readFileSync(setFile, 'utf8'));
const tracks = set.tracks.slice(0, maxTracks);
const NURL = process.env.NAVIDROME_URL || 'http://10.0.0.30:4533';
const { NN, NP } = process.env;
if (!NN || !NP) throw new Error('set NN and NP (Navidrome user and password)');

const subsonic = (endpoint, params = {}) => {
  const s = randomBytes(6).toString('hex');
  const q = new URLSearchParams({ u: NN, t: createHash('md5').update(NP + s).digest('hex'), s, v: '1.16.1', c: 'aidj-lab-render', f: 'json', ...params });
  return `${NURL}/rest/${endpoint}?${q}`;
};

// the songs: tagged tempo (the Lab's analysis hint) and the audio, cached
fs.mkdirSync(cache, { recursive: true });
const bpmTags = {};
for (const t of tracks) {
  const meta = await (await fetch(subsonic('getSong', { id: t.id }))).json();
  bpmTags[t.id] = meta['subsonic-response']?.song?.bpm || undefined;
  const file = path.join(cache, t.id);
  if (!fs.existsSync(file)) {
    const res = await fetch(subsonic('stream', { id: t.id, format: 'raw' }));
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || (res.headers.get('content-type') || '').includes('xml')) throw new Error(`stream ${t.id} (${t.artist} – ${t.title}): ${res.status}`);
    fs.writeFileSync(file, buf);
    console.log(`fetched ${t.artist} – ${t.title} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
}

const bundle = await build({ entryPoints: [path.join(here, 'entry.ts')], bundle: true, write: false, format: 'iife', target: 'chrome120', logLevel: 'error' });
const page_js = bundle.outputFiles[0].text;

// WAV: header written at the end, once the length is known
const fd = fs.openSync(outFile, 'w');
fs.writeSync(fd, Buffer.alloc(44));
let bytes = 0;

const browser = await chromium.launch({ args: ['--js-flags=--max-old-space-size=8192', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => console.log(`[page] ${m.text()}`));
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.route('http://lab.local/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/audio/')) {
    const id = decodeURIComponent(url.pathname.slice('/audio/'.length));
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: fs.readFileSync(path.join(cache, id)) });
  }
  return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><script>${page_js}</script>` });
});
await page.exposeFunction('emitPCM', (b64) => {
  const buf = Buffer.from(b64, 'base64');
  fs.writeSync(fd, buf);
  bytes += buf.length;
});
await page.goto('http://lab.local/');
const t0 = Date.now();
const report = await page.evaluate(
  ({ set, bpmTags, maxTracks }) => window.renderSet(set, bpmTags, (b64) => window.emitPCM(b64), maxTracks),
  { set, bpmTags, maxTracks: Number.isFinite(maxTracks) ? maxTracks : 1e9 },
);
await browser.close();

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + bytes, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(44100, 24);
header.writeUInt32LE(44100 * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(bytes, 40);
fs.writeSync(fd, header, 0, 44, 0);
fs.closeSync(fd);
fs.writeFileSync(`${outFile}.json`, JSON.stringify(report, null, 2));
console.log(`${outFile}: ${report.tracks} songs, ${(report.seconds / 60).toFixed(1)} min, ${report.windows} windows, rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const t of report.transitions) console.log(`  ${String(Math.floor(t.at / 60)).padStart(3)}:${String(t.at % 60).padStart(2, '0')} ${t.kind} ${t.bars} (${t.planned}, lock ${t.lock}${t.jump ? `, jump ${t.jump}` : ''}) ${t.song}`);
