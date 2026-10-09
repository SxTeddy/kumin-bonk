// Rules engine: matches live events to rules and runs their actions.
import { sizeFor } from './effects.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lc = s => String(s ?? '').trim().toLowerCase();

export class Engine {
  constructor({ getConfig, getHead, vts, images, gifts, effects, overlay, dashboard, log }) {
    Object.assign(this, { getConfig, getHead, vts, images, gifts, effects, overlay, dashboard, log });
    this.lastFired = new Map();
    this.likeBucket = new Map(); // ruleId -> likes accumulated
    this.stats = { gifts: 0, diamonds: 0, likes: 0, follows: 0, shares: 0, triggers: 0 };
  }

  handle(ev) {
    const cfg = this.getConfig();
    if (ev.type === 'gift') { this.stats.gifts += ev.count; this.stats.diamonds += ev.count * (ev.gift.diamonds || 0); }
    if (ev.type === 'like') this.stats.likes += ev.count;
    if (ev.type === 'follow') this.stats.follows++;
    if (ev.type === 'share') this.stats.shares++;

    const rules = cfg.rules.filter(r => r.enabled && r.trigger?.type === ev.type);
    const hits = [];
    for (const r of rules.filter(r => !r.trigger.fallback)) {
      const times = this.match(r, ev);
      if (times > 0) hits.push([r, times]);
    }
    if (ev.type === 'gift' && !hits.some(([r]) => isSpecificGift(r))) {
      for (const r of rules.filter(r => r.trigger.fallback)) {
        const times = this.match(r, ev);
        if (times > 0) hits.push([r, times]);
      }
    }
    for (const [rule, times] of hits) this.fire(rule, ev, times);
    return hits.map(([r]) => r.name);
  }

  // How many times the rule should fire for this event (0 = no match).
  match(rule, ev) {
    const t = rule.trigger;
    switch (t.type) {
      case 'gift': {
        const coins = Number(ev.gift.diamonds) || 0;
        if (coins < (Number(t.minDiamonds) || 0)) return 0;
        if (Number(t.maxDiamonds) > 0 && coins > Number(t.maxDiamonds)) return 0;
        const list = String(t.gifts || '*').split(',').map(x => x.trim()).filter(Boolean);
        return list.some(e => this.gifts.matches(e, ev.gift)) ? 1 : 0;
      }
      case 'like': {
        const every = Math.max(1, Number(t.every) || 1);
        const acc = (this.likeBucket.get(rule.id) || 0) + ev.count;
        const times = Math.floor(acc / every);
        this.likeBucket.set(rule.id, acc % every);
        return Math.min(times, 10);
      }
      case 'chat': {
        const m = lc(t.match);
        const text = lc(ev.text);
        if (!m) return 1;
        return (t.mode === 'contains' ? text.includes(m) : (text === m || text.startsWith(m + ' ') || text.startsWith(m))) ? 1 : 0;
      }
      default: return 1; // follow / share / join
    }
  }

  async fire(rule, ev, times = 1) {
    const now = Date.now();
    const cd = (Number(rule.cooldown) || 0) * 1000;
    if (cd && now - (this.lastFired.get(rule.id) || 0) < cd) return;
    this.lastFired.set(rule.id, now);
    this.stats.triggers++;
    this.dashboard({ t: 'fired', rule: rule.name, user: ev.user?.nickname });
    const ctx = makeCtx(ev, times);
    if (ev.type === 'gift') ctx.entry = this.gifts.find(ev.gift);
    for (const a of rule.actions || []) {
      try { await this.run(a, ctx); }
      catch (e) { this.log('rule', `"${rule.name}" → ${a.type}: ${e.message}`, 'warn'); }
    }
  }

  // Effect sounds play from the overlay when throwing there, otherwise from the KuminBonk page (desktop audio).
  sound(name) {
    if (!name || name === 'none') return;
    const cfg = this.getConfig();
    if (!cfg.throwing.sound) return;
    if ((cfg.throwing.target === 'overlay') && this.overlay.count() > 0) this.overlay.send({ t: 'sound', sound: name });
    else this.dashboard({ t: 'sound', sound: name, volume: cfg.throwing.volume });
  }

