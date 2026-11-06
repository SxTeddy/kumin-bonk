// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// 🎛️ Soundboard, 🖼️ on-screen widgets (flower garden, fireworks, countdown timer, leaderboards, goal bar)
// and 📝 live subtitles: settings, state and the logic that reacts to live events.

const hex = (v, d) => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : d;
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));
const str = (v, n, d = '') => String(v ?? d).slice(0, n);
const ID = /^[a-z0-9]{1,24}$/;
export const PIC = /^(gift:g\d{3}|[a-z]{2,16}|https?:\/\/\S{1,1000})$/;

// ---------- settings ----------
export const BOARD_DEFAULT = {
  volume: 0.9, stopOthers: false,
  pads: [ // ready-made pads with the app's own sounds; viewers' favourite reactions
    { id: 'p1', name: 'ปรบมือ', emoji: '👏', color: '#ff7aa8', src: 'b:clap' },
    { id: 'p2', name: 'ตุ้มตึ้ง', emoji: '🥁', color: '#ffb547', src: 'b:drum' },
    { id: 'p3', name: 'แฟนแฟร์', emoji: '🎺', color: '#7c5cff', src: 'b:fanfare' },
    { id: 'p4', name: 'โป๊ก', emoji: '🔨', color: '#5ce1e6', src: 'b:bonk' },
    { id: 'p5', name: 'จุ๊บ', emoji: '💋', color: '#ff4f8b', src: 'b:kiss' },
    { id: 'p6', name: 'วิ้ง', emoji: '✨', color: '#7cf29c', src: 'b:magic' },
    { id: 'p7', name: 'คำราม', emoji: '🦁', color: '#e0a82e', src: 'b:roar' },
    { id: 'p8', name: 'เงินเข้า', emoji: '💰', color: '#3ecf8e', src: 'b:cash' },
  ],
  giftSongs: [], // [{ id, gift: Thai or English gift name, pad: pad id, min: how many in one send, on }]
};
export const WIDGETS_DEFAULT = {
  garden: { on: true, minCoins: 0, max: 60, ground: '#7cc96b', title: 'สวนดอกไม้ของขวัญ' },
  fireworks: { on: true, minCoins: 1, bigAt: 1000, sound: true, volume: 0.5 },
  timer: { on: true, startMin: 60, perCoin: 10, perFollow: 30, perShare: 15, per100Likes: 5, maxHours: 24, title: 'ไลฟ์ต่ออีก', color: '#ff7aa8' },
  board: { on: true, show: 'gifts', rows: 5, title: '' }, // show: gifts | likes | both
  goal: { on: true, kind: 'coins', target: 1000, title: 'เป้าหมายวันนี้', color: '#ff7aa8' }, // kind: coins | gifts | likes | follows | shares
  resetOnLive: true, // a new live clears the leaderboards and the goal
};
export const SUBS_DEFAULT = { lang: 'th-TH', tr: ['en'], size: 34, color: '#ffffff', bg: '#000000', bgAlpha: 0.5, lines: 2, seconds: 6 };
export const SUB_LANGS = ['en', 'th', 'ja', 'zh-CN', 'ko', 'vi', 'id', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'hi', 'ms', 'tl', 'lo', 'my', 'km'];

