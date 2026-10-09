// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// 📊 Live summaries and 🙏 auto thank-you messages.
import fs from 'node:fs';

// ---------- one summary per live ----------
export class Sessions {
  constructor(file, log) {
    this.file = file; this.log = log; this.cur = null; this.dirty = false;
    try { this.list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.list = []; }
    if (!Array.isArray(this.list)) this.list = [];
    // app closed/restarted during a live: continue that summary if the same live reconnects soon
    const last = this.list[0];
    if (last && !last.end && Date.now() - (last.updated || last.start) < 10 * 60000) this.resumable = last;
    for (const s of this.list) if (!s.end && s !== this.resumable) s.end = s.updated || s.start;
    setInterval(() => this.flush(), 15000).unref?.();
  }
  start(username) {
    if (this.cur && this.cur.user === username && Date.now() - this.cur.updated < 10 * 60000) { this.cur.end = null; return; } // reconnect = same live
    const r = this.resumable; this.resumable = null;
    if (r && r.user === username && Date.now() - (r.updated || r.start) < 10 * 60000) { this.end(); this.cur = r; r.end = null; return; }
    if (r && !r.end) r.end = r.updated || r.start;
    this.end(true);
    this.cur = { id: Date.now(), user: username, start: Date.now(), end: null, updated: Date.now(), coins: 0, gifts: 0, likes: 0, follows: 0, shares: 0, joins: 0, chats: 0, peak: 0, givers: {}, giftTypes: {} };
    this.list.unshift(this.cur); this.list = this.list.slice(0, 30); this.dirty = true;
  }
  // stale = the live dropped without a clean "stream ended": finish at the last activity, not now
  end(stale = false) {
    const c = this.cur; if (!c) return false;
    c.end = stale ? Math.max(c.start, c.updated || c.start) : Date.now(); this.cur = null;
    const empty = !c.gifts && !c.likes && !c.chats && !c.follows && c.end - c.start < 120000;
    if (empty) this.list = this.list.filter(s => s !== c);
    this.dirty = true; this.flush();
    return !empty;
  }
  viewers(n) { if (this.cur && n > this.cur.peak) { this.cur.peak = n; this.dirty = true; } }
  add(ev) {
    const c = this.cur; if (!c) return;
    c.updated = Date.now(); this.dirty = true;
    const u = ev.user || {};
    switch (ev.type) {
      case 'gift': {
        const n = Number(ev.count) || 1, coins = n * (Number(ev.gift?.diamonds) || 0);
        c.gifts += n; c.coins += coins;
        const key = u.id || u.username || u.nickname || '?';
        const g = c.givers[key] || (c.givers[key] = { name: u.nickname || u.username || '?', username: u.username || '', avatar: u.avatar || '', coins: 0, gifts: 0 });
        g.coins += coins; g.gifts += n; if (u.nickname) g.name = u.nickname;
        const gname = ev.gift?.th || ev.gift?.name || '?';
        const t = c.giftTypes[gname] || (c.giftTypes[gname] = { name: gname, image: ev.gift?.image || '', count: 0, coins: 0 });
        t.count += n; t.coins += coins;
        return;
      }
      case 'like': c.likes += Number(ev.count) || 1; return;
      case 'follow': c.follows++; return;
      case 'share': c.shares++; return;
      case 'join': c.joins++; return;
      case 'chat': c.chats++; return;
    }
  }
  // compact copy for the dashboard (top supporters first)
  view(s) {
    return {
      ...s, live: s === this.cur,
      givers: Object.values(s.givers).sort((a, b) => b.coins - a.coins || b.gifts - a.gifts).slice(0, 10),
      giftTypes: Object.values(s.giftTypes).sort((a, b) => b.coins - a.coins || b.count - a.count).slice(0, 12),
      giverCount: Object.keys(s.givers).length,
    };
  }
  all() { return this.list.map(s => this.view(s)); }
  remove(id) { this.list = this.list.filter(s => s.id !== id || s === this.cur); this.dirty = true; this.flush(); }
  flush() {
    if (!this.dirty) return; this.dirty = false;
    try { fs.writeFileSync(this.file, JSON.stringify(this.list)); } catch (e) { this.log?.('summary', e.message, 'warn'); }
  }
}

// ---------- thank-you messages ----------
// Gifts in a streak arrive many times; wait until the viewer stops sending, then say thanks once with the total.
export class Thanks {
  constructor(getConfig, say) { this.getConfig = getConfig; this.say = say; this.pending = new Map(); }
  fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? '').toString()).slice(0, 200); }
  handle(ev) {
    const t = this.getConfig().thanks || {};
    if (!t.enabled) return;
    const name = ev.user?.nickname || ev.user?.username || '';
    if (!name) return;
    if (ev.type === 'follow' && t.follow) return this.say(this.fill(t.followText, { name }));
    if (ev.type === 'share' && t.share) return this.say(this.fill(t.shareText, { name }));
    if (ev.type !== 'gift') return;
    const key = `${ev.user?.id || name}:${ev.gift?.name}`;
    const p = this.pending.get(key) || { name, gift: ev.gift?.th || ev.gift?.name || '', diamonds: Number(ev.gift?.diamonds) || 0, count: 0 };
    p.count += Number(ev.count) || 1; p.name = name;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      this.pending.delete(key);
      const cfg = this.getConfig().thanks || {};
      if (!cfg.enabled || p.diamonds * p.count < (Number(cfg.minCoins) || 0)) return;
      this.say(this.fill(cfg.giftText, { name: p.name, gift: p.gift, count: p.count, coins: p.diamonds * p.count }));
    }, Math.max(1, Number(t.wait) || 3) * 1000);
    this.pending.set(key, p);
  }
}
