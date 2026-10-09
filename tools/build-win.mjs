// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// Builds dist/KuminBonk.exe: one Windows app file with every web asset embedded.
// usage: node tools/build-win.mjs <path to Windows node.exe> [--linux-test]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const DIST = path.join(ROOT, 'dist');
const VERSION = '1.4.11';
const nodeExe = process.argv[2];
const linuxTest = process.argv.includes('--linux-test');
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });

// 1) bundle
run('node', ['tools/build.mjs']);

// 1b) icon (.ico with PNG images)
const sizes = [16, 24, 32, 48, 64, 128, 256];
const svg = fs.readFileSync(path.join(ROOT, 'public/assets/icon.svg'));
const pngs = sizes.map(s => new Resvg(svg, { fitTo: { mode: 'width', value: s } }).render().asPng());
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
  off += pngs[i].length;
});
const ico = Buffer.concat([head, ...pngs]);
fs.writeFileSync(path.join(ROOT, 'public/assets/icon.ico'), ico);


// 2) embed every file under public/
const assets = {};
const walk = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else assets['public/' + path.relative(path.join(ROOT, 'public'), p).replace(/\\/g, '/')] = p; } };
walk(path.join(ROOT, 'public'));
fs.writeFileSync(path.join(BUILD, 'sea-config.json'), JSON.stringify({
  main: path.join(BUILD, 'app.cjs'), output: path.join(BUILD, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false, assets,
}, null, 1));
run('node', ['--experimental-sea-config', path.join(BUILD, 'sea-config.json')]);
console.log('embedded files:', Object.keys(assets).length);

const inject = exe => run('npx', ['postject', exe, 'NODE_SEA_BLOB', path.join(BUILD, 'sea-prep.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2', '--overwrite']);

if (linuxTest) {
  const out = path.join(BUILD, 'kb-linux');
  fs.copyFileSync(process.execPath, out);
  inject(out);
  console.log('linux test build:', out);
  process.exit(0);
}

// 4) start from the official node.exe (editing its resources corrupts the file, so the icon is used by the shortcuts instead)
const out = path.join(DIST, 'KuminBonk.exe');
fs.copyFileSync(nodeExe, out);

// 5) app code + assets
inject(out);

// 6) Windows GUI app (no black console window)
const buf = fs.readFileSync(out);
const pe = buf.readUInt32LE(0x3c);
if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('not a PE file');
const subsys = pe + 24 + 68;
console.log('subsystem', buf.readUInt16LE(subsys), '-> 2');
buf.writeUInt16LE(2, subsys);
fs.writeFileSync(out, buf);
console.log('built', out, (buf.length / 1e6).toFixed(1), 'MB');