function cleanPad(p) {
  if (!p || typeof p !== 'object' || !ID.test(String(p.id))) return null;
  const src = String(p.src || '');
  if (!/^(b:[a-z]{2,16}|m:[a-z0-9]{1,24})$/.test(src)) return null;
  return {
    id: String(p.id), name: str(p.name, 30, 'ปุ่ม'), emoji: str(p.emoji, 8, '🎵'), color: hex(p.color, '#ff7aa8'), src,
    vol: num(p.vol, 0, 1.5, 1), start: num(p.start, 0, 3600, 0), end: num(p.end, 0, 3600, 0), loop: !!p.loop,
  };
}
export function sanitizeBoard(b) {
  const s = b && typeof b === 'object' ? b : {};
  const pads = (Array.isArray(s.pads) ? s.pads : BOARD_DEFAULT.pads).map(cleanPad).filter(Boolean).slice(0, 48);
  const ids = new Set(pads.map(p => p.id));
  return {
    volume: num(s.volume, 0, 1, BOARD_DEFAULT.volume), stopOthers: !!s.stopOthers, pads,
    giftSongs: (Array.isArray(s.giftSongs) ? s.giftSongs : []).filter(g => g && ID.test(String(g.id)) && ids.has(String(g.pad)) && String(g.gift || '').trim())
      .slice(0, 60).map(g => ({ id: String(g.id), gift: str(g.gift, 60).trim(), pad: String(g.pad), min: int(g.min, 1, 10000, 1), on: g.on !== false })),
  };
}
export function sanitizeWidgets(w) {
  const s = w && typeof w === 'object' ? w : {}, D = WIDGETS_DEFAULT;
  const g = s.garden || {}, f = s.fireworks || {}, t = s.timer || {}, b = s.board || {}, o = s.goal || {};
  return {
    garden: { on: g.on !== false, minCoins: int(g.minCoins, 0, 100000, 0), max: int(g.max, 10, 200, D.garden.max), ground: hex(g.ground, D.garden.ground), title: str(g.title ?? D.garden.title, 30) },
    fireworks: { on: f.on !== false, minCoins: int(f.minCoins, 0, 100000, 1), bigAt: int(f.bigAt, 1, 1000000, D.fireworks.bigAt), sound: f.sound !== false, volume: num(f.volume, 0, 1, 0.5) },
    timer: { on: t.on !== false, startMin: int(t.startMin, 0, 6000, 60), perCoin: num(t.perCoin, 0, 600, 10), perFollow: int(t.perFollow, 0, 3600, 30), perShare: int(t.perShare, 0, 3600, 15),
      per100Likes: int(t.per100Likes, 0, 3600, 5), maxHours: int(t.maxHours, 1, 240, 24), title: str(t.title ?? D.timer.title, 30), color: hex(t.color, D.timer.color) },
    board: { on: b.on !== false, show: ['gifts', 'likes', 'both'].includes(b.show) ? b.show : 'gifts', rows: int(b.rows, 3, 10, 5), title: str(b.title, 30) },
    goal: { on: o.on !== false, kind: ['coins', 'gifts', 'likes', 'follows', 'shares'].includes(o.kind) ? o.kind : 'coins', target: int(o.target, 1, 1e9, 1000), title: str(o.title ?? D.goal.title, 40), color: hex(o.color, D.goal.color) },
    resetOnLive: s.resetOnLive !== false,
  };
}
export function sanitizeSubs(x) {
  const s = x && typeof x === 'object' ? x : {};
  return {
    lang: /^[a-z]{2,3}(-[A-Z]{2})?$/.test(String(s.lang || '')) ? String(s.lang) : SUBS_DEFAULT.lang,
    tr: (Array.isArray(s.tr) ? s.tr : SUBS_DEFAULT.tr).filter(l => SUB_LANGS.includes(l)).slice(0, 4),
    size: int(s.size, 16, 90, 34), color: hex(s.color, '#ffffff'), bg: hex(s.bg, '#000000'), bgAlpha: num(s.bgAlpha, 0, 1, 0.5),
    lines: int(s.lines, 1, 4, 2), seconds: int(s.seconds, 2, 30, 6),
  };
}

// ---------- widget state ----------
// send(m) reaches every widget page; save() stores the state; getCfg() gives the current widgets settings
export class Widgets {
  constructor(state, send, save, getCfg) {
    const st = state && typeof state === 'object' ? state : {};
    this.send = send; this.save = save; this.cfg = getCfg;
    this.givers = new Map((Array.isArray(st.givers) ? st.givers : []).slice(0, 300).map(g => [str(g.name, 60), { name: str(g.name, 60), coins: Number(g.coins) || 0, avatar: PIC.test(String(g.avatar || '')) ? g.avatar : '' }]));
    this.likers = new Map((Array.isArray(st.likers) ? st.likers : []).slice(0, 300).map(g => [str(g.name, 60), { name: str(g.name, 60), likes: Number(g.likes) || 0, avatar: PIC.test(String(g.avatar || '')) ? g.avatar : '' }]));
    this.totals = { coins: 0, gifts: 0, likes: 0, follows: 0, shares: 0, ...(st.totals || {}) };
    this.flowers = (Array.isArray(st.flowers) ? st.flowers : []).filter(f => f && PIC.test(String(f.p))).slice(-200);
    const t = st.timer || {};
    this.timer = { running: !!t.running, left: Math.max(0, Number(t.left) || 0), at: Date.now() }; // left: seconds remaining when last updated
    this.likeAcc = 0;
  }
  state() {
    this.tickTimer();
    return { givers: this.top('gifts', 300), likers: this.top('likes', 300), totals: this.totals, flowers: this.flowers, timer: { running: this.timer.running, left: this.timer.left } };
  }
  top(kind, n) {
    const list = kind === 'likes' ? [...this.likers.values()].sort((a, b) => b.likes - a.likes) : [...this.givers.values()].sort((a, b) => b.coins - a.coins);
    return list.slice(0, n);
  }
  view() { // what a widget page needs
    const c = this.cfg(); this.tickTimer();
    return { t: 'wState', cfg: c, givers: this.top('gifts', 10), likers: this.top('likes', 10), totals: this.totals, flowers: this.flowers, timer: { running: this.timer.running, left: Math.round(this.timer.left) } };
  }
  push() { this.send(this.view()); this.save(); }

