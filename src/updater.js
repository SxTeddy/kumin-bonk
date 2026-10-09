// Auto-update: checks GitHub releases, downloads the new app files in the background,
// and switches to them on the next start (or right away when the user presses restart).
// Installed layout:  <install>\launch.cjs  <install>\current.txt  <install>\versions\<ver>\{app.cjs, public\...}
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

export const REPO = 'SxTeddy/kumin-bonk';
const API = process.env.KB_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`;

export const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};

export class Updater extends EventEmitter {
  constructor({ version, log }) {
    super();
    this.version = version;
    this.log = log;
    this.install = process.env.KB_INSTALL || '';
    this.enabled = !!this.install;
    this.state = { status: this.enabled ? 'idle' : 'off', current: version };
    this.busy = false;
  }

  set(s) { this.state = { ...this.state, ...s }; this.emit('state', this.state); }

  start() {
    if (!this.enabled) return;
    this.cleanup();
    setTimeout(() => this.check(), 8000);
    setInterval(() => this.check(), 6 * 3600 * 1000);
  }

  async get(url, type = 'json') {
    const r = await fetch(url, { headers: { 'User-Agent': 'KuminBonk', Accept: type === 'json' ? 'application/vnd.github+json' : 'application/octet-stream' }, signal: AbortSignal.timeout(type === 'json' ? 15000 : 300000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return type === 'json' ? r.json() : type === 'text' ? r.text() : Buffer.from(await r.arrayBuffer());
  }

  async check(manual = false) {
    if (!this.enabled || this.busy) return this.state;
    this.busy = true;
    try {
      this.set({ status: 'checking' });
      const rel = await this.get(API);
      const latest = String(rel.tag_name || '').replace(/^v/, '');
      if (!latest || !newer(latest, this.version)) { this.set({ status: 'uptodate', latest }); return this.state; }
      const dir = path.join(this.install, 'versions', latest);
      if (fs.existsSync(path.join(dir, '.complete'))) { this.activate(latest); this.set({ status: 'ready', latest, notes: rel.body || '' }); return this.state; }

      const asset = n => rel.assets?.find(a => a.name === n)?.browser_download_url;
      const bundleUrl = asset('update.json.gz'), sumUrl = asset('update.sha256');
      if (!bundleUrl || !sumUrl) throw new Error('release has no update files');
      this.set({ status: 'downloading', latest });
      this.log('update', `พบเวอร์ชันใหม่ ${latest} กำลังดาวน์โหลด…`);
      const [gz, sum] = await Promise.all([this.get(bundleUrl, 'bin'), this.get(sumUrl, 'text')]);
      const want = sum.trim().split(/\s+/)[0].toLowerCase();
      const got = crypto.createHash('sha256').update(gz).digest('hex');
      if (want !== got) throw new Error('ไฟล์อัปเดตไม่ตรงกับลายเซ็น');
      const bundle = JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
      if (String(bundle.version) !== latest) throw new Error('เวอร์ชันในไฟล์ไม่ตรง');

      const tmp = dir + '.partial';
      fs.rmSync(tmp, { recursive: true, force: true });
      for (const [rel, b64] of Object.entries(bundle.files)) {
        if (rel.includes('..') || path.isAbsolute(rel)) throw new Error('bad path in update');
        const out = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, Buffer.from(b64, 'base64'));
      }
      // gift pictures are not published online: carry them over from the version in use
      const curGifts = path.join(process.env.KB_ROOT || '', 'public', 'gifts');
      if (fs.existsSync(curGifts) && !fs.existsSync(path.join(tmp, 'public', 'gifts'))) fs.cpSync(curGifts, path.join(tmp, 'public', 'gifts'), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.complete'), latest);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(tmp, dir);
      this.activate(latest);
      this.set({ status: 'ready', latest, notes: rel.body || '' });
      this.log('update', `ดาวน์โหลดเวอร์ชัน ${latest} เสร็จแล้ว — จะใช้ตอนเปิดโปรแกรมครั้งหน้า หรือกด "รีสตาร์ท" ได้เลย`);
    } catch (e) {
      this.set({ status: 'error', detail: e.message });
      if (manual) this.log('update', `ตรวจอัปเดตไม่ได้: ${e.message}`, 'warn');
    } finally { this.busy = false; }
    return this.state;
  }

  activate(ver) {
    const cur = path.join(this.install, 'current.txt');
    const was = fs.existsSync(cur) ? fs.readFileSync(cur, 'utf8').trim() : this.version;
    if (was !== ver) fs.writeFileSync(path.join(this.install, 'prev.txt'), was);
    fs.writeFileSync(cur, ver);
  }

  // keep only the version in use, the active one and the previous one
  cleanup() {
    try {
      const keep = new Set([this.version, ...['current.txt', 'prev.txt'].map(f => { try { return fs.readFileSync(path.join(this.install, f), 'utf8').trim(); } catch { return ''; } })]);
      const vdir = path.join(this.install, 'versions');
      for (const v of fs.readdirSync(vdir)) if (!keep.has(v)) fs.rmSync(path.join(vdir, v), { recursive: true, force: true });
    } catch {}
  }
}
