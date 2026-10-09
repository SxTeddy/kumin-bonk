// KuminBonk — สร้างโดย hxz · Copyright (c) 2026 hxz · ดูเงื่อนไขใน LICENSE
// Bundles src/ into build/app.cjs (with the copyright banner) and copies the license files into public/legal/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const banner = '// KuminBonk — สร้างโดย hxz · Copyright (c) 2026 hxz. All rights reserved. ดูเงื่อนไขใน LICENSE\n// Third-party libraries bundled below keep their own licenses: see THIRD-PARTY-NOTICES.txt';
execFileSync('npx', ['esbuild', 'src/server.js', '--bundle', '--platform=node', '--target=node22', '--format=cjs', '--outfile=build/app.cjs',
  '--external:bufferutil', '--external:utf-8-validate', '--legal-comments=eof', `--banner:js=${banner}`, '--log-level=warning'], { cwd: ROOT, stdio: 'inherit' });
fs.mkdirSync(path.join(ROOT, 'public', 'legal'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(ROOT, 'public', 'legal', 'LICENSE.txt'));
fs.copyFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.txt'), path.join(ROOT, 'public', 'legal', 'THIRD-PARTY-NOTICES.txt'));
console.log('built build/app.cjs');
