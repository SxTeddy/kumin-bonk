// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// KuminBonk — TikTok LIVE gifts → VTube Studio reactions + OBS throwing overlay.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { IS_APP, IS_SEA, DATA_DIR, readPublic, logToFile } from './files.js';
import { openAppWindow, makeShortcuts, messageBox } from './window.js';
import { Updater } from './updater.js';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { TikTokSource } from './tiktok.js';
import { VTS } from './vts.js';
import { Engine, CAT_DEFAULT } from './engine.js';
import { Images } from './images.js';
import { CATALOG, GiftMatcher, STYLES, ANCHOR } from './gifts.js';
import { Effects } from './effects.js';
import { DEFAULT_CONFIG } from './defaults.js';

const VERSION = '1.4.12';
const DATA = DATA_DIR;

// --selftest: used by the updater to check a downloaded version before switching to it.
if (process.argv.includes('--selftest')) {
  const checks = {
    dashboard: !!readPublic('dashboard.html'), script: !!readPublic('dashboard.js'), sounds: !!readPublic('sounds.js'),
    overlay: !!readPublic('overlay.html'), icon: !!readPublic('assets/icon.png'),
    gifts: CATALOG.filter(g => readPublic(`gifts/${g.img}.png`)).length >= CATALOG.length - 5,
    catalog: CATALOG.length > 200, styles: Object.keys(STYLES).length >= 20, rules: Array.isArray(DEFAULT_CONFIG.rules),
    config: (() => { try { const f = path.join(DATA, 'config.json'); if (fs.existsSync(f)) JSON.parse(fs.readFileSync(f, 'utf8')); return true; } catch { return false; } })(),
  };
  const ok = Object.values(checks).every(Boolean);
  process.stdout.write(JSON.stringify({ ok, version: VERSION, checks }));
  process.exit(ok ? 0 : 1);
}
const CONFIG_FILE = path.join(DATA, 'config.json');

// ---------- config ----------
let config = loadConfig();
function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { ...structuredClone(DEFAULT_CONFIG), ...c, head: { ...DEFAULT_CONFIG.head, ...c.head }, throwing: { ...DEFAULT_CONFIG.throwing, ...c.throwing }, fx: { ...DEFAULT_CONFIG.fx, ...c.fx }, chatTts: { ...DEFAULT_CONFIG.chatTts, ...c.chatTts } };
  } catch { return structuredClone(DEFAULT_CONFIG); }
}
function saveConfig() {
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_FILE);
}
if ((config.rulesVersion || 1) < DEFAULT_CONFIG.rulesVersion) {
  // v1.2: Thai gift list + coin price ranges. v1.3: gift-specific effects. v1.4: rose uses its category settings too.
  config.rules = structuredClone(DEFAULT_CONFIG.rules);
  config.rulesVersion = DEFAULT_CONFIG.rulesVersion;
  saveConfig();
}
let firstRun = !fs.existsSync(CONFIG_FILE); // brand-new install: show the welcome card once
if (firstRun) saveConfig();

// ---------- logging ----------
const logs = [];
function log(src, msg, level = 'info') {
  const entry = { t: 'log', time: Date.now(), src, msg, level };
  logs.push(entry); if (logs.length > 200) logs.shift();
  const line = `[${new Date().toLocaleString()}] ${src.padEnd(6)} ${msg}`;
  if (IS_APP) logToFile(line); else console.log(line);
  toDashboards(entry);
}

// ---------- sockets ----------
const dashboards = new Set();
const overlays = new Set();
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
function toDashboards(m) { for (const ws of dashboards) send(ws, m); }
const overlay = {
  count: () => overlays.size,
  send: m => { for (const ws of overlays) send(ws, m); },
};

