// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// Turns a throw source ('rose', a gift picture URL, an avatar URL) into PNG/JPG/GIF data VTube Studio accepts.
import crypto from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';

const MAX_BYTES = 4_000_000;
// 🔒 never fetch pictures from this PC or the home network (only public internet addresses)
export function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}
async function publicUrl(u) {
  let url; try { url = new URL(u); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (net.isIP(host)) return !privateIp(host);
  try { const all = await dns.promises.lookup(host, { all: true }); return all.length > 0 && all.every(a => !privateIp(a.address)); } catch { return false; }
}
// download at most MAX_BYTES, follow at most 3 redirects (each one checked again)
async function download(u) {
  for (let hop = 0; hop < 4; hop++) {
    if (!(await publicUrl(u))) return null;
    const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location'), u).href; continue; }
    if (!res.ok) return null;
    if (Number(res.headers.get('content-length')) > MAX_BYTES) return null;
    const parts = []; let got = 0;
    for await (const chunk of res.body) { got += chunk.length; if (got > MAX_BYTES) return null; parts.push(Buffer.from(chunk)); }
    return Buffer.concat(parts);
  }
  return null;
}

export const BUILTIN = ['rose', 'heart', 'star', 'hammer', 'donut', 'slipper', 'target', 'note', 'sparkle', 'cash', 'petal', 'snow', 'flame', 'confetti', 'smoke', 'coin', 'zap', 'diamond', 'bubble', 'drop', 'crown', 'streak', 'firework'];

export class Images {
  constructor(readPublic, log) {
    this.read = readPublic;
    this.log = log;
    this.cache = new Map();
    this.bad = new Set();
    this.bytes = 0; // size of downloaded pictures kept in memory
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
          buf = await download(u); if (!buf) continue;
          ext = sniff(buf);
          if (ext) break;
        } catch {}
      }
      if (!ext || buf.length > MAX_BYTES || !bigEnough(buf, ext)) throw new Error('unsupported image');
      const key = 'u' + crypto.createHash('sha1').update(src).digest('hex').slice(0, 14);
      const img = { key, b64: buf.toString('base64'), ext };
      this.cache.set(src, img); this.bytes += img.b64.length;
      // keep memory small: forget the oldest downloaded pictures (built-in ones stay)
      for (const [k, v] of this.cache) {
        if (this.cache.size <= 300 && this.bytes <= 120e6) break;
        if (/^https?:/.test(k)) { this.cache.delete(k); this.bytes -= v.b64.length; }
      }
      return img;
    } catch {
      if (this.bad.size > 2000) this.bad.clear();
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
