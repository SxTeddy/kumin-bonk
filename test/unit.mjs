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
import { Effects } from '../src/effects.js';

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

await t('donut follows the mouth while the model moves', async () => {
  const t0 = Date.now(); const moves = [];
  const liveX = () => 0.3 + 0.4 * Math.min(1, (Date.now() - t0) / 1500);
  const vts = { ready: true, sprite: async () => 'it1', spriteTo: (id, o) => { moves.push({ ...o, want: liveX() }); return Promise.resolve(); }, animate() {}, move() {}, flinch() {}, spriteKill: async () => {}, pin: async () => true, unpin: async () => {}, tint: async () => {} };
  const fx = new Effects({ vts, images: { get: async () => ({ key: 'x' }) }, getHead: () => ({ x: .5, y: .3 }), getLock: k => k === 'cat:eat' ? { coords: { artMeshID: 'Mouth' }, live: { x: liveX(), y: 0.5 } } : null, sound() {}, log() {}, getConfig: () => DEFAULT_CONFIG });
  fx.lock = 'cat:eat'; fx.style = 'eat';
  await fx.eat({ key: 'x' }, 1, 1);
  const withPos = moves.filter(m => m.x != null && m.y != null);
  const last = withPos[withPos.length - 1];
  assert.ok(withPos.length > 8, 'too few steps: ' + withPos.length);
  assert.ok(Math.abs(last.x - last.want) < 0.03, `ended at ${last.x.toFixed(2)}, mouth at ${last.want.toFixed(2)}`);
  assert.ok(last.want - withPos[0].want > 0.1, 'mouth did not move in the test');
});

await t('every effect follows the model (hat lands on the moved head)', async () => {
  const t0 = Date.now(); const moves = []; let headX = 0.5;
  const vts = { ready: true, sprite: async (img, o) => { moves.push({ ...o, spawn: true }); return 'h1'; }, spriteTo: (id, o) => { moves.push(o); return Promise.resolve(); }, animate() {}, move() {}, flinch() {}, spriteKill: async () => {}, pin: async () => false, unpin: async () => {}, tint: async () => {} };
  const fx = new Effects({ vts, images: { get: async () => ({ key: 'x' }) }, getHead: () => ({ x: headX, y: 0.3 }), sound() {}, log() {}, getConfig: () => DEFAULT_CONFIG });
  fx.style = 'wear'; fx.frozen = fx.liveHead();
  setTimeout(() => { headX = 0.7; }, 200); // the streamer moves while the hat falls
  await fx.wear({ key: 'x' }, 1, 1);
  const landed = moves.filter(m => m.y != null && Math.abs(m.y - (0.3 - 0.14)) < 0.02);
  assert.ok(landed.some(m => Math.abs(m.x - 0.7) < 0.02), 'hat did not land on the moved head: ' + JSON.stringify(landed.map(m => m.x)));
});

await t('a big gift gets the stage alone (others wait until it ends)', async () => {
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.limit = { enabled: false };
  cfg.rules = [{ id: 'g', enabled: true, name: 'gift', trigger: { type: 'gift', gifts: '*' }, cooldown: 0, actions: [{ type: 'giftfx', style: 'auto' }] }];
  const plays = []; let finish;
  const effects = { queue: [], play: (st, o) => { plays.push(o); if (o.spot) return new Promise(r => { finish = r; }); return Promise.resolve(); } };
  const e = new Engine({ getConfig: () => cfg, getHead: () => ({ x: .5, y: .3 }), vts: { ready: true, canCustomImages: true, flinch() {} }, images: { guess: () => 'rose' },
    gifts: { matches: () => true, find: g => ({ th: g.name, img: 'g001', style: 'bonk', coins: g.diamonds }) }, effects, overlay: { count: () => 0 }, dashboard: () => {}, log: () => {}, banner: async () => ({ key: 'bnx', b64: 'x', ext: 'png' }) });
  e.handle({ type: 'gift', user: { id: 'a' }, gift: { name: 'สิงโต', diamonds: 29999 }, count: 1 });
  await sleep(50);
  assert.equal(plays.length, 1); assert.equal(plays[0].tier, 3); assert.equal(plays[0].scene, 'lion'); assert.ok(plays[0].banner, 'banner missing'); assert.ok(plays[0].spot);
  e.handle({ type: 'gift', user: { id: 'b' }, gift: { name: 'Rose', diamonds: 1 }, count: 1 });
  await sleep(100);
  assert.equal(plays.length, 1, 'small gift played during the big show');
  finish(); await sleep(100);
  assert.equal(plays.length, 2, 'small gift did not play after the show');
});