// ---------- core ----------
const icon = readPublic('assets/icon.png')?.toString('base64');
const vts = new VTS({ port: config.vtsPort, tokenFile: path.join(DATA, 'vts-token.txt'), icon, log });
const tiktok = new TikTokSource(log);
const images = new Images(readPublic, log);
let liveHead = null; // head position after following the model around
const getHead = () => liveHead || { x: config.head.x, y: config.head.y };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { try { fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 1)); } catch {} };
const gifts = new GiftMatcher(readJson('gift-aliases.json', {}));
const effects = new Effects({ vts, images, getHead, log, getConfig: () => config, sound: name => engine.sound(name) });
const engine = new Engine({ getConfig: () => config, getHead, vts, images, gifts, effects, overlay, dashboard: toDashboards, log });
// Gifts actually received in lives (real English name, picture and price) — shown in the gift picker.
const giftsSeen = new Map(readJson('gifts-seen.json', []).map(g => [g.name, g]));
let seenDirty = false;
setInterval(() => { if (seenDirty) { seenDirty = false; writeJson('gifts-seen.json', [...giftsSeen.values()]); writeJson('gift-aliases.json', gifts.learned); } }, 5000);
let viewers = 0;

function status() {
  return {
    tiktok: { status: tiktok.status, detail: tiktok.statusDetail || '', username: tiktok.username },
    vts: { status: vts.status, detail: vts.statusDetail || '', model: vts.model?.modelName || '', images: vts.canCustomImages },
    overlays: overlays.size, viewers, stats: engine.stats, version: VERSION,
  };
}
const pushStatus = () => toDashboards({ t: 'status', ...status() });
const updater = new Updater({ version: VERSION, log, dataDir: DATA });
// Show a cute "updated!" card once after the app switched to a new version.
let justUpdated = '';
if (config.seenVersion !== VERSION) {
  if (!firstRun && (config.seenVersion || updater.previous())) justUpdated = VERSION;
  config.seenVersion = VERSION; saveConfig();
}
updater.set({});
updater.on('state', st => toDashboards({ t: 'update', ...st }));
tiktok.on('status', pushStatus);
vts.on('status', pushStatus);
tiktok.on('viewers', v => { viewers = v; });
setInterval(pushStatus, 3000);

function onEvent(ev, simulated = false) {
  if (ev.type === 'gift' && ev.gift?.name) {
    const learned = simulated ? null : gifts.learn(ev.gift.name, Number(ev.gift.diamonds) || 0);
    if (learned) log('gift', `จำได้แล้ว: "${ev.gift.name}" = ${learned}`);
    ev.gift.th = gifts.thaiName(ev.gift.name) || (CATALOG.some(g => g.th === ev.gift.name) ? ev.gift.name : '');
    if (!simulated && !giftsSeen.has(ev.gift.name)) { giftsSeen.set(ev.gift.name, { name: ev.gift.name, th: ev.gift.th, image: ev.gift.image, diamonds: ev.gift.diamonds }); seenDirty = true; }
  }
  const fired = engine.handle(ev);
  toDashboards({ t: 'event', ev, fired, simulated, time: Date.now() });
}
tiktok.on('event', e => onEvent(e));

// Keep the aim on the head when the model is dragged around in VTS.
setInterval(async () => {
  if (!vts.ready || !config.head.followModel || config.head.modelX == null || calibrating) { liveHead = null; return; }
  const m = await vts.refreshModel();
  const p = m?.modelPosition; if (!p) return;
  liveHead = { x: config.head.x + (p.positionX - config.head.modelX) / 2, y: config.head.y - (p.positionY - config.head.modelY) / 2 };
  if (overlays.size) overlay.send({ t: 'head', ...liveHead });
}, 1000);
let calibrating = false;
let adoptedWindow = false; // the window of the previous version is still open after an update restart

function overlaySettings() {
  return { t: 'settings', throwing: config.throwing, head: { x: config.head.x, y: config.head.y } };
}

