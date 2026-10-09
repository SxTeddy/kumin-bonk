// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// Gift effects played inside VTube Studio: each style is a small choreography of
// item sprites (the gift picture + particles) and reactions of the model itself.
import { ANCHOR } from './gifts.js';
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
  }

  // head point moved by the aim offset of the gift/category being played
  getHead(aim = this.aim) {
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

  play(style, { img = 'heart', count = 1, power = 1, label = '', coins = 1, size = 1, speed = 1, sound = 'auto', showcaseMin = 1000, aim = null, lock = null } = {}) {
    if (!this.vts.ready) return;
    const show = showcaseMin > 0 && coins >= showcaseMin;
    if (style === 'bonk' && !show) return this.bonk(img, count, power, sizeFor(coins) * size, speed, sound, aim);
    const same = this.queue.find(q => q.style === style && q.img === img && JSON.stringify(q.aim) === JSON.stringify(aim));
    if (same) { same.count += count; return; }
    if (this.queue.length >= 8) return this.vts.flinch(side(), 0.8, true); // too busy: just react
    this.queue.push({ style, img, count, power, label, coins, size, speed, sound, show, aim, lock });
    if (!this.running) this._drain();
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
        if (job.show) await this.showcase(pic, job.coins);
        const power = clamp(job.power, 0.6, 2.5);
        const run = fn === this.bonk ? this.bonk(pic, job.count, power, this.cur.scale, job.speed, job.sound, job.aim) : fn.call(this, pic, job.count, power, job);
        await Promise.race([run, sleep(HEAVY_TIMEOUT)]);
        this.cur = null; SPEED = 1; this.soundMode = 'auto'; this.aim = null; this.lock = null;
      } catch (e) { this.cur = null; SPEED = 1; this.soundMode = 'auto'; this.aim = null; this.log('fx', `เอฟเฟกต์ ${job.style} ผิดพลาด: ${e.message}`, 'warn'); }
    }
    this.running = false;
  }

  // ---------- helpers ----------
  get eyes() { return this.getConfig().throwing.eyesClose; }
  async pic(name) { return this.images.get(name, 'heart'); }
  async spawn(img, o) {
    if (this.cur && img === this.cur.img) o = { ...o, size: clamp((o.size ?? 0.2) * this.cur.scale, 0.03, 0.75) };
    try { return await this.vts.sprite(img, o); } catch { return null; }
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
    await sleep(ms);
    if (pinned) await this.vts.unpin(id);
    return pinned;
  }
  // scale a target size for the current gift picture (used by moves that resize it)
  gs(size) { return this.cur ? clamp(size * this.cur.scale, 0.02, 0.75) : size; }

  // Expensive gifts (1,000+ coins) are shown off big first, with a sparkle ring.
  async showcase(img, coins) {
    const h = this.getHead();
    const big = clamp(0.3 * sizeFor(coins), 0.3, 0.6);
    const at = { x: h.x, y: clamp(h.y - 0.05, 0.25, 0.6) };
    const id = await this.vts.sprite(img, { x: at.x, y: at.y, size: 0.04, order: 29 }).catch(() => null);
    this.sound('fanfare'); this.lookUp(1.6, 0.6);
    await this.to(id, { size: big, rot: 0 }, 0.45, 'overshoot'); await sleep(450);
    const n = coins >= 10000 ? 12 : 8;
    this.particles('sparkle', n, () => ({ x: at.x, y: at.y }), i => ({ x: at.x + Math.cos(i / n * 6.28) * big * 0.7, y: at.y + Math.sin(i / n * 6.28) * big * 1.25, size: 0.04 }), 0.9, { gap: 20 });
    if (coins >= 10000) { this.vts.tint('#fff1b8', 1.2).catch(() => {}); this.particles('coin', 10, () => ({ x: rnd(0.15, 0.85), y: -0.1 }), (i, a) => ({ x: a.x, y: 1.15, size: 0.05 }), 1.6, { gap: 60, fade: 'easeIn' }); }
    await this.to(id, { size: big * 1.08 }, 0.4, 'easeBoth'); await sleep(420);
    await this.to(id, { size: big }, 0.4, 'easeBoth'); await sleep(420);
    await this.to(id, { size: 0.02, rot: 180 }, 0.35, 'easeIn'); await sleep(360);
    if (id) await this.vts.spriteKill(id);
  }
  to(id, o, t, fade) { return this.vts.spriteTo(id, o, t / SPEED, fade); }
  kill(id) { return this.vts.spriteKill(id); }
  happy(sec = 1.5, k = 1) { this.vts.animate(sec, (t, u) => ({ MouthSmile: 1 * k * (1 - u * 0.3), EyeOpenLeft: -0.45 * k, EyeOpenRight: -0.45 * k, FaceAngleZ: 8 * k * Math.sin(t * 6) })); }
  shy(sec = 2.5) { const d = side(); this.vts.animate(sec, (t, u) => { const e = Math.min(1, t * 4) * (u > 0.85 ? (1 - u) / 0.15 : 1); return { FaceAngleX: 16 * d * e, FaceAngleY: -9 * e, FaceAngleZ: -8 * d * e, EyeOpenLeft: -0.55 * e, EyeOpenRight: -0.55 * e, MouthSmile: 1 * e }; }); }
  scared(sec = 1.6, d = side()) { this.vts.animate(sec, (t, u) => { const e = u > 0.8 ? (1 - u) / 0.2 : 1; return { EyeOpenLeft: 0.7 * e, EyeOpenRight: 0.7 * e, MouthOpen: 0.9 * e, FaceAngleY: 12 * e, FaceAngleX: -d * 14 * e, FaceAngleZ: 3 * Math.sin(t * 60) * e }; }); }
  shiver(sec = 2, k = 1) { this.vts.animate(sec, (t, u) => ({ FaceAngleZ: 4 * k * Math.sin(t * 70), FaceAngleX: 2 * k * Math.sin(t * 53), EyeOpenLeft: -0.3, EyeOpenRight: -0.3 })); }
  lookUp(sec = 1.5, k = 1) { this.vts.animate(sec, (t, u) => ({ FaceAngleY: 18 * k * Math.sin(Math.PI * u), EyeOpenLeft: 0.3 * Math.sin(Math.PI * u), EyeOpenRight: 0.3 * Math.sin(Math.PI * u) })); }
  follow(sec, fromLeft, k = 1) { this.vts.animate(sec, (t, u) => { const e = Math.sin(Math.PI * Math.min(1, u * 1.1)); return { FaceAngleX: (fromLeft ? 1 : -1) * (-26 + 52 * u) * e * k, FaceAngleY: 12 * e }; }); }
  groove(sec, beat = 0.48, k = 1) { this.vts.animate(sec, t => { const ph = (t / beat) * Math.PI; const e = Math.min(1, t * 2, (sec - t) * 2); return { FaceAngleZ: 11 * k * Math.sin(ph) * e, FaceAngleY: 7 * k * Math.abs(Math.sin(ph)) * e, FacePositionY: 1.5 * k * Math.abs(Math.sin(ph)) * e, MouthSmile: 0.7 * e, EyeOpenLeft: -0.3 * e, EyeOpenRight: -0.3 * e }; }); }

  // particle burst: n sprites of `name`, each from(i) -> to(i) over t seconds
  async particles(name, n, from, to, t = 1.2, opts = {}) {
    const img = await this.pic(name);
    const jobs = [];
    for (let i = 0; i < n; i++) {
      jobs.push((async () => {
        await sleep(i * (opts.gap ?? 70));
        const a = from(i);
        const id = await this.spawn(img, { x: a.x, y: a.y, size: a.size ?? rnd(0.05, 0.08), rot: rnd(0, 360) });
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
    const n = clamp(count, 1, 30);
    for (let i = 0; i < n; i++) {
      this.vts.throwItem({ img: pic, head: this.getHead(aim), from: 'random', size: clamp((cfg.size || 90) / 500 * scale, 0.05, 0.6), speed: (cfg.speed || 1) * speed, spin: cfg.spin, flinch: true, strength: 0.6 + power * 0.4, eyes: this.eyes, onHit: () => hit && this._sound(hit) });
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

  async eat(img, count, power) {
    const h = this.getHead(); const d = side();
    const mouth = { x: h.x, y: h.y + 0.07 };
    const id = await this.spawn(img, { x: d < 0 ? -0.1 : 1.1, y: h.y + 0.25, size: 0.17, rot: 0 });
    await this.to(id, { x: mouth.x, y: mouth.y, rot: d * 25 }, 0.55, 'easeOut'); await sleep(560);
    for (const s of [0.13, 0.09, 0.05]) {
      this.vts.animate(0.25, (t, u) => ({ MouthOpen: Math.sin(Math.PI * u) }));
      this.sound('munch');
      await this.to(id, { size: this.gs(s) }, 0.12, 'easeIn'); await sleep(300);
    }
    await this.kill(id);
    this.happy(1.8, 1); this.vts.move('jump', 0.7);
    this.particles('heart', 3, () => ({ x: mouth.x, y: mouth.y }), () => ({ x: mouth.x + rnd(-0.08, 0.08), y: mouth.y - 0.2, size: 0.02 }), 1);
  }

  async drive(img, count, power) {
    const h = this.getHead(); const d = side(); // d = side it comes from
    const y = h.y + 0.3;
    const id = await this.spawn(img, { x: d < 0 ? -0.25 : 1.25, y, size: 0.28 + 0.04 * power, rot: 0 });
    if (d > 0) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    this.sound('whoosh');
    await this.to(id, { x: h.x + d * 0.04 }, 0.55, 'easeIn'); await sleep(550);
    this.sound('crash'); this.vts.flinch(d, 2, this.eyes); this.vts.move('knock', 0.8 + power * 0.3, d);
    this.particles('smoke', 4, () => ({ x: h.x + d * 0.04, y }), () => ({ x: h.x + d * 0.04 + rnd(-0.1, 0.1), y: y - rnd(0.05, 0.15), size: 0.12 }), 0.8);
    await this.to(id, { x: d < 0 ? 1.3 : -0.3, rot: rnd(-10, 10) }, 0.6, 'easeIn'); await sleep(620);
    await this.kill(id);
    this.scared(1.2, d);
  }

  async flyby(img, count, power, job) {
    const h = this.getHead(); const fromLeft = Math.random() < 0.5;
    const y = clamp(h.y - 0.2, 0.08, 0.5);
    const id = await this.spawn(img, { x: fromLeft ? -0.2 : 1.2, y: y + 0.05, size: 0.26 + 0.04 * power, rot: 0 });
    if (!fromLeft) await this.vts.spriteTo(id, {}, 0, 'linear', true);
    this.sound('whoosh'); this.follow(2.6, fromLeft);
    await this.to(id, { x: fromLeft ? 1.25 : -0.25, y: y - 0.05, rot: fromLeft ? -6 : 6 }, 2.4, 'easeBoth');
    for (let i = 0; i < 4; i++) {
      await sleep(450);
      const px = fromLeft ? -0.2 + (i + 1) * 0.29 : 1.2 - (i + 1) * 0.29;
      this.particles('sparkle', 1, () => ({ x: px, y }), () => ({ x: px, y: y + 0.25, size: 0.02 }), 1);
    }
    await sleep(700);
    await this.kill(id);
    this.happy(1, 0.7);
  }

  async rocket(img, count, power) {
    const h = this.getHead(); const d = side();
    const x = h.x + d * 0.22;
    const id = await this.spawn(img, { x, y: 1.2, size: 0.3, rot: 0 });
    this.sound('rumble'); this.vts.move('shake', 1.2);
    this.particles('smoke', 6, () => ({ x, y: 1.05 }), () => ({ x: x + rnd(-0.12, 0.12), y: rnd(0.75, 0.95), size: 0.16 }), 1.2, { gap: 120 });
    this.lookUp(2, 1.2);
    await this.to(id, { y: -0.45 }, 1.6, 'easeIn'); await sleep(1600);
    await this.kill(id);
    this.particles('sparkle', 8, () => ({ x, y: 0.02 }), i => ({ x: x + rnd(-0.25, 0.25), y: rnd(0.1, 0.4), size: 0.03 }), 1.2, { gap: 40 });
    this.sound('fanfare'); this.happy(1.6);
  }

  async meteor(img, count, power) {
    const n = clamp(count, 1, 6);
    for (let k = 0; k < n; k++) {
      const h = this.getHead(); const d = side();
      const id = await this.spawn(img, { x: d > 0 ? 1.15 : -0.15, y: -0.2, size: 0.2 + 0.04 * power, rot: d > 0 ? 200 : 160 });
      this.sound('whoosh');
      await this.to(id, { x: h.x, y: h.y - 0.05 }, 0.45, 'easeIn'); await sleep(450);
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
}
