// 🫙 Gift jar: a glass jar on the live screen (its own Link source, /jar) that fills up with the pictures
// of the gifts viewers send. The app keeps what's inside, so the jar looks the same after LIVE Studio reloads it.
// Tricks: pricey gifts are bigger and shake the jar, rare ones glow, the sender's name floats up, likes and
// follows drop hearts and stars, a goal bar with a party when the jar is full, "!เขย่า" in chat, top giver.

export const JAR_DEFAULT = {
  enabled: true,
  shape: 'jar',          // see JAR_SHAPES
  glass: '#bfe6ff',      // glass tint
  lid: 'metal',          // metal | cork | cloth | none
  lidColor: '#ff7aa8',
  bow: true, bowColor: '#ff4f8b',
  label: 'โหลของขวัญ', labelColor: '#ffffff', labelBg: '#ff7aa8', showCount: true,
  itemSize: 1,           // 0.6 .. 1.6
  capacity: 120,         // pictures the jar holds before it's full
  perGift: 10,           // most pictures one send adds (a ×99 send doesn't flood the jar)
  minCoins: 0,           // gifts cheaper than this don't go in
  whenFull: 'empty',     // empty: party, pour out and start again · stop: keep it full
  sparkle: true, sound: true, volume: 0.4,
  // tricks
  bigSize: true,         // pricier gifts are bigger pictures
  shakeMin: 1000,        // a send worth this many coins (or more) shakes the jar · 0 = never
  glowMin: 500,          // gifts worth this many coins (or more) glow inside the jar · 0 = never
  names: true,           // "+กุหลาบ ×5 · name" floats up from the jar
  likes: true, likesPer: 30, // every N likes drop a little heart
  follows: true,         // each new follower drops a star
  goal: true, goalText: 'เต็มโหล = ร้องเพลง 1 เพลง', // fill bar under the jar (+ what happens when it's full)
  shakeCmd: true, shakeWord: '!เขย่า', shakeWait: 30, // viewers type this in chat to shake the jar (seconds each viewer waits)
  topGiver: true,        // 👑 who has given the most since the jar was last emptied
  wobble: true,          // the jar rocks a little when things land in it
};
export const JAR_SHAPES = ['jar', 'tall', 'round', 'heart', // glass jars
  'factory', 'gacha', 'chest', 'piggy', 'aquarium', 'cauldron', 'giftbox', 'basket', 'boba', 'bag', // themed containers (public/jar-themes.js)
  'bucket', 'claw', 'trophy', 'mailbox', 'vending', 'hourglass', 'pumpkin', 'snowglobe', 'flowerpot', 'moneybag'];
export const JAR_LIDS = ['metal', 'cork', 'cloth', 'none'];
// containers without a lid: when they're full, gifts spill out over the rim instead of being poured out
export const OPEN_THEMES = ['factory', 'chest', 'aquarium', 'cauldron', 'giftbox', 'basket', 'bag', 'bucket', 'trophy', 'pumpkin', 'flowerpot'];
export function jarOpen(cfg) { return ['jar', 'tall', 'round', 'heart'].includes(cfg.shape) ? cfg.lid === 'none' : OPEN_THEMES.includes(cfg.shape); }

const hex = (v, d) => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : d;
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const int = (v, lo, hi, d) => Math.round(num(v, lo, hi, d));

