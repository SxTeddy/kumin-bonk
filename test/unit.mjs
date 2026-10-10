// KuminBonk — สร้างโดย HXZ ! · automatic checks of the app's logic (run by tools/check.mjs before every update)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Engine } from '../src/engine.js';
import { DEFAULT_CONFIG } from '../src/defaults.js';
import { Sessions, Thanks } from '../src/live.js';
import { reportHtml, reportName } from '../src/report.js';
import { parseHotkey } from '../src/hotkey.js';
import { privateIp } from '../src/images.js';
import { GiftMatcher } from '../src/gifts.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
async function t(name, fn) {
  try { await fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e.message]); }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-unit-'));

function makeEngine(over = {}) {
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.rules = [
    { id: 'g', enabled: true, name: 'gift', trigger: { type: 'gift', gifts: '*', minDiamonds: 0 }, cooldown: 0, actions: [] },
    { id: 'c', enabled: true, name: 'cmd', trigger: { type: 'chat', match: '!hi' }, cooldown: 0, actions: [] },
  ];
  Object.assign(cfg, over);
  const fx = { queue: [] };
  const e = new Engine({ getConfig: () => cfg, getHead: () => ({ x: .5, y: .3 }), vts: { ready: false, flinch() {} }, images: { guess: () => 'rose' },
    gifts: { matches: () => true, find: () => null }, effects: fx, overlay: { count: () => 0, send() {} }, dashboard: () => {}, log: () => {} });
  let fired = 0; const of = e.fire.bind(e); e.fire = (...a) => { fired++; return of(...a); };
  return { e, cfg, fx, fired: () => fired };
}
const gift = (u, n = 1, d = 1) => ({ type: 'gift', user: { id: u, nickname: u }, gift: { name: 'Rose', diamonds: d }, count: n });