// ---------- dashboard commands ----------
async function onDashboard(ws, m) {
  switch (m.t) {
    case 'saveConfig': {
      const next = m.config;
      if (!next || !Array.isArray(next.rules)) return;
      config = { ...config, ...next, head: { ...config.head, ...next.head }, throwing: { ...config.throwing, ...next.throwing }, fx: { ...config.fx, ...next.fx }, chatTts: { ...config.chatTts, ...next.chatTts } };
      saveConfig();
      vts.setPort(Number(config.vtsPort) || 8001);
      overlay.send(overlaySettings());
      send(ws, { t: 'saved' });
      return;
    }
    case 'connectTikTok':
      config.tiktokUsername = String(m.username || '').replace(/^@/, '').trim();
      if (m.apiKey !== undefined) config.eulerApiKey = m.apiKey;
      saveConfig();
      tiktok.connect(config.tiktokUsername, config.eulerApiKey);
      return;
    case 'disconnectTikTok': return tiktok.disconnect();
    case 'simulate': {
      const ev = m.ev;
      ev.user = { id: 'sim', username: 'tester', nickname: ev.user?.nickname || 'คนทดสอบ', avatar: ev.user?.avatar };
      return onEvent(ev, true);
    }
    case 'testAction': {
      try { await engine.run(m.action, { name: 'คนทดสอบ', username: 'tester', gift: 'Rose', count: 1, text: 'สวัสดี', giftImage: undefined }); }
      catch (e) { log('test', e.message, 'warn'); }
      return;
    }
    case 'runRule': {
      const r = config.rules.find(r => r.id === m.id);
      if (r) engine.fire({ ...r, cooldown: 0 }, sampleEvent(r), 1);
      return;
    }
    case 'vtsLists': {
      const out = { t: 'vtsLists', hotkeys: [], expressions: [], items: [] };
      if (vts.ready) {
        out.hotkeys = await vts.hotkeys().catch(() => []);
        out.expressions = await vts.expressions().catch(() => []);
        out.items = await vts.itemFiles().catch(() => []);
      }
      send(ws, out);
      return;
    }
    case 'calibHead': {
      config.head.x = clamp01(m.x); config.head.y = clamp01(m.y);
      calibrating = true; liveHead = null;
      overlay.send({ t: 'calib', x: config.head.x, y: config.head.y, show: true });
      if (vts.ready && vts.canCustomImages) vts.showCalib(images.builtin('target'), config.head);
      return;
    }
    case 'aimMarker': { // show the VTS target at a category/gift aim point (head point itself is unchanged)
      calibrating = true; liveHead = null;
      const at = { x: clamp01(m.x), y: clamp01(m.y) };
      overlay.send({ t: 'calib', ...at, show: true });
      if (vts.ready && vts.canCustomImages) vts.showCalib(images.builtin('target'), at);
      return;
    }
    case 'calibDone': {
      const p = vts.ready ? (await vts.refreshModel())?.modelPosition : null;
      config.head.modelX = p ? p.positionX : null;
      config.head.modelY = p ? p.positionY : null;
      calibrating = false;
      await vts.hideCalib();
      saveConfig();
      overlay.send({ t: 'calib', x: config.head.x, y: config.head.y, show: false });
      overlay.send(overlaySettings());
      log('calib', 'บันทึกตำแหน่งหัวแล้ว');
      return;
    }
    case 'previewStyle': {
      const g = m.gift ? CATALOG.find(c => c.th === m.gift) : CATALOG.find(c => c.style === m.style);
      if (!g) return;
      const ev = { type: 'gift', user: { id: 'sim', username: 'tester', nickname: 'คนทดสอบ' }, gift: { id: '0', name: g.en || g.th, diamonds: g.coins }, count: Number(m.count) || 1 };
      ev.gift.th = g.th;
      toDashboards({ t: 'event', ev, fired: [`ท่า: ${STYLES[g.style]}`], simulated: true, time: Date.now() });
      return engine.run({ type: 'giftfx', style: m.style && !m.gift ? m.style : 'auto' }, { name: 'คนทดสอบ', gift: g.th, count: ev.count, diamonds: g.coins, entry: g });
    }
    case 'quit': return quit();
    case 'checkUpdate': return updater.check(true);
    case 'restartForUpdate': return restartApp();
    case 'backupNow': { saveConfig(); updater.backup('สำรองเอง'); return updater.set({}); }
    case 'restoreBackup': {
      try { updater.restore(m.id); log('backup', 'กู้คืนการตั้งค่าแล้ว กำลังเปิดใหม่…'); }
      catch (e) { return log('backup', e.message, 'warn'); }
      config = loadConfig(); // never overwrite the restored file with what's in memory
      return process.env.KB_INSTALL ? restartApp() : updater.set({});
    }
    case 'rollback': {
      try { const v = updater.rollback(); log('update', `ย้อนกลับเป็นเวอร์ชัน ${v} กำลังเปิดใหม่…`); return restartApp(); }
      catch (e) { return log('update', e.message, 'warn'); }
    }
    case 'clearOverlay': return overlay.send({ t: 'clear' });
    case 'resetRules': config.rules = structuredClone(DEFAULT_CONFIG.rules); saveConfig(); send(ws, { t: 'state', config, gifts: [...giftsSeen.values()], catalog: CATALOG, styles: STYLES }); return;
  }
}

