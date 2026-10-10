// KuminBonk — สร้างโดย HXZ ! · 🏋️ load test: one huge gift (300 items) against a fake VTube Studio.
// Checks the PC stays light: items in the air stay capped, memory/CPU stay low, the app keeps answering.
// usage: node test/stress.mjs   (run by tools/check.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.argv[2]) || 300;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-stress-'));
const vtsPort = 18100 + Math.floor(Math.random() * 500), appPort = 4100 + Math.floor(Math.random() * 500);
fs.mkdirSync(path.join(work, 'data'));
fs.writeFileSync(path.join(work, 'data', 'config.json'), JSON.stringify({ vtsPort, fx: { showcaseMin: 0, cats: { bonk: { max: N } }, gifts: {} }, rulesVersion: 99 }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let vtsStats = {};
const mock = spawn(process.execPath, ['test/mock-vts.js'], { cwd: ROOT, env: { ...process.env, PORT: String(vtsPort), EVERY: '250' }, stdio: ['ignore', 'pipe', 'ignore'] });
mock.stdout.on('data', d => { for (const l of String(d).split('\n')) if (l.startsWith('VTS ')) try { vtsStats = JSON.parse(l.slice(4)); } catch {} });
await sleep(400);
const app = spawn(process.execPath, ['build/app.cjs'], { cwd: ROOT, env: { ...process.env, KB_DATA: path.join(work, 'data'), KB_PORT: String(appPort), KB_NO_BROWSER: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
let appErr = ''; app.stderr.on('data', d => appErr += d);

// memory + CPU of the app process (Linux /proc; elsewhere only memory checks are skipped)
const clk = 100;
function sample() {
  try {
    const st = fs.readFileSync(`/proc/${app.pid}/stat`, 'utf8').split(') ')[1].split(' ');
    const rss = Number(fs.readFileSync(`/proc/${app.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024;
    return { cpu: (Number(st[11]) + Number(st[12])) / clk, rss };
  } catch { return null; }
}
const ping = () => new Promise(r => { const t0 = Date.now(); const q = http.get({ host: '127.0.0.1', port: appPort, path: '/api/ping', headers: { host: `localhost:${appPort}` } }, res => { res.resume(); r(Date.now() - t0); }); q.on('error', () => r(-1)); q.setTimeout(3000, () => { q.destroy(); r(-1); }); });

let ok = true; const out = [];
const check = (name, cond, detail) => { out.push(`${cond ? '✓' : '✗'} ${name} — ${detail}`); if (!cond) ok = false; };
try {
  for (let i = 0; i < 40 && (await ping()) < 0; i++) await sleep(250);
  const ws = new WebSocket(`ws://127.0.0.1:${appPort}/ws`, { origin: `http://localhost:${appPort}`, headers: { host: `localhost:${appPort}` } });
  let status = {};
  ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'status') status = m; });
  await new Promise(r => ws.once('open', r));
  for (let i = 0; i < 60 && !(status.vts?.status === 'ready' && status.vts?.images); i++) await sleep(250);
  check('fake VTube Studio connected', status.vts?.status === 'ready', String(status.vts?.status));
  await sleep(1500);
  const base = sample();
  const t0 = Date.now();
  ws.send(JSON.stringify({ t: 'simulate', ev: { type: 'gift', user: { nickname: 'big fan' }, gift: { name: 'Rose', diamonds: 1 }, count: N } }));
  let peakRss = base?.rss || 0, worstPing = 0, last = null;
  while (Date.now() - t0 < 120000) {
    await sleep(500);
    const s = sample(); if (s) { peakRss = Math.max(peakRss, s.rss); last = s; }
    worstPing = Math.max(worstPing, await ping());
    if ((vtsStats['load:custom'] || 0) + (vtsStats['load:cached'] || 0) >= N && !vtsStats.live) break;
  }
  const secs = (Date.now() - t0) / 1000;
  const loads = (vtsStats['load:custom'] || 0) + (vtsStats['load:cached'] || 0);
  check(`all ${N} items were thrown`, loads >= N, `${loads} thrown in ${secs.toFixed(0)} s`);
  check('items in the air stay capped (≤ 20)', (vtsStats.peak || 0) <= 20, `peak ${vtsStats.peak}`);
  check('every item was cleaned up', !vtsStats.live, `left on screen: ${vtsStats.live || 0}`);
  check('picture sent to VTS only once (cached after)', (vtsStats['load:custom'] || 0) <= 2, `${vtsStats['load:custom']} uploads`);
  if (base && last) {
    const cpu = (last.cpu - base.cpu) / secs * 100;
    check('memory stays low', peakRss - base.rss < 120, `+${(peakRss - base.rss).toFixed(0)} MB (peak ${peakRss.toFixed(0)} MB)`);
    check('CPU stays low', cpu < 35, `${cpu.toFixed(1)}% of one core on average`);
  }
  check('app keeps answering during the flood', worstPing >= 0 && worstPing < 1000, `slowest reply ${worstPing} ms`);
  ws.close();
} catch (e) { check('load test ran', false, e.message); }
app.kill(); mock.kill();
fs.rmSync(work, { recursive: true, force: true });
for (const l of out) console.log(l);
if (/Error/.test(appErr)) { console.log('✗ errors from the app — ' + appErr.split('\n').find(l => /Error/.test(l))); ok = false; }
console.log('stress:', ok ? 'passed' : 'failed');
process.exit(ok ? 0 : 1);