  // ⏱️ countdown timer
  tickTimer(now = Date.now()) {
    const t = this.timer;
    if (t.running) { t.left = Math.max(0, t.left - (now - t.at) / 1000); if (t.left <= 0) t.running = false; }
    t.at = now;
  }
  addTime(sec, why = '') {
    const c = this.cfg().timer; if (!c.on || !(sec > 0)) return 0;
    this.tickTimer();
    const before = this.timer.left;
    this.timer.left = Math.min(c.maxHours * 3600, this.timer.left + sec);
    const added = this.timer.left - before;
    if (added > 0) this.send({ t: 'wTimerAdd', sec: Math.round(added), why: str(why, 60) });
    return added;
  }
  timerCmd(cmd, sec) {
    const c = this.cfg().timer; this.tickTimer();
    if (cmd === 'start') { if (this.timer.left <= 0) this.timer.left = c.startMin * 60; this.timer.running = true; }
    else if (cmd === 'pause') this.timer.running = false;
    else if (cmd === 'reset') { this.timer.running = false; this.timer.left = c.startMin * 60; }
    else if (cmd === 'add') this.timer.left = Math.max(0, Math.min(c.maxHours * 3600, this.timer.left + (Number(sec) || 0)));
    this.timer.at = Date.now(); this.push();
  }

  // live events. pic: the gift's picture for the garden / fireworks
  event(ev, pic) {
    const c = this.cfg(), u = ev.user || {}, name = str(u.nickname || u.username || '', 60), avatar = PIC.test(String(u.avatar || '')) ? u.avatar : '';
    if (ev.type === 'gift') {
      const n = Math.max(1, Number(ev.count) || 1), each = Number(ev.gift?.diamonds) || 0, coins = n * each;
      this.totals.gifts += n; this.totals.coins += coins;
      if (name) { const g = this.givers.get(name) || { name, coins: 0, avatar: '' }; g.coins += coins; if (avatar) g.avatar = avatar; this.givers.set(name, g); }
      if (this.givers.size > 500) this.givers = new Map(this.top('gifts', 300).map(g => [g.name, g]));
      if (c.timer.on && c.timer.perCoin > 0 && coins > 0) this.addTime(coins * c.timer.perCoin, `${name} +${coins} 🪙`);
      if (pic && PIC.test(String(pic))) {
        if (c.garden.on && each >= c.garden.minCoins) {
          const k = Math.min(5, n); // a combo plants a few, not hundreds
          for (let i = 0; i < k; i++) this.flowers.push({ p: String(pic), s: each >= 1000 ? 3 : each >= 100 ? 2 : 1, x: Math.round(Math.random() * 1000) / 1000 });
          if (this.flowers.length > c.garden.max) this.flowers = this.flowers.slice(-c.garden.max);
          this.send({ t: 'wFlower', flowers: this.flowers.slice(-k), name });
        }
        if (c.fireworks.on && each >= c.fireworks.minCoins) this.send({ t: 'wFirework', p: String(pic), n: Math.min(8, n), big: coins >= c.fireworks.bigAt, name });
      }
    } else if (ev.type === 'like') {
      const n = Math.max(1, Number(ev.count) || 1); this.totals.likes += n;
      if (name) { const g = this.likers.get(name) || { name, likes: 0, avatar: '' }; g.likes += n; if (avatar) g.avatar = avatar; this.likers.set(name, g); }
      if (this.likers.size > 500) this.likers = new Map(this.top('likes', 300).map(g => [g.name, g]));
      if (c.timer.on && c.timer.per100Likes > 0) { this.likeAcc += n; const k = Math.floor(this.likeAcc / 100); if (k) { this.likeAcc -= k * 100; this.addTime(k * c.timer.per100Likes, `❤️ ×${k * 100}`); } }
    } else if (ev.type === 'follow') { this.totals.follows++; if (c.timer.on) this.addTime(c.timer.perFollow, `${name} ⭐`); }
    else if (ev.type === 'share') { this.totals.shares++; if (c.timer.on) this.addTime(c.timer.perShare, `${name} 🔁`); }
    else return;
    this.dirty = true;
  }
  flush() { if (this.dirty) { this.dirty = false; this.push(); } }
  reset(what = 'all') {
    if (what === 'all' || what === 'board') { this.givers.clear(); this.likers.clear(); }
    if (what === 'all' || what === 'goal') this.totals = { coins: 0, gifts: 0, likes: 0, follows: 0, shares: 0 };
    if (what === 'garden') this.flowers = [];
    this.push();
  }
}

// ---------- 🎵 gift → song ----------
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
export function giftSongsFor(board, ev) {
  if (ev.type !== 'gift') return [];
  const names = [ev.gift?.th, ev.gift?.name].filter(Boolean).map(norm);
  return board.giftSongs.filter(g => g.on && names.includes(norm(g.gift)) && (Number(ev.count) || 1) >= g.min).map(g => board.pads.find(p => p.id === g.pad)).filter(Boolean);
}

// ---------- 🌐 translation for subtitles (Google's free web endpoint; no key, may change) ----------
export async function translate(text, to, from = 'auto', fetchFn = globalThis.fetch) {
  const q = String(text || '').slice(0, 500);
  if (!q.trim()) return '';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetchFn(url, { signal: ctrl.signal });
    if (!r.ok) return '';
    const j = await r.json();
    return Array.isArray(j?.[0]) ? j[0].map(x => x?.[0] || '').join('').slice(0, 600) : '';
  } catch { return ''; } finally { clearTimeout(tm); }
}
