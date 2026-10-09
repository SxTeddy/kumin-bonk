// Makes dist/update.json.gz + dist/update.sha256 (code + web files, no TikTok gift pictures).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!version) throw new Error('usage: node tools/make-update.mjs <version>');
const files = { 'app.cjs': fs.readFileSync(path.join(ROOT, 'build', 'app.cjs')).toString('base64') };
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  if (rel.startsWith('public/gifts')) continue;
  if (fs.statSync(p).isDirectory()) walk(p); else files[rel] = fs.readFileSync(p).toString('base64'); } };
walk(path.join(ROOT, 'public'));
const gz = zlib.gzipSync(Buffer.from(JSON.stringify({ version, files })), { level: 9 });
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'update.json.gz'), gz);
fs.writeFileSync(path.join(ROOT, 'dist', 'update.sha256'), crypto.createHash('sha256').update(gz).digest('hex') + '  update.json.gz\n');
console.log('update bundle', version, Object.keys(files).length, 'files', (gz.length / 1e6).toFixed(2), 'MB');
