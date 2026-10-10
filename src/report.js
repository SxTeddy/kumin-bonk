// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// 📊 Live summary saved as a file: one self-contained HTML page per live (opens in any web browser).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec, spawn } from 'node:child_process';

const T = {
  th: { title: 'สรุปไลฟ์', live: 'ไลฟ์ของ', dur: 'ระยะเวลา', coins: 'เหรียญรวม', gifts: 'ของขวัญ', givers: 'คนส่งของขวัญ', likes: 'ไลค์', follows: 'ฟอลโลว์ใหม่', shares: 'แชร์', chats: 'แชต', peak: 'คนดูสูงสุด', top: '🏆 คนส่งของขวัญเยอะสุด', got: '🎁 ของขวัญที่ได้', none: 'ยังไม่มี', coin: 'เหรียญ', h: 'ชม.', m: 'นาที', made: 'สร้างโดย KuminBonk · HXZ !', pcs: 'ชิ้น' },
  en: { title: 'Live summary', live: 'Live of', dur: 'Duration', coins: 'Total coins', gifts: 'Gifts', givers: 'Gift senders', likes: 'Likes', follows: 'New followers', shares: 'Shares', chats: 'Chats', peak: 'Peak viewers', top: '🏆 Top supporters', got: '🎁 Gifts received', none: 'None', coin: 'coins', h: 'h', m: 'min', made: 'Made with KuminBonk · HXZ !', pcs: 'pcs' },
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const stamp = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`; };

export function reportName(s) {
  const user = String(s.user || 'live').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  return `${stamp(s.start)} @${user}.html`;
}

// s = Sessions.view(...) ; giftPic(name) -> data: URL or '' ; lang = app language
export function reportHtml(s, giftPic = () => '', lang = 'th') {
  const L = T[lang] || T.en;
  let loc = lang === 'th' ? 'th-TH' : lang;
  try { new Date().toLocaleString(loc); } catch { loc = 'th-TH'; }
  const n = v => Number(v || 0).toLocaleString(loc);
  const mins = Math.max(0, Math.round(((s.end || Date.now()) - s.start) / 60000));
  const dur = mins >= 60 ? `${Math.floor(mins / 60)} ${L.h} ${mins % 60} ${L.m}` : `${mins} ${L.m}`;
  const when = new Date(s.start).toLocaleString(loc, { dateStyle: 'full', timeStyle: 'short' });
  const tile = (v, l) => `<div class="t"><b>${v}</b><small>${esc(l)}</small></div>`;
  const medal = i => ['🥇', '🥈', '🥉'][i] || i + 1;
  const givers = (s.givers || []).map((g, i) => `<li><span class="rk">${medal(i)}</span>${g.avatar ? `<img src="${esc(g.avatar)}" alt="" onerror="this.style.visibility='hidden'">` : '<i></i>'}<span class="nm">${esc(g.name)}${g.username ? ` <small>@${esc(g.username)}</small>` : ''}</span><span class="v">${n(g.coins)} ${esc(L.coin)}</span></li>`).join('') || `<li class="no">${esc(L.none)}</li>`;
  const gifts = (s.giftTypes || []).map(t => { const pic = giftPic(t.name) || ''; return `<div class="g">${pic ? `<img src="${pic}" alt="">` : '<i>🎁</i>'}<b>${esc(t.name)}</b><small>×${n(t.count)} · ${n(t.coins)} ${esc(L.coin)}</small></div>`; }).join('') || `<p class="no">${esc(L.none)}</p>`;
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(L.title)} · @${esc(s.user)} · ${esc(stamp(s.start))}</title>
<style>
:root { --bg: #fff5f8; --card: #fff; --line: #f6d5e1; --ink: #3b2430; --muted: #8c6b7a; --pink: #ff4f8b; --soft: #ffe3ee; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1418; --card: #261c22; --line: #43303a; --ink: #f6e9ef; --muted: #b99aa8; --soft: #3a2630; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 "Prompt", "Leelawadee UI", "Segoe UI", system-ui, sans-serif; }
main { max-width: 920px; margin: 0 auto; padding: 28px 18px 40px; }
header { display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
header .logo { font-size: 38px; }
h1 { margin: 0; font-size: 26px; }
.sub { color: var(--muted); margin: 0 0 18px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 22px; }
.t { background: var(--card); border: 2px solid var(--line); border-radius: 16px; padding: 12px 14px; }
.t b { display: block; font-size: 24px; }
.t small { color: var(--muted); }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }
section { background: var(--card); border: 2px solid var(--line); border-radius: 18px; padding: 16px; }
h2 { margin: 0 0 12px; font-size: 18px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 12px; background: var(--bg); }
li .rk { width: 28px; text-align: center; font-weight: 700; }
li img, li i { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: var(--soft); flex: none; }
li .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li .nm small { color: var(--muted); }
li .v { font-weight: 600; white-space: nowrap; }
.gifts { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
.g { text-align: center; background: var(--bg); border-radius: 14px; padding: 10px 6px; display: grid; gap: 2px; }
.g img { width: 46px; height: 46px; object-fit: contain; margin: 0 auto; }
.g i { font-size: 34px; font-style: normal; }
.g small { color: var(--muted); font-size: 12px; }
.no { color: var(--muted); }
footer { text-align: center; color: var(--muted); font-size: 12px; margin-top: 26px; }
</style></head>
<body><main>
<header><span class="logo">📊</span><div><h1>${esc(L.title)} · @${esc(s.user)}</h1></div></header>
<p class="sub">${esc(when)} · ${esc(L.dur)} ${esc(dur)}</p>
<div class="tiles">${tile(n(s.coins), L.coins)}${tile(n(s.gifts), L.gifts)}${tile(n(s.giverCount), L.givers)}${tile(n(s.likes), L.likes)}${tile(n(s.follows), L.follows)}${tile(n(s.shares), L.shares)}${tile(n(s.chats), L.chats)}${tile(n(s.peak), L.peak)}</div>
<div class="cols">
<section><h2>${esc(L.top)}</h2><ul>${givers}</ul></section>
<section><h2>${esc(L.got)}</h2><div class="gifts">${gifts}</div></section>
</div>
<footer>${esc(L.made)}</footer>
</main></body></html>`;
}

// ---------- the folder ----------
let docsDir = path.join(os.homedir(), 'Documents');
// Windows may move "Documents" (e.g. into OneDrive): ask Windows where it really is.
export function findDocuments() {
  if (process.platform !== 'win32') return;
  exec('powershell -NoProfile -NonInteractive -Command "[Environment]::GetFolderPath(\'MyDocuments\')"', { windowsHide: true, encoding: 'utf8' }, (err, out) => {
    const p = String(out || '').trim();
    if (!err && p && fs.existsSync(p)) docsDir = p;
  });
}
export function summaryDir(custom) {
  const c = String(custom || '').trim();
  return c || path.join(docsDir, 'KuminBonk สรุปไลฟ์');
}
export function listReports(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.html'))
      .map(f => { const st = fs.statSync(path.join(dir, f)); return { name: f, time: st.mtimeMs, size: st.size }; })
      .sort((a, b) => b.name.localeCompare(a.name)).slice(0, 300);
  } catch { return []; }
}
// Open a folder or a file with Windows (a file opens in the web browser)
export function openPath(p) {
  if (process.platform === 'win32') spawn('explorer.exe', [p], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  else if (process.platform === 'darwin') spawn('open', [p], { detached: true, stdio: 'ignore' }).unref();
  else { try { spawn('xdg-open', [p], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch {} }
}
