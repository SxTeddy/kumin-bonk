// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// VTube Studio public API client (ws://localhost:8001).
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import WebSocket from 'ws';

const PLUGIN = { pluginName: 'KuminBonk', pluginDeveloper: 'kmxlrinf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class VTS extends EventEmitter {
  constructor({ port = 8001, tokenFile, icon, log }) {
    super();
    this.port = port;
    this.tokenFile = tokenFile;
    this.icon = icon;
    this.log = log;
    this.ws = null;
    this.pending = new Map();
    this.seq = 0;
    this.status = 'offline'; // offline | waiting-permission | ready
    this.model = null;
    this.anims = [];
    this.loop = null;
    this.moveChain = Promise.resolve();
    this.stopped = false;
    this.canCustomImages = false;
    this.itemFileCache = new Map(); // key -> fileName VTS generated for our custom image
    this.flying = 0;                // items currently being thrown
    this.throwQueue = [];
    this.calibItem = null;
    this.sprites = 0;
  }

  // Needed to throw our own pictures as VTS items (asks once, VTS remembers).
  async ensureImagePermission() {
    try {
      const has = await this.request('PermissionRequest', {});
      if (has.permissions?.some(p => p.name === 'LoadCustomImagesAsItems' && p.granted)) { this.canCustomImages = true; return true; }
      this.log('vts', 'ขออนุญาตโหลดรูปเป็นไอเท็ม — กด Allow ใน VTube Studio');
      const r = await this.request('PermissionRequest', { requestedPermission: 'LoadCustomImagesAsItems' }, 120000);
      this.canCustomImages = !!r.grantSuccess || !!r.permissions?.some(p => p.name === 'LoadCustomImagesAsItems' && p.granted);
      this.log('vts', this.canCustomImages ? 'ได้รับอนุญาตให้ปาของใน VTube Studio แล้ว' : 'ไม่ได้รับอนุญาตโหลดรูป — ของที่ปาจะไม่แสดงใน VTS', this.canCustomImages ? 'info' : 'warn');
    } catch (e) { this.log('vts', `ขออนุญาตโหลดรูปไม่ได้: ${e.message}`, 'warn'); }
    return this.canCustomImages;
  }

  // Load an image as a VTS item; reuses the file VTS generated the first time.
  async loadImageItem(img, opts) {
    const base = {
      positionX: opts.x, positionY: opts.y, size: opts.size, rotation: opts.rotation || 0, fadeTime: opts.fadeTime ?? 0,
      order: opts.order ?? 12, failIfOrderTaken: false, smoothing: 0, censored: false, flipped: false, locked: true, unloadWhenPluginDisconnects: true,
    };
    const cached = this.itemFileCache.get(img.key);
    if (cached) {
      try { return await this.request('ItemLoadRequest', { ...base, fileName: cached }); }
      catch { this.itemFileCache.delete(img.key); }
    }
    if (!this.canCustomImages) throw new Error('ยังไม่ได้อนุญาตให้โหลดรูปใน VTube Studio');
    const r = await this.request('ItemLoadRequest', {
      ...base, fileName: `kb-${img.key}.${img.ext || 'png'}`.slice(0, 32),
      customDataBase64: img.b64, customDataAskUserFirst: false, customDataSkipAskingUserIfWhitelisted: true, customDataAskTimer: -1,
    });
    if (r.fileName) { this.itemFileCache.set(img.key, r.fileName); if (this.itemFileCache.size > 600) this.itemFileCache.delete(this.itemFileCache.keys().next().value); }
    return r;
  }

  unloadItems(ids) {
    return this.request('ItemUnloadRequest', { unloadAllInScene: false, unloadAllLoadedByThisPlugin: false, allowUnloadingItemsLoadedByUserOrOtherPlugins: false, instanceIDs: ids }).catch(() => {});
  }

  moveItem(id, o, time, fadeMode = 'linear') {
    return this.request('ItemMoveRequest', { itemsToMove: [{
      itemInstanceID: id, timeInSeconds: time, fadeMode, positionX: o.x ?? -1000, positionY: o.y ?? -1000, size: o.size ?? -1000,
      rotation: o.rotation ?? -1000, order: -1000, setFlip: false, flip: false, userCanStop: false,
    }] });
  }

  // Throw a picture at the head inside VTube Studio. head = {x,y} in 0..1 screen coords (y down).
  throwItem(t) {
    if (!this.ready) return;
    if (this.flying >= 18) { if (this.throwQueue.length < 600) this.throwQueue.push(t); return; } // max 18 in the air, the rest wait (each waiting one is tiny)
    this.flying++;
    this._throw(t).catch(e => this.log('vts', `ปาของไม่สำเร็จ: ${e.message}`, 'warn')).finally(() => {
      this.flying--;
      const next = this.throwQueue.shift();
      if (next) this.throwItem(next);
    });
  }

  async _throw({ img, head, from = 'random', size = 0.18, speed = 1, spin = 1, flinch = true, strength = 1, eyes = true, onHit }) {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const headNow = typeof head === 'function' ? head : () => head; // a function = follow the model while flying
    const jx = rnd(-0.04, 0.04), jy = rnd(-0.04, 0.04);
    const h0 = headNow();
    let hx = h0.x * 2 - 1 + jx;
    let hy = 1 - h0.y * 2 + jy;
    if (from === 'random') from = ['left', 'right', 'left', 'right', 'top'][Math.floor(Math.random() * 5)];
    let sx, sy;
    if (from === 'left') { sx = -1.35; sy = rnd(-0.5, 0.6); }
    else if (from === 'right') { sx = 1.35; sy = rnd(-0.5, 0.6); }
    else if (from === 'top') { sx = hx + rnd(-0.25, 0.25); sy = 1.4; }
    else { sx = rnd(-0.8, 0.8); sy = -1.4; }
    const rot0 = rnd(0, 360);
    const turn = (Math.random() < 0.5 ? -1 : 1) * 360 * Math.max(0.2, spin);
    const T = (from === 'top' ? 0.5 : rnd(0.4, 0.55)) / Math.max(0.3, speed);

    const { instanceID: id } = await this.loadImageItem(img, { x: sx, y: sy, size, rotation: rot0, order: 10 + Math.floor(Math.random() * 15) });
    try {
      await this.moveItem(id, { x: hx, y: hy, rotation: rot0 + turn }, T, 'easeIn');
      await sleep(T * 600);
      // halfway: the model may have moved — aim again at where the head is now
      const h1 = headNow(); const nx = h1.x * 2 - 1 + jx, ny = 1 - h1.y * 2 + jy;
      if (Math.abs(nx - hx) + Math.abs(ny - hy) > 0.01) { hx = nx; hy = ny; await this.moveItem(id, { x: hx, y: hy, rotation: rot0 + turn }, T * 0.4, 'linear'); }
      await sleep(T * 400);
      const dir = sx < hx ? -1 : 1; // side the hit came from
      if (flinch) this.flinch(dir, strength, eyes);
      onHit?.(dir);
      // bounce off the head, then drop out of the screen
      const bx = hx - dir * rnd(0.12, 0.3);
      await this.moveItem(id, { x: bx, y: hy + rnd(0.15, 0.3), rotation: rot0 + turn * 1.4 }, 0.22, 'easeOut');
      await sleep(230);
      await this.moveItem(id, { x: bx - dir * rnd(0.05, 0.2), y: -1.5, rotation: rot0 + turn * 2.2 }, 0.65, 'easeIn');
      await sleep(680);
    } finally {
      await this.unloadItems([id]);
    }
  }

  // ---- sprite helpers for gift effects (screen coords: x 0..1 left→right, y 0..1 top→bottom) ----
  async sprite(img, { x, y, size = 0.2, rot = 0, order, fade = 0 }) {
    if (!this.ready) return null;
    for (let i = 0; this.sprites >= 26 && i < 60; i++) await sleep(50);
    if (this.sprites >= 26) return null;
    this.sprites++;
    try {
      const r = await this.loadImageItem(img, { x: x * 2 - 1, y: 1 - y * 2, size, rotation: rot, order: order ?? 6 + Math.floor(Math.random() * 20), fadeTime: fade });
      return r.instanceID;
    } catch (e) { this.sprites--; throw e; }
  }
  spriteTo(id, { x, y, size, rot }, time, fade = 'linear', flip) {
    if (!id) return Promise.resolve();
    return this.request('ItemMoveRequest', { itemsToMove: [{
      itemInstanceID: id, timeInSeconds: time, fadeMode: fade,
      positionX: x == null ? -1000 : x * 2 - 1, positionY: y == null ? -1000 : 1 - y * 2, size: size ?? -1000, rotation: rot ?? -1000,
      order: -1000, setFlip: flip != null, flip: !!flip, userCanStop: false,
    }] }).catch(() => {});
  }
  async spriteKill(id) { if (!id) return; await this.unloadItems([id]); this.sprites = Math.max(0, this.sprites - 1); }

  // ---- lock to the model ----
  subscribe(eventName, subscribe = true, config = {}) { return this.request('EventSubscriptionRequest', { eventName, subscribe, config }); }
  // Pin an item to an exact point on the model (barycentric coords from a model click); it then follows the model.
  pin(id, coords) {
    if (!id || !coords) return Promise.resolve(false);
    return this.request('ItemPinRequest', {
      pin: true, itemInstanceID: id, angleRelativeTo: 'RelativeToCurrentItemRotation', sizeRelativeTo: 'RelativeToCurrentItemSize', vertexPinType: 'Provided',
      pinInfo: { modelID: coords.modelID || '', artMeshID: coords.artMeshID, angle: 0, size: 0,
        vertexID1: coords.vertexID1, vertexID2: coords.vertexID2, vertexID3: coords.vertexID3,
        vertexWeight1: coords.vertexWeight1, vertexWeight2: coords.vertexWeight2, vertexWeight3: coords.vertexWeight3 },
    }).then(r => !!r.isPinned).catch(e => { this.log('vts', `ติดหมุดไอเท็มกับโมเดลไม่ได้: ${e.message}`, 'warn'); return false; });
  }
  unpin(id) { return id ? this.request('ItemPinRequest', { pin: false, itemInstanceID: id }).catch(() => {}) : Promise.resolve(); }

  // Aim marker shown inside VTS while calibrating.
  async showCalib(img, head) {
    if (!this.ready) return;
    const x = head.x * 2 - 1, y = 1 - head.y * 2;
    if (this.calibItem) { await this.moveItem(this.calibItem, { x, y }, 0).catch(() => { this.calibItem = null; }); if (this.calibItem) return; }
    if (this._calibLoading) return;
    this._calibLoading = true;
    try { this.calibItem = (await this.loadImageItem(img, { x, y, size: 0.14, order: 30 })).instanceID; }
    catch (e) { this.log('vts', `แสดงเป้าใน VTS ไม่ได้: ${e.message}`, 'warn'); }
    finally { this._calibLoading = false; }
  }
  async hideCalib() { if (this.calibItem) { const id = this.calibItem; this.calibItem = null; await this.unloadItems([id]); } }

  setStatus(s, detail = '') {
    if (this.status === s && this.statusDetail === detail) return;
    this.status = s; this.statusDetail = detail;
    this.emit('status', { status: s, detail, model: this.model?.modelName });
  }

  start() { this.stopped = false; this._open(); }
  stop() { this.stopped = true; this.ws?.close(); }
  setPort(p) { if (p === this.port) return; this.port = p; this.ws?.terminate(); }

  _open() {
    if (this.stopped) return;
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.ws = ws;
    ws.on('open', () => this._auth().catch(e => {
      this.log('vts', `ยืนยันตัวตนไม่สำเร็จ: ${e.message}`, 'warn');
      ws.close();
    }));
    ws.on('message', raw => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      const p = this.pending.get(msg.requestID);
      if (p) { this.pending.delete(msg.requestID); clearTimeout(p.t); p.resolve(msg); }
      else if (msg.messageType === 'ModelLoadedEvent') { this.refreshModel(); this.emit('modelLoaded'); }
      else if (/Event$/.test(msg.messageType || '')) this.emit('vtsEvent', msg.messageType, msg.data || {});
    });
    ws.on('close', () => {
      for (const p of this.pending.values()) { clearTimeout(p.t); p.reject(new Error('disconnected')); }
      this.pending.clear();
      if (this.ws === ws) this.ws = null;
      if (this.status !== 'offline') this.log('vts', 'หลุดการเชื่อมต่อ VTube Studio', 'warn');
      this.setStatus('offline', 'เปิด VTube Studio และเปิด API (Start API) ไว้');
      if (!this.stopped) setTimeout(() => this._open(), 3000);
    });
    ws.on('error', () => {});
  }

  request(messageType, data = {}, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return reject(new Error('VTube Studio ไม่ได้เชื่อมต่อ'));
      const requestID = `kb${++this.seq}`;
      const t = setTimeout(() => { this.pending.delete(requestID); reject(new Error(`${messageType} timeout`)); }, timeout);
      this.pending.set(requestID, { resolve, reject, t });
      this.ws.send(JSON.stringify({ apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0', requestID, messageType, data }));
    }).then(msg => {
      if (msg.messageType === 'APIError') {
        const e = new Error(msg.data?.message || 'API error'); e.code = msg.data?.errorID; throw e;
      }
      return msg.data;
    });
  }

  readToken() { try { return fs.readFileSync(this.tokenFile, 'utf8').trim(); } catch { return ''; } }
  saveToken(t) { try { fs.writeFileSync(this.tokenFile, t); } catch {} }

  async _auth() {
    let token = this.readToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!token) {
        this.setStatus('waiting-permission', 'กด "Allow" ในหน้าต่าง VTube Studio');
        this.log('vts', 'ขออนุญาตใช้ปลั๊กอิน — กด Allow ใน VTube Studio');
        const r = await this.request('AuthenticationTokenRequest', { ...PLUGIN, pluginIcon: this.icon }, 120000);
        token = r.authenticationToken;
        this.saveToken(token);
      }
      const a = await this.request('AuthenticationRequest', { ...PLUGIN, authenticationToken: token });
      if (a.authenticated) {
        await this.request('EventSubscriptionRequest', { eventName: 'ModelLoadedEvent', subscribe: true }).catch(() => {});
        await this.refreshModel();
        this.setStatus('ready');
        this.emit('ready');
        this.log('vts', `เชื่อมต่อ VTube Studio แล้ว${this.model?.modelName ? ` (โมเดล: ${this.model.modelName})` : ''}`);
        this.itemFileCache.clear();
        this.ensureImagePermission();
        return;
      }
      token = ''; this.saveToken('');
    }
    throw new Error('ไม่ได้รับอนุญาต');
  }

  async refreshModel() {
    try {
      this.model = await this.request('CurrentModelRequest');
      this.emit('status', { status: this.status, detail: this.statusDetail, model: this.model?.modelName });
    } catch {}
    return this.model;
  }

  get ready() { return this.status === 'ready'; }

  // ---------- lists for the dashboard ----------
  async hotkeys() {
    const r = await this.request('HotkeysInCurrentModelRequest');
    return (r.availableHotkeys || []).map(h => ({ id: h.hotkeyID, name: h.name || h.type, type: h.type }));
  }
  async expressions() {
    const r = await this.request('ExpressionStateRequest', { details: false });
    return (r.expressions || []).map(e => ({ file: e.file, name: e.name }));
  }
  async itemFiles() {
    const r = await this.request('ItemListRequest', { includeAvailableSpots: false, includeItemInstancesInScene: false, includeAvailableItemFiles: true });
    return (r.availableItemFiles || []).map(f => f.fileName);
  }

  // ---------- actions ----------
  triggerHotkey(id) { return this.request('HotkeyTriggerRequest', { hotkeyID: id }); }

  async expression(file, seconds = 3) {
    await this.request('ExpressionActivationRequest', { expressionFile: file, active: true });
    if (seconds > 0) setTimeout(() => this.request('ExpressionActivationRequest', { expressionFile: file, active: false }).catch(() => {}), seconds * 1000);
  }

  async tint(hex = '#ff7aa8', seconds = 2) {
    const c = hexToRgb(hex);
    const matcher = { tintAll: true };
    await this.request('ColorTintRequest', { colorTint: { colorR: c.r, colorG: c.g, colorB: c.b, colorA: 255 }, artMeshMatcher: matcher });
    clearTimeout(this.tintTimer);
    this.tintTimer = setTimeout(() => this.request('ColorTintRequest', { colorTint: { colorR: 255, colorG: 255, colorB: 255, colorA: 255 }, artMeshMatcher: matcher }).catch(() => {}), seconds * 1000);
  }

  async item({ file, x = 0.5, y = 0.3, size = 0.3, seconds = 5 }) {
    const r = await this.request('ItemLoadRequest', {
      fileName: file, positionX: x * 2 - 1, positionY: 1 - y * 2, size, rotation: 0, fadeTime: 0.3, order: 25 + Math.floor(Math.random() * 10),
      failIfOrderTaken: false, smoothing: 0, censored: false, flipped: false, locked: false, unloadWhenPluginDisconnects: true,
    });
    if (seconds > 0) setTimeout(() => this.request('ItemUnloadRequest', { instanceIDs: [r.instanceID], unloadAllInScene: false, unloadAllLoadedByThisPlugin: false, allowUnloadingItemsLoadedByUserOrOtherPlugins: false }).catch(() => {}), seconds * 1000);
    return r.instanceID;
  }

  // Head/face animations are added on top of face tracking (InjectParameterData, mode "add").
  // fn(t seconds, u 0..1) returns { FaceAngleX, FaceAngleY, FaceAngleZ, EyeOpenLeft, EyeOpenRight, MouthSmile, MouthOpen, FacePositionX, FacePositionY }.
  animate(seconds, fn) {
    if (!this.ready) return;
    this.anims.push({ t0: Date.now(), dur: seconds * 1000, fn });
    if (this.anims.length > 24) this.anims.shift();
    if (!this.loop) this.loop = setInterval(() => this._tick(), 33);
  }

  // Bonk flinch: decaying, wobbling head-turn. dir: -1 (hit from left) .. 1 (hit from right); strength 0..2
  flinch(dir = 0, strength = 1, eyes = true) {
    const d = dir || (Math.random() < 0.5 ? -1 : 1);
    this.animate(0.9, t => {
      const env = Math.exp(-t / 0.22) * Math.cos(t * 16);
      return {
        FaceAngleX: -d * 28 * strength * env, FaceAngleZ: d * 18 * strength * env, FaceAngleY: -12 * strength * Math.exp(-t / 0.18),
        ...(eyes && t < 0.28 ? { EyeOpenLeft: -1, EyeOpenRight: -1 } : {}),
      };
    });
  }

  _tick() {
    const now = Date.now();
    this.anims = this.anims.filter(a => now - a.t0 < a.dur);
    const sum = { FaceAngleX: 0, FaceAngleY: 0, FaceAngleZ: 0, EyeOpenLeft: 0, EyeOpenRight: 0, MouthSmile: 0, MouthOpen: 0, FacePositionX: 0, FacePositionY: 0 };
    for (const a of this.anims) {
      const t = (now - a.t0) / 1000;
      let out; try { out = a.fn(t, Math.min(1, t * 1000 / a.dur)) || {}; } catch { out = {}; }
      for (const k in out) if (k in sum && Number.isFinite(out[k])) sum[k] += out[k];
    }
    const lim = { FaceAngleX: 30, FaceAngleY: 30, FaceAngleZ: 30, EyeOpenLeft: 1, EyeOpenRight: 1, MouthSmile: 1, MouthOpen: 1, FacePositionX: 10, FacePositionY: 10 };
    const params = Object.entries(sum).map(([id, v]) => ({ id, value: Math.max(-lim[id], Math.min(lim[id], v)) }));
    this.request('InjectParameterDataRequest', { faceFound: false, mode: 'add', parameterValues: params }, 1000).catch(() => {});
    if (!this.anims.length) { clearInterval(this.loop); this.loop = null; }
  }

  // Model movement effects run one at a time and always return the model to where it was.
  move(kind, power = 1, dir = 1) {
    if (!this.ready) return Promise.resolve();
    this.moveChain = this.moveChain.then(() => this._move(kind, power, dir)).catch(e => this.log('vts', `ขยับโมเดลไม่ได้: ${e.message}`, 'warn'));
    return this.moveChain;
  }

  async _move(kind, p, dir = 1) {
    const m = await this.request('CurrentModelRequest');
    const home = m.modelPosition;
    const to = (o, time) => this.request('MoveModelRequest', { timeInSeconds: time, valuesAreRelativeToModel: false, ...o });
    const at = (dx = 0, dy = 0, rot = 0, size = 0) => ({
      positionX: home.positionX + dx, positionY: home.positionY + dy, rotation: home.rotation + rot, size: Math.max(-100, Math.min(100, home.size + size)),
    });
    try {
      if (kind === 'jump') {
        await to(at(0, 0.18 * p), 0.15); await sleep(160);
        await to(at(0, -0.02 * p), 0.18); await sleep(190);
      } else if (kind === 'shake') {
        for (let i = 0; i < 6; i++) { await to(at((i % 2 ? -1 : 1) * 0.035 * p * (1 - i / 7)), 0.04); await sleep(50); }
      } else if (kind === 'spin') {
        const dir = home.rotation > 0 ? -1 : 1; // stay inside VTS's -360..360 range
        for (const r of [120, 240, 360]) { await to(at(0, 0, dir * r), 0.2); await sleep(210); }
        await to(at(), 0); // 360° looks identical to 0°, snap back instantly
        return;
      } else if (kind === 'zoom') {
        await to(at(0, 0, 0, 12 * p), 0.2); await sleep(900);
      } else if (kind === 'squash') {
        await to(at(0, -0.05 * p, 0, -6 * p), 0.08); await sleep(110);
        await to(at(0, 0.03 * p, 0, 3 * p), 0.1); await sleep(110);
      } else if (kind === 'knock') {
        await to(at(-dir * 0.22 * p, 0.04 * p, -dir * 22 * p), 0.12); await sleep(450);
        await to(at(-dir * 0.04 * p, 0, -dir * 4 * p), 0.35); await sleep(360);
      } else if (kind === 'bounce') {
        for (let i = 0; i < 4; i++) { await to(at(0, 0.05 * p), 0.12); await sleep(130); await to(at(), 0.12); await sleep(150); }
      } else if (kind === 'wobble') {
        for (let i = 0; i < 4; i++) { await to(at(0, 0, (i % 2 ? -1 : 1) * 12 * p * (1 - i / 5)), 0.1); await sleep(110); }
      }
    } finally {
      await to(at(), 0.15).catch(() => {});
      await sleep(160);
    }
  }
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16) || 0xffffff;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
