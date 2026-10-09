// KuminBonk — สร้างโดย hxz · Copyright (c) 2026 hxz · ดูเงื่อนไขใน LICENSE
// TikTok LIVE connection: turns raw webcast messages into simple, uniform events.
import { EventEmitter } from 'node:events';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const pick = (...vals) => vals.find(v => v !== undefined && v !== null && v !== '');
// Prefer a PNG/JPG link (VTube Studio can't load WebP).
const img = m => {
  const list = [...(m?.urlList || []), ...(m?.url || []), ...(m?.urlListList || [])].filter(u => typeof u === 'string');
  return list.find(u => /\.(png|jpe?g)(\?|$)/i.test(u)) || list[0] || undefined;
};

export function normUser(u = {}) {
  return {
    id: String(pick(u.userId, u.id, '') ?? ''),
    username: pick(u.uniqueId, u.displayId, u.username, 'unknown'),
    nickname: pick(u.nickname, u.uniqueId, u.displayId, 'ผู้ชม'),
    avatar: pick(u.profilePictureUrl, img(u.avatarThumb), img(u.avatarMedium), img(u.profilePicture)),
  };
}

export class TikTokSource extends EventEmitter {
  constructor(log) {
    super();
    this.log = log;
    this.conn = null;
    this.status = 'offline'; // offline | connecting | live | error
    this.username = '';
    this.wantConnected = false;
    this.retryTimer = null;
    this.retryDelay = 5000;
    this.streaks = new Map(); // combo-gift streak tracking
  }

  setStatus(s, detail = '') {
    this.status = s;
    this.statusDetail = detail;
    this.emit('status', { status: s, detail, username: this.username });
  }

  async connect(username, apiKey) {
    await this.disconnect(true);
    username = String(username || '').replace(/^@/, '').trim();
    if (!username) return this.setStatus('error', 'ยังไม่ได้ใส่ชื่อ TikTok');
    this.username = username;
    this.apiKey = apiKey;
    this.wantConnected = true;
    this.retryDelay = 5000;
    return this._open();
  }

  async _open() {
    clearTimeout(this.retryTimer);
    this.setStatus('connecting');
    const opts = { processInitialData: false, enableExtendedGiftInfo: false };
    if (this.apiKey) opts.signApiKey = this.apiKey;
    const conn = new TikTokLiveConnection(this.username, opts);
    this.conn = conn;
    this._wire(conn);
    try {
      const state = await conn.connect();
      if (this.conn !== conn) return;
      this.retryDelay = 5000;
      this.setStatus('live', `room ${state?.roomId ?? ''}`.trim());
      this.log('tiktok', `เชื่อมต่อไลฟ์ของ @${this.username} แล้ว`);
    } catch (err) {
      if (this.conn !== conn) return;
      const msg = friendlyError(err);
      this.setStatus('error', msg);
      this.log('tiktok', `เชื่อมต่อไม่ได้: ${msg}`, 'warn');
      this._scheduleRetry();
    }
  }

  _scheduleRetry() {
    if (!this.wantConnected) return;
    clearTimeout(this.retryTimer);
    const d = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 60000);
    this.log('tiktok', `จะลองใหม่ใน ${Math.round(d / 1000)} วินาที`);
    this.retryTimer = setTimeout(() => this._open(), d);
  }

  async disconnect(silent = false) {
    this.wantConnected = false;
    clearTimeout(this.retryTimer);
    const c = this.conn;
    this.conn = null;
    if (c) { try { await c.disconnect(); } catch {} c.removeAllListeners?.(); }
    this.streaks.clear();
    if (!silent) { this.setStatus('offline'); this.log('tiktok', 'ตัดการเชื่อมต่อ TikTok แล้ว'); }
  }

  _wire(conn) {
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.conn !== conn) return;
      this.setStatus('connecting', 'หลุดการเชื่อมต่อ');
      this.log('tiktok', 'หลุดจากไลฟ์ กำลังต่อใหม่…', 'warn');
      this._scheduleRetry();
    });
    conn.on(ControlEvent.ERROR, e => this.status === 'live' && this.log('tiktok', `ข้อผิดพลาด: ${friendlyError(e?.exception || e)}`, 'warn'));
    conn.on(WebcastEvent.STREAM_END, () => {
      this.log('tiktok', 'ไลฟ์จบแล้ว');
      this.setStatus('offline', 'ไลฟ์จบ');
    });

    conn.on(WebcastEvent.GIFT, d => this.handleGift(d));
    conn.on(WebcastEvent.CHAT, d => this.emit('event', { type: 'chat', user: normUser(d.user), text: pick(d.comment, d.content, '') }));
    conn.on(WebcastEvent.LIKE, d => this.emit('event', {
      type: 'like', user: normUser(d.user), count: Number(pick(d.likeCount, d.count, 1)), total: Number(pick(d.totalLikeCount, d.total, 0)),
    }));
    conn.on(WebcastEvent.FOLLOW, d => this.emit('event', { type: 'follow', user: normUser(d.user) }));
    conn.on(WebcastEvent.SHARE, d => this.emit('event', { type: 'share', user: normUser(d.user) }));
    conn.on(WebcastEvent.MEMBER, d => this.emit('event', { type: 'join', user: normUser(d.user) }));
    conn.on(WebcastEvent.ROOM_USER, d => this.emit('viewers', Number(pick(d.viewerCount, d.total, 0))));
  }

  // Combo gifts (type 1) arrive many times with a growing repeatCount; emit only the new part each time.
  handleGift(d) {
    const g = d.giftDetails || d.gift || {};
    const user = normUser(d.user);
    const giftId = String(pick(d.giftId, g.id, ''));
    const name = pick(g.giftName, g.name, d.giftName, `Gift ${giftId}`);
    const diamonds = Number(pick(g.diamondCount, d.diamondCount, 0));
    const type = Number(pick(g.giftType, g.type, 0));
    const image = pick(d.giftPictureUrl, img(g.giftImage), img(g.image), img(g.icon));
    const repeat = Math.max(1, Number(pick(d.repeatCount, d.comboCount, 1)));
    const ended = Boolean(d.repeatEnd);

    let count = repeat;
    if (type === 1) {
      const key = `${user.id || user.username}:${giftId}:${d.groupId ?? ''}`;
      const seen = this.streaks.get(key) || 0;
      count = Math.max(0, repeat - seen);
      if (ended) this.streaks.delete(key); else this.streaks.set(key, Math.max(seen, repeat));
      if (this.streaks.size > 500) this.streaks.clear();
    }
    if (count <= 0) return;
    this.emit('event', { type: 'gift', user, gift: { id: giftId, name, diamonds, image }, count });
  }
}

function friendlyError(err) {
  const m = String(err?.message || err || 'unknown');
  if (/offline|not.*live|UserOffline/i.test(m) || err?.constructor?.name === 'UserOfflineError') return 'ยังไม่ได้เปิดไลฟ์ (หรือชื่อผิด)';
  if (/Room ID/i.test(m)) return 'หาไลฟ์ไม่เจอ — ยังไม่ได้เปิดไลฟ์ หรือชื่อผิด (จะลองใหม่เรื่อย ๆ)';
  if (/rate ?limit/i.test(m)) return 'Euler Stream จำกัดจำนวนครั้ง ลองใส่ API key หรือรอสักพัก';
  if (/captcha/i.test(m)) return 'TikTok ขอ captcha ลองใหม่ภายหลัง';
  return m.slice(0, 200);
}