export function sanitizeJar(j) {
  const D = JAR_DEFAULT, s = j && typeof j === 'object' ? j : {};
  return {
    enabled: s.enabled !== false,
    shape: JAR_SHAPES.includes(s.shape) ? s.shape : D.shape,
    glass: hex(s.glass, D.glass),
    lid: JAR_LIDS.includes(s.lid) ? s.lid : D.lid,
    lidColor: hex(s.lidColor, D.lidColor),
    bow: s.bow !== false, bowColor: hex(s.bowColor, D.bowColor),
    label: String(s.label ?? D.label).slice(0, 30),
    labelColor: hex(s.labelColor, D.labelColor), labelBg: hex(s.labelBg, D.labelBg),
    showCount: s.showCount !== false,
    itemSize: num(s.itemSize, 0.6, 1.6, D.itemSize),
    capacity: int(s.capacity, 20, 400, D.capacity),
    perGift: int(s.perGift, 1, 50, D.perGift),
    minCoins: int(s.minCoins, 0, 100000, D.minCoins),
    whenFull: s.whenFull === 'stop' ? 'stop' : 'empty',
    sparkle: s.sparkle !== false, sound: s.sound !== false,
    volume: num(s.volume, 0, 1, D.volume),
    bigSize: s.bigSize !== false,
    shakeMin: int(s.shakeMin, 0, 1000000, D.shakeMin),
    glowMin: int(s.glowMin, 0, 1000000, D.glowMin),
    names: s.names !== false,
    likes: s.likes !== false, likesPer: int(s.likesPer, 1, 1000, D.likesPer),
    follows: s.follows !== false,
    goal: s.goal !== false, goalText: String(s.goalText ?? D.goalText).slice(0, 40),
    shakeCmd: s.shakeCmd !== false, shakeWord: String(s.shakeWord ?? D.shakeWord).trim().slice(0, 20) || D.shakeWord, shakeWait: int(s.shakeWait, 0, 600, D.shakeWait),
    topGiver: s.topGiver !== false,
    wobble: s.wobble !== false,
  };
}

const PIC = /^(gift:g\d{3}|[a-z]{2,16}|https?:\/\/\S{1,1000})$/;
// what's in the jar: { p: picture, s: size (1 = normal), g: 1 when it glows }
function cleanItem(x) {
  const it = typeof x === 'string' ? { p: x } : x && typeof x === 'object' ? x : null;
  if (!it || !PIC.test(String(it.p || ''))) return null;
  const out = { p: String(it.p) };
  const s = Number(it.s); if (Number.isFinite(s) && s !== 1) out.s = Math.min(2, Math.max(0.4, s));
  if (it.g) out.g = 1;
  return out;
}
export function bigScale(coins) { return coins >= 5000 ? 2 : coins >= 1000 ? 1.6 : coins >= 100 ? 1.3 : 1; }

export class GiftJar {
  // state: { items, total, top }; send(message) reaches every jar page; save() stores the state
  constructor(state, send, save) {
    this.items = (Array.isArray(state?.items) ? state.items : []).map(cleanItem).filter(Boolean).slice(-400);
    this.total = Math.max(0, Math.floor(Number(state?.total)) || 0);
    this.givers = new Map((Array.isArray(state?.givers) ? state.givers : []).filter(g => g && g.name).slice(0, 50)
      .map(g => [String(g.name).slice(0, 60), { name: String(g.name).slice(0, 60), coins: Number(g.coins) || 0, avatar: PIC.test(String(g.avatar || '')) ? String(g.avatar) : '' }]));
    this.likeAcc = 0; this.combos = new Map();
    this.shakeAt = 0; this.shakeBy = new Map();
    this.send = send; this.save = save;
  }
  state() { return { items: this.items, total: this.total, givers: [...this.givers.values()].sort((a, b) => b.coins - a.coins).slice(0, 50) }; }
  top() { let t = null; for (const g of this.givers.values()) if (!t || g.coins > t.coins) t = g; return t; }

  // put pictures in; returns how many went in
  _put(list, cfg, extra = {}) {
    let n = list.length;
    if (jarOpen(cfg) && this.items.length + n > cfg.capacity) { // no lid: gifts pile up and spill over the rim (no pouring out)
      if (this.items.length < cfg.capacity) this.send({ t: 'jarGoal' }); // just got full: party, but keep everything in
      this.items.push(...list); this.items = this.items.slice(-cfg.capacity);
      this.send({ t: 'jarAdd', items: list, total: this.total, ...extra }); this.save();
      return n;
    }
    if (this.items.length + n > cfg.capacity) {
      if (cfg.whenFull === 'stop') n = Math.max(0, cfg.capacity - this.items.length);
      else { this.items = []; this.send({ t: 'jarFull' }); n = Math.min(n, cfg.capacity); }
    }
    const add = list.slice(0, n);
    this.items.push(...add);
    this.send({ t: 'jarAdd', items: add, total: this.total, ...extra });
    this.save();
    return n;
  }

