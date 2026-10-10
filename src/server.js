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
import { Sessions, Thanks } from './live.js';
import { Hotkey, HOTKEYS } from './hotkey.js';
import { reportHtml, reportName, summaryDir, listReports, openPath, findDocuments } from './report.js';

const VERSION = '1.8.2';
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
    return sanitizeConfig(mergeConfig(structuredClone(DEFAULT_CONFIG), c));
  } catch { return structuredClone(DEFAULT_CONFIG); }
}
// Settings groups (plain objects like head, throwing, combo…) are merged key by key so new options get their defaults.
function mergeConfig(base, next) {
  const SECTIONS = ['head', 'throwing', 'fx', 'chatTts', 'pause', 'combo', 'limit', 'chatCmd', 'thanks', 'summary'];
  const out = { ...base, ...next };
  for (const k of SECTIONS) if (next?.[k] && typeof next[k] === 'object') out[k] = { ...base[k], ...next[k] };
  return out;
}
// 🔒 settings coming from the dashboard are checked before use (types, ranges, safe folder)
function intIn(v, lo, hi, d) { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; }
function safeFolder(f) {
  const s = typeof f === 'string' ? f.trim() : '';
  if (!s || s.length > 240 || /[\0<>"|?*]/.test(s)) return '';
  if (/^[\\/]{2}/.test(s)) return ''; // no network (\\server\share) paths
  if (process.platform === 'win32') return /^[A-Za-z]:[\\/]/.test(s) && !s.slice(2).includes(':') ? s : '';
  return path.isAbsolute(s) ? s : '';
}
function sanitizeConfig(c) {
  c.vtsPort = intIn(c.vtsPort, 1, 65535, 8001);
  c.port = intIn(c.port, 1024, 65535, 3939);
  c.tiktokUsername = String(c.tiktokUsername || '').replace(/^@/, '').trim().slice(0, 64);
  if (!Array.isArray(c.rules)) c.rules = structuredClone(DEFAULT_CONFIG.rules);
  c.summary = { ...DEFAULT_CONFIG.summary, ...(c.summary || {}) };
  c.summary.folder = safeFolder(c.summary.folder);
  if (!Array.isArray(c.customSounds)) c.customSounds = [];
  c.customSounds = c.customSounds.filter(x => x && /^[a-z0-9]{1,20}$/.test(String(x.id)) && /^[a-z0-9]{1,20}\.(mp3|wav|ogg|webm|m4a|aac)$/.test(String(x.file)));
  if (c.lang && !['th', 'en', 'ja', 'zh', 'ko', 'vi', 'id', 'es'].includes(c.lang)) c.lang = 'th';
  return c;
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
// ---------- lock to the model ----------
// config.locks[target] = { coords (point on the model from a click in VTS), x, y, model }  target: 'head' | 'cat:<style>' | 'gift:<name>'
const livePts = new Map(); // target -> live position from VTube Studio's point tracking
let trackingOk = null, lockWaiting = null, lockTimer = null;
const livePoint = key => { const p = livePts.get(key); return p && Date.now() - p.t < 1500 ? p : null; };
const getLock = key => { const l = config.locks?.[key]; return l ? { ...l, live: livePoint(key) } : null; };
// Locks are saved per model (every model is drawn differently), so switching models switches lock points too.
const modelId = () => vts.model?.modelID || '';
function useModelLocks() { config.modelLocks = config.modelLocks || {}; config.locks = config.modelLocks[modelId()] || {}; }
const getHead = () => livePoint('head') || liveHead || { x: config.head.x, y: config.head.y };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { try { fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 1)); } catch {} };
const gifts = new GiftMatcher(readJson('gift-aliases.json', {}));
const effects = new Effects({ vts, images, getHead, getLock, log, getConfig: () => config, sound: name => engine.sound(name) });
const engine = new Engine({ getConfig: () => config, getHead, vts, images, gifts, effects, overlay, dashboard: toDashboards, log });
// Gifts actually received in lives (real English name, picture and price) — shown in the gift picker.
const giftsSeen = new Map(readJson('gifts-seen.json', []).map(g => [g.name, g]));
let seenDirty = false;
setInterval(() => { if (seenDirty) { seenDirty = false; writeJson('gifts-seen.json', [...giftsSeen.values()]); writeJson('gift-aliases.json', gifts.learned); } }, 5000);
let viewers = 0;
// 📊 live summaries, 🙏 thank-you messages, ⌨️ pause shortcut
const sessions = new Sessions(path.join(DATA, 'sessions.json'), log);
findDocuments();
// 📁 each finished live is also saved as a page in a folder, to open and read any time
function giftPic(name) {
  const g = CATALOG.find(c => c.th === name || c.en === name);
  const buf = g && readPublic(`gifts/${g.img}.png`);
  return buf ? 'data:image/png;base64,' + buf.toString('base64') : '';
}
function writeReport(s) {
  if (!s) return null;
  try {
    const dir = summaryDir(config.summary?.folder);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, reportName(s));
    fs.writeFileSync(file, reportHtml(sessions.view(s), giftPic, config.lang || 'th'));
    s.file = file; sessions.dirty = true; sessions.flush();
    log('summary', `บันทึกสรุปไลฟ์เป็นไฟล์แล้ว: ${path.basename(file)}`);
    return file;
  } catch (e) { log('summary', `บันทึกไฟล์สรุปไม่ได้: ${e.message}`, 'warn'); return null; }
}
function liveEnded(s) {
  if (s && config.summary?.saveFiles !== false) writeReport(s);
  toDashboards({ t: 'sessions', list: sessions.all(), ended: !!s });
}
const thanks = new Thanks(() => config, text => toDashboards({ t: 'tts', text, kind: 'thanks' }));
const hotkey = new Hotkey(log);
hotkey.onPress = () => setPaused(!engine.paused, 'คีย์ลัด');
function setupHotkey() { hotkey.set(config.pause?.hotkeyOn ? config.pause.hotkey : ''); setTimeout(pushStatus, 2500); }
function setPaused(on, by = '') {
  engine.setPaused(on);
  log('pause', on ? `⏸ พักเอฟเฟกต์${by ? ` (${by})` : ''} — ของขวัญที่ส่งมาระหว่างนี้จะรอไว้ก่อน` : `▶ เล่นเอฟเฟกต์ต่อ${engine.queue.length ? ` — ปล่อยของที่รอ ${engine.queue.length} รายการ` : ''}`);
  pushStatus();
}
// The live dropped and never came back (no clean "stream ended"): close its summary after 10 minutes.
setInterval(() => {
  const c = sessions.cur;
  if (c && tiktok.status !== 'live' && Date.now() - (c.updated || c.start) > 10 * 60000) {
    liveEnded(sessions.end(true));
  }
}, 60000).unref?.();
let queueTimer = null;
engine.onQueue = () => { if (!queueTimer) queueTimer = setTimeout(() => { queueTimer = null; pushStatus(); }, 300); };
const SOUND_DIR = path.join(DATA, 'sounds');

