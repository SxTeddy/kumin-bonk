// KuminBonk — สร้างโดย hxz · Copyright (c) 2026 hxz · ดูเงื่อนไขใน LICENSE
// Where things live. In the packaged app every web file is embedded in KuminBonk.exe
// (Node "single executable" assets); during development they're read from ./public.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sea from 'node:sea';

export const IS_SEA = (() => { try { return sea.isSea(); } catch { return false; } })();
// Installed app: KuminBonk.exe (Node runtime) running app\app.cjs — no console window.
export const IS_APP = IS_SEA || path.basename(process.execPath).toLowerCase() === 'kuminbonk.exe';

const DEV_ROOT = process.env.KB_ROOT || [path.dirname(process.argv[1] || '.'), process.cwd(), path.resolve(path.dirname(process.argv[1] || '.'), '..')]
  .find(d => fs.existsSync(path.join(d, 'public', 'dashboard.html'))) || process.cwd();
const PUBLIC = path.join(DEV_ROOT, 'public');

const cache = new Map();
export function readPublic(rel) {
  rel = rel.replace(/^\/+/, '').replace(/\\/g, '/');
  if (rel.includes('..')) return null;
  if (IS_SEA) {
    if (cache.has(rel)) return cache.get(rel);
    try { const b = Buffer.from(sea.getAsset('public/' + rel)); cache.set(rel, b); return b; } catch { return null; }
  }
  try { return fs.readFileSync(path.join(PUBLIC, rel)); } catch { return null; }
}

// Settings live in %APPDATA%\KuminBonk on Windows so the exe can sit anywhere (even Program Files).
export const DATA_DIR = process.env.KB_DATA
  || (process.platform === 'win32' && process.env.APPDATA ? path.join(process.env.APPDATA, 'KuminBonk') : path.join(IS_APP ? path.dirname(process.execPath) : DEV_ROOT, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

// Log file (the app has no console window).
const LOG = path.join(DATA_DIR, 'log.txt');
export function logToFile(line) {
  try {
    const st = fs.statSync(LOG, { throwIfNoEntry: false });
    if (st && st.size > 1_000_000) fs.renameSync(LOG, LOG + '.old');
    fs.appendFileSync(LOG, line + os.EOL);
  } catch {}
}
