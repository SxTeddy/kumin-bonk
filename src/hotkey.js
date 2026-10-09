// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// ⌨️ A keyboard shortcut that works even while another program (a game) is in front — Windows only.
// A small hidden PowerShell helper registers the key with Windows and prints "hit" each time it is pressed.
import { spawn } from 'node:child_process';

export const HOTKEYS = ['Ctrl+Alt+P', 'Ctrl+Shift+P', 'F8', 'F9', 'F10', 'Pause'];
const VK = { P: 0x50, F8: 0x77, F9: 0x78, F10: 0x79, Pause: 0x13 };

export function parseHotkey(s) {
  const parts = String(s || '').split('+').map(x => x.trim()).filter(Boolean);
  let mods = 0, vk = 0;
  for (const p of parts) {
    const u = p.toLowerCase();
    if (u === 'ctrl') mods |= 2; else if (u === 'alt') mods |= 1; else if (u === 'shift') mods |= 4;
    else vk = VK[p] || VK[p.toUpperCase()] || (p.length === 1 ? p.toUpperCase().charCodeAt(0) : 0);
  }
  return vk ? { mods, vk } : null;
}

const SCRIPT = (mods, vk, pid) => `
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class KbHotkey : NativeWindow {
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  public KbHotkey() { CreateHandle(new CreateParams()); }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0312) { Console.Out.WriteLine("hit"); Console.Out.Flush(); }
    base.WndProc(ref m);
  }
  public static void Run(uint mods, uint vk, int parent) {
    KbHotkey w = new KbHotkey();
    if (!RegisterHotKey(w.Handle, 1, mods | 0x4000, vk)) { Console.Out.WriteLine("busy"); Console.Out.Flush(); return; }
    Console.Out.WriteLine("ok"); Console.Out.Flush();
    Timer t = new Timer(); t.Interval = 3000;
    t.Tick += delegate {
      bool alive = true;
      try { System.Diagnostics.Process.GetProcessById(parent); } catch { alive = false; }
      if (!alive) { UnregisterHotKey(w.Handle, 1); Application.Exit(); }
    };
    t.Start();
    Application.Run();
  }
}
'@
[KbHotkey]::Run(${mods}, ${vk}, ${pid})
`;

export class Hotkey {
  constructor(log) { this.log = log; this.proc = null; this.onPress = () => {}; this.key = ''; this.state = 'off'; }
  set(key) {
    this.stop();
    this.key = key || '';
    if (process.platform !== 'win32' || !key) { this.state = 'off'; return; }
    const hk = parseHotkey(key);
    if (!hk) { this.state = 'off'; return; }
    const enc = Buffer.from(SCRIPT(hk.mods, hk.vk, process.pid), 'utf16le').toString('base64');
    let p;
    try {
      p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', enc], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { this.state = 'error'; this.log('hotkey', `ตั้งคีย์ลัดไม่ได้: ${e.message}`, 'warn'); return; }
    this.proc = p; this.state = 'starting';
    let buf = '';
    p.stdout.on('data', d => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line === 'hit') this.onPress();
        else if (line === 'ok') { this.state = 'on'; this.log('hotkey', `คีย์ลัดพักเอฟเฟกต์: ${key} (กดได้แม้อยู่ในเกม)`); }
        else if (line === 'busy') { this.state = 'busy'; this.log('hotkey', `คีย์ ${key} ถูกโปรแกรมอื่นใช้อยู่ — ลองเลือกคีย์อื่นในแท็บ ✨ ตัวช่วยไลฟ์`, 'warn'); }
      }
    });
    p.stderr.on('data', () => {});
    p.on('error', () => { this.state = 'error'; });
    p.on('exit', () => { if (this.proc === p) { this.proc = null; if (this.state === 'on' || this.state === 'starting') this.state = 'error'; } });
  }
  stop() { const p = this.proc; this.proc = null; if (p) try { p.kill(); } catch {} }
}
