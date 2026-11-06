// 🫙 Gift jar: a glass jar on the live screen (its own Link source, /jar) that fills up with the pictures
// of the gifts viewers send. The app keeps what's inside, so the jar looks the same after LIVE Studio reloads it.

export const JAR_DEFAULT = {
  enabled: true,
  shape: 'jar',          // jar | tall | round | heart
  glass: '#bfe6ff',      // glass tint
  lid: 'metal',          // metal | cork | cloth | none
  lidColor: '#ff7aa8',
  bow: true, bowColor: '#ff4f8b',
  label: 'โหลของขวัญ', labelColor: '#ffffff', labelBg: '#ff7aa8', showCount: true,
  itemSize: 1,           // 0.6 .. 1.6
  capacity: 120,         // pictures the jar holds before it's full
  perGift: 10,           // most pictures one send adds (a ×99 send doesn't flood the jar)
  minCoins: 0,           // gifts cheaper than this don't go in
  whenFull: 'empty',     // empty: pour out and start again · stop: keep it full
  sparkle: true, sound: true, volume: 0.4,
};
export const JAR_SHAPES = ['jar', 'tall', 'round', 'heart'];
export const JAR_LIDS = ['metal', 'cork', 'cloth', 'none'];

const hex = (v, d) => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : d;
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

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
    capacity: Math.round(num(s.capacity, 20, 400, D.capacity)),
    perGift: Math.round(num(s.perGift, 1, 50, D.perGift)),
    minCoins: Math.round(num(s.minCoins, 0, 100000, D.minCoins)),
    whenFull: s.whenFull === 'stop' ? 'stop' : 'empty',
    sparkle: s.sparkle !== false, sound: s.sound !== false,
    volume: num(s.volume, 0, 1, D.volume),
  };
}

const PIC = /^(gift:g\d{3}|[a-z]{2,16}|https?:\/\/\S{1,1000})$/;

export class GiftJar {
  // state: { items: [picture], total: gifts counted }; send(message) reaches every jar page; save() stores the state
  constructor(state, send, save) {
    this.items = Array.isArray(state?.items) ? state.items.filter(p => PIC.test(String(p))).slice(-400) : [];
    this.total = Math.max(0, Math.floor(Number(state?.total)) || 0);
    this.send = send; this.save = save;
  }
  state() { return { items: this.items, total: this.total }; }
  // pic: the gift's picture ('gift:g012' or a web address); count: how many were sent; coins: price of one
  add(pic, count, coins, cfg) {
    if (!cfg.enabled || !PIC.test(String(pic || ''))) return 0;
    if ((Number(coins) || 0) < cfg.minCoins) return 0;
    count = Math.max(1, Math.floor(Number(count)) || 1);
    this.total += count;
    let n = Math.min(count, cfg.perGift);
    if (this.items.length + n > cfg.capacity) {
      if (cfg.whenFull === 'stop') n = Math.max(0, cfg.capacity - this.items.length);
      else { this.items = []; this.send({ t: 'jarPour' }); n = Math.min(n, cfg.capacity); }
    }
    const add = Array(n).fill(String(pic));
    this.items.push(...add);
    this.send({ t: 'jarAdd', items: add, total: this.total });
    this.save();
    return n;
  }
  clear() { this.items = []; this.total = 0; this.send({ t: 'jarPour', total: 0 }); this.save(); }
}