function status() {
  return {
    tiktok: { status: tiktok.status, detail: tiktok.statusDetail || '', username: tiktok.username },
    vts: { status: vts.status, detail: vts.statusDetail || '', model: vts.model?.modelName || '', images: vts.canCustomImages },
    overlays: overlays.size, viewers, stats: engine.stats, version: VERSION,
    paused: engine.paused, queued: engine.queue.length, hotkey: { key: hotkey.key, state: hotkey.state, list: HOTKEYS }, session: !!sessions.cur,
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
let lastTikStatus = '';
tiktok.on('status', () => {
  const st = tiktok.status;
  if (st !== lastTikStatus) {
    if (st === 'live' && config.summary?.enabled !== false) sessions.start(tiktok.username);
    if (st === 'offline' && sessions.cur) liveEnded(sessions.end());
    lastTikStatus = st;
  }
  pushStatus();
});
vts.on('status', pushStatus);
tiktok.on('viewers', v => { viewers = v; sessions.viewers(v); });
setInterval(pushStatus, 3000);

// TikTok (or a test) event → safe shape: numbers are numbers, strings are short strings
function cleanEvent(ev) {
  const str = (v, n = 200) => String(v ?? '').slice(0, n);
  const u = ev.user || {};
  ev.user = { id: str(u.id, 80), username: str(u.username, 80), nickname: str(u.nickname, 80), avatar: /^https?:\/\//.test(String(u.avatar || '')) ? str(u.avatar, 1000) : '' };
  ev.count = Math.max(1, Math.min(1e6, Math.floor(Number(ev.count)) || 1));
  if (ev.type === 'gift') {
    const g = ev.gift || {};
    ev.gift = { id: str(g.id, 40), name: str(g.name, 120), diamonds: Math.max(0, Math.min(1e6, Math.floor(Number(g.diamonds)) || 0)), image: /^https?:\/\//.test(String(g.image || '')) ? str(g.image, 1000) : undefined };
  }
  if (ev.type === 'chat') ev.text = str(ev.text, 500);
  return ev;
}
const EVENT_TYPES = new Set(['gift', 'like', 'follow', 'share', 'join', 'chat']);
function onEvent(ev, simulated = false) {
  if (!ev || !EVENT_TYPES.has(ev.type)) return;
  cleanEvent(ev);
  if (ev.type === 'gift' && ev.gift?.name) {
    const learned = simulated ? null : gifts.learn(ev.gift.name, Number(ev.gift.diamonds) || 0);
    if (learned) log('gift', `จำได้แล้ว: "${ev.gift.name}" = ${learned}`);
    ev.gift.th = gifts.thaiName(ev.gift.name) || (CATALOG.some(g => g.th === ev.gift.name) ? ev.gift.name : '');
    if (!simulated && !giftsSeen.has(ev.gift.name) && giftsSeen.size < 1000) { giftsSeen.set(ev.gift.name, { name: ev.gift.name, th: ev.gift.th, image: ev.gift.image, diamonds: ev.gift.diamonds }); seenDirty = true; }
  }
  if (!simulated) sessions.add(ev);
  if (!simulated) thanks.handle(ev); // the ✨ tab has its own "listen" button for testing
  const fired = engine.handle(ev, simulated); // tests always play right away (even while paused)
  const combo = ev.type === 'gift' && engine.lastCombo?.mult > 1 ? engine.lastCombo.total : 0;
  toDashboards({ t: 'event', ev, fired, simulated, time: Date.now(), combo, queued: !simulated && (engine.paused || engine.queue.length > 0) && fired.length > 0 });
}
tiktok.on('event', e => onEvent(e));

const COORD_KEYS = ['modelID', 'artMeshID', 'vertexID1', 'vertexID2', 'vertexID3', 'vertexWeight1', 'vertexWeight2', 'vertexWeight3'];
async function syncTracking() {
  if (!vts.ready) return;
  const pts = Object.entries(config.locks || {}).filter(([, l]) => l?.coords)
    .map(([k, l]) => ({ trackingPointID: k, artMeshCoords: { ...Object.fromEntries(COORD_KEYS.map(c => [c, l.coords[c]])), angle: 0, size: 1 }, visualize: false }));
  try {
    if (!pts.length) { await vts.subscribe('ArtMeshTrackingEvent', false); livePts.clear(); return; }
    await vts.subscribe('ArtMeshTrackingEvent', true, { frequency: 20, trackingPoints: pts });
    if (trackingOk !== true) log('lock', `ล็อกกับโมเดลแล้ว ${pts.length} จุด — เป้าจะขยับตามตัวละครตลอดเวลา`);
    trackingOk = true;
  } catch (e) {
    if (trackingOk !== false) log('lock', 'VTube Studio เวอร์ชันนี้ยังติดตามจุดบนโมเดลแบบสด ๆ ไม่ได้ (มีในเวอร์ชันใหม่/beta) — ของที่วางบนตัวยังติดหมุดตามโมเดลได้ปกติ', 'warn');
    trackingOk = false;
  }
}
function finishLock(target, d, hit) {
  clearTimeout(lockTimer); lockWaiting = null;
  vts.subscribe('ModelClickedEvent', false).catch(() => {});
  const pos = { x: clamp01((d.clickPosition.x + 1) / 2), y: clamp01((1 - d.clickPosition.y) / 2) };
  config.modelLocks = config.modelLocks || {};
  const mid = d.loadedModelID || modelId();
  config.modelLocks[mid] = { ...(config.modelLocks[mid] || {}), [target]: { coords: hit, x: pos.x, y: pos.y, model: d.loadedModelName || '' } };
  config.locks = config.modelLocks[mid];
  // the clicked point is also the new aim for that target
  if (target === 'head') { config.head.x = pos.x; config.head.y = pos.y; liveHead = null; }
  else {
    const [kind, ...rest] = target.split(':'); const name = rest.join(':');
    config.fx = config.fx || {}; config.fx.cats = config.fx.cats || {}; config.fx.gifts = config.fx.gifts || {};
    const style = kind === 'cat' ? name : (config.fx.gifts[name]?.style || CATALOG.find(g => g.th === name)?.style || 'bonk');
    const a = ANCHOR[style] || { dx: 0, dy: 0 };
    const aim = { dx: Math.round((pos.x - config.head.x - a.dx) * 1000) / 1000, dy: Math.round((pos.y - config.head.y - a.dy) * 1000) / 1000 };
    if (kind === 'cat') config.fx.cats[name] = { ...(config.fx.cats[name] || {}), aim };
    else config.fx.gifts[name] = { ...(config.fx.gifts[name] || {}), aim };
  }
  saveConfig(); syncTracking();
  log('lock', `📌 ล็อกจุด ${target === 'head' ? 'หัว' : target.replace(/^cat:/, 'หมวด ').replace(/^gift:/, '')} ไว้กับ "${hit.artMeshID}" ของโมเดลแล้ว`);
  toDashboards({ t: 'lockDone', target, config });
  if (vts.ready && vts.canCustomImages) vts.showCalib(images.builtin('target'), pos);
}
vts.on('ready', () => { trackingOk = null; livePts.clear(); useModelLocks(); syncTracking(); toDashboards({ t: 'lockDone', config }); });
vts.on('modelLoaded', () => { livePts.clear(); setTimeout(() => { useModelLocks(); syncTracking(); toDashboards({ t: 'lockDone', config }); }, 800); });
vts.on('vtsEvent', (type, d) => {
  if (type === 'ArtMeshTrackingEvent') {
    const now = Date.now();
    for (const tp of d.trackingPoints || []) if (tp.position) livePts.set(tp.trackingPointID, { x: (tp.position.x + 1) / 2, y: (1 - tp.position.y) / 2, t: now });
    return;
  }
  if (type === 'ModelClickedEvent' && lockWaiting) {
    if (d.mouseButtonID !== 0 || !d.modelWasClicked || !d.artMeshHits?.length) return;
    const hit = (d.artMeshHits.find(h => h.artMeshOrder === 0) || d.artMeshHits[0]).hitInfo;
    if (hit) finishLock(lockWaiting, d, hit);
  }
});

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
      delete next.customSounds; // the server owns the uploaded-sound list (a save in flight must not undo an upload)
      const hk = JSON.stringify([config.pause?.hotkeyOn, config.pause?.hotkey]);
      config = sanitizeConfig(mergeConfig(config, next));
      saveConfig();
      if (hk !== JSON.stringify([config.pause?.hotkeyOn, config.pause?.hotkey])) setupHotkey();
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
      const ev = m.ev && typeof m.ev === 'object' ? m.ev : null;
      if (!ev) return;
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
    case 'lockStart': {
      if (!vts.ready) return log('lock', 'ต้องเชื่อมต่อ VTube Studio ก่อน', 'warn');
      lockWaiting = String(m.target || 'head');
      await vts.subscribe('ModelClickedEvent', true, { onlyClicksOnModel: true }).catch(e => { lockWaiting = null; log('lock', `เริ่มล็อกไม่ได้: ${e.message}`, 'warn'); });
      if (!lockWaiting) return;
      await vts.hideCalib();
      clearTimeout(lockTimer);
      lockTimer = setTimeout(() => { if (lockWaiting) { lockWaiting = null; vts.subscribe('ModelClickedEvent', false).catch(() => {}); toDashboards({ t: 'lockCancelled' }); } }, 90000);
      toDashboards({ t: 'lockWaiting', target: lockWaiting });
      return;
    }
    case 'lockCancel': clearTimeout(lockTimer); lockWaiting = null; vts.subscribe('ModelClickedEvent', false).catch(() => {}); toDashboards({ t: 'lockCancelled' }); return;
    case 'unlock': {
      const ml = config.modelLocks?.[modelId()]; if (ml) delete ml[m.target];
      useModelLocks();
      livePts.delete(m.target); saveConfig(); syncTracking();
      log('lock', 'ปลดล็อกจุดแล้ว');
      toDashboards({ t: 'lockDone', target: m.target, config });
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
    case 'pause': return setPaused(m.on !== undefined ? !!m.on : !engine.paused, 'ปุ่ม');
    case 'clearQueue': engine.clearQueue(); log('pause', 'ล้างของที่รออยู่แล้ว'); return pushStatus();
    case 'sessions': return send(ws, { t: 'sessions', list: sessions.all() });
    case 'delSession': sessions.remove(Number(m.id)); return send(ws, { t: 'sessions', list: sessions.all() });
    case 'summaryFiles': { const dir = summaryDir(config.summary?.folder); return send(ws, { t: 'summaryFiles', dir, files: listReports(dir) }); }
    case 'saveSummaryFile': {
      const s = sessions.list.find(x => x.id === Number(m.id));
      const file = writeReport(s);
      if (file && m.open) openPath(file);
      const dir = summaryDir(config.summary?.folder);
      toDashboards({ t: 'sessions', list: sessions.all() });
      return send(ws, { t: 'summaryFiles', dir, files: listReports(dir) });
    }
    case 'openSummaryFolder': {
      const dir = summaryDir(config.summary?.folder);
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return log('summary', `เปิดโฟลเดอร์ไม่ได้: ${e.message}`, 'warn'); }
      return openPath(dir);
    }
    case 'openSummaryFile': {
      const dir = summaryDir(config.summary?.folder);
      const file = path.join(dir, path.basename(String(m.name || '')));
      if (!file.toLowerCase().endsWith('.html') || !fs.existsSync(file)) return log('summary', 'ไม่พบไฟล์สรุปนี้ (อาจถูกย้ายหรือลบไปแล้ว)', 'warn');
      return openPath(file);
    }
    case 'addSound': {
      const ext = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/x-m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/aac': 'aac' }[m.mime] || String(m.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac'].includes(ext)) return log('sound', 'ใช้ได้เฉพาะไฟล์เสียง mp3 / wav / ogg / m4a', 'warn');
      if ((config.customSounds || []).length >= 50) return log('sound', 'เพิ่มเสียงได้สูงสุด 50 เสียง ลบเสียงที่ไม่ใช้ก่อนนะ', 'warn');
      if (typeof m.data !== 'string' || m.data.length > 4.2e6) return log('sound', 'ไฟล์เสียงต้องไม่เกิน 3 MB', 'warn');
      const buf = Buffer.from(m.data, 'base64');
      if (!buf.length || buf.length > 3 * 1024 * 1024) return log('sound', 'ไฟล์เสียงต้องไม่เกิน 3 MB', 'warn');
      fs.mkdirSync(SOUND_DIR, { recursive: true });
      const id = Date.now().toString(36);
      fs.writeFileSync(path.join(SOUND_DIR, `${id}.${ext}`), buf);
      const name = String(m.name || 'เสียงของฉัน').replace(/\.[a-z0-9]+$/i, '').slice(0, 40);
      config.customSounds = [...(config.customSounds || []), { id, name, file: `${id}.${ext}` }];
      saveConfig(); log('sound', `เพิ่มเสียง "${name}" แล้ว`);
      return toDashboards({ t: 'sounds', customSounds: config.customSounds, added: id });
    }
    case 'delSound': {
      const s = (config.customSounds || []).find(x => x.id === m.id);
      if (s) { try { fs.rmSync(path.join(SOUND_DIR, s.file), { force: true }); } catch {} }
      config.customSounds = (config.customSounds || []).filter(x => x.id !== m.id);
      saveConfig();
      return toDashboards({ t: 'sounds', customSounds: config.customSounds });
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
// 🔒 Only this app may talk to the server: web pages from other sites (and DNS-rebinding tricks) are refused.
const LOCAL_HOSTS = () => [`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`];
const hostOk = req => LOCAL_HOSTS().includes(String(req.headers.host || '').toLowerCase());
const originOk = req => { const o = req.headers.origin; return !o || LOCAL_HOSTS().some(h => String(o).toLowerCase() === 'http://' + h); };
const server = http.createServer((req, res) => {
  if (!hostOk(req)) { res.writeHead(403); return res.end('forbidden'); }
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;
  if (p === '/') p = '/dashboard.html';
  if (p === '/overlay') p = '/overlay.html';
  if (p === '/api/ping') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('kuminbonk'); }
  if (p.startsWith('/usound/')) { // uploaded effect sounds
    const s = (config.customSounds || []).find(x => x.id === p.slice(8));
    let buf = null; try { if (s) buf = fs.readFileSync(path.join(SOUND_DIR, s.file)); } catch {}
    if (!buf) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(s.file).slice(1);
    res.writeHead(200, { 'Content-Type': { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4', aac: 'audio/aac' }[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
    return res.end(buf);
  }
  let rel; try { rel = decodeURIComponent(p); } catch { res.writeHead(400); return res.end('bad request'); }
  const buf = readPublic(rel);
  if (!buf) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': p.startsWith('/gifts/') ? 'max-age=86400' : 'no-cache' });
  res.end(buf);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 6 * 1024 * 1024, verifyClient: ({ req }) => hostOk(req) && originOk(req) });
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
  hotkey.stop();
  { const s = sessions.end(tiktok.status !== 'live'); if (s && config.summary?.saveFiles !== false) writeReport(s); }
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
  vts.stop(); tiktok.disconnect(true).catch(() => {}); hotkey.stop(); sessions.dirty = true; sessions.flush();
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
  setupHotkey();
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