function sampleEvent(r) {
  const t = r.trigger?.type || 'gift';
  const user = { id: 'sim', username: 'tester', nickname: 'คนทดสอบ' };
  if (t === 'gift') {
    const name = String(r.trigger.gifts || '*').split(',')[0].trim();
    const min = Math.max(1, Number(r.trigger.minDiamonds) || 1);
    const g = name === '*' ? (CATALOG.find(c => c.coins >= min) || CATALOG[0]) : (CATALOG.find(c => c.th === name || c.en === name) || { th: name, en: name, coins: min });
    const known = giftsSeen.get(g.en) || giftsSeen.get(name);
    return { type: 'gift', user, gift: { id: '0', name: g.en || g.th, diamonds: g.coins, image: known?.image }, count: 3 };
  }
  if (t === 'chat') return { type: 'chat', user, text: `${r.trigger.match || ''} ทดสอบ` };
  if (t === 'like') return { type: 'like', user, count: Number(r.trigger.every) || 1 };
  return { type: t, user };
}

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;
  if (p === '/') p = '/dashboard.html';
  if (p === '/overlay') p = '/overlay.html';
  if (p === '/api/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('kuminbonk'); }
  const buf = readPublic(decodeURIComponent(p));
  if (!buf) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': p.startsWith('/gifts/') ? 'max-age=86400' : 'no-cache' });
  res.end(buf);
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('error', () => {}); // listen errors are handled on the http server
wss.on('connection', (ws, req) => {
  const role = new URL(req.url, 'http://x').searchParams.get('role');
  if (role === 'overlay') {
    overlays.add(ws);
    send(ws, overlaySettings());
    pushStatus();
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'hit' && m.flinch) vts.flinch(Number(m.dir) || 0, Math.min(2, Number(m.strength) || 1), config.throwing.eyesClose);
    });
    ws.on('close', () => { overlays.delete(ws); pushStatus(); });
  } else {
    // Only one app window: when a new one opens (e.g. after an update), the older one closes itself.
    ws.isApp = new URL(req.url, 'http://x').searchParams.get('app') === '1';
    if (ws.isApp) for (const d of dashboards) if (d.isApp) send(d, { t: 'closeWindow' });
    dashboards.add(ws);
    send(ws, { t: 'state', config, gifts: [...giftsSeen.values()], catalog: CATALOG, styles: STYLES, catDefault: CAT_DEFAULT, anchors: ANCHOR, logs, justUpdated, firstRun });
    justUpdated = ''; firstRun = false;
    send(ws, { t: 'status', ...status() });
    send(ws, { t: 'update', ...updater.state });
    ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; } onDashboard(ws, m).catch(e => log('app', e.message, 'warn')); });
    ws.on('close', () => { dashboards.delete(ws); if (adoptedWindow) setTimeout(() => { if (adoptedWindow && dashboards.size === 0 && !restarting) quit(); }, 8000); });
  }
});

const PORT = Number(process.env.KB_PORT) || Number(config.port) || 3939;
const URL_ = `http://localhost:${PORT}`;
let appWindow = null;

function quit() {
  log('app', 'ปิดโปรแกรม');
  try { appWindow?.kill(); } catch {}
  vts.stop(); tiktok.disconnect(true).catch(() => {});
  setTimeout(() => process.exit(0), 300);
}