await t('category / gift / chat-command volumes reach the sound player', async () => {
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.limit = { enabled: false };
  cfg.throwing = { ...cfg.throwing, volume: 0.6, sound: true, target: 'vts' };
  cfg.fx = { showcaseMin: 0, cats: { bonk: { vol: 0.5 }, love: { vol: 0 } }, gifts: {} };
  cfg.chatCmd = { userCooldown: 0, volume: 0 };
  cfg.rules = [
    { id: 'g', enabled: true, name: 'gift', trigger: { type: 'gift', gifts: '*' }, cooldown: 0, actions: [{ type: 'giftfx', style: 'auto' }] },
    { id: 'c', enabled: true, name: 'cmd', trigger: { type: 'chat', match: '!hi' }, cooldown: 0, actions: [{ type: 'sound', sound: 'ding' }] },
  ];
  const sent = []; const plays = [];
  const e = new Engine({ getConfig: () => cfg, getHead: () => ({ x: .5, y: .3 }), vts: { ready: true, canCustomImages: true, flinch() {} }, images: { guess: () => 'rose' },
    gifts: { matches: () => true, find: g => ({ th: g.name, img: 'g001', style: g.name === 'heart' ? 'love' : 'bonk', coins: 1 }) },
    effects: { queue: [], play: (st, o) => { plays.push(o); return Promise.resolve(); } }, overlay: { count: () => 0 }, dashboard: m => m.t === 'sound' && sent.push(m), log: () => {} });
  await e.fire(cfg.rules[0], { type: 'gift', user: { id: 'a' }, gift: { name: 'rose', diamonds: 1 }, count: 1 });
  await e.fire(cfg.rules[0], { type: 'gift', user: { id: 'a' }, gift: { name: 'heart', diamonds: 1 }, count: 1 });
  assert.equal(plays[0].vol, 0.5, 'bonk category volume'); assert.equal(plays[1].vol, 0, 'muted category');
  e.sound('bonk', plays[0].vol); assert.equal(sent.pop().volume, 0.3, 'master × category');
  e.sound('bonk', 0); assert.equal(sent.length, 0, 'muted sound still played');
  await e.fire(cfg.rules[1], { type: 'chat', user: { id: 'v' }, text: '!hi' });
  assert.equal(sent.length, 0, 'muted chat-command sound still played');
});

// --- v1.9.2 bug fixes ---
function bigEngine(rules, fxCfg = {}) {
  const cfg = structuredClone(DEFAULT_CONFIG);
  cfg.limit = { enabled: false };
  cfg.fx = { ...cfg.fx, ...fxCfg };
  cfg.rules = rules;
  const plays = []; const finishers = [];
  const effects = { queue: [], play: (st, o) => { plays.push({ style: st, ...o }); if (o.spot) return new Promise(r => finishers.push(r)); return Promise.resolve(); } };
  const e = new Engine({ getConfig: () => cfg, getHead: () => ({ x: .5, y: .3 }), vts: { ready: true, canCustomImages: true, flinch() {} }, images: { guess: () => 'rose' },
    gifts: { matches: () => true, find: g => ({ th: g.name, img: 'g001', style: 'bonk', coins: g.diamonds }) }, effects, overlay: { count: () => 0 }, dashboard: () => {}, log: () => {}, banner: async () => ({ key: 'bnx', b64: 'x', ext: 'png' }) });
  return { e, cfg, plays, finish: () => finishers.splice(0).forEach(f => f()) };
}
const lion = (u = 'a') => ({ type: 'gift', user: { id: u }, gift: { name: 'สิงโต', diamonds: 29999 }, count: 1 });