  // a gift. pic: 'gift:g012' or a web address; coins: price of one; who: { name, avatar }; giftName: shown in the floating tag
  // A combo (e.g. 300 roses sent by holding the button) reaches the app as many small sends, so "most pictures
  // per send" counts the whole combo: same viewer + same gift with less than 4 seconds between sends.
  add(pic, count, coins, cfg, who = null, giftName = '', now = Date.now()) {
    if (!cfg.enabled || !PIC.test(String(pic || ''))) return 0;
    coins = Number(coins) || 0;
    if (coins < cfg.minCoins) return 0;
    count = Math.max(1, Math.floor(Number(count)) || 1);
    this.total += count;
    const it = { p: String(pic) };
    if (cfg.bigSize && bigScale(coins) !== 1) it.s = bigScale(coins);
    if (cfg.glowMin > 0 && coins >= cfg.glowMin) it.g = 1;
    const extra = {};
    const name = String(who?.name || '').slice(0, 60);
    if (name) {
      const g = this.givers.get(name) || { name, coins: 0, avatar: '' };
      g.coins += coins * count; if (PIC.test(String(who.avatar || ''))) g.avatar = String(who.avatar);
      this.givers.set(name, g);
      if (this.givers.size > 500) { const keep = [...this.givers.values()].sort((a, b) => b.coins - a.coins).slice(0, 200); this.givers = new Map(keep.map(x => [x.name, x])); }
      if (cfg.topGiver) extra.top = this.top();
    }
    const key = (name || '?') + '|' + pic;
    let st = this.combos.get(key);
    if (!st || now - st.at > 4000) { st = { n: 0, count: 0, coins: 0, shook: false }; this.combos.set(key, st); if (this.combos.size > 300) for (const [k, v] of this.combos) if (now - v.at > 4000) this.combos.delete(k); }
    st.at = now; st.count += count; st.coins += coins * count;
    const n = Math.max(0, Math.min(count, cfg.perGift - st.n)); st.n += n;
    if (cfg.names && name && n > 0) extra.tag = { name, gift: String(giftName || '').slice(0, 40), count: st.count };
    if (cfg.shakeMin > 0 && !st.shook && st.coins >= cfg.shakeMin) { st.shook = true; extra.shake = Math.min(3, 1 + Math.log10(st.coins / cfg.shakeMin + 1) * 2); }
    if (!n) { this.send({ t: 'jarAdd', items: [], total: this.total, ...extra }); this.save(); return 0; }
    return this._put(Array.from({ length: n }, () => ({ ...it })), cfg, extra);
  }
  // ❤️ likes: every likesPer likes drop one small heart
  like(n, cfg) {
    if (!cfg.enabled || !cfg.likes) return 0;
    this.likeAcc += Math.max(0, Math.floor(Number(n)) || 0);
    const k = Math.min(5, Math.floor(this.likeAcc / cfg.likesPer));
    if (!k) return 0;
    this.likeAcc -= k * cfg.likesPer; if (this.likeAcc > cfg.likesPer * 5) this.likeAcc = 0;
    return this._put(Array.from({ length: k }, () => ({ p: 'heart', s: 0.6 })), cfg);
  }
  // ⭐ a new follower drops a star
  follow(who, cfg) {
    if (!cfg.enabled || !cfg.follows) return 0;
    const name = String(who?.name || '').slice(0, 60);
    return this._put([{ p: 'star', s: 0.8, g: 1 }], cfg, cfg.names && name ? { tag: { name, gift: '⭐ ฟอลโลว์', count: 1 } } : {});
  }
  // 💬 "!เขย่า" in chat: each viewer waits shakeWait seconds, and the jar shakes at most every 4 seconds
  chat(text, who, cfg, now = Date.now()) {
    if (!cfg.enabled || !cfg.shakeCmd) return false;
    if (String(text || '').trim().toLowerCase().split(/\s+/)[0] !== cfg.shakeWord.toLowerCase()) return false;
    const key = String(who?.id || who?.name || '?');
    if (now - (this.shakeBy.get(key) || 0) < cfg.shakeWait * 1000 || now - this.shakeAt < 4000) return false;
    this.shakeBy.set(key, now); this.shakeAt = now;
    if (this.shakeBy.size > 2000) this.shakeBy.clear();
    this.send({ t: 'jarShake', power: 1, by: String(who?.name || '').slice(0, 60) });
    return true;
  }
  shake(power = 1.5) { this.send({ t: 'jarShake', power }); }
  clear() { this.items = []; this.total = 0; this.givers.clear(); this.likeAcc = 0; this.send({ t: 'jarPour', total: 0, top: null }); this.save(); }
}