// Start again through the launcher so the newest downloaded version is used.
// The launcher writes booting.txt before starting a version; removing it confirms this version works.
function bootOk() { if (process.env.KB_INSTALL) setTimeout(() => { try { fs.rmSync(path.join(process.env.KB_INSTALL, 'booting.txt'), { force: true }); } catch {} }, 4000); }
let restarting = false;
function restartApp() {
  restarting = true;
  if (!process.env.KB_INSTALL) return log('update', 'รีสตาร์ทอัตโนมัติได้เฉพาะแอปที่ติดตั้งแล้ว', 'warn');
  log('update', 'กำลังรีสตาร์ทเพื่อใช้เวอร์ชันใหม่…');
  // Keep the app window open: it shows a "changing outfit" screen and reloads itself when the new version is up.
  toDashboards({ t: 'restarting' });
  vts.stop(); tiktok.disconnect(true).catch(() => {});
  for (const ws of [...dashboards, ...overlays]) { try { ws.terminate(); } catch {} }
  server.close(() => {
    spawn(process.execPath, [path.join(process.env.KB_INSTALL, 'launch.cjs')], { cwd: process.env.KB_INSTALL, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, KB_RESTARTED: '1' } }).unref();
    setTimeout(() => process.exit(0), 300);
  });
  setTimeout(() => process.exit(0), 5000);
}

// Closing the app window closes the app — unless a KuminBonk page is still open somewhere.
function watchWindow(child) {
  if (!child) return;
  const started = Date.now();
  child.on('exit', () => {
    if (restarting) return;
    if (Date.now() - started < 4000) return; // browser handed off to another process: keep running
    setTimeout(() => { if (dashboards.size === 0) quit(); }, 4000);
  });
}

server.on('error', async e => {
  if (e.code === 'EADDRINUSE') {
    // Already running: just bring up another window for it.
    try {
      const r = await fetch(`${URL_}/api/ping`, { signal: AbortSignal.timeout(2000) });
      if ((await r.text()) === 'kuminbonk') {
        if (process.env.KB_INSTALL) { try { fs.rmSync(path.join(process.env.KB_INSTALL, 'booting.txt'), { force: true }); } catch {} }
        if (process.platform === 'win32') openAppWindow(URL_, DATA, { detached: true });
        else console.log(`KuminBonk เปิดอยู่แล้วที่ ${URL_}`);
        return setTimeout(() => process.exit(0), 500);
      }
    } catch {}
    logToFile(`port ${PORT} in use by another program`);
    if (process.env.KB_INSTALL) { try { fs.rmSync(path.join(process.env.KB_INSTALL, 'booting.txt'), { force: true }); } catch {} }
    messageBox(`เปิด KuminBonk ไม่ได้: พอร์ต ${PORT} ถูกโปรแกรมอื่นใช้อยู่`);
    return setTimeout(() => process.exit(1), 4000);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  if (!IS_APP) console.log(`\n  KuminBonk v${VERSION}\n  หน้าตั้งค่า: ${URL_}\n  (overlay ไม่บังคับ: ${URL_}/overlay)\n`);
  log('app', `เปิด KuminBonk v${VERSION}`);
  bootOk();
  vts.start();
  updater.start();
  if (config.autoConnect && config.tiktokUsername) tiktok.connect(config.tiktokUsername, config.eulerApiKey);
  const restarted = process.env.KB_RESTARTED; delete process.env.KB_RESTARTED;
  if (process.platform === 'win32' && !process.env.KB_NO_BROWSER && restarted) {
    // After an update restart the old window reconnects by itself; open a new one only if it doesn't.
    adoptedWindow = true;
    setTimeout(() => { if (dashboards.size === 0) { adoptedWindow = false; appWindow = openAppWindow(URL_, DATA); watchWindow(appWindow); } }, 7000);
  } else if (process.platform === 'win32' && !process.env.KB_NO_BROWSER) {
    appWindow = openAppWindow(URL_, DATA);
    watchWindow(appWindow);
    if (IS_SEA) {
      const ico = path.join(DATA, 'icon.ico');
      try { fs.writeFileSync(ico, readPublic('assets/icon.ico')); } catch {}
      makeShortcuts(process.execPath, ico, log);
    }
  }
});

process.on('uncaughtException', e => log('app', `ข้อผิดพลาด: ${e.message}`, 'warn'));
process.on('unhandledRejection', e => log('app', `ข้อผิดพลาด: ${e?.message || e}`, 'warn'));
