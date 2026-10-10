// KuminBonk — สร้างโดย HXZ ! · 🔍 checks everything before an update is released:
// syntax → logic tests → build + self-test → security tests on a running app → click through every tab.
// usage: node tools/check.mjs        (tools/make-update.mjs runs it automatically)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const step = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fails.push(name); };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 300000, ...opts });

// 1. syntax of every script
const files = [...fs.readdirSync(path.join(ROOT, 'src')).map(f => 'src/' + f), 'public/dashboard.js', 'public/sounds.js', 'public/i18n.js', 'installer/launch.cjs', ...fs.readdirSync(path.join(ROOT, 'tools')).filter(f => f.endsWith('.mjs')).map(f => 'tools/' + f)].filter(f => /\.(c|m)?js$/.test(f));
const bad = files.filter(f => run(process.execPath, ['--check', f]).status !== 0);
step(`syntax (${files.length} files)`, !bad.length, bad.join(', '));

// 2. logic tests
const u = run(process.execPath, ['test/unit.mjs'], { timeout: 120000 });
process.stdout.write(u.stdout.split('\n').filter(l => l.startsWith('✗')).map(l => '   ' + l + '\n').join(''));
step('logic tests', u.status === 0, (u.stdout.match(/unit: .*/) || [''])[0]);

// 3. translations + build + self-test
step('translations', run('python3', ['tools/i18n/build.py']).status === 0);
const b = run('npm', ['run', '-s', 'build']);
step('build', b.status === 0, b.status ? b.stderr.slice(0, 300) : '');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-check-'));
const st = run(process.execPath, ['build/app.cjs', '--selftest'], { env: { ...process.env, KB_DATA: path.join(work, 'st') } });
let stOk = false; try { stOk = JSON.parse(st.stdout).ok === true; } catch {}
step('self-test of the built app', stOk, stOk ? '' : st.stdout.slice(0, 300));

// 4. run the built app and attack it a little
const port = 3990 + Math.floor(Math.random() * 8);
fs.mkdirSync(path.join(work, 'data'), { recursive: true });
const app = spawn(process.execPath, ['build/app.cjs'], { cwd: ROOT, env: { ...process.env, KB_DATA: path.join(work, 'data'), KB_PORT: String(port), KB_NO_BROWSER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let appLog = ''; app.stdout.on('data', d => appLog += d); app.stderr.on('data', d => appLog += d);
const get = (p, host = `localhost:${port}`) => new Promise(r => { const q = http.get({ host: '127.0.0.1', port, path: p, headers: { host } }, res => { res.resume(); r(res.statusCode); }); q.on('error', () => r(0)); });
const wsTry = origin => new Promise(r => { const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, origin ? { origin, headers: { host: `localhost:${port}` } } : { headers: { host: `localhost:${port}` } }); w.on('open', () => { w.close(); r(true); }); w.on('error', () => r(false)); w.on('unexpected-response', () => r(false)); });
for (let i = 0; i < 40 && (await get('/api/ping')) !== 200; i++) await new Promise(r => setTimeout(r, 250));
step('app starts', (await get('/api/ping')) === 200, appLog.slice(-300));
step('security: other websites cannot control the app', (await wsTry('http://evil.example')) === false);
step('security: the app window can connect', (await wsTry(`http://localhost:${port}`)) === true);
step('security: DNS-rebinding host refused', (await get('/dashboard.html', 'evil.example:' + port)) === 403);
step('security: no reading files outside the app', ![200].includes(await get('/..%2fpackage.json')) && ![200].includes(await get('/%2e%2e/%2e%2e/package.json')) && ![200].includes(await get('/..%5c..%5cpackage.json')));
step('security: broken URL does not hang', (await get('/%E0%A4%A')) === 400);
// settings sent to the app are checked (no network folders, ports stay numbers)
await new Promise(done => {
  const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: `http://localhost:${port}`, headers: { host: `localhost:${port}` } });
  w.on('error', () => { step('security: bad settings are refused', false, 'no connection'); done(); });
  w.once('message', d => {
    const cfg = JSON.parse(d).config;
    w.send(JSON.stringify({ t: 'saveConfig', config: { ...cfg, vtsPort: 'abc', summary: { ...cfg.summary, folder: '\\\\evil-pc\\share' } } }));
    w.send(JSON.stringify({ t: 'simulate', ev: { type: 'gift', gift: { name: 'Rose', diamonds: '5' }, count: '7x' } }));
    setTimeout(() => {
      let c = {}; try { c = JSON.parse(fs.readFileSync(path.join(work, 'data', 'config.json'), 'utf8')); } catch {}
      step('security: bad settings are refused', c.summary?.folder === '' && c.vtsPort === 8001, `folder=${c.summary?.folder} vtsPort=${c.vtsPort}`);
      w.close(); done();
    }, 800);
  });
});

// 5. load test: one gift of 300 items against a fake VTube Studio (memory, CPU, items on screen)
const ss = run(process.execPath, ['test/stress.mjs', '300'], { timeout: 200000 });
process.stdout.write(ss.stdout.split('\n').filter(l => /^[✓✗]/.test(l)).map(l => '   ' + l + '\n').join(''));
step('load test (300 items, PC stays light)', ss.status === 0);

// 6. click through everything like a user (every tab, Thai + other languages)
const sm = run('python3', ['test/smoke.py', String(port), work], { timeout: 240000 });
process.stdout.write(sm.stdout.split('\n').filter(l => l.startsWith('✗')).map(l => '   ' + l + '\n').join(''));
step('click-through test', sm.status === 0, sm.status ? (sm.stderr || '').slice(-400) : '');
app.kill();
if (/Error|TypeError|ReferenceError/.test(appLog)) step('no errors in the app log', false, appLog.split('\n').filter(l => /Error/.test(l)).slice(0, 5).join(' | '));
fs.rmSync(work, { recursive: true, force: true });

console.log(fails.length ? `\n❌ ${fails.length} check(s) failed — do not release` : '\n✅ all checks passed');
process.exit(fails.length ? 1 : 0);
