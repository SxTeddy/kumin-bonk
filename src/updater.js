// KuminBonk — สร้างโดย hxz · Copyright (c) 2026 hxz · ดูเงื่อนไขใน LICENSE
// Auto-update: checks the GitHub repo's updates/ folder, downloads the new app files in the background,
// and switches to them on the next start (or right away when the user presses restart).
// Installed layout:  <install>\launch.cjs  <install>\current.txt  <install>\versions\<ver>\{app.cjs, public\...}
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const REPO = 'SxTeddy/kumin-bonk';
// Update files live in the repo's updates/ folder: latest.json + update-<version>.json.gz
const BASE = process.env.KB_UPDATE_BASE || `https://raw.githubusercontent.com/${REPO}/main/updates`;

export const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};

export class Updater extends EventEmitter {
  constructor({ version, log, dataDir }) {
    super();
    this.dataDir = dataDir;
    this.version = version;
    this.log = log;
    this.install = process.env.KB_INSTALL || '';
    this.enabled = !!this.install;
    this.state = { status: this.enabled ? 'idle' : 'off', current: version, previous: '', backups: [] };
    this.busy = false;
  }

  set(s) { this.state = { ...this.state, ...s, previous: this.previous(), backups: this.backups().slice(0, 10) }; this.emit('state', this.state); }

  start() {
    if (!this.enabled) return;
    this.cleanup();
    setTimeout(() => this.check(), 8000);
    setInterval(() => this.check(), 6 * 3600 * 1000);
  }

