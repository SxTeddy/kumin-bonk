# KuminBonk — สร้างโดย hxz · Copyright (c) 2026 hxz
# Builds dist/KuminBonk-v<ver>-ติดตั้ง.exe: one installer .exe with the app packed inside (needs mono-mcs).
import os, sys, zipfile, subprocess, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VER = sys.argv[1]
tmp = tempfile.mkdtemp()
payload = os.path.join(tmp, 'payload.zip')
with zipfile.ZipFile(payload, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(os.path.join(ROOT, 'build', 'app.cjs'), 'app/app.cjs')
    for r, _, fs in os.walk(os.path.join(ROOT, 'public')):
        for f in fs:
            if f.endswith('.ico'): continue
            p = os.path.join(r, f)
            z.write(p, 'app/public/' + os.path.relpath(p, os.path.join(ROOT, 'public')).replace(os.sep, '/'))
    z.write(os.path.join(ROOT, 'public', 'assets', 'icon.ico'), 'icon.ico')
    z.write(os.path.join(ROOT, 'installer', 'launch.cjs'), 'launch.cjs')
    un = open(os.path.join(ROOT, 'installer', 'uninstall.ps1'), encoding='utf-8').read().replace('__VERSION__', VER)
    z.writestr('uninstall.ps1', '﻿'.encode('utf-8') + un.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8'))
open(os.path.join(tmp, 'version.txt'), 'w').write(VER)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist', f'KuminBonk-v{VER}-ติดตั้ง.exe')
subprocess.run(['mcs', '-target:winexe', '-platform:x64', '-optimize+', '-nologo', '-out:' + out,
    '-win32icon:' + os.path.join(ROOT, 'public', 'assets', 'icon.ico'),
    '-resource:' + payload + ',payload.zip', '-resource:' + os.path.join(ROOT, 'public', 'assets', 'icon.png') + ',icon.png',
    '-resource:' + os.path.join(tmp, 'version.txt') + ',version.txt',
    '-r:System.Windows.Forms', '-r:System.Drawing', '-r:System.IO.Compression',
    os.path.join(ROOT, 'installer', 'Setup.cs')], check=True)
print(out, round(os.path.getsize(out) / 1e6, 1), 'MB')
