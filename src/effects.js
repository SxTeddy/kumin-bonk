// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// Gift effects played inside VTube Studio: each style is a small choreography of
// item sprites (the gift picture + particles) and reactions of the model itself.
import { ANCHOR } from './gifts.js';
export const MAX_ITEMS = 300; // safety ceiling for one gift (keeps the PC and VTube Studio smooth)
let SPEED = 1; // per-category speed while a job runs
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));
const rnd = (a, b) => a + Math.random() * (b - a);
const side = () => (Math.random() < 0.5 ? -1 : 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const HEAVY_TIMEOUT = 18000;

// Pricier gifts show bigger: 1 coin ≈ 0.75×, 100 ≈ 1.2×, 1,000 ≈ 1.4×, 10,000+ ≈ 1.65–1.75×
export const sizeFor = coins => clamp(0.75 + 0.22 * Math.log10(Math.max(1, coins)), 0.75, 1.75);

export class Effects {
  constructor({ vts, images, getHead, getLock = () => null, sound, log, getConfig }) {
    Object.assign(this, { vts, images, log, getConfig, getLock });
    this.baseHead = getHead;
    this.aim = null; // per-category / per-gift target offset {dx, dy} while a job runs
    this._sound = sound;
    this.soundMode = 'auto';
    this.queue = [];
    this.running = false;
    this.base = new Map(); // sprite id -> where we last placed it (before following the model)
    this.frozen = null;    // head point when the current effect started
  }

  // Inside an effect, positions are planned around the head as it was when the effect started (frozen).
  // to()/spawn() then shift every move by how far the model has moved since (delta), so everything follows the model.
  getHead(aim = this.aim) { return this.frozen && aim === this.aim ? this.frozen : this.liveHead(aim); }
  delta() {
    if (!this.frozen) return { x: 0, y: 0 };
    const n = this.liveHead();
    return { x: n.x - this.frozen.x, y: n.y - this.frozen.y };
  }
  // head point right now, moved by the aim offset of the gift/category being played
  liveHead(aim = this.aim) {
    // locked to the model: use the live tracked point (the style's own offset is taken back out, so it lands exactly there)
    const lk = this.lock && this.getLock(this.lock);
    if (lk?.live) { const a = ANCHOR[this.style] || { dx: 0, dy: 0 }; return { x: clamp(lk.live.x - a.dx, 0, 1), y: clamp(lk.live.y - a.dy, 0, 1) }; }
    const h = this.baseHead();
    if (!aim || (!aim.dx && !aim.dy)) return h;
    return { x: clamp(h.x + (Number(aim.dx) || 0), 0, 1), y: clamp(h.y + (Number(aim.dy) || 0), 0, 1) };
  }

  // style: one of STYLES; img: picture source ('gift:g001', 'rose', URL); count: how many were sent; power: 0.8..2.4
  sound(name) {
    if (this.soundMode === 'none') return;
    this._sound(this.soundMode && this.soundMode !== 'auto' ? this.soundMode : name);
  }

  // Returns a promise that settles when this gift's effect has finished (used to give big gifts the stage alone).
  // tier 0–3 = how grand (by price) · banner = picture of "thank you <name>" · scene = special scene key · spot = play before anything waiting
  play(style, { img = 'heart', count = 1, power = 1, label = '', coins = 1, size = 1, speed = 1, sound = 'auto', showcaseMin = 1000, aim = null, lock = null, tier = null, banner = null, scene = null, spot = false } = {}) {
    if (!this.vts.ready) return Promise.resolve();
    if (tier == null) tier = showcaseMin > 0 && coins >= showcaseMin ? 1 : 0;
    const show = tier >= 1;
    if (style === 'bonk' && !show && !scene && !banner) return this.bonk(img, count, power, sizeFor(coins) * size, speed, sound, aim);
    const same = !spot && this.queue.find(q => !q.spot && q.style === style && q.img === img && JSON.stringify(q.aim) === JSON.stringify(aim));
    if (same) { same.count += count; return same.done; }
    if (this.queue.length >= 8 && !spot) { this.vts.flinch(side(), 0.8, true); return Promise.resolve(); } // too busy: just react
    let resolve; const done = new Promise(r => { resolve = r; });
    const job = { style, img, count, power, label, coins, size, speed, sound, show, tier, banner, scene, spot, aim, lock, done, resolve };
    if (spot) this.queue.unshift(job); else this.queue.push(job); // big gifts go first
    if (!this.running) this._drain();
    return done;
  }

  async _drain() {
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      const fn = this[job.style] || this.bonk;
      try {
        const pic = await this.images.get(job.img, 'heart');
        this.cur = { img: pic, scale: sizeFor(job.coins) * (job.size || 1) }; // the gift picture is drawn at this scale
        SPEED = Math.max(0.3, job.speed || 1); this.soundMode = job.sound || 'auto'; this.aim = job.aim || null; this.lock = job.lock || null; this.style = job.style;
        this.frozen = null; this.frozen = this.liveHead();
        const banner = job.banner ? await this.showBanner(job.banner, job.tier) : null;
        if (job.show) await this.showcase(pic, job.coins, job.tier);
        const crown = job.tier >= 3 ? await this.crownOn() : null;
        const power = clamp(job.power, 0.6, 2.5);
        const run = job.scene && this['scene_' + job.scene] ? this['scene_' + job.scene](pic, job.count, power, job)
          : fn === this.bonk ? this.bonk(pic, job.count, power, this.cur.scale, job.speed, job.sound, job.aim) : fn.call(this, pic, job.count, power, job);
        await Promise.race([run, sleep(job.scene ? 16000 : HEAVY_TIMEOUT)]);
        if (job.tier >= 2) await this.finale(job.tier);
        if (crown) await crown.off();
        if (banner) await this.hideBanner(banner);
        this.cur = null; SPEED = 1; this.soundMode = 'auto'; this.aim = null; this.lock = null; this.frozen = null;
        job.resolve?.();
      } catch (e) { job.resolve?.(); this.cur = null; SPEED = 1; this.soundMode = 'auto'; this.aim = null; this.frozen = null; this.log('fx', `เอฟเฟกต์ ${job.style} ผิดพลาด: ${e.message}`, 'warn'); }
    }
    this.running = false;
  }

  // ---------- helpers ----------
  get eyes() { return this.getConfig().throwing.eyesClose; }
  async pic(name) { return this.images.get(name, 'heart'); }
  async spawn(img, o) {
    if (this.cur && img === this.cur.img) o = { ...o, size: clamp((o.size ?? 0.2) * this.cur.scale, 0.03, 0.75) };
    const d = this.delta();
    try {
      const id = await this.vts.sprite(img, { ...o, x: o.x + d.x, y: o.y + d.y });
      if (id) { this.base.set(id, { x: o.x, y: o.y }); if (this.base.size > 400) this.base.delete(this.base.keys().next().value); }
      return id;
    } catch { return null; }
  }
  // While a sprite rests on the character, pin it to the model so it moves with the head (when a lock point exists).
  pinCoords() {
    const own = this.lock && this.getLock(this.lock);
    if (own?.coords) return own.coords;
    const a = ANCHOR[this.style];
    if (!a || (!a.dx && !a.dy)) return this.getLock('head')?.coords || null;
    return null;
  }
  async rest(id, ms) {
    const c = this.pinCoords();
    const pinned = c ? await this.vts.pin(id, c) : false;
    if (pinned) { await sleep(ms); await this.vts.unpin(id); return true; }
    await this.stick([id], ms);
    return false;
  }
  // keep resting sprites on the model while it moves (no pin): re-place them every 0.15 s
  async stick(ids, ms) {
    const end = Date.now() + ms / SPEED; let last = this.delta();
    while (Date.now() < end) {
      await new Promise(r => setTimeout(r, Math.min(150, Math.max(0, end - Date.now()))));
      const d = this.delta();
      if (Math.abs(d.x - last.x) + Math.abs(d.y - last.y) < 0.003) continue;
      last = d;
      for (const id of ids) { const b = this.base.get(id); if (b?.x != null) this.vts.spriteTo(id, { x: b.x + d.x, y: b.y + d.y }, 0.14, 'linear'); }
    }
  }
  // scale a target size for the current gift picture (used by moves that resize it)
  gs(size) { return this.cur ? clamp(size * this.cur.scale, 0.02, 0.75) : size; }

  // ---------- 👑 expensive gifts ----------
  // Tier 1 (1,000+): shown off big with a sparkle ring · Tier 2 (5,000+): + fireworks, gold light, coin rain
  // Tier 3 (20,000+): + rainbow light, shaking, diamonds and stars from the sky, a crown on the head, big finale
  async showcase(img, coins, tier = 1) {
    const h = this.getHead();
    const big = clamp(0.3 * sizeFor(coins) * (tier >= 3 ? 1.15 : 1), 0.3, 0.65);
    const at = { x: h.x, y: clamp(h.y - 0.05, 0.25, 0.6) };
    const id = await this.spawn(img, { x: at.x, y: at.y, size: 0.04, order: 29 });
    this.sound('fanfare'); this.lookUp(1.6, 0.6);
    if (tier >= 3) { this.vts.move('shake', 1.4); this.rainbow(2.4); }
    else if (tier >= 2) this.vts.tint('#ffe9a8', 1.6).catch(() => {});
    await this.to(id, { size: big, rot: tier >= 2 ? 360 : 0 }, tier >= 2 ? 0.7 : 0.45, 'overshoot'); await sleep(tier >= 2 ? 700 : 450);
    const n = tier >= 3 ? 14 : tier >= 2 ? 11 : 8;
    this.particles('sparkle', n, () => ({ x: at.x, y: at.y }), i => ({ x: at.x + Math.cos(i / n * 6.28) * big * 0.7, y: at.y + Math.sin(i / n * 6.28) * big * 1.25, size: 0.04 }), 0.9, { gap: 20 });
    if (tier >= 2) this.fireworks(tier >= 3 ? 4 : 2, at);
    if (tier >= 2) this.rain(tier >= 3 ? ['coin', 'diamond', 'star'] : ['coin'], tier >= 3 ? 16 : 10, 1.8);
    await this.to(id, { size: big * 1.08 }, 0.4, 'easeBoth'); await sleep(420);
    await this.to(id, { size: big }, 0.4, 'easeBoth'); await sleep(420);
    if (tier >= 2) { this.happy(1.4, 1); this.vts.move('jump', 0.8); }
    await this.to(id, { size: 0.02, rot: 180 }, 0.35, 'easeIn'); await sleep(360);
    if (id) await this.kill(id);
  }
  // fireworks around a point (or random high up)
  fireworks(n = 3, near = null) {
    return (async () => {
      for (let k = 0; k < n; k++) {
        const fx = clamp((near ? near.x : 0.5) + rnd(-0.32, 0.32), 0.08, 0.92), fy = clamp((near ? near.y - 0.2 : 0.2) + rnd(-0.12, 0.08), 0.06, 0.5);
        this.particles('firework', 1, () => ({ x: fx, y: fy, size: 0.02 }), () => ({ x: fx, y: fy, size: rnd(0.18, 0.26) }), 0.55, { fade: 'easeOut' });
        this.particles(Math.random() < 0.5 ? 'sparkle' : 'confetti', 6, () => ({ x: fx, y: fy }), i => ({ x: fx + Math.cos(i * 1.05) * 0.12, y: fy + Math.sin(i * 1.05) * 0.2 + 0.12, size: 0.02 }), 1.1, { gap: 0 });
        this.sound('pop');
        await sleep(280);
      }
    })();
  }
  // things falling from the sky
  rain(names, n = 10, t = 1.8) {
    return this.particles(names[0], n, i => ({ x: rnd(0.05, 0.95), y: -0.08, size: 0.05 }), (i, a) => ({ x: a.x + rnd(-0.08, 0.08), y: 1.12, size: 0.05 }), t, { gap: 90, fade: 'easeIn', pick: names });
  }
  // rainbow light on the character
  rainbow(sec = 2.4) {
    return (async () => {
      const cols = ['#ffb3b3', '#ffd9a0', '#fff3a0', '#c2f5b0', '#b3e3ff', '#c9c2ff', '#f0c2ff'];
      const step = sec / cols.length;
      for (const c of cols) { this.vts.tint(c, step + 0.05).catch(() => {}); await sleep(step * 1000); }
      this.vts.tint('#ffffff', 0.05).catch(() => {});
    })();
  }
  // big ending for tier 2–3 gifts
  async finale(tier) {
    const h = this.getHead();
    this.sound('fanfare');
    if (tier >= 3) { this.vts.move('spin', 1); this.rainbow(2.2); }
    this.particles('confetti', tier >= 3 ? 14 : 9, () => ({ x: h.x, y: h.y - 0.1 }), i => ({ x: h.x + rnd(-0.4, 0.4), y: h.y + rnd(-0.35, 0.3), size: 0.05 }), 1.3, { gap: 25 });
    await this.fireworks(tier >= 3 ? 5 : 3, h);
    this.happy(1.6, 1);
    await sleep(600);
  }
  // 👑 a crown sits on the head (follows the model) for the whole tier-3 show
  async crownOn() {
    const h = this.getHead();
    const id = await this.spawn(await this.pic('crown'), { x: h.x, y: -0.15, size: 0.16, order: 28 });
    if (!id) return null;
    await this.to(id, { y: h.y - 0.16 }, 0.5, 'overshoot'); await sleep(500);
    this.sound('ding');
    let on = true; const pc = this.getLock('head')?.coords;
    const pinned = pc ? await this.vts.pin(id, pc) : false;
    const keep = pinned ? null : (async () => { while (on) await this.stick([id], 600); })();
    return { off: async () => { on = false; await keep; if (pinned) await this.vts.unpin(id); await this.to(id, { y: -0.3 }, 0.5, 'easeIn'); await sleep(520); await this.kill(id); } };
  }
  // "thank you <name>" picture drawn by the app window, shown at the top of the screen
  async showBanner(img, tier = 1) {
    const id = await this.vts.sprite(img, { x: 0.5, y: 0.1, size: 0.05, order: 30 }).catch(() => null);
    if (!id) return null;
    this.vts.spriteTo(id, { size: tier >= 3 ? 0.62 : 0.52 }, 0.45, 'overshoot');
    return id;
  }
  async hideBanner(id) {
    await this.vts.spriteTo(id, { y: -0.2 }, 0.45, 'easeIn'); await sleep(470);
    await this.vts.spriteKill(id);
  }

  // move a sprite; abs = the position is already where the model is now (don't shift it again)
  to(id, o, t, fade, abs = false) {
    if (!id) return Promise.resolve();
    const b = this.base.get(id) || {};
    if (o.x != null) b.x = o.x; if (o.y != null) b.y = o.y;
    this.base.set(id, b);
    let out = o;
    if (!abs && this.frozen && b.x != null && b.y != null) {
      const d = this.delta();
      if (Math.abs(d.x) + Math.abs(d.y) > 0.002) out = { ...o, x: b.x + d.x, y: b.y + d.y };
    }
    return this.vts.spriteTo(id, out, t / SPEED, fade);
  }
  kill(id) { this.base.delete(id); return this.vts.spriteKill(id); }
  happy(sec = 1.5, k = 1) { this.vts.animate(sec, (t, u) => ({ MouthSmile: 1 * k * (1 - u * 0.3), EyeOpenLeft: -0.45 * k, EyeOpenRight: -0.45 * k, FaceAngleZ: 8 * k * Math.sin(t * 6) })); }
  shy(sec = 2.5) { const d = side(); this.vts.animate(sec, (t, u) => { const e = Math.min(1, t * 4) * (u > 0.85 ? (1 - u) / 0.15 : 1); return { FaceAngleX: 16 * d * e, FaceAngleY: -9 * e, FaceAngleZ: -8 * d * e, EyeOpenLeft: -0.55 * e, EyeOpenRight: -0.55 * e, MouthSmile: 1 * e }; }); }
  scared(sec = 1.6, d = side()) { this.vts.animate(sec, (t, u) => { const e = u > 0.8 ? (1 - u) / 0.2 : 1; return { EyeOpenLeft: 0.7 * e, EyeOpenRight: 0.7 * e, MouthOpen: 0.9 * e, FaceAngleY: 12 * e, FaceAngleX: -d * 14 * e, FaceAngleZ: 3 * Math.sin(t * 60) * e }; }); }
  shiver(sec = 2, k = 1) { this.vts.animate(sec, (t, u) => ({ FaceAngleZ: 4 * k * Math.sin(t * 70), FaceAngleX: 2 * k * Math.sin(t * 53), EyeOpenLeft: -0.3, EyeOpenRight: -0.3 })); }
  lookUp(sec = 1.5, k = 1) { this.vts.animate(sec, (t, u) => ({ FaceAngleY: 18 * k * Math.sin(Math.PI * u), EyeOpenLeft: 0.3 * Math.sin(Math.PI * u), EyeOpenRight: 0.3 * Math.sin(Math.PI * u) })); }
  follow(sec, fromLeft, k = 1) { this.vts.animate(sec, (t, u) => { const e = Math.sin(Math.PI * Math.min(1, u * 1.1)); return { FaceAngleX: (fromLeft ? 1 : -1) * (-26 + 52 * u) * e * k, FaceAngleY: 12 * e }; }); }
  groove(sec, beat = 0.48, k = 1) { this.vts.animate(sec, t => { const ph = (t / beat) * Math.PI; const e = Math.min(1, t * 2, (sec - t) * 2); return { FaceAngleZ: 11 * k * Math.sin(ph) * e, FaceAngleY: 7 * k * Math.abs(Math.sin(ph)) * e, FacePositionY: 1.5 * k * Math.abs(Math.sin(ph)) * e, MouthSmile: 0.7 * e, EyeOpenLeft: -0.3 * e, EyeOpenRight: -0.3 * e }; }); }

  // particle burst: n sprites of `name`, each from(i) -> to(i) over t seconds
  async particles(name, n, from, to, t = 1.2, opts = {}) {
    const pics = opts.pick ? await Promise.all(opts.pick.map(p => this.pic(p))) : null;
    const img = pics ? null : await this.pic(name);
    const jobs = [];
    for (let i = 0; i < n; i++) {
      jobs.push((async () => {
        await sleep(i * (opts.gap ?? 70));
        const a = from(i);
        const id = await this.spawn(pics ? pics[i % pics.length] : img, { x: a.x, y: a.y, size: a.size ?? rnd(0.05, 0.08), rot: rnd(0, 360) });
        if (!id) return;
        const b = to(i, a);
        await this.to(id, { ...b, rot: b.rot ?? rnd(-400, 400) }, t, opts.fade || 'easeOut');
        await sleep(t * 1000 + 30);
        await this.kill(id);
      })());
    }
    await Promise.all(jobs);
  }
  ring(h, n, r = 0.14) { return i => ({ x: h.x + Math.cos((i / n) * Math.PI * 2) * r * 0.56, y: h.y + Math.sin((i / n) * Math.PI * 2) * r }); }

  // ---------- styles ----------
  async bonk(img, count, power, scale = this.cur?.scale || 1, speed = 1, sound = this.soundMode, aim = this.aim) {
    const cfg = this.getConfig().throwing;
    const hit = sound === 'none' ? null : (sound && sound !== 'auto' ? sound : 'bonk');
    const pic = typeof img === 'string' ? await this.images.get(img, 'rose') : img;
    const n = clamp(count, 1, MAX_ITEMS); // how many come is set per category (สูงสุดต่อครั้ง); VTS gets at most 18 in the air at once
    for (let i = 0; i < n; i++) {
      this.vts.throwItem({ img: pic, head: () => this.liveHead(aim), from: 'random', size: clamp((cfg.size || 90) / 500 * scale, 0.05, 0.6), speed: (cfg.speed || 1) * speed, spin: cfg.spin, flinch: true, strength: 0.6 + power * 0.4, eyes: this.eyes, onHit: () => hit && this._sound(hit) });
      await sleep(cfg.stagger || 90);
    }
  }

  async wear(img, count, power) {
    const h = this.getHead();
    const id = await this.spawn(img, { x: h.x, y: -0.15, size: 0.2 + 0.03 * power, rot: rnd(-20, 20) });
    await this.to(id, { x: h.x, y: h.y - 0.14, rot: 0 }, 0.45, 'easeIn'); await sleep(450);
    this.sound('boing'); this.vts.flinch(0, 0.5, false); this.vts.move('squash', 0.6);
    this.happy(4, 0.8);
    if (this.pinCoords()) await this.rest(id, 3600); // locked: stays on the head and follows it
    else for (let i = 0; i < 4; i++) { await this.to(id, { rot: i % 2 ? -7 : 7 }, 0.45, 'easeBoth'); await sleep(900); }
    await this.to(id, { y: -0.3, rot: rnd(-60, 60) }, 0.5, 'easeIn'); await sleep(520);
    await this.kill(id);
  }

  async neck(img, count, power) {
    const h = this.getHead();
    const id = await this.spawn(img, { x: h.x, y: -0.15, size: 0.26, rot: 0 });
    await this.to(id, { x: h.x, y: h.y + 0.15 }, 0.6, 'overshoot'); await sleep(620);
    this.sound('ding'); this.shy(3);
    this.particles('sparkle', 5, this.ring({ x: h.x, y: h.y + 0.15 }, 5, 0.1), (i, a) => ({ x: a.x, y: a.y - 0.08, size: 0.02 }), 0.9);
    await this.rest(id, 3000);
    await this.to(id, { y: 1.3 }, 0.6, 'easeIn'); await sleep(620);
    await this.kill(id);
  }

  // Fly toward a target that may move (the mouth follows the model): re-aim every ~0.1 s on the way.
  async home(id, from, target, T, rot = 0) {
    if (!id) return;
    const steps = Math.max(3, Math.round(T / 0.1)), dt = T / steps;
    for (let i = 1; i <= steps; i++) {
      const p = target(), u = i / steps, e = 1 - (1 - u) * (1 - u); // ease-out
      this.vts.spriteTo(id, { x: from.x + (p.x - from.x) * e, y: from.y + (p.y - from.y) * e, rot: rot * u }, dt, 'linear');
      await sleep(dt * 1000);
    }
  }

  // Move along a curve of points in T seconds. bank: tilt along the flight direction. trail: leave particles behind.
  async glide(id, pts, T, { bank = 0, trail = null, every = 2 } = {}) {
    if (!id || !pts.length) return;
    const dt = T / pts.length;
    let prev = { ...(this.base.get(id) || pts[0]) };
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], dx = p.x - prev.x, dy = p.y - prev.y;
      const o = { x: p.x, y: p.y };
      if (p.size) o.size = p.size;
      if (bank && Math.abs(dx) + Math.abs(dy) > 0.001) o.rot = clamp(Math.atan2(dy, Math.abs(dx)) * 57.3 * (dx < 0 ? -1 : 1) * bank, -28, 28); // clockwise = nose down when flying right
      else if (p.rot != null) o.rot = p.rot;
      this.to(id, o, dt, 'linear');
      if (trail && i % every === 0) {
        const at = { ...prev }, back = { x: -dx * 2.5, y: -dy * 2.5 };
        this.particles(trail.img, 1, () => ({ x: at.x, y: at.y, size: trail.size ?? 0.04 }), () => ({ x: at.x + back.x + rnd(-0.015, 0.015), y: at.y + back.y + (trail.fall ?? 0.06), size: 0.006 }), trail.t ?? 0.7, { fade: 'easeOut' });
      }
      prev = p;
      await sleep(dt * 1000);
    }
  }

  async eat(img, count, power) {
    // where the mouth is right now: follows the model live when "บินเข้าปาก" is locked to it (📌 in the 🎯 tab)
    const mouthNow = () => { const h = this.liveHead(); return { x: h.x, y: clamp(h.y + (ANCHOR.eat?.dy ?? 0.07), 0, 1) }; };
    const live = () => !!(this.lock && this.getLock(this.lock)?.live);
    const d = side();
    const m0 = mouthNow();
    const from = { x: d < 0 ? -0.1 : 1.1, y: clamp(m0.y + 0.18, 0, 1.1) };
    const id = await this.spawn(img, { ...from, size: 0.17, rot: 0 });
    await this.home(id, from, mouthNow, 0.55 / SPEED, d * 25);
    // no live tracking (older VTube Studio) but a lock point: stick it to the mouth while eating
    const pc = !live() && this.pinCoords();
    const pinned = pc && id ? await this.vts.pin(id, pc) : false;
    for (const s of [0.13, 0.09, 0.05]) {
      this.vts.animate(0.25, (t, u) => ({ MouthOpen: Math.sin(Math.PI * u) }));
      this.sound('munch');
      const m = mouthNow();
      await this.to(id, pinned ? { size: this.gs(s) } : { x: m.x, y: m.y, size: this.gs(s) }, 0.12, 'easeIn', true);
      if (!pinned && live()) for (let k = 0; k < 3; k++) { await sleep(100); const p = mouthNow(); this.vts.spriteTo(id, { x: p.x, y: p.y }, 0.09, 'linear'); } // stay on the mouth between bites
      else await sleep(300);
    }
    if (pinned) await this.vts.unpin(id);
    await this.kill(id);
    const mouth = mouthNow();
    this.happy(1.8, 1); this.vts.move('jump', 0.7);
    this.particles('heart', 3, () => ({ x: mouth.x, y: mouth.y }), () => ({ x: mouth.x + rnd(-0.08, 0.08), y: mouth.y - 0.2, size: 0.02 }), 1);
  }

  async drive(img, count, power) {
    const h = this.getHead(); const d = side(); // d = side it comes from
    const y = h.y + 0.3, size = 0.28 + 0.04 * power;
    const id = await this.spawn(img, { x: d < 0 ? -0.25 : 1.25, y, size, rot: 0 });
    if (d > 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    this.sound('whoosh');
    // speeding in: bumpy wheels, dust behind
    const hitX = h.x + d * 0.04;
    const pts = []; for (let i = 1; i <= 8; i++) { const u = i / 8, e = u * u; pts.push({ x: (d < 0 ? -0.25 : 1.25) + (hitX - (d < 0 ? -0.25 : 1.25)) * e, y: y + (i % 2 ? -0.008 : 0.006), rot: d * -3 * (i % 2 ? 1 : -1) }); }
    await this.glide(id, pts, 0.6, { trail: { img: 'smoke', size: 0.07, fall: -0.02, t: 0.6 }, every: 2 });
    this.sound('crash'); this.vts.flinch(d, 2, this.eyes); this.vts.move('knock', 0.8 + power * 0.3, d);
    this.particles('star', 5, () => ({ x: hitX, y: y - 0.05 }), i => ({ x: hitX + Math.cos(i * 1.25) * 0.14, y: y - 0.05 + Math.sin(i * 1.25) * 0.2 - 0.05, size: 0.02 }), 0.6, { gap: 0 });
    this.particles('smoke', 4, () => ({ x: hitX, y }), () => ({ x: hitX + rnd(-0.1, 0.1), y: y - rnd(0.05, 0.15), size: 0.12 }), 0.8);
    // bounce back a little, then race away with a wheelie
    await this.to(id, { x: hitX + d * 0.06, rot: d * 8 }, 0.18, 'easeOut'); await sleep(260);
    await this.glide(id, [0.2, 0.45, 0.75, 1].map(u => ({ x: hitX + d * 0.06 + ((d < 0 ? 1.35 : -0.35) - hitX) * u * u, y: y - 0.01 * Math.sin(u * 3), rot: d * -10 })), 0.6, { trail: { img: 'smoke', size: 0.06, fall: -0.02, t: 0.5 } });
    await this.kill(id);
    this.scared(1.2, d);
  }

  async flyby(img, count, power, job) {
    const h = this.getHead(); const fromLeft = Math.random() < 0.5; const dir = fromLeft ? 1 : -1;
    const pricey = (job?.coins || 0) >= 1000;
    const size0 = this.gs(0.24 + 0.04 * power);
    const x0 = fromLeft ? -0.25 : 1.25, x1 = fromLeft ? 1.25 : -0.25;
    const yTop = clamp(h.y - 0.2, 0.06, 0.5);
    const id = await this.spawn(img, { x: x0, y: yTop + 0.12, size: (0.24 + 0.04 * power) * 0.7, rot: 0 });
    if (!fromLeft) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    this.sound('whoosh'); this.follow(2.9, fromLeft);
    // swoop: comes in high, dips down past the face (bigger = closer), climbs away
    const N = 14, pts = [];
    for (let i = 1; i <= N; i++) {
      const u = i / N, near = Math.sin(Math.PI * u);
      pts.push({ x: x0 + (x1 - x0) * u, y: yTop + 0.1 - 0.08 * u + near * 0.03 + 0.025 * Math.sin(u * Math.PI * 4), size: size0 * (0.7 + 0.45 * near) }); // passes just above the head, not over the face
    }
    const trail = { img: pricey ? 'sparkle' : 'star', size: pricey ? 0.05 : 0.035, fall: 0.07, t: 0.9 };
    await this.glide(id, pts.slice(0, 7), 1.3, { bank: 0.6, trail });
    this.sound('magic');
    this.particles('sparkle', pricey ? 8 : 4, () => ({ x: h.x, y: yTop + 0.1 }), i => ({ x: h.x + rnd(-0.2, 0.2), y: yTop + rnd(0.2, 0.35), size: 0.02 }), 0.9, { gap: 30 });
    if (pricey) { // pricey flyers circle the character once before leaving
      const c = { x: h.x, y: h.y }, Rx = 0.21, Ry = 0.25;
      const loop = []; // once around the head, starting above it; bigger while passing in front
      for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + dir * (k / 12) * Math.PI * 2; loop.push({ x: c.x + Math.cos(a) * Rx, y: c.y + Math.sin(a) * Ry, size: size0 * (0.95 + 0.3 * Math.sin(a)) }); }
      await this.glide(id, loop, 1.6, { bank: 0.4, trail, every: 1 });
      this.happy(1.2, 1);
    }
    await this.glide(id, pts.slice(7), 1.3, { bank: 0.6, trail });
    await this.kill(id);
    this.happy(1, 0.7);
  }

  async rocket(img, count, power) {
    const h = this.getHead(); const d = side();
    const x = h.x + d * 0.22;
    const id = await this.spawn(img, { x, y: 1.2, size: 0.3, rot: 0 });
    this.sound('rumble'); this.vts.move('shake', 1.2);
    this.particles('smoke', 6, () => ({ x, y: 1.05 }), () => ({ x: x + rnd(-0.14, 0.14), y: rnd(0.75, 0.95), size: 0.16 }), 1.2, { gap: 120 });
    this.lookUp(2.2, 1.2);
    // slow lift-off, then faster and faster, flame under it the whole way
    const pts = []; for (let i = 1; i <= 12; i++) { const u = i / 12; pts.push({ x: x + 0.015 * Math.sin(u * 20), y: 1.2 - 1.65 * u * u }); }
    await this.glide(id, pts, 1.7, { trail: { img: 'flame', size: 0.07, fall: 0.12, t: 0.5 }, every: 1 });
    await this.kill(id);
    // fireworks where it left the screen
    this.sound('fanfare'); this.happy(1.6);
    for (let k = 0; k < 3; k++) {
      const fx = x + rnd(-0.25, 0.25), fy = rnd(0.08, 0.3);
      this.particles('firework', 1, () => ({ x: fx, y: fy, size: 0.02 }), () => ({ x: fx, y: fy, size: 0.22 }), 0.5, { fade: 'easeOut' });
      this.particles('sparkle', 6, () => ({ x: fx, y: fy }), i => ({ x: fx + Math.cos(i) * 0.12, y: fy + Math.sin(i) * 0.2 + 0.1, size: 0.02 }), 1, { gap: 0 });
      this.sound('pop');
      await sleep(350);
    }
  }

  async meteor(img, count, power) {
    const n = clamp(count, 1, 6);
    for (let k = 0; k < n; k++) {
      const h = this.getHead(); const d = side();
      const id = await this.spawn(img, { x: d > 0 ? 1.15 : -0.15, y: -0.2, size: 0.2 + 0.04 * power, rot: d > 0 ? 200 : 160 });
      this.sound('whoosh');
      const sx = d > 0 ? 1.15 : -0.15, mp = []; for (let i = 1; i <= 6; i++) { const u = i / 6, e = u * u; mp.push({ x: sx + (h.x - sx) * e, y: -0.2 + (h.y - 0.05 + 0.2) * e }); }
      await this.glide(id, mp, 0.45, { trail: { img: 'flame', size: 0.08, fall: -0.03, t: 0.45 }, every: 1 });
      this.sound('crash'); this.vts.flinch(d, 2, this.eyes); this.vts.move('squash', 1.2);
      if (k === 0) this.vts.tint('#8a8a8a', 1.4).catch(() => {});
      this.particles('smoke', 3, () => ({ x: h.x, y: h.y - 0.05 }), () => ({ x: h.x + rnd(-0.12, 0.12), y: h.y - rnd(0.1, 0.25), size: 0.13 }), 0.9);
      this.particles('star', 4, () => ({ x: h.x, y: h.y - 0.05 }), i => ({ x: h.x + Math.cos(i * 1.6) * 0.15, y: h.y - 0.05 + Math.sin(i * 1.6) * 0.2, size: 0.02 }), 0.6, { gap: 0 });
      await this.to(id, { x: h.x - d * 0.3, y: 1.3, rot: rnd(-400, 400) }, 0.8, 'easeIn');
      await sleep(n > 1 ? 350 : 800);
      this.kill(id);
    }
    this.scared(1.5);
  }

  async zap(img, count, power) {
    const h = this.getHead();
    const id = await this.spawn(img, { x: h.x, y: h.y - 0.3, size: 0.2, rot: 0 });
    await this.to(id, { y: h.y - 0.24 }, 0.3, 'overshoot');
    const bolt = await this.pic('zap');
    for (let i = 0; i < 2; i++) {
      const b = await this.spawn(bolt, { x: h.x + rnd(-0.03, 0.03), y: h.y - 0.12, size: 0.16, rot: rnd(-15, 15), order: 29 });
      this.sound('zap');
      setTimeout(() => this.kill(b), 220);
      await sleep(120);
    }
    this.shiver(1.6, 1.6); this.vts.move('shake', 1.2);
    for (let i = 0; i < 4; i++) { this.vts.tint(i % 2 ? '#ffffff' : '#fff27a', 0.12).catch(() => {}); await sleep(130); }
    this.vts.tint('#ffffff', 0.05).catch(() => {});
    this.particles('smoke', 3, () => ({ x: h.x, y: h.y - 0.1 }), () => ({ x: h.x + rnd(-0.06, 0.06), y: h.y - 0.3, size: 0.1 }), 1.2);
    await sleep(800);
    await this.to(id, { y: -0.3 }, 0.4, 'easeIn'); await sleep(420);
    await this.kill(id);
  }

  async animal(img, count, power) {
    const h = this.getHead(); const d = side();
    const top = { x: h.x, y: h.y - 0.15 };
    const id = await this.spawn(img, { x: d < 0 ? -0.15 : 1.15, y: 0.95, size: 0.2, rot: 0 });
    if (d > 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    await this.to(id, { x: h.x + d * 0.25, y: 0.9 }, 0.5, 'linear'); await sleep(500);
    await this.to(id, { x: top.x, y: top.y }, 0.45, 'overshoot'); await sleep(460);
    this.sound('boing'); this.vts.flinch(0, 0.7, false); this.vts.move('squash', 0.7);
    this.vts.animate(3.6, t => ({ FaceAngleZ: 6 * Math.sin(t * 5), FaceAngleY: -6, MouthSmile: 0.8 }));
    if (this.pinCoords()) { const r = this.rest(id, 3200); for (let i = 0; i < 4; i++) { await sleep(700); this.vts.flinch(0, 0.25, false); } await r; }
    else for (let i = 0; i < 4; i++) {
      await this.to(id, { y: top.y - 0.06 }, 0.18, 'easeOut'); await sleep(190);
      await this.to(id, { y: top.y }, 0.18, 'easeIn'); await sleep(190);
      this.vts.flinch(0, 0.25, false);
      await sleep(420);
    }
    await this.to(id, { x: d < 0 ? 1.2 : -0.2, y: 0.9 }, 0.7, 'easeIn'); await sleep(720);
    await this.kill(id);
  }

  async roar(img, count, power, job) {
    const h = this.getHead(); const d = side();
    const pos = { x: clamp(h.x + d * 0.3, 0.12, 0.88), y: h.y + 0.18 };
    const id = await this.spawn(img, { x: pos.x, y: 1.3, size: 0.4, rot: 0 });
    if (d < 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    await this.to(id, pos, 0.5, 'overshoot'); await sleep(520);
    this.sound('roar'); this.scared(2.4, d); this.vts.move('shake', 1.6);
    await this.to(id, { size: this.gs(0.5) }, 0.25, 'easeOut'); await sleep(250);
    await this.to(id, { size: this.gs(0.42) }, 0.4, 'easeBoth');
    if (/มังกร|ไฟ/.test(job.label)) {
      this.vts.tint('#ffa060', 1.6).catch(() => {});
      await this.particles('flame', 8, () => ({ x: pos.x - d * 0.08, y: pos.y - 0.05 }), () => ({ x: h.x + rnd(-0.05, 0.05), y: h.y + rnd(-0.05, 0.1), size: 0.1 }), 0.6, { gap: 60 });
      this.vts.tint('#555555', 1).catch(() => {});
    } else {
      await this.particles('smoke', 4, () => ({ x: pos.x - d * 0.1, y: pos.y - 0.1 }), () => ({ x: h.x, y: h.y, size: 0.14 }), 0.6, { gap: 60 });
    }
    await sleep(900);
    await this.to(id, { y: 1.3 }, 0.6, 'easeIn'); await sleep(620);
    await this.kill(id);
  }

  async music(img, count, power) {
    const h = this.getHead(); const d = side();
    const pos = { x: clamp(h.x + d * 0.24, 0.1, 0.9), y: h.y + 0.24 };
    const id = await this.spawn(img, { x: pos.x, y: 1.25, size: 0.22, rot: 0 });
    await this.to(id, pos, 0.5, 'overshoot'); await sleep(520);
    const sec = 4 + Math.min(3, power);
    this.groove(sec); this.sound('tune');
    const notes = this.particles('note', Math.round(5 + power * 2), () => ({ x: pos.x + rnd(-0.04, 0.04), y: pos.y - 0.05 }), () => ({ x: pos.x + rnd(-0.15, 0.15), y: pos.y - rnd(0.3, 0.45), size: 0.03 }), 1.6, { gap: 420 });
    const beats = Math.floor(sec / 0.48);
    for (let i = 0; i < beats; i++) {
      this.to(id, { rot: i % 2 ? -12 : 12, size: this.gs(i % 2 ? 0.22 : 0.24) }, 0.2, 'easeBoth');
      if (i % 4 === 3) this.sound('tune');
      await sleep(480);
    }
    await notes;
    await this.to(id, { y: 1.3, rot: 0 }, 0.5, 'easeIn'); await sleep(520);
    await this.kill(id);
  }

  async money(img, count, power, job) {
    const h = this.getHead(); const d = side();
    const gun = { x: clamp(h.x + d * 0.32, 0.08, 0.92), y: h.y + 0.08 };
    const id = await this.spawn(img, { x: d < 0 ? -0.2 : 1.2, y: gun.y, size: 0.22, rot: 0 });
    if (d < 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    await this.to(id, gun, 0.4, 'easeOut'); await sleep(420);
    const ammo = /เพชร|อัญมณี/.test(job.label) ? 'diamond' : /เหรียญ|โชค|หวัง|Airdrop/.test(job.label) ? 'coin' : 'cash';
    const n = Math.round(clamp(6 + power * 4 + count, 6, 24));
    const shots = [];
    for (let i = 0; i < n; i++) {
      this.to(id, { rot: (d < 0 ? 1 : -1) * rnd(4, 10) }, 0.05, 'linear');
      shots.push(this.particles(ammo, 1, () => ({ x: gun.x - d * 0.05, y: gun.y - 0.02, size: 0.06 }), () => ({ x: h.x + rnd(-0.06, 0.06), y: h.y + rnd(-0.05, 0.12), size: 0.06 }), 0.28, { fade: 'linear' }).then(() => {
        this.vts.flinch(-d, 0.35, false); this.sound('cash');
      }));
      await sleep(110);
    }
    await Promise.all(shots);
    this.happy(2, 1); this.vts.move('jump', 0.6);
    this.particles(ammo, 6, () => ({ x: h.x, y: h.y + 0.05 }), () => ({ x: h.x + rnd(-0.2, 0.2), y: 1.2, size: 0.05 }), 1.3, { gap: 30, fade: 'easeIn' });
    await this.to(id, { x: d < 0 ? -0.25 : 1.25 }, 0.4, 'easeIn'); await sleep(420);
    await this.kill(id);
  }

  async party(img, count, power) {
    const h = this.getHead();
    const id = await this.spawn(img, { x: h.x, y: h.y - 0.22, size: 0.05, rot: 0, order: 28 });
    this.sound('fanfare');
    await this.to(id, { size: this.gs(0.32) }, 0.35, 'overshoot'); await sleep(350);
    this.vts.move('jump', 1); this.happy(2.5, 1);
    const n = Math.round(clamp(8 + power * 4, 8, 18));
    const burst = this.particles(Math.random() < 0.5 ? 'confetti' : 'sparkle', n, () => ({ x: h.x, y: h.y - 0.22 }), i => ({ x: h.x + Math.cos(i / n * 6.28) * 0.35, y: h.y - 0.22 + Math.sin(i / n * 6.28) * 0.45 + 0.15, size: 0.05 }), 1.3, { gap: 15 });
    for (const c of ['#ffc2dc', '#fff3a0', '#b8e6ff', '#d6c2ff']) { this.vts.tint(c, 0.4).catch(() => {}); await sleep(320); }
    this.vts.tint('#ffffff', 0.05).catch(() => {});
    await burst;
    await this.to(id, { y: -0.3 }, 0.5, 'easeIn'); await sleep(520);
    await this.kill(id);
  }

  async love(img, count, power) {
    const h = this.getHead();
    this.sound('ding'); this.shy(3); this.vts.tint('#ffcfe0', 3).catch(() => {});
    const n = Math.round(clamp(5 + power * 2 + Math.log2(count + 1) * 2, 5, 16));
    const giftEvery = 3;
    const heart = await this.pic('heart');
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const x = h.x + rnd(-0.22, 0.22);
      jobs.push((async () => {
        await sleep(i * 160);
        const id = await this.spawn(i % giftEvery === 0 ? img : heart, { x, y: 1.1, size: i % giftEvery === 0 ? 0.13 : rnd(0.05, 0.08), rot: rnd(-20, 20) });
        await this.to(id, { x: x + rnd(-0.08, 0.08), y: h.y - rnd(0.1, 0.35), rot: rnd(-25, 25) }, 2.2, 'easeOut');
        await sleep(2250); await this.to(id, { size: 0.01 }, 0.25); await sleep(260); await this.kill(id);
      })());
    }
    await Promise.all(jobs);
  }

  async flower(img, count, power) {
    const h = this.getHead();
    this.sound('ding');
    const petals = this.particles('petal', Math.round(10 + power * 3), () => ({ x: rnd(0.1, 0.9), y: -0.1, size: 0.05 }), (i, a) => ({ x: a.x + rnd(-0.15, 0.15), y: 1.15, size: 0.05 }), 2.6, { gap: 90, fade: 'linear' });
    const id = await this.spawn(img, { x: h.x + side() * 0.4, y: h.y + 0.5, size: 0.18 });
    await this.to(id, { x: h.x + 0.04, y: h.y + 0.26, rot: -15 }, 0.6, 'easeOut'); await sleep(620);
    this.shy(2.6); this.vts.tint('#ffd6e4', 2.6).catch(() => {});
    await sleep(2400);
    await this.to(id, { y: 1.3 }, 0.5, 'easeIn'); await sleep(520);
    await this.kill(id);
    await petals;
  }

  async pat(img, count, power) {
    const h = this.getHead();
    const top = { x: h.x + 0.02, y: h.y - 0.17 };
    const id = await this.spawn(img, { x: top.x, y: -0.2, size: 0.18, rot: 0 });
    await this.to(id, top, 0.4, 'easeOut'); await sleep(420);
    const n = clamp(2 + count, 3, 6);
    for (let i = 0; i < n; i++) {
      await this.to(id, { y: top.y + 0.05 }, 0.12, 'easeIn'); await sleep(120);
      this.sound('pop'); this.vts.flinch(0, 0.3, false);
      await this.to(id, { y: top.y }, 0.15, 'easeOut'); await sleep(200);
    }
    this.happy(1.8, 1);
    await this.to(id, { y: -0.3 }, 0.4, 'easeIn'); await sleep(420);
    await this.kill(id);
  }

  async ball(img, count, power) {
    const h = this.getHead();
    const top = { x: h.x, y: h.y - 0.12 };
    const id = await this.spawn(img, { x: h.x + 0.1, y: -0.15, size: 0.15, rot: 0 });
    let x = top.x;
    await this.to(id, { x, y: top.y, rot: 200 }, 0.45, 'easeIn'); await sleep(450);
    const n = clamp(2 + count, 3, 7);
    for (let i = 0; i < n; i++) {
      this.sound('boing'); this.vts.flinch(side(), 0.6, false);
      x = clamp(top.x + rnd(-0.05, 0.05), 0.05, 0.95);
      await this.to(id, { x, y: top.y - rnd(0.18, 0.3), rot: rnd(-400, 400) }, 0.3, 'easeOut'); await sleep(300);
      await this.to(id, { y: top.y }, 0.3, 'easeIn'); await sleep(300);
    }
    this.sound('bonk'); this.vts.flinch(side(), 1, this.eyes);
    await this.to(id, { x: side() > 0 ? 1.3 : -0.3, y: -0.2, rot: 900 }, 0.6, 'easeOut'); await sleep(620);
    await this.kill(id);
    this.happy(1.2);
  }

  async slap(img, count, power) {
    const h = this.getHead();
    const id = await this.spawn(img, { x: h.x, y: h.y + 0.02, size: 0.05, rot: rnd(-15, 15), order: 29 });
    await this.to(id, { size: this.gs(0.34) }, 0.15, 'overshoot'); await sleep(150);
    this.sound('bonk'); this.vts.flinch(0, 1.3, this.eyes); this.vts.move('squash', 0.8);
    await this.rest(id, 1300);
    await this.to(id, { y: h.y + 0.5, rot: rnd(-30, 30) }, 0.9, 'easeIn'); await sleep(920);
    await this.kill(id);
  }

  async scare(img, count, power) {
    const h = this.getHead();
    const id = await this.spawn(img, { x: h.x + side() * 0.12, y: h.y, size: 0.1, order: 29 });
    await this.to(id, { size: this.gs(0.36) }, 0.12, 'overshoot');
    this.sound('scream'); this.scared(2); this.vts.move('jump', 0.8);
    this.vts.tint('#c9d6ff', 1.8).catch(() => {});
    await sleep(1500);
    await this.to(id, { size: 0.02 }, 0.3, 'easeIn'); await sleep(320);
    await this.kill(id);
  }

  async spider(img, count, power) {
    const h = this.getHead();
    const x = h.x + 0.05;
    const id = await this.spawn(img, { x, y: -0.2, size: 0.18 });
    await this.to(id, { y: h.y - 0.02 }, 1.3, 'easeOut'); await sleep(1300);
    this.sound('scream'); this.scared(2.2); this.vts.move('shake', 1.2);
    for (let i = 0; i < 3; i++) { await this.to(id, { y: h.y + (i % 2 ? -0.04 : 0.04) }, 0.3, 'easeBoth'); await sleep(320); }
    await this.to(id, { y: -0.25 }, 0.8, 'easeIn'); await sleep(820);
    await this.kill(id);
  }

  async ice(img, count, power) {
    const h = this.getHead();
    this.sound('ice');
    const snow = this.particles('snow', 12, () => ({ x: rnd(0.15, 0.85), y: -0.1, size: 0.05 }), (i, a) => ({ x: a.x + rnd(-0.1, 0.1), y: 1.15 }), 2.4, { gap: 110, fade: 'linear' });
    const id = await this.spawn(img, { x: h.x, y: h.y - 0.05, size: 0.05, order: 29 });
    await this.to(id, { size: this.gs(0.3) }, 0.3, 'overshoot');
    this.vts.tint('#a8dcff', 3.5).catch(() => {}); this.shiver(3.5, 1.3);
    await sleep(2200);
    await this.to(id, { size: 0.02, rot: 180 }, 0.4, 'easeIn'); await sleep(420);
    await this.kill(id);
    await snow;
  }

  async fire(img, count, power, job) {
    const h = this.getHead();
    if (/ฟีนิกซ์/.test(job.label)) await this.flyby(img, count, power, job);
    const flames = this.particles('flame', 10, () => ({ x: h.x + rnd(-0.2, 0.2), y: 1.1, size: 0.08 }), (i, a) => ({ x: a.x, y: h.y + rnd(0, 0.3), size: 0.12 }), 1.1, { gap: 90 });
    this.vts.tint('#ffb27a', 1.6).catch(() => {}); this.sound('roar');
    this.scared(1.6); this.vts.move('shake', 1);
    await flames;
    this.vts.tint('#5a5a5a', 1).catch(() => {});
    this.particles('smoke', 4, () => ({ x: h.x, y: h.y }), () => ({ x: h.x + rnd(-0.1, 0.1), y: h.y - 0.3, size: 0.14 }), 1.2);
    await sleep(1000);
  }

  async magic(img, count, power) {
    const h = this.getHead();
    this.sound('magic'); this.vts.tint('#e2ccff', 2.8).catch(() => {}); this.happy(2.8, 0.8);
    const id = await this.spawn(img, { x: h.x, y: h.y - 0.24, size: 0.05, order: 28 });
    await this.to(id, { size: this.gs(0.24) }, 0.5, 'overshoot');
    const n = 8; const sp = await this.pic('sparkle');
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(await this.spawn(sp, { ...this.ring(h, n, 0.18)(i), size: 0.04 }));
    for (let step = 1; step <= 6; step++) {
      ids.forEach((sid, i) => { const a = (i / n + step / 12) * Math.PI * 2; this.to(sid, { x: h.x + Math.cos(a) * 0.18 * 0.56, y: h.y + Math.sin(a) * 0.18, rot: step * 60 }, 0.3, 'linear'); });
      await this.to(id, { y: h.y - 0.24 + (step % 2 ? -0.02 : 0.02) }, 0.3, 'easeBoth');
      await sleep(300);
    }
    ids.forEach(sid => this.to(sid, { size: 0.01 }, 0.3));
    await this.to(id, { size: 0.02 }, 0.35, 'easeIn'); await sleep(360);
    await Promise.all([...ids.map(i => this.kill(i)), this.kill(id)]);
  }

  async punch(img, count, power) {
    const h = this.getHead(); const d = side();
    const id = await this.spawn(img, { x: d < 0 ? -0.2 : 1.2, y: h.y + 0.05, size: 0.26 });
    if (d > 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    await this.to(id, { x: h.x + d * 0.12 }, 0.25, 'easeIn'); await sleep(250);
    this.sound('crash'); this.vts.flinch(d, 2, this.eyes); this.vts.move('knock', 0.8 + power * 0.3, d);
    this.particles('star', 5, () => ({ x: h.x + d * 0.05, y: h.y }), i => ({ x: h.x + d * 0.05 + Math.cos(i * 1.3) * 0.12, y: h.y + Math.sin(i * 1.3) * 0.2, size: 0.02 }), 0.6, { gap: 0 });
    await this.to(id, { x: h.x + d * 0.35 }, 0.4, 'easeOut'); await sleep(700);
    await this.to(id, { x: d < 0 ? -0.3 : 1.3 }, 0.4, 'easeIn'); await sleep(420);
    await this.kill(id);
  }

  async balloon(img, count, power) {
    const h = this.getHead();
    this.lookUp(2.4, 1);
    const jobs = [];
    for (let i = 0; i < 3; i++) {
      jobs.push((async () => {
        await sleep(i * 300);
        const x = h.x + (i - 1) * 0.12;
        const id = await this.spawn(img, { x, y: 1.15, size: 0.16 });
        await this.to(id, { x: x + rnd(-0.05, 0.05), y: -0.2, rot: rnd(-15, 15) }, 2.2, 'easeIn'); await sleep(2220);
        await this.kill(id);
      })());
    }
    await Promise.all(jobs);
    this.sound('pop'); this.happy(1);
  }

  // ---------- 🎬 special scenes for famous expensive gifts ----------
  async scene_ocean(img, count, power) { // whale / stingray / siren
    const h = this.getHead(); const d = side();
    this.vts.tint('#a9dcff', 7).catch(() => {}); this.sound('whoosh');
    const bubbles = this.particles('bubble', 16, () => ({ x: rnd(0.08, 0.92), y: 1.08, size: rnd(0.03, 0.07) }), (i, a) => ({ x: a.x + rnd(-0.06, 0.06), y: rnd(-0.1, 0.3), size: rnd(0.05, 0.09) }), 3, { gap: 160, fade: 'easeOut' });
    const sx = d < 0 ? -0.3 : 1.3, stop = { x: clamp(h.x + d * 0.24, 0.12, 0.88), y: clamp(h.y - 0.2, 0.08, 0.4) }; // beside the head, a bit above
    const id = await this.spawn(img, { x: sx, y: stop.y + 0.12, size: 0.28, rot: 0 });
    if (d > 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    const swim = []; for (let i = 1; i <= 10; i++) { const u = i / 10; swim.push({ x: sx + (stop.x - sx) * (1 - (1 - u) * (1 - u)), y: stop.y + 0.12 * (1 - u) + 0.03 * Math.sin(u * 9) }); }
    this.follow(2.2, d < 0);
    await this.glide(id, swim, 2.1, { bank: 0.35, trail: { img: 'bubble', size: 0.035, fall: -0.08, t: 1 }, every: 2 });
    for (let i = 0; i < 2; i++) { await this.to(id, { y: stop.y - 0.025 }, 0.35, 'easeBoth'); await sleep(360); await this.to(id, { y: stop.y + 0.01 }, 0.35, 'easeBoth'); await sleep(360); }
    // the spout: water shoots up, then rains on the character
    this.sound('whoosh'); this.sound('ding');
    await this.particles('drop', 8, () => ({ x: stop.x, y: stop.y - 0.06, size: 0.03 }), i => ({ x: stop.x + (h.x - stop.x) * 0.5 + (i - 3.5) * 0.035, y: stop.y - rnd(0.2, 0.28), size: 0.05 }), 0.45, { gap: 25, fade: 'easeOut' }); // arcs toward the character
    this.particles('drop', 12, i => ({ x: h.x + rnd(-0.22, 0.22), y: stop.y - 0.2, size: 0.05 }), (i, a) => ({ x: a.x + rnd(-0.04, 0.04), y: h.y + rnd(0.05, 0.35), size: 0.03 }), 0.8, { gap: 45, fade: 'easeIn' });
    await sleep(500);
    this.vts.flinch(0, 1, true); this.shiver(2.2, 1.4); this.vts.tint('#7fc4ff', 1.2).catch(() => {});
    this.particles('drop', 6, () => ({ x: h.x, y: h.y }), i => ({ x: h.x + Math.cos(i * 1.05) * 0.18, y: h.y + Math.sin(i * 1.05) * 0.24, size: 0.025 }), 0.6, { gap: 0 });
    await sleep(900);
    const away = []; for (let i = 1; i <= 8; i++) { const u = i / 8; away.push({ x: stop.x + ((d < 0 ? 1.35 : -0.35) - stop.x) * u * u, y: stop.y - 0.05 * u + 0.03 * Math.sin(u * 8) }); }
    await this.glide(id, away, 1.6, { bank: 0.35, trail: { img: 'bubble', size: 0.03, fall: -0.06, t: 0.9 }, every: 2 });
    await this.kill(id); await bubbles;
    this.vts.tint('#ffffff', 0.4).catch(() => {}); this.happy(1.4, 1);
  }

  async scene_lion(img, count, power) { // lion king
    const h = this.getHead();
    this.sound('rumble'); this.vts.tint('#ffe2a0', 6).catch(() => {});
    const ls = side(); const at = { x: clamp(h.x + ls * 0.3, 0.14, 0.86), y: clamp(h.y + 0.2, 0.3, 0.8) };
    const id = await this.spawn(img, { x: at.x, y: 1.35, size: 0.22, rot: 0 });
    if (ls < 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    await this.to(id, { y: at.y, size: this.gs(0.32) }, 0.9, 'overshoot'); await sleep(900);
    for (let k = 0; k < 2; k++) {
      this.sound('roar'); this.scared(1.6, side()); this.vts.move('shake', 1.6 + k * 0.4);
      await this.to(id, { size: this.gs(0.38) }, 0.2, 'easeOut'); await sleep(220);
      this.particles('smoke', 5, () => ({ x: at.x, y: at.y - 0.12 }), i => ({ x: h.x + rnd(-0.25, 0.25), y: h.y + rnd(-0.2, 0.1), size: 0.15 }), 0.7, { gap: 30 });
      await this.to(id, { size: this.gs(0.32) }, 0.5, 'easeBoth'); await sleep(700);
    }
    this.particles('star', 10, () => ({ x: at.x, y: at.y - 0.1 }), i => ({ x: at.x + Math.cos(i * 0.63) * 0.35, y: at.y - 0.1 + Math.sin(i * 0.63) * 0.5, size: 0.03 }), 1.1, { gap: 0 });
    this.sound('fanfare'); this.happy(1.8, 1);
    await this.to(id, { y: 1.35, size: this.gs(0.26) }, 0.7, 'easeIn'); await sleep(720);
    await this.kill(id);
  }

  async scene_dragon(img, count, power) { // dragon flame
    const h = this.getHead(); const dir = side();
    this.sound('roar'); this.vts.tint('#ffb08a', 7).catch(() => {});
    const c = { x: h.x, y: h.y }, Rx = 0.3, Ry = 0.32;
    const id = await this.spawn(img, { x: dir < 0 ? -0.3 : 1.3, y: c.y - 0.3, size: 0.26 });
    const loop = []; for (let k = 0; k <= 18; k++) { const a = -Math.PI / 2 + dir * (k / 12) * Math.PI * 2; loop.push({ x: c.x + Math.cos(a) * Rx, y: c.y + Math.sin(a) * Ry, size: this.gs(0.24 + 0.08 * Math.sin(a)) }); }
    this.follow(3, dir < 0);
    await this.glide(id, loop, 3.2, { bank: 0.5, trail: { img: 'flame', size: 0.07, fall: 0.03, t: 0.6 }, every: 1 });
    // fire breath onto the character
    const from = this.base.get(id) || { x: c.x, y: c.y - 0.3 };
    this.sound('roar'); this.scared(2, side()); this.vts.move('shake', 1.6);
    await this.particles('flame', 12, () => ({ x: from.x, y: from.y + 0.05, size: 0.05 }), () => ({ x: h.x + rnd(-0.08, 0.08), y: h.y + rnd(-0.05, 0.15), size: 0.14 }), 0.5, { gap: 55 });
    this.vts.tint('#666666', 1.4).catch(() => {});
    this.particles('smoke', 6, () => ({ x: h.x, y: h.y }), () => ({ x: h.x + rnd(-0.15, 0.15), y: h.y - rnd(0.2, 0.4), size: 0.16 }), 1.3, { gap: 60 });
    await this.to(id, { y: -0.4, size: this.gs(0.2) }, 0.8, 'easeIn'); await sleep(820);
    await this.kill(id);
    await sleep(600); this.vts.tint('#ffffff', 0.4).catch(() => {});
  }

  async scene_phoenix(img, count, power) { // rebirth in fire
    const h = this.getHead();
    this.sound('roar'); this.vts.tint('#ffc88a', 6).catch(() => {});
    const flames = this.particles('flame', 12, () => ({ x: h.x + rnd(-0.3, 0.3), y: 1.1, size: 0.08 }), (i, a) => ({ x: a.x, y: rnd(0.4, 0.8), size: 0.13 }), 1.2, { gap: 70 });
    const id = await this.spawn(img, { x: h.x, y: 1.3, size: 0.24 });
    const up = []; for (let i = 1; i <= 10; i++) { const u = i / 10; up.push({ x: h.x + 0.08 * Math.sin(u * 6.3), y: 1.3 - (1.3 - clamp(h.y - 0.3, 0.06, 0.5)) * (1 - (1 - u) * (1 - u)) }); }
    this.lookUp(2.6, 1.3);
    await this.glide(id, up, 1.8, { trail: { img: 'flame', size: 0.08, fall: 0.1, t: 0.6 }, every: 1 });
    for (let k = 0; k < 2; k++) { await this.to(id, { size: this.gs(0.32) }, 0.3, 'easeOut'); await sleep(320); await this.to(id, { size: this.gs(0.25) }, 0.3, 'easeIn'); await sleep(320); this.sound('magic'); }
    this.particles('sparkle', 12, () => ({ x: h.x, y: h.y - 0.25 }), i => ({ x: h.x + Math.cos(i * 0.52) * 0.3, y: h.y - 0.25 + Math.sin(i * 0.52) * 0.42, size: 0.03 }), 1, { gap: 0 });
    this.rain(['sparkle', 'star'], 10, 2); this.vts.tint('#fff1b8', 2).catch(() => {}); this.happy(2, 1);
    await this.to(id, { y: -0.4 }, 0.9, 'easeIn'); await sleep(920);
    await this.kill(id); await flames;
  }

  async scene_roses(img, count, power) { // rose carriage / rose nebula
    const h = this.getHead(); const d = side();
    this.sound('ding'); this.vts.tint('#ffd3e2', 7).catch(() => {}); this.shy(4);
    const petals = this.particles('petal', 18, () => ({ x: rnd(0.05, 0.95), y: -0.08, size: 0.05 }), (i, a) => ({ x: a.x + rnd(-0.15, 0.15), y: 1.12, size: 0.05 }), 3, { gap: 140, fade: 'linear' });
    const n = 8, rose = await this.pic('rose'), ids = [];
    for (let i = 0; i < n; i++) ids.push(await this.spawn(rose, { ...this.ring(h, n, 0.26)(i), size: 0.06 }));
    const y = clamp(h.y + 0.3, 0.5, 0.85), sx = d < 0 ? -0.3 : 1.3;
    const id = await this.spawn(img, { x: sx, y, size: 0.24 });
    if (d > 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    const ride = []; for (let i = 1; i <= 14; i++) { const u = i / 14; ride.push({ x: sx + ((d < 0 ? 1.3 : -0.3) - sx) * u, y: y + (i % 2 ? -0.008 : 0.006) }); }
    const go = this.glide(id, ride, 4, { trail: { img: 'heart', size: 0.035, fall: -0.1, t: 1 }, every: 2 });
    for (let step = 1; step <= 10; step++) {
      ids.forEach((sid, i) => { const a = (i / n + step / 14) * Math.PI * 2; this.to(sid, { x: h.x + Math.cos(a) * 0.26 * 0.56, y: h.y + Math.sin(a) * 0.26, rot: step * 36 }, 0.38, 'linear'); });
      await sleep(400);
    }
    await go; await this.kill(id);
    ids.forEach(sid => this.to(sid, { size: 0.01 }, 0.3)); await sleep(320);
    await Promise.all(ids.map(i => this.kill(i)));
    this.particles('heart', 6, () => ({ x: h.x, y: h.y }), () => ({ x: h.x + rnd(-0.15, 0.15), y: h.y - 0.3, size: 0.03 }), 1.2);
    await petals;
  }

  async scene_space(img, count, power) { // shuttle / universe / stars
    const h = this.getHead(); const d = side();
    this.vts.tint('#9a9ad8', 7).catch(() => {}); this.sound('magic');
    const twinkle = this.particles('star', 14, () => ({ x: rnd(0.05, 0.95), y: rnd(0.04, 0.45), size: 0.005 }), (i, a) => ({ x: a.x, y: a.y, size: rnd(0.025, 0.045) }), 1.4, { gap: 110 });
    const x = clamp(h.x + d * 0.28, 0.12, 0.88);
    const id = await this.spawn(img, { x, y: 1.25, size: 0.24 });
    this.sound('rumble'); this.vts.move('shake', 1.4); this.lookUp(3, 1.4);
    this.particles('smoke', 8, () => ({ x, y: 1.05 }), () => ({ x: x + rnd(-0.2, 0.2), y: rnd(0.7, 0.95), size: 0.18 }), 1.4, { gap: 90 });
    await sleep(500);
    const up = []; for (let i = 1; i <= 14; i++) { const u = i / 14; up.push({ x: x + 0.012 * Math.sin(u * 25) - d * 0.1 * u * u, y: 1.25 - 1.75 * u * u }); }
    await this.glide(id, up, 2.2, { trail: { img: 'flame', size: 0.08, fall: 0.12, t: 0.55 }, every: 1 });
    await this.kill(id);
    this.sound('fanfare'); await this.fireworks(4);
    this.rain(['star', 'sparkle'], 12, 1.8); this.happy(1.8, 1);
    await twinkle;
    this.vts.tint('#ffffff', 0.5).catch(() => {});
  }

  async scene_race(img, count, power) { // sports car / race
    const h = this.getHead();
    this.sound('whoosh');
    const streaks = this.particles('streak', 10, i => ({ x: i % 2 ? -0.15 : 1.15, y: rnd(0.15, 0.9), size: 0.12 }), (i, a) => ({ x: a.x < 0.5 ? 1.2 : -0.2, y: a.y, size: 0.12 }), 0.4, { gap: 90, fade: 'linear' });
    const y = clamp(h.y + 0.32, 0.5, 0.88);
    for (let pass = 0; pass < 2; pass++) {
      const d = pass ? 1 : -1; // first from the left, then back from the right, bigger
      const sx = d < 0 ? -0.35 : 1.35, ex = d < 0 ? 1.35 : -0.35;
      const id = await this.spawn(img, { x: sx, y: y - pass * 0.04, size: 0.22 + pass * 0.06 });
      if (d > 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
      this.sound('whoosh'); this.follow(0.9, d < 0);
      const pts = []; for (let i = 1; i <= 8; i++) { const u = i / 8; pts.push({ x: sx + (ex - sx) * u, y: y - pass * 0.04 + (i % 2 ? -0.006 : 0.006) }); }
      await this.glide(id, pts, 0.7 - pass * 0.1, { trail: { img: 'smoke', size: 0.07, fall: -0.02, t: 0.5 }, every: 1 });
      await this.kill(id);
      this.vts.flinch(d, 0.8, false);
    }
    // finish line: winner!
    this.sound('fanfare'); this.vts.move('jump', 1); this.happy(2, 1);
    this.particles('coin', 12, () => ({ x: h.x, y: h.y + 0.1 }), i => ({ x: h.x + rnd(-0.35, 0.35), y: h.y - rnd(0.05, 0.4), size: 0.05 }), 1, { gap: 30 });
    await this.fireworks(2, h);
    await streaks;
  }

  async scene_meteors(img, count, power) { // meteor shower
    const h = this.getHead();
    this.vts.tint('#b9a8e8', 5).catch(() => {}); this.lookUp(2, 1);
    const shower = (async () => {
      for (let i = 0; i < 9; i++) {
        const sx = rnd(0.2, 1.1), sy = rnd(-0.15, 0.1);
        this.particles('star', 1, () => ({ x: sx, y: sy, size: 0.04 }), () => ({ x: sx - 0.45, y: sy + 0.55, size: 0.02 }), 0.6, { fade: 'easeIn' });
        this.particles('sparkle', 2, () => ({ x: sx, y: sy, size: 0.025 }), () => ({ x: sx - 0.3, y: sy + 0.36, size: 0.005 }), 0.7, { gap: 60, fade: 'easeIn' });
        this.sound('whoosh');
        await sleep(240);
      }
    })();
    await sleep(1400);
    const d = side(); const sx = d > 0 ? 1.2 : -0.2;
    const id = await this.spawn(img, { x: sx, y: -0.25, size: 0.22, rot: d > 0 ? 210 : 150 });
    const fall = []; for (let i = 1; i <= 8; i++) { const u = i / 8, e = u * u; fall.push({ x: sx + (h.x - sx) * e, y: -0.25 + (h.y - 0.05 + 0.25) * e }); }
    await this.glide(id, fall, 0.7, { trail: { img: 'flame', size: 0.09, fall: -0.03, t: 0.5 }, every: 1 });
    this.sound('crash'); this.vts.tint('#ffffff', 0.15).catch(() => {}); this.vts.flinch(d, 2, this.eyes); this.vts.move('shake', 1.8); this.scared(1.8, d);
    this.particles('smoke', 6, () => ({ x: h.x, y: h.y - 0.05 }), () => ({ x: h.x + rnd(-0.2, 0.2), y: h.y - rnd(0.1, 0.35), size: 0.16 }), 1);
    this.particles('star', 8, () => ({ x: h.x, y: h.y - 0.05 }), i => ({ x: h.x + Math.cos(i * 0.8) * 0.2, y: h.y - 0.05 + Math.sin(i * 0.8) * 0.28, size: 0.025 }), 0.7, { gap: 0 });
    await this.to(id, { x: h.x - d * 0.35, y: 1.3, rot: rnd(-400, 400) }, 0.8, 'easeIn'); await sleep(820);
    await this.kill(id); await shower;
    this.vts.tint('#ffffff', 0.5).catch(() => {});
  }

  async scene_jewels(img, count, power) { // flying diamonds / gem magic
    const h = this.getHead();
    this.sound('magic'); this.vts.tint('#dff3ff', 5).catch(() => {}); this.happy(4, 0.9);
    const rain = this.rain(['diamond', 'sparkle', 'coin'], 18, 2);
    const at = { x: h.x, y: clamp(h.y - 0.3, 0.07, 0.5) }; // above the head
    const id = await this.spawn(img, { x: at.x, y: at.y, size: 0.05 });
    await this.to(id, { size: this.gs(0.24) }, 0.5, 'overshoot'); await sleep(500);
    for (let k = 0; k < 4; k++) {
      this.sound('cash');
      await this.to(id, { rot: k % 2 ? -12 : 12, size: this.gs(k % 2 ? 0.24 : 0.28) }, 0.35, 'easeBoth'); await sleep(360);
      this.particles('sparkle', 4, () => ({ x: at.x, y: at.y }), i => ({ x: at.x + rnd(-0.18, 0.18), y: at.y + rnd(-0.15, 0.2), size: 0.02 }), 0.6, { gap: 0 });
    }
    this.particles('diamond', 8, () => ({ x: at.x, y: at.y }), i => ({ x: h.x + rnd(-0.06, 0.06), y: h.y + rnd(0, 0.12), size: 0.04 }), 0.45, { gap: 60 });
    await sleep(700);
    await this.to(id, { size: 0.02, rot: 360 }, 0.4, 'easeIn'); await sleep(420);
    await this.kill(id); await rain;
  }

}

// Famous expensive gifts that get their own scene (Thai gift names → scene)
export const SCENES = {
  ocean: ['ดำน้ำดูปลาวาฬ', 'เพลงขับกล่อมของกระเบน', 'บทเพลงของไซเรน'],
  lion: ['สิงโต', 'Leon และ Lion', 'ลีออนและลิลี่', 'เสือดาวลิลี่', 'ลูกแมวลีออน'],
  dragon: ['เปลวไฟมังกร'],
  phoenix: ['ฟีนิกซ์'],
  roses: ['รถม้าดอกกุหลาบ', 'เนบิวลาดอกกุหลาบ'],
  space: ['กระสวยอวกาศ TikTok', 'สำรวจดวงดาว', 'TikTok Universe', 'TikTok Stars', 'การเดินทางในอนาคต', 'ดาว PK', 'ความฝันของ Adam'],
  race: ['รถสปอร์ต', 'ถนนแข่งรถยามเย็น', 'เข้าเส้นชัยอย่างสวยงาม', 'มอเตอร์ไซค์'],
  meteors: ['ฝนดาวตก', 'ดาวตก'],
  jewels: ['ประกายเพชรโบยบิน', 'มนต์แห่งอัญมณี'],
};
export const SCENE_NAMES = { ocean: '🐋 ทะเล (วาฬ)', lion: '🦁 ราชาสิงโต', dragon: '🐉 มังกรพ่นไฟ', phoenix: '🔥 ฟีนิกซ์', roses: '🌹 กุหลาบ', space: '🚀 อวกาศ', race: '🏎️ แข่งรถ', meteors: '☄️ ฝนดาวตก', jewels: '💎 อัญมณี' };
export const sceneFor = name => Object.keys(SCENES).find(k => SCENES[k].includes(name)) || null;