  async get(url, type = 'json', onProgress = null) {
    const r = await fetch(url, { headers: { 'User-Agent': 'KuminBonk', Accept: '*/*', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(type === 'json' ? 15000 : 300000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (type === 'json') return r.json();
    if (type === 'text') return r.text();
    // binary: read in chunks so the dashboard can show a progress bar
    const total = Number(r.headers.get('content-length')) || 0;
    const parts = []; let got = 0, last = 0;
    for await (const chunk of r.body) {
      parts.push(chunk); got += chunk.length;
      if (onProgress && Date.now() - last > 150) { last = Date.now(); onProgress(got, total); }
    }
    if (onProgress) onProgress(got, total || got);
    return Buffer.concat(parts.map(c => Buffer.from(c)));
  }

  async check(manual = false) {
    if (!this.enabled || this.busy) return this.state;
    this.busy = true;
    try {
      this.set({ status: 'checking' });
      const man = await this.get(`${BASE}/latest.json?t=${Date.now()}`);
      const latest = String(man.version || '').replace(/^v/, '');
      if (!latest || !newer(latest, this.version)) { this.set({ status: 'uptodate', latest }); return this.state; }
      let skip = ''; try { skip = fs.readFileSync(path.join(this.install, 'skip.txt'), 'utf8').trim(); } catch {}
      if (skip === latest && !manual) { this.set({ status: 'skipped', latest }); return this.state; }
      if (manual) { try { fs.rmSync(path.join(this.install, 'skip.txt'), { force: true }); } catch {} }
      const dir = path.join(this.install, 'versions', latest);
      if (fs.existsSync(path.join(dir, '.complete'))) { this.activate(latest); this.set({ status: 'ready', latest, notes: man.notes || '' }); return this.state; }
      if (!man.file || !man.sha256 || /[\\/]/.test(man.file)) throw new Error('bad update manifest');
      this.set({ status: 'downloading', latest, progress: 0 });
      this.log('update', `พบเวอร์ชันใหม่ ${latest} กำลังดาวน์โหลด…`);
      const size = Number(man.size) || 0;
      const gz = await this.get(`${BASE}/${man.file}`, 'bin', (got, total) => this.set({ status: 'downloading', latest, progress: Math.min(1, got / (total || size || got || 1)) }));
      const got = crypto.createHash('sha256').update(gz).digest('hex');
      if (String(man.sha256).toLowerCase() !== got) throw new Error('ไฟล์อัปเดตไม่ตรงกับลายเซ็น');
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
      // try the new version before using it
      this.set({ status: 'verifying', latest });
      const t = spawnSync(process.execPath, [path.join(tmp, 'app.cjs'), '--selftest'], { env: { ...process.env, KB_ROOT: tmp }, timeout: 60000, encoding: 'utf8', windowsHide: true });
      let res = {}; try { res = JSON.parse(t.stdout || '{}'); } catch {}
      if (t.status !== 0 || !res.ok || String(res.version) !== latest) {
        fs.rmSync(tmp, { recursive: true, force: true });
        const failed = Object.entries(res.checks || {}).filter(([, v]) => !v).map(([k]) => k).join(', ');
        throw new Error(`เวอร์ชัน ${latest} ตรวจไม่ผ่าน${failed ? ` (${failed})` : ''} — ยังใช้เวอร์ชันเดิมต่อ`);
      }
      this.log('update', `ตรวจเวอร์ชัน ${latest} ผ่านแล้ว ✓ (${Object.keys(res.checks).length} รายการ)`);
      fs.writeFileSync(path.join(tmp, '.complete'), latest);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.renameSync(tmp, dir);
      this.backup(`ก่อนอัปเดตเป็น ${latest}`);
      this.activate(latest);
      try { if (fs.existsSync(path.join(dir, 'launch.cjs'))) fs.copyFileSync(path.join(dir, 'launch.cjs'), path.join(this.install, 'launch.cjs')); } catch {}
      this.set({ status: 'ready', verified: true, latest, notes: man.notes || '' });
      this.log('update', `ดาวน์โหลดเวอร์ชัน ${latest} เสร็จแล้ว — จะใช้ตอนเปิดโปรแกรมครั้งหน้า หรือกด "รีสตาร์ท" ได้เลย`);
    } catch (e) {
      this.set({ status: 'error', detail: e.message });
      if (manual || /ตรวจไม่ผ่าน/.test(e.message)) this.log('update', `ตรวจอัปเดตไม่ได้: ${e.message}`, 'warn');
    } finally { this.busy = false; }
    return this.state;
  }

  // ---- settings backups (%APPDATA%\KuminBonk\backups\<time>) ----
  static FILES = ['config.json', 'gift-aliases.json', 'gifts-seen.json', 'vts-token.txt'];
  get backupDir() { return path.join(this.dataDir, 'backups'); }
  backup(label = 'สำรองเอง') {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dir = path.join(this.backupDir, stamp);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of Updater.FILES) { const src = path.join(this.dataDir, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, f)); }
      fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ label, version: this.version, time: Date.now() }));
      // keep the newest 10
      const all = this.backups();
      for (const b of all.slice(10)) fs.rmSync(path.join(this.backupDir, b.id), { recursive: true, force: true });
      this.log('backup', `สำรองการตั้งค่าแล้ว (${label})`);
      return stamp;
    } catch (e) { this.log('backup', `สำรองการตั้งค่าไม่สำเร็จ: ${e.message}`, 'warn'); return null; }
  }
  backups() {
    try {
      return fs.readdirSync(this.backupDir).map(id => {
        let info = {}; try { info = JSON.parse(fs.readFileSync(path.join(this.backupDir, id, 'info.json'), 'utf8')); } catch {}
        return { id, label: info.label || '', version: info.version || '', time: info.time || 0 };
      }).sort((a, b) => b.time - a.time);
    } catch { return []; }
  }
  restore(id) {
    const dir = path.join(this.backupDir, path.basename(String(id)));
    if (!fs.existsSync(path.join(dir, 'info.json'))) throw new Error('ไม่พบไฟล์สำรองนี้');
    this.backup('ก่อนกู้คืน');
    for (const f of Updater.FILES) { const src = path.join(dir, f); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(this.dataDir, f)); }
  }

  // ---- go back to the previous version ----
  previous() {
    if (!this.enabled) return '';
    let prev = ''; try { prev = fs.readFileSync(path.join(this.install, 'prev.txt'), 'utf8').trim(); } catch {}
    return prev && prev !== this.version && fs.existsSync(path.join(this.install, 'versions', prev, '.complete')) ? prev : '';
  }
  rollback() {
    const prev = this.previous();
    if (!prev) throw new Error('ไม่มีเวอร์ชันก่อนหน้าในเครื่อง');
    this.backup(`ก่อนย้อนกลับเป็น ${prev}`);
    fs.writeFileSync(path.join(this.install, 'prev.txt'), this.version);
    fs.writeFileSync(path.join(this.install, 'current.txt'), prev);
    // don't jump straight back up to the version we're leaving
    fs.writeFileSync(path.join(this.install, 'skip.txt'), this.version);
    return prev;
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