await t('a rule with two effects plays the grand show only once', async () => {
  const { e, plays, finish } = bigEngine([{ id: 'g', enabled: true, name: '10k', trigger: { type: 'gift', gifts: '*' }, cooldown: 0, actions: [{ type: 'giftfx', style: 'auto' }, { type: 'giftfx', style: 'party' }] }]);
  e.handle(lion()); await sleep(80);
  assert.equal(plays.length, 2);
  assert.equal(plays[0].tier, 3); assert.equal(plays[0].scene, 'lion'); assert.ok(plays[0].banner); assert.ok(plays[0].spot);
  assert.equal(plays[1].style, 'party'); assert.equal(plays[1].tier, 0, 'second show'); assert.equal(plays[1].scene, null); assert.equal(plays[1].banner, null); assert.equal(plays[1].spot, false);
  finish();
});
await t('the special scene only plays when no other move was picked', async () => {
  const rule = st => [{ id: 'g', enabled: true, name: 'r', trigger: { type: 'gift', gifts: '*' }, cooldown: 0, actions: [{ type: 'giftfx', style: st }] }];
  let x = bigEngine(rule('flyby')); await x.e.fire(x.cfg.rules[0], lion()); assert.equal(x.plays[0].scene, null, 'rule picked a move'); x.finish();
  x = bigEngine(rule('auto'), { gifts: { 'สิงโต': { style: 'wear' } } }); await x.e.fire(x.cfg.rules[0], lion()); assert.equal(x.plays[0].scene, null, 'gift has its own move'); x.finish();
  x = bigEngine(rule('auto'), { cats: { bonk: { as: 'love' } } }); await x.e.fire(x.cfg.rules[0], lion()); assert.equal(x.plays[0].scene, null, 'category uses another move'); x.finish();
  x = bigEngine(rule('auto')); await x.e.fire(x.cfg.rules[0], lion()); assert.equal(x.plays[0].scene, 'lion', 'default keeps the scene'); x.finish();
});
await t('tests from the settings do not hold real gifts back', async () => {
  const x = bigEngine([]);
  await x.e.run({ type: 'giftfx', style: 'auto' }, { name: 't', gift: 'สิงโต', count: 1, diamonds: 29999, entry: { th: 'สิงโต', img: 'g001', style: 'bonk', coins: 29999 }, preview: true });
  assert.equal(x.plays[0].spot, false); assert.equal(x.e.hold, 0);
});
await t('after a big show the waiting gifts come out one by one', async () => {
  const { e, plays, finish } = bigEngine([{ id: 'g', enabled: true, name: 'gift', trigger: { type: 'gift', gifts: '*' }, cooldown: 0, actions: [{ type: 'giftfx', style: 'auto' }] }]);
  e.handle(lion()); await sleep(50);
  for (let i = 0; i < 6; i++) e.handle(gift('s' + i));
  await sleep(80); assert.equal(plays.length, 1, 'played during the show');
  finish(); await sleep(150);
  assert.equal(plays.length, 2, 'all waiting gifts were let out at once: ' + (plays.length - 1));
  await sleep(800); assert.ok(plays.length >= 3 && plays.length < 7, 'not paced: ' + plays.length);
  e.clearQueue();
});
function fakeFx(over = {}) {
  const throws = [], sprites = [];
  const vts = { ready: true, sprite: async (img, o) => { sprites.push(o); return 's' + sprites.length; }, spriteTo: () => Promise.resolve(), spriteKill: async () => {}, animate() {}, move() {}, flinch() {}, pin: async () => false, unpin: async () => {}, tint: async () => {}, throwItem: o => throws.push(o), ...over };
  const fx = new Effects({ vts, images: { get: async () => ({ key: 'x' }) }, getHead: () => ({ x: .5, y: .3 }), getLock: k => k === 'cat:eat' ? { coords: { artMeshID: 'Mouth' }, live: { x: 0.9, y: 0.9 } } : null, sound() {}, log() {}, getConfig: () => DEFAULT_CONFIG });
  return { fx, throws, sprites };
}
await t('quick throws aim at their own target, not at the effect playing beside them', async () => {
  const { fx, throws } = fakeFx();
  fx.lock = 'cat:eat'; fx.style = 'eat'; // a donut is being eaten right now
  await fx.play('bonk', { img: 'rose', count: 2, coins: 1, lock: null });
  assert.ok(throws.length === 2);
  const h = throws[0].head();
  assert.ok(Math.abs(h.x - 0.5) < 0.001 && Math.abs(h.y - 0.3) < 0.001, 'aimed at the mouth lock: ' + JSON.stringify(h));
});
await t('big-gift shows are never merged together', async () => {
  const { fx } = fakeFx();
  fx.running = true; // something is on stage: new jobs wait
  fx.play('flyby', { img: 'gift:g001', coins: 5000, tier: 2, banner: { key: 'b1' } });
  fx.play('flyby', { img: 'gift:g001', coins: 5000, tier: 2, banner: { key: 'b2' } });
  fx.play('love', { img: 'heart', count: 2 }); fx.play('love', { img: 'heart', count: 3 });
  assert.equal(fx.queue.length, 3, 'queue: ' + fx.queue.map(q => q.style + q.count));
  assert.equal(fx.queue[2].count, 5, 'plain ones should still merge');
  fx.queue = [];
});
await t('the name banner is taken down even if an effect fails', async () => {
  const killed = [];
  const { fx } = fakeFx({ spriteKill: async id => { killed.push(id); } });
  fx.love = async () => { throw new Error('boom'); };
  let banner;
  const orig = fx.showBanner.bind(fx); fx.showBanner = async (...a) => (banner = await orig(...a));
  await fx.play('love', { img: 'heart', coins: 1, banner: { key: 'b' }, tier: 0 });
  assert.ok(banner && killed.includes(banner), 'banner left on screen');
  assert.equal(fx.lock, null); assert.equal(fx.frozen, null); assert.equal(fx.running, false);
});
await t('flying moves turn smoothly (no sudden flips)', async () => {
  const rots = [];
  const { fx } = fakeFx({ spriteTo: (id, o) => { if (o.rot != null) rots.push(o.rot); return Promise.resolve(); } });
  const pts = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; pts.push({ x: 0.5 + Math.cos(a) * 0.2, y: 0.4 + Math.sin(a) * 0.2 }); } // a full loop
  await fx.glide('s1', pts, 0.3, { bank: 1 });
  for (let i = 1; i < rots.length; i++) assert.ok(Math.abs(rots[i] - rots[i - 1]) <= 10.01, `jump ${rots[i - 1]} → ${rots[i]}`);
});

fs.rmSync(tmp, { recursive: true, force: true });
let bad = 0;
for (const [ok, name, err] of results) { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' — ' + err}`); if (!ok) bad++; }
console.log(`unit: ${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
