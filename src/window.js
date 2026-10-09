// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// Opens KuminBonk in its own app window (Microsoft Edge / Chrome "app mode": no tabs, no address bar).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, exec } from 'node:child_process';

function findBrowser() {
  const bases = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const cands = bases.flatMap(b => [
    path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]);
  return cands.find(f => { try { return fs.existsSync(f); } catch { return false; } });
}

// Returns the window process (or null when it fell back to the normal browser).
export function openAppWindow(url, dataDir, { detached = false } = {}) {
  if (process.platform !== 'win32') return null;
  const exe = findBrowser();
  if (!exe) { exec(`start "" "${url}"`, { windowsHide: true }); return null; }
  const child = spawn(exe, [
    `--app=${url}`,
    `--user-data-dir=${path.join(dataDir, 'window')}`,
    '--window-size=1320,900',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run', '--no-default-browser-check', '--disable-features=Translate,msEdgeSidebarV2',
  ], { stdio: 'ignore', detached });
  if (detached) child.unref();
  return child;
}

// Desktop + Start menu shortcuts pointing at this exe (refreshed if the exe was moved).
export function makeShortcuts(exePath, iconPath, log) {
  if (process.platform !== 'win32') return;
  const q = s => s.replace(/'/g, "''");
  const ps = `
$ws = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $lnk = Join-Path $dir 'KuminBonk.lnk'
  $s = $ws.CreateShortcut($lnk)
  if ($s.TargetPath -ne '${q(exePath)}' -or $s.IconLocation -ne '${q(iconPath)},0') {
    $s.TargetPath = '${q(exePath)}'
    $s.WorkingDirectory = '${q(path.dirname(exePath))}'
    $s.IconLocation = '${q(iconPath)},0'
    $s.Description = 'KuminBonk - TikTok gifts to VTube Studio'
    $s.Save()
  }
}`;
  const enc = Buffer.from(ps, 'utf16le').toString('base64');
  exec(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${enc}`, { windowsHide: true }, err => {
    if (err) log?.('app', 'สร้างทางลัดไม่สำเร็จ (ไม่เป็นไร เปิดจาก KuminBonk.exe ได้ตามปกติ)', 'warn');
  });
}

// Small Windows message box (the app has no console to print to).
export function messageBox(text, title = 'KuminBonk') {
  if (process.platform !== 'win32') { console.log(text); return; }
  const q = s => s.replace(/'/g, "''");
  const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${q(text)}', '${q(title)}') | Out-Null`;
  try { require_exec(ps); } catch {}
}
function require_exec(ps) {
  const enc = Buffer.from(ps, 'utf16le').toString('base64');
  exec(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${enc}`, { windowsHide: true });
}
