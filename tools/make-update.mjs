// KuminBonk — สร้างโดย hxz · Copyright (c) 2026 hxz · ดูเงื่อนไขใน LICENSE
// Makes dist/update.json.gz + dist/update.sha256 (code + web files, no TikTok gift pictures).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version) throw new Error('usage: node tools/make-update.mjs <version>');
const files = { 'app.cjs': fs.readFileSync(path.join(ROOT, 'build', 'app.cjs')).toString('base64'), 'launch.cjs': fs.readFileSync(path.join(ROOT, 'installer', 'launch.cjs')).toString('base64') };
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  if (rel.startsWith('public/gifts')) continue;
  if (fs.statSync(p).isDirectory()) walk(p); else files[rel] = fs.readFileSync(p).toString('base64'); } };
walk(path.join(ROOT, 'public'));
const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ version, files })), { level: 9 });
// updates/ is committed to the repo; the app reads latest.json from GitHub.
const notes = (() => { try { const c = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'); const m = c.split(/^## /m).find(x => x.startsWith('v' + version)); return m ? m.split('\n').slice(1).join('\n').trim() : ''; } catch { return ''; } })();
const dir = path.join(ROOT, 'updates');
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (f.startsWith('update-')) fs.rmSync(path.join(dir, f));
const file = `update-${version}.json.gz`;
fs.writeFileSync(path.join(dir, file), gz);
fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ version, file, sha256: crypto.createHash('sha256').update(gz).digest('hex'), size: gz.length, notes }, null, 1) + '\n');
console.log('update bundle', version, Object.keys(files).length, 'files', (gz.length / 1e6).toFixed(2), 'MB');
