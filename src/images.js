// KuminBonk — สร้างโดย hxz · Copyright (c) 2026 hxz · ดูเงื่อนไขใน LICENSE
// Turns a throw source ('rose', a gift picture URL, an avatar URL) into PNG/JPG/GIF data VTube Studio accepts.
import crypto from 'node:crypto';

export const BUILTIN = ['rose', 'heart', 'star', 'hammer', 'donut', 'slipper', 'target', 'note', 'sparkle', 'cash', 'petal', 'snow', 'flame', 'confetti', 'smoke', 'coin', 'zap', 'diamond'];

export class Images {
  constructor(readPublic, log) {
    this.read = readPublic;
    this.log = log;
    this.cache = new Map();
    this.bad = new Set();
  }

  builtin(name) {
    if (!BUILTIN.includes(name)) name = 'heart';
    if (!this.cache.has(name)) {
      const b64 = this.read(`assets/${name}.png`).toString('base64');
      this.cache.set(name, { key: name, b64, ext: 'png' });
    }
    return this.cache.get(name);
  }

  // Gift pictures cut from the Thai gift panel (public/gifts/gNNN.png).
  giftPic(id) {
    const key = 'gift:' + id;
    if (!this.cache.has(key)) {
      const buf = this.read(`gifts/${id}.png`);
      if (!buf) return null;
      this.cache.set(key, { key: id, b64: buf.toString('base64'), ext: 'png' });
    }
    return this.cache.get(key);
  }

  // Best built-in stand-in for a gift whose own picture can't be used.
  guess(giftName = '') {
    const n = giftName.toLowerCase();
    const has = (...w) => w.some(x => n.includes(x));
    if (has('rose', 'flower', 'กุหลาบ', 'โรซ่า', 'ดอกไม้', 'มาลัย')) return 'rose';
    if (has('heart', 'love', 'หัวใจ', 'รัก', 'ใจ')) return 'heart';
    if (has('donut', 'doughnut', 'cake', 'ice cream', 'โดนัท', 'เค้ก', 'ไอศกรีม')) return 'donut';
    if (has('hammer', 'ค้อน')) return 'hammer';
    return 'star';
  }

  async get(src, fallback = 'heart') {
    if (!src || BUILTIN.includes(src)) return this.builtin(src || fallback);
    if (/^gift:g\d{3}$/.test(src)) return this.giftPic(src.slice(5)) || this.builtin(fallback);
    if (this.cache.has(src)) return this.cache.get(src);
    if (this.bad.has(src) || !/^https?:\/\//.test(src)) return this.builtin(fallback);
    try {
      // TikTok's CDN can usually serve the same picture as PNG instead of WebP.
      const tries = [src];
      if (/\.webp(\?|$)/i.test(src)) tries.unshift(src.replace(/\.webp(\?|$)/i, '.png$1'));
      let buf, ext;
      for (const u of tries) {
        try {
          const res = await fetch(u, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) continue;
          buf = Buffer.from(await res.arrayBuffer()); ext = sniff(buf);
          if (ext) break;
        } catch {}
      }
      if (!ext || buf.length > 4_000_000 || !bigEnough(buf, ext)) throw new Error('unsupported image');
      const key = 'u' + crypto.createHash('sha1').update(src).digest('hex').slice(0, 14);
      const img = { key, b64: buf.toString('base64'), ext };
      this.cache.set(src, img);
      if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
      return img;
    } catch {
      this.bad.add(src);
      return this.builtin(fallback);
    }
  }
}

function sniff(b) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  return null; // webp etc. are not accepted by VTube Studio
}

// VTS needs at least 64x64 pixels.
function bigEnough(b, ext) {
  try {
    if (ext === 'png') return b.readUInt32BE(16) >= 64 && b.readUInt32BE(20) >= 64;
    if (ext === 'gif') return b.readUInt16LE(6) >= 64 && b.readUInt16LE(8) >= 64;
    if (ext === 'jpg') {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) return false;
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return b.readUInt16BE(i + 5) >= 64 && b.readUInt16BE(i + 7) >= 64;
        i += 2 + len;
      }
    }
  } catch {}
  return false;
}