await t('combo grows for the same viewer + gift', async () => {
  const { e } = makeEngine({ limit: { enabled: false } });
  const m = []; for (let i = 0; i < 6; i++) { e.handle(gift('a')); m.push(e.lastCombo.mult); }
  assert.ok(m[5] > m[0], 'combo multiplier should grow');
  e.handle(gift('b')); assert.equal(e.lastCombo.mult, 1, 'other viewer starts at 1');
});
await t('pause keeps gifts, resume releases all of them', async () => {
  const { e, fired } = makeEngine({ limit: { enabled: false } });
  e.setPaused(true);
  for (let i = 0; i < 120; i++) e.handle(gift('u' + i));
  assert.equal(fired(), 0); assert.equal(e.queue.length, 120);
  e.setPaused(false); await sleep(100);
  e.handle(gift('new')); // a new gift while the backlog drains must not cut the backlog
  assert.ok(e.queue.length >= 118, 'backlog was trimmed: ' + e.queue.length);
  e.clearQueue();
});
await t('chat commands while paused are ignored and do not use the viewer wait', async () => {
  const { e } = makeEngine({ limit: { enabled: false } });
  e.setPaused(true); assert.deepEqual(e.handle({ type: 'chat', user: { id: 'v' }, text: '!hi' }), []);
  e.setPaused(false); assert.deepEqual(e.handle({ type: 'chat', user: { id: 'v' }, text: '!hi' }), ['cmd']);
  assert.deepEqual(e.handle({ type: 'chat', user: { id: 'v' }, text: '!hi' }), [], 'same viewer must wait');
  assert.deepEqual(e.handle({ type: 'chat', user: { id: 'w' }, text: '!hi' }), ['cmd'], 'other viewer may use it');
});
await t('rate limit queues extra effects', async () => {
  const { e, fired } = makeEngine({ limit: { enabled: true, perMinute: 12 } });
  e.tokens = 2;
  for (let i = 0; i < 8; i++) e.handle(gift('x' + i, 1, i + 1));
  await sleep(50);
  assert.ok(fired() <= 3, 'too many fired: ' + fired());
  assert.ok(e.queue.length >= 5);
  e.clearQueue();
});
await t('backlog waits for the model to finish effects', async () => {
  const { e, fx, fired } = makeEngine({ limit: { enabled: false } });
  fx.queue = [1, 2, 3];
  e.setPaused(true); for (let i = 0; i < 3; i++) e.handle(gift('q' + i)); e.setPaused(false);
  await sleep(600); assert.equal(fired(), 0);
  fx.queue = []; await sleep(2200); assert.equal(fired(), 3);
});
await t('summary counts gifts and ignores tricky names', async () => {
  const s = new Sessions(path.join(tmp, 's.json'));
  s.start('me');
  s.add(gift('__proto__', 3, 5)); s.add(gift('constructor', 1, 100)); s.add({ type: 'like', count: 50, user: {} });
  const v = s.all()[0];
  assert.equal(v.coins, 115); assert.equal(v.giverCount, 2); assert.equal(({}).coins, undefined, 'Object.prototype polluted');
  assert.ok(s.end(), 'live with gifts is kept');
  s.start('me'); assert.equal(s.end(), null, 'empty live is not kept');
});
await t('stale live ends at the last activity', async () => {
  const s = new Sessions(path.join(tmp, 's2.json')); s.list = [];
  s.start('a'); s.cur.start -= 3600e3; s.cur.updated = s.cur.start + 600e3; s.cur.gifts = 1;
  const c = s.cur; s.end(true);
  assert.equal(Math.round((c.end - c.start) / 60000), 10);
});
await t('thank-you waits for a gift streak and thanks once', async () => {
  const cfg = { thanks: { ...DEFAULT_CONFIG.thanks, enabled: true, wait: 1 } };
  const said = []; const th = new Thanks(() => cfg, x => said.push(x));
  th.handle({ ...gift('Mai', 2), gift: { name: 'Rose', th: 'กุหลาบ', diamonds: 1 } });
  th.handle({ ...gift('Mai', 3), gift: { name: 'Rose', th: 'กุหลาบ', diamonds: 1 } });
  await sleep(1300);
  assert.deepEqual(said, ['ขอบคุณ Mai ที่ส่ง กุหลาบ 5 อันนะ']);
});
await t('report page escapes viewer names', async () => {
  const html = reportHtml({ user: 'x', start: Date.now() - 6e5, end: Date.now(), coins: 1, gifts: 1, giverCount: 1, givers: [{ name: '<script>alert(1)</script>', avatar: '"><img onerror=x>', coins: 1 }], giftTypes: [{ name: '<b>', count: 1, coins: 1 }] }, () => '', 'xx-bad');
  assert.ok(!html.includes('<script>alert'), 'name not escaped');
  assert.ok(!html.includes('"><img onerror'), 'avatar not escaped');
  assert.ok(!reportName({ user: '../..\\evil', start: Date.now() }).match(/[\\/]/), 'file name has a path');
});
await t('hotkeys parse', async () => {
  assert.deepEqual(parseHotkey('Ctrl+Alt+P'), { mods: 3, vk: 0x50 });
  assert.deepEqual(parseHotkey('F9'), { mods: 0, vk: 0x78 });
  assert.equal(parseHotkey(''), null);
});
await t('private network addresses are blocked for downloads', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) assert.ok(privateIp(ip), ip);
  for (const ip of ['8.8.8.8', '151.101.1.1']) assert.ok(!privateIp(ip), ip);
});
await t('gift learning ignores special names', async () => {
  const g = new GiftMatcher({ constructor: 'x' });
  assert.equal(typeof g.thaiName('toString'), 'string');
  assert.equal(g.thaiName('nope'), '');
});

fs.rmSync(tmp, { recursive: true, force: true });
let bad = 0;
for (const [ok, name, err] of results) { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' — ' + err}`); if (!ok) bad++; }
console.log(`unit: ${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