  async run(a, ctx) {
    const cfg = this.getConfig();
    const vts = this.vts;
    switch (a.type) {
      case 'throw': {
        const base = a.amount === 'count' ? ctx.count : Math.max(1, Number(a.amount) || 1);
        const n = Math.min(Math.max(1, Math.round(base * (Number(a.multiply) || 1))), Math.max(1, Number(a.max) || 30));
        const src = a.image === 'gift' ? (ctx.entry ? `gift:${ctx.entry.img}` : ctx.giftImage || this.images.guess(ctx.gift)) : a.image === 'avatar' ? (ctx.avatar || 'heart') : (a.image || 'rose');
        const strength = (Number(a.strength) || 1) * (cfg.throwing.flinchStrength ?? 1);
        const flinch = a.flinch !== false;
        const sound = a.sound || 'bonk';
        const target = cfg.throwing.target || 'vts';
        if (target === 'overlay' && this.overlay.count() > 0) {
          this.overlay.send({ t: 'throw', src, count: n, from: a.from || 'random', flinch, strength, sound, size: a.size, round: a.image === 'avatar' && !!ctx.avatar });
          return;
        }
        if (this.vts.ready && this.vts.canCustomImages) {
          const fallback = a.image === 'gift' ? this.images.guess(ctx.gift) : 'heart';
          const img = await this.images.get(src, fallback);
          const px = (Number(a.size) || cfg.throwing.size || 90) * (a.image === 'gift' ? sizeFor(Number(ctx.diamonds) || 1) : 1);
          for (let i = 0; i < n; i++) {
            this.vts.throwItem({
              img, head: this.getHead(), from: a.from || 'random', size: Math.max(0.05, Math.min(0.6, px / 500)),
              speed: cfg.throwing.speed, spin: cfg.throwing.spin, flinch, strength, eyes: cfg.throwing.eyesClose,
              onHit: () => this.sound(sound),
            });
            await sleep(cfg.throwing.stagger || 90);
          }
          return;
        }
        // VTS not ready for pictures: still make the model react.
        if (flinch) for (let i = 0; i < Math.min(n, 10); i++) { this.vts.flinch(Math.random() * 2 - 1, strength, cfg.throwing.eyesClose); this.sound(sound); await sleep((cfg.throwing.stagger || 90) + 120); }
        return;
      }
      case 'giftfx': {
        const e = ctx.entry;
        const fx = cfg.fx || {};
        const own = (e && fx.gifts?.[e.th]) || {};                       // per-gift override
        let style = a.style && a.style !== 'auto' ? a.style : (own.style || e?.style || (ctx.gift ? 'bonk' : 'love'));
        const cat = catSettings(fx, style);                               // per-category settings
        if (!cat.enabled) return;
        if (cat.as && cat.as !== 'same') style = cat.as;
        const img = a.image && a.image !== 'gift' ? a.image : e ? `gift:${e.img}` : (ctx.giftImage || this.images.guess(ctx.gift || ''));
        const coins = Number(ctx.diamonds) || e?.coins || 1;
        const power = Math.min(2.5, 0.8 + Math.log10(coins + 1) * 0.35) * (Number(a.power) || 1) * cat.power;
        const count = Math.max(1, Math.min(ctx.count, cat.max));
        if (cfg.throwing.target === 'overlay' && this.overlay.count() > 0) {
          return this.run({ type: 'throw', image: 'gift', amount: count, max: cat.max, flinch: true, sound: 'bonk' }, ctx);
        }
        if (!vts.ready || !vts.canCustomImages) {
          for (let i = 0; i < Math.min(count, 5); i++) { vts.flinch(Math.random() * 2 - 1, power * 0.7, cfg.throwing.eyesClose); await sleep(200); }
          return;
        }
        this.effects.play(style, {
          img, count, power, coins, label: e?.th || ctx.gift || '',
          size: cat.size * (Number(own.size) || 1), speed: cat.speed, sound: cat.sound,
          showcaseMin: fx.showcaseMin ?? 1000,
        });
        return;
      }
      case 'flinch':
        for (let i = 0; i < Math.min(ctx.count, 10); i++) { vts.flinch(Math.random() * 2 - 1, Number(a.strength) || 1, cfg.throwing.eyesClose); await sleep(150); }
        return;
      case 'hotkey': if (a.hotkeyId) await vts.triggerHotkey(a.hotkeyId); return;
      case 'expression': if (a.file) await vts.expression(a.file, Number(a.seconds) || 3); return;
      case 'move': await vts.move(a.kind || 'jump', Number(a.power) || 1); return;
      case 'tint': await vts.tint(a.color || '#ff7aa8', Number(a.seconds) || 2); return;
      case 'item': {
        const h = this.getHead();
        if (a.file) await vts.item({ file: a.file, x: h.x, y: h.y - 0.12, size: Number(a.size) || 0.3, seconds: Number(a.seconds) || 5 });
        return;
      }
      case 'alert': this.overlay.send({ t: 'alert', text: fill(a.text, ctx), avatar: ctx.avatar, image: ctx.giftImage, seconds: Number(a.seconds) || 4 }); return;
      case 'sound': this.sound(a.sound || 'ding'); return;
      case 'tts': this.dashboard({ t: 'tts', text: fill(a.text || '{text}', ctx) }); return;
      case 'wait': await sleep(Math.min(Number(a.ms) || 500, 30000)); return;
    }
  }
}

export const CAT_DEFAULT = { enabled: true, size: 1, power: 1, speed: 1, max: 30, sound: 'auto', as: 'same' };
export function catSettings(fx, style) { return { ...CAT_DEFAULT, ...(fx?.cats?.[style] || {}) }; }

function isSpecificGift(r) {
  return r.trigger.type === 'gift' && !String(r.trigger.gifts || '*').split(',').map(lc).includes('*');
}

function makeCtx(ev, times) {
  const ctx = {
    name: ev.user?.nickname || 'ผู้ชม', username: ev.user?.username || '', avatar: ev.user?.avatar,
    gift: '', count: times, text: '', giftImage: undefined,
  };
  if (ev.type === 'gift') Object.assign(ctx, { gift: ev.gift.th || ev.gift.name, count: ev.count * times, giftImage: ev.gift.image, diamonds: ev.gift.diamonds });
  if (ev.type === 'chat') {
    ctx.text = String(ev.text || '');
    const parts = ctx.text.split(/\s+/);
    if (parts[0]?.startsWith('!')) ctx.text = parts.slice(1).join(' ');
  }
  return ctx;
}

export function fill(tpl, ctx) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (ctx[k] ?? '').toString()).slice(0, 300);
}
