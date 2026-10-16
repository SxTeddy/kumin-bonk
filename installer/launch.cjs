// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// KuminBonk launcher: starts the newest complete version in .\versions (auto-update friendly).
const fs = require('fs');
const path = require('path');
const root = __dirname;
// Started by the official node.exe from a shortcut (a console program): start a copy of ourselves
// with the window hidden and close this one, so no black window stays open.
// (Windows "Smart App Control" blocks unsigned helper .exe files, but allows the signed node.exe.)
if ((process.platform === 'win32' || process.env.KB_FORCE_RESPAWN) && !process.env.KB_CHILD && path.basename(process.execPath).toLowerCase().startsWith('node')) {
  const { spawn } = require('child_process');
  spawn(process.execPath, [__filename, ...process.argv.slice(2)], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, KB_CHILD: '1' } }).unref();
  process.exit(0);
}
const read = f => { try { return fs.readFileSync(path.join(root, f), 'utf8').trim(); } catch { return ''; } };
const ok = v => v && fs.existsSync(path.join(root, 'versions', v, '.complete')) && fs.existsSync(path.join(root, 'versions', v, 'app.cjs'));
const num = v => v.split('.').map(n => n.padStart(5, '0')).join('.');
let ver = [read('current.txt'), read('prev.txt')].find(ok);
if (!ver) {
  const all = fs.readdirSync(path.join(root, 'versions')).filter(ok).sort((a, b) => num(a).localeCompare(num(b)));
  ver = all.pop();
}
// If the last start of this version never finished (booting.txt still there), go back to the previous one.
const boot = read('booting.txt');
const prev = read('prev.txt');
if (boot && boot === ver && ok(prev) && prev !== ver) {
  fs.writeFileSync(path.join(root, 'current.txt'), prev);
  fs.writeFileSync(path.join(root, 'prev.txt'), ver);
  fs.writeFileSync(path.join(root, 'skip.txt'), ver);
  fs.appendFileSync(path.join(root, 'launch-log.txt'), `${new Date().toISOString()} ${ver} did not start, went back to ${prev}\n`);
  ver = prev;
}
fs.writeFileSync(path.join(root, 'booting.txt'), ver);
const dir = path.join(root, 'versions', ver);
process.env.KB_ROOT = dir;
process.env.KB_INSTALL = root;
require(path.join(dir, 'app.cjs'));
