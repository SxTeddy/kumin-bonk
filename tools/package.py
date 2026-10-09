# Builds dist/KuminBonk-v<ver>-Windows.zip (installer layout).
import os, shutil, zipfile, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VER = sys.argv[1]
out = os.path.join(ROOT, 'dist', 'pkg', 'KuminBonk')
shutil.rmtree(os.path.join(ROOT, 'dist', 'pkg'), ignore_errors=True)
os.makedirs(os.path.join(out, 'setup', 'app'))
shutil.copy(os.path.join(ROOT, 'build', 'app.cjs'), os.path.join(out, 'setup', 'app'))
shutil.copytree(os.path.join(ROOT, 'public'), os.path.join(out, 'setup', 'app', 'public'), ignore=shutil.ignore_patterns('*.ico'))
shutil.copy(os.path.join(ROOT, 'public', 'assets', 'icon.ico'), os.path.join(out, 'setup', 'icon.ico'))
for f in ('install.ps1', 'uninstall.ps1'):
    txt = open(os.path.join(ROOT, 'installer', f), encoding='utf-8').read().replace('__VERSION__', VER)
    open(os.path.join(out, 'setup', f), 'w', encoding='utf-8-sig', newline='\r\n').write(txt)  # BOM: Windows PowerShell 5 needs it for Thai
shutil.copy(os.path.join(ROOT, 'installer', 'install.cmd'), os.path.join(out, 'ติดตั้ง KuminBonk.cmd'))
shutil.copy(os.path.join(ROOT, 'installer', 'launch.cjs'), os.path.join(out, 'setup', 'launch.cjs'))
readme = open(os.path.join(ROOT, 'README-TH.txt'), encoding='utf-8').read()
open(os.path.join(out, 'README-TH.txt'), 'w', encoding='utf-8-sig', newline='\r\n').write(readme)
src = os.path.join(out, 'source')
for d in ('src', 'tools', 'test', 'installer'):
    shutil.copytree(os.path.join(ROOT, d), os.path.join(src, d), ignore=shutil.ignore_patterns('__pycache__'))
for f in ('package.json', 'package-lock.json'):
    shutil.copy(os.path.join(ROOT, f), src)
z = os.path.join(ROOT, 'dist', f'KuminBonk-v{VER}-Windows.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for r, _, fs in os.walk(out):
        for f in fs:
            p = os.path.join(r, f)
            zf.write(p, os.path.relpath(p, os.path.dirname(out)))
print(z, round(os.path.getsize(z) / 1e6, 1), 'MB')
