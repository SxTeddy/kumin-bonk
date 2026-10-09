// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// KuminBonk dashboard
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let config = null;
let vtsLists = { hotkeys: [], expressions: [], items: [] };
let seenGifts = [];
let catalog = []; // Thai gift list {coins, th, en, img, style}
let anchors = {}; // style -> where it lands relative to the head
let styles = {};  // effect style id -> Thai description
let catDefault = { enabled: true, size: 1, power: 1, speed: 1, max: 30, sound: 'auto', as: 'same' };

// ---------- socket ----------
let ws;
function send(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); }
function connect() {
  ws = new WebSocket(`ws://${location.host}/ws?role=dashboard`);
  ws.onopen = () => { if (restartingNow) return location.reload(); send({ t: 'vtsLists' }); }; // after an update restart: load the new version's page
  ws.onclose = () => { if (restartingNow) return setTimeout(connect, 1500); setPill('pTik', 'bad', 'TikTok'); setPill('pVts', 'bad', 'VTube Studio'); toast('โปรแกรมปิดอยู่ — เปิด KuminBonk แล้วรีเฟรชหน้านี้'); setTimeout(connect, 2000); };
  ws.onmessage = e => handle(JSON.parse(e.data));
}

function handle(m) {
  switch (m.t) {
    case 'state':
      config = m.config; seenGifts = m.gifts || []; if (m.catalog) catalog = m.catalog; if (m.styles) styles = m.styles; if (m.catDefault) catDefault = m.catDefault; if (m.anchors) anchors = m.anchors;
      (m.logs || []).forEach(addLog);
      if (config.theme && config.theme !== curTheme()) applyTheme(config.theme);
      renderAll();
      hideSplash();
      if (m.justUpdated) setTimeout(() => showWhatsNew(m.justUpdated), 800);
      else if (m.firstRun) setTimeout(showWelcome, 800);
      break;
    case 'status': renderStatus(m); break;
    case 'log': addLog(m); break;
    case 'event': addFeed(m); if (m.ev.type === 'chat') readChat(m.ev.user?.nickname || m.ev.user?.username, m.ev.user?.username, m.ev.text); if (m.ev.type === 'gift' && !seenGifts.some(g => g.name === m.ev.gift.name)) { seenGifts.push(m.ev.gift); fillGiftList(); } break;
    case 'fired': break;
    case 'vtsLists': vtsLists = m; if (config) renderRules(); break;
    case 'tts': speak(m.text); break;
    case 'sound': if (soundOn) KBSound.play(m.sound, m.volume); break;
    case 'saved': flashSaved(); break;
    case 'update': renderUpdate(m); break;
    case 'restarting': if (!restartingNow) { restartingNow = true; showSplash('กำลังเปลี่ยนชุดใหม่ ✨', 'รอแป๊บนึงนะ เดี๋ยวกลับมา~'); } $('#updBar').hidden = true; break;
  }
}

// ---------- status ----------
function setPill(id, cls, text) { const p = $('#' + id); p.className = 'pill ' + cls; p.lastChild.textContent = text; }
let lastVts = '';
function renderStatus(s) {
  const t = s.tiktok;
  setPill('pTik', t.status === 'live' ? 'ok' : t.status === 'connecting' ? 'wait' : t.status === 'error' ? 'bad' : '', t.status === 'live' ? `TikTok @${t.username}` : 'TikTok');
  $('#tikDetail').textContent = { live: `✅ เชื่อมต่อไลฟ์ @${t.username} แล้ว`, connecting: `กำลังเชื่อมต่อ… ${t.detail}`, error: `❌ ${t.detail}`, offline: t.detail || 'ต้องเปิดไลฟ์ก่อน แล้วค่อยกดเชื่อมต่อ' }[t.status] || '';
  const v = s.vts;
  setPill('pVts', v.status === 'ready' ? 'ok' : v.status === 'waiting-permission' ? 'wait' : 'bad', v.status === 'ready' ? `VTS${v.model ? ' · ' + v.model : ''}` : v.status === 'waiting-permission' ? 'VTS: กด Allow' : 'VTube Studio');
  $('#ckVts').classList.toggle('done', v.status === 'ready');
  if (v.status === 'ready' && lastVts !== 'ready' + v.model) send({ t: 'vtsLists' });
  lastVts = v.status + v.model;
  setPill('pObs', 'ok', `Overlay (${s.overlays})`); $('#pObs').style.display = s.overlays > 0 ? '' : 'none';
  $('#ckPerm').classList.toggle('done', !!v.images);

  const st = s.stats || {};
  $('#stats').innerHTML = `<span>🎁 <b>${st.gifts || 0}</b></span><span>💎 <b>${st.diamonds || 0}</b></span><span>❤️ <b>${st.likes || 0}</b></span><span>➕ <b>${st.follows || 0}</b></span>${s.viewers ? `<span>👀 <b>${s.viewers}</b></span>` : ''}`;
}

// ---------- auto-update ----------
// cute bits shared by the splash screen, the update card and the "updated!" card
// ---------- themes ----------
const THEMES = {
  pink:     { name: '🌸 ชมพูพาสเทล', note: 'น่ารักสดใส หัวใจลอยฟุ้ง (ค่าเริ่มต้น)', bg: '#fff6f9', card: '#fff', accent: '#ff4f8b', floaties: ['heart', 'rose', 'star', 'heart', 'note'] },
  cloud:    { name: '☁️ ขาวคลาวด์', note: 'ขาวสะอาดตา มินิมอล การ์ดลอยนุ่ม ๆ', bg: '#f6f6fa', card: '#fff', accent: '#7c6cf2', floaties: ['sparkle', 'star', 'petal', 'sparkle'] },
  midnight: { name: '🌙 ดำมิดไนท์', note: 'ดำสนิท ไฟนีออนชมพูเรืองแสง มีดาวระยิบ', bg: '#0c0b10', card: '#15131c', accent: '#ff3d8b', floaties: ['star', 'sparkle', 'zap', 'star'] },
  ocean:    { name: '🌊 น้ำเงินทะเลลึก', note: 'น้ำเงินเข้มใต้ทะเล แสงฟ้า ฟองอากาศลอยขึ้น', bg: '#07142b', card: '#0e2142', accent: '#38d6ff', bubbles: true },
};
const curTheme = () => THEMES[document.documentElement.dataset.theme] ? document.documentElement.dataset.theme : 'pink';
function fillFloaties() {
  const box = $('#splash .floaties'); if (!box) return;
  box.innerHTML = '';
  const t = THEMES[curTheme()];
  for (let i = 0; i < 14; i++) {
    let el;
    if (t.bubbles) { el = document.createElement('span'); el.className = 'bub'; const d = 10 + Math.random() * 26; el.style.width = el.style.height = d + 'px'; }
    else { el = document.createElement('img'); el.src = `/assets/${t.floaties[i % t.floaties.length]}.svg`; el.alt = ''; el.style.width = (18 + Math.random() * 18) + 'px'; }
    el.style.left = (4 + Math.random() * 92) + '%';
    el.style.animationDuration = (5 + Math.random() * 5) + 's'; el.style.animationDelay = (-Math.random() * 8) + 's';
    box.appendChild(el);
  }
}
function fillBubbles() {
  const box = $('#bubbles'); box.innerHTML = '';
  if (!THEMES[curTheme()].bubbles) return;
  for (let i = 0; i < 16; i++) {
    const b = document.createElement('i'); const d = 6 + Math.random() * 20;
    b.style.width = b.style.height = d + 'px'; b.style.left = Math.random() * 100 + '%';
    b.style.animationDuration = (12 + Math.random() * 14) + 's'; b.style.animationDelay = (-Math.random() * 20) + 's';
    box.appendChild(b);
  }
}
function applyTheme(t, persist = false) {
  if (!THEMES[t]) t = 'pink';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('kbTheme', t); } catch {}
  fillFloaties(); fillBubbles(); renderThemes();
  if (persist && config) { config.theme = t; save(); }
}
function renderThemes() {
  const box = $('#themes'); if (!box) return;
  box.innerHTML = Object.entries(THEMES).map(([k, t]) => `<button class="theme ${k === curTheme() ? 'on' : ''}" data-theme="${k}">
    <div class="pv" style="background:${t.bg}"><i style="background:${t.card}"></i><u style="background:${t.accent}"></u><s style="background:${t.accent};opacity:.5"></s></div>
    <b>${t.name}</b><small>${t.note}</small></button>`).join('');
  box.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { applyTheme(b.dataset.theme, true); toast('เปลี่ยนธีมเป็น ' + THEMES[b.dataset.theme].name + ' แล้ว'); });
}
applyTheme(curTheme());
let splashT0 = Date.now(), restartingNow = false;
setTimeout(() => { if (!$('#splash').classList.contains('gone') && !restartingNow) $('#splashSub').textContent = 'ยังเชื่อมกับโปรแกรมไม่ได้… ถ้านานเกินไป ลองปิดแล้วเปิด KuminBonk ใหม่นะ'; }, 10000);
function showSplash(title, sub) { $('#splashTitle').textContent = title; $('#splashSub').textContent = sub; $('#splash').classList.remove('gone'); }
function hideSplash() { if (restartingNow) return; setTimeout(() => $('#splash').classList.add('gone'), Math.max(0, 700 - (Date.now() - splashT0))); }
function confetti(box, n = 80) {
  const colors = ['#ff4f8b', '#ffb3cd', '#ffd23f', '#7ad7f0', '#9b8cff', '#2fbf8f'];
  box.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.style.left = Math.random() * 100 + '%'; c.style.background = colors[i % colors.length];
    c.style.animationDuration = (2.2 + Math.random() * 2.5) + 's'; c.style.animationDelay = (Math.random() * 1.2) + 's';
    c.style.transform = `rotate(${Math.random() * 360}deg)`; box.appendChild(c);
  }
}
function mdLine(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
async function showWhatsNew(ver) {
  let notes = [];
  try { const w = await (await fetch('/whatsnew.json', { cache: 'no-store' })).json(); if (!ver || w.version === ver) notes = String(w.notes || '').split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean); } catch {}
  $('#yayTitle').textContent = `อัปเดตเป็น v${ver} แล้ว! 🎉`; $('#yaySub').textContent = 'มีอะไรใหม่บ้าง'; $('#btnYay').textContent = 'เย้! ไปกันเลย ✨'; $('#yayNotes').className = '';
  $('#yayNotes').innerHTML = notes.length ? notes.map(n => `<li>${mdLine(n)}</li>`).join('') : '<li>แก้ไขและปรับปรุงให้ดีขึ้น 💖</li>';
  $('#yay').hidden = false; confetti($('#yay .confetti'));
  try { KBSound.play?.('fanfare'); } catch {}
}
$('#btnYay').onclick = () => { $('#yay').hidden = true; };
// first time ever: a welcome card with the 3 things to do
function showWelcome() {
  $('#yayTitle').textContent = 'ยินดีต้อนรับสู่ KuminBonk! 💖';
  $('#yaySub').textContent = 'เริ่มใช้ได้ใน 3 ขั้นตอน';
  $('#yayNotes').className = 'steps';
  $('#yayNotes').innerHTML = [
    '<b>เปิด VTube Studio</b> → ตั้งค่า (ฟันเฟือง) → เปิด <b>Start API</b> แล้วกด <b>Allow</b> 2 ครั้ง',
    'แท็บ <b>🎯 เล็งหัว</b> → ลากเป้าให้ตรงหัวตัวละคร → บันทึก',
    'หน้าหลัก → ใส่ชื่อ TikTok → <b>เชื่อมต่อ</b> (เปิดไลฟ์ใน TikTok LIVE Studio ก่อน)',
  ].map(t => `<li>${t}</li>`).join('');
  $('#btnYay').textContent = 'เริ่มกันเลย ✨';
  $('#yay').hidden = false; confetti($('#yay .confetti'), 60);
}
$('#yay').onclick = e => { if (e.target.id === 'yay') $('#yay').hidden = true; };

const DL_LINES = ['กำลังไปรับชุดใหม่มาให้~ 🧺', 'ห่อของขวัญอยู่นะ 🎁', 'อีกนิดเดียว ฮึบ! 💪', 'วิ่ง ๆ ๆ 🏃‍♀️💨', 'ใกล้แล้วว ✨'];
let dlLine = 0, dlTimer = null, updLater = false;
function renderUpdate(u) {
  const bar = $('#updBar'), btn = $('#btnRestart'), later = $('#btnLater'), prog = $('#updProg');
  $('#verInfo').textContent = `เวอร์ชัน ${u.current || ''}` + (u.status === 'off' ? ' · อัปเดตอัตโนมัติใช้ได้เมื่อติดตั้งด้วยตัวติดตั้ง' : u.status === 'uptodate' ? ' · ล่าสุดแล้ว ✓' : u.status === 'skipped' ? ` · ข้ามเวอร์ชัน ${u.latest} ไว้ (กดตรวจหาอัปเดตเพื่อลองอีกครั้ง)` : u.status === 'error' ? ` · ตรวจอัปเดตไม่ได้ (${u.detail || ''})` : '');
  const show = (title, text, { pct = null, busy = false, ready = false, err = false } = {}) => {
    bar.hidden = false; bar.classList.toggle('ready', ready); bar.classList.toggle('err', err);
    $('#updTitle').textContent = title; $('#updText').textContent = text;
    prog.hidden = pct === null && !busy; prog.classList.toggle('busy', busy);
    if (pct !== null) { $('#updFill').style.width = Math.max(4, pct * 100) + '%'; $('#updPct').textContent = Math.round(pct * 100) + '%'; } else $('#updPct').textContent = '';
    btn.hidden = later.hidden = !ready;
  };
  if (u.status !== 'downloading') { clearInterval(dlTimer); dlTimer = null; }
  if (u.status === 'downloading') {
    if (!dlTimer) dlTimer = setInterval(() => { dlLine++; if (!$('#updBar').hidden) $('#updText').textContent = DL_LINES[dlLine % DL_LINES.length]; }, 2500);
    show(`มีชุดใหม่ v${u.latest} มาแล้ว!`, DL_LINES[dlLine % DL_LINES.length], { pct: u.progress ?? 0 });
  } else if (u.status === 'verifying') show(`ขอลองใส่ชุดใหม่ v${u.latest} ดูก่อนนะ 👀`, 'ตรวจว่าพอดีไม่มีอะไรหลุด แล้วสำรองการตั้งค่าไว้ให้', { busy: true });
  else if (u.status === 'ready' && !updLater) show(`ชุดใหม่ v${u.latest} พร้อมแล้ว! ✨`, 'ตรวจผ่านแล้ว + สำรองการตั้งค่าไว้ให้แล้ว · ถ้ากำลังไลฟ์ กด "ไว้ทีหลัง" ได้ เปิดแอปครั้งหน้าจะเป็นชุดใหม่เอง', { ready: true });
  else if (u.status === 'error' && /ตรวจไม่ผ่าน/.test(u.detail || '')) show('ชุดใหม่ยังไม่พอดี เลยใช้ชุดเดิมไปก่อนนะ 🙏', u.detail || '', { err: true });
  else bar.hidden = true;
  const rb = $('#btnRollback'); rb.hidden = !u.previous; rb.textContent = `↩ ย้อนกลับเป็นเวอร์ชัน ${u.previous || ''}`;
  const bl = $('#backupList');
  bl.innerHTML = (u.backups || []).map(b => `<option value="${esc(b.id)}">${new Date(b.time).toLocaleString('th-TH')} · ${esc(b.label)} (v${esc(b.version)})</option>`).join('') || '<option value="">ยังไม่มีไฟล์สำรอง</option>';
}
$('#btnRestart').onclick = () => {
  restartingNow = true; $('#updBar').hidden = true;
  setTimeout(() => location.reload(), 30000); // safety net
  showSplash('กำลังเปลี่ยนชุดใหม่ ✨', 'รอแป๊บนึงนะ เดี๋ยวกลับมาเป็นชุดใหม่~');
  setTimeout(() => send({ t: 'restartForUpdate' }), 1400);
};
$('#btnLater').onclick = () => { updLater = true; $('#updBar').hidden = true; toast('โอเค~ เปิดแอปครั้งหน้าจะเป็นชุดใหม่เองนะ 💖'); };
$('#btnRollback').onclick = () => { if (confirm('ย้อนกลับไปเวอร์ชันก่อนหน้า? (สำรองการตั้งค่าไว้ให้ก่อน)')) send({ t: 'rollback' }); };
$('#btnBackup').onclick = () => send({ t: 'backupNow' });
$('#btnRestore').onclick = () => { const id = $('#backupList').value; if (id && confirm('กู้คืนการตั้งค่าชุดนี้? (การตั้งค่าตอนนี้จะถูกสำรองไว้ก่อน)')) send({ t: 'restoreBackup', id }); };
$('#btnCheckUpd').onclick = () => { send({ t: 'checkUpdate' }); $('#verInfo').textContent += ' · กำลังตรวจ…'; };

// ---------- feed & log ----------
function evText(ev) {
  switch (ev.type) {
    case 'gift': return `ส่ง <b>${esc(ev.gift.th || ev.gift.name)}</b>${ev.gift.th && ev.gift.th !== ev.gift.name ? ` <small>(${esc(ev.gift.name)})</small>` : ''} ×${ev.count}${ev.gift.diamonds ? ` <small>· ${ev.gift.diamonds} เหรียญ</small>` : ''}`;
    case 'like': return `กดไลค์ ×${ev.count}`;
    case 'follow': return 'ฟอลโลว์แล้ว';
    case 'share': return 'แชร์ไลฟ์';
    case 'join': return 'เข้ามาในไลฟ์';
    case 'chat': return `: ${esc(ev.text)}`;
  }
  return ev.type;
}
function addFeed(m) {
  const ev = m.ev;
  if (ev.type === 'join' && !m.fired.length) return; // too noisy
  if (ev.type === 'like' && !m.fired.length && Math.random() < 0.7) return;
  const ul = $('#feed');
  ul.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  const gpic = ev.type === 'gift' ? catalog.find(c => c.th === ev.gift.th || c.en === ev.gift.name) : null;
  li.innerHTML = `${gpic ? `<img class="gp" src="/gifts/${gpic.img}.png" alt="">` : ev.user?.avatar ? `<img src="${esc(ev.user.avatar)}" alt="">` : '<img alt="">'}<span><b>${esc(ev.user?.nickname)}</b> ${evText(ev)} ${m.simulated ? '<span class="sim">ทดสอบ</span>' : ''}</span>${m.fired.length ? `<span class="fired">${m.fired.map(esc).join('<br>')}</span>` : ''}`;
  ul.prepend(li);
  while (ul.children.length > 80) ul.lastChild.remove();
}
function addLog(m) {
  const li = document.createElement('li');
  if (m.level === 'warn') li.className = 'warn';
  li.innerHTML = `<time>${new Date(m.time).toLocaleTimeString('th-TH')}</time> ${esc(m.msg)}`;
  $('#log').prepend(li);
  while ($('#log').children.length > 150) $('#log').lastChild.remove();
}

// ---------- tabs ----------
$$('#tabs button').forEach(b => b.onclick = () => {
  $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === b.dataset.tab));
  if (b.dataset.tab === 'aim') { renderAimFor(); showMarker(); }
  else if (aimShown) { send({ t: 'calibDone' }); }
  aimShown = b.dataset.tab === 'aim';
});
let aimShown = false;

// ---------- save ----------
let saveTimer;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => send({ t: 'saveConfig', config }), 400); }
function flashSaved() { const n = $('#savedNote'); n.classList.add('show'); clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('show'), 1200); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2500); }

// ---------- render ----------
function renderAll() {
  renderChat();
  $('#tUser').value = config.tiktokUsername || '';
  $('#autoConnect').checked = !!config.autoConnect;
  $('#obsUrl').value = `${location.origin}/overlay`;
  $('#optKey').value = config.eulerApiKey || '';
  $('#optVtsPort').value = config.vtsPort || 8001;
  $('#optSound').checked = config.throwing.sound;
  $('#optTarget').value = config.throwing.target || 'vts';
  $('#optEyes').checked = config.throwing.eyesClose;
  $('#followModel').checked = config.head.followModel;
  renderSliders(); renderRules(); fillGiftList(); renderAimFor(); renderGallery(); renderCats();
}

function fillGiftList() {
  const names = [...new Set([...catalog.map(g => g.th), ...seenGifts.map(g => g.name)])];
  $('#giftNames').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}

// ---------- rules editor ----------
const TRIGGERS = {
  gift: 'ได้รับของขวัญ', follow: 'มีคนฟอลโลว์', share: 'มีคนแชร์ไลฟ์', like: 'ไลค์ครบจำนวน', chat: 'มีคนพิมพ์แชต', join: 'มีคนเข้าไลฟ์',
};
const IMAGES = { gift: 'รูปของขวัญนั้น', avatar: 'รูปโปรไฟล์คนส่ง', rose: '🌹 กุหลาบ', heart: '❤️ หัวใจ', star: '⭐ ดาว', hammer: '🔨 ค้อนของเล่น', donut: '🍩 โดนัท', slipper: '🩴 รองเท้าแตะ' };
const SOUNDS = { bonk: 'ป๊อก!', pop: 'ป๊อป', boing: 'ดึ๋ง', ding: 'ติ๊ง', fanfare: 'แตร', none: 'ไม่มีเสียง' };
const MOVES = { jump: 'กระโดด', shake: 'สั่น', spin: 'หมุนตัว', zoom: 'ซูมเข้า', squash: 'ยุบตัว', wobble: 'โยกไปมา' };
const FROM = { random: 'สุ่ม', left: 'ซ้าย', right: 'ขวา', top: 'ตกจากบน', bottom: 'ล่าง' };

const ACTIONS = {
  giftfx: { label: '🎭 ท่าตามของขวัญ', def: { style: 'auto', power: 1 }, fields: [['style', 'ท่า', 'select', () => ({ auto: 'อัตโนมัติ (ตามรูปของขวัญ)', ...styles })], ['power', 'ความแรง', 'number', null, false, 0.1]] },
  throw: { label: '🎯 ปาของใส่', def: { image: 'gift', amount: 'count', multiply: 1, max: 30, from: 'random', flinch: true, sound: 'bonk', strength: 1 }, fields: [
    ['image', 'ของที่ปา', 'select', () => IMAGES, true],
    ['amount', 'จำนวน', 'amount'],
    ['max', 'สูงสุดต่อครั้ง', 'number'],
    ['from', 'มาจาก', 'select', () => FROM],
    ['sound', 'เสียง', 'select', () => SOUNDS],
    ['strength', 'แรงสะดุ้ง', 'number', null, false, 0.1],
    ['flinch', 'โดนแล้วสะดุ้ง', 'check'],
  ] },
  flinch: { label: '💥 สะดุ้งเหมือนโดนตี', def: { strength: 1 }, fields: [['strength', 'แรง', 'number', null, false, 0.1]] },
  move: { label: '🕺 ขยับโมเดล', def: { kind: 'jump', power: 1 }, fields: [['kind', 'ท่า', 'select', () => MOVES], ['power', 'แรง', 'number', null, false, 0.1]] },
  hotkey: { label: '⌨️ กดคีย์ลัด VTS', def: { hotkeyId: '', name: '' }, fields: [['hotkeyId', 'คีย์ลัด', 'hotkey']] },
  expression: { label: '😳 เปลี่ยนสีหน้า', def: { file: '', seconds: 3 }, fields: [['file', 'Expression', 'expression'], ['seconds', 'นาน (วิ)', 'number']] },
  tint: { label: '🎨 เปลี่ยนสีตัว', def: { color: '#ff8fb8', seconds: 2 }, fields: [['color', 'สี', 'color'], ['seconds', 'นาน (วิ)', 'number']] },
  item: { label: '🎀 ใส่ไอเท็ม VTS', def: { file: '', size: 0.3, seconds: 5 }, fields: [['file', 'ไอเท็ม', 'item'], ['size', 'ขนาด', 'number', null, false, 0.05], ['seconds', 'นาน (วิ)', 'number']] },
  alert: { label: '💬 ข้อความบนจอ', def: { text: '{name} ส่ง {gift} x{count}!', seconds: 4 }, fields: [['text', 'ข้อความ ({name} {gift} {count} {text})', 'text'], ['seconds', 'นาน (วิ)', 'number']] },
  sound: { label: '🔊 เล่นเสียง', def: { sound: 'ding' }, fields: [['sound', 'เสียง', 'select', () => SOUNDS]] },
  tts: { label: '🗣️ อ่านออกเสียง', def: { text: '{name} บอกว่า {text}' }, fields: [['text', 'ข้อความ', 'text']] },
  wait: { label: '⏳ รอ', def: { ms: 500 }, fields: [['ms', 'มิลลิวินาที', 'number']] },
};

function renderRules() {
  const list = $('#ruleList');
  list.innerHTML = '';
  config.rules.forEach((r, i) => list.appendChild(ruleCard(r, i)));
}

function ruleCard(r, idx) {
  const el = document.createElement('div');
  el.className = 'rule' + (r.enabled ? '' : ' off');
  el.innerHTML = `
    <div class="rule-head">
      <label class="switch" title="เปิด/ปิด"><input type="checkbox" ${r.enabled ? 'checked' : ''}><span></span></label>
      <input class="name" value="${esc(r.name)}">
      <button class="small" data-op="run">▶ ทดสอบ</button>
      <button class="small" data-op="up" title="เลื่อนขึ้น">↑</button>
      <button class="small" data-op="dup">ทำสำเนา</button>
      <button class="small danger" data-op="del">ลบ</button>
    </div>
    <div class="rule-body"><div class="when"><div class="tag">เมื่อ</div></div><div class="then"><div class="tag">ให้ทำ</div><div class="acts"></div><select class="add"><option value="">+ เพิ่มการกระทำ…</option>${Object.entries(ACTIONS).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join('')}</select></div></div>`;
  el.querySelector('.switch input').onchange = e => { r.enabled = e.target.checked; el.classList.toggle('off', !r.enabled); save(); };
  el.querySelector('.name').oninput = e => { r.name = e.target.value; save(); };
  el.querySelector('[data-op=run]').onclick = () => send({ t: 'runRule', id: r.id });
  el.querySelector('[data-op=up]').onclick = () => { if (idx > 0) { config.rules.splice(idx - 1, 0, config.rules.splice(idx, 1)[0]); renderRules(); save(); } };
  el.querySelector('[data-op=dup]').onclick = () => { config.rules.splice(idx + 1, 0, { ...structuredClone(r), id: 'r' + Date.now(), name: r.name + ' (สำเนา)' }); renderRules(); save(); };
  el.querySelector('[data-op=del]').onclick = () => { if (confirm(`ลบกฎ "${r.name}" ?`)) { config.rules.splice(idx, 1); renderRules(); save(); } };
  renderTrigger(el.querySelector('.when'), r);
  const acts = el.querySelector('.acts');
  const drawActs = () => { acts.innerHTML = ''; r.actions.forEach((a, i) => acts.appendChild(actionRow(r, a, i, drawActs))); };
  drawActs();
  el.querySelector('.add').onchange = e => {
    const k = e.target.value; if (!k) return;
    r.actions.push({ type: k, ...structuredClone(ACTIONS[k].def) }); e.target.value = ''; drawActs(); save();
  };
  return el;
}

function renderTrigger(box, r) {
  const t = r.trigger;
  const sel = document.createElement('select');
  sel.innerHTML = Object.entries(TRIGGERS).map(([k, v]) => `<option value="${k}" ${t.type === k ? 'selected' : ''}>${v}</option>`).join('');
  sel.onchange = () => { r.trigger = { type: sel.value, ...(sel.value === 'gift' ? { gifts: 'Rose', minDiamonds: 0 } : sel.value === 'like' ? { every: 100 } : sel.value === 'chat' ? { match: '!bonk' } : {}) }; renderTrigger(box, r); save(); };
  box.querySelectorAll(':scope > :not(.tag)').forEach(n => n.remove());
  box.appendChild(sel);
  const add = (html, bind) => { const d = document.createElement('div'); d.innerHTML = html; box.appendChild(d); bind?.(d); };
  if (t.type === 'gift') {
    add(`<label>ของขวัญ (เว้นว่าง หรือ * = ทุกชิ้นในช่วงราคา)</label><div class="chips"></div><div class="row"><button class="small primary pick">🎁 เลือกของขวัญ</button><input class="giftText" list="giftNames" placeholder="หรือพิมพ์ชื่อ คั่นด้วย ,"></div>`, d => {
      const chips = d.querySelector('.chips'), txt = d.querySelector('.giftText');
      const list = () => String(t.gifts || '').split(',').map(x => x.trim()).filter(x => x && x !== '*');
      const setList = arr => { t.gifts = arr.length ? arr.join(', ') : '*'; draw(); save(); };
      const draw = () => {
        const arr = list();
        chips.innerHTML = arr.length ? arr.map(n => { const g = catalog.find(c => c.th === n); return `<span class="chip">${g ? `<img src="/gifts/${g.img}.png" alt="">` : ''}${esc(n)}${g ? ` <small>${g.coins}</small>` : ''}<b data-x="${esc(n)}">✕</b></span>`; }).join('') : '<span class="chip all">ทุกของขวัญ</span>';
        chips.querySelectorAll('[data-x]').forEach(b => b.onclick = () => setList(list().filter(n => n !== b.dataset.x)));
      };
      draw();
      d.querySelector('.pick').onclick = () => openPicker(list(), setList);
      txt.onchange = () => { const add = txt.value.split(',').map(x => x.trim()).filter(Boolean); txt.value = ''; setList([...new Set([...list(), ...add])]); };
    });
    add(`<label>ราคาต่อชิ้น (เหรียญ)</label><div class="row range"><input type="number" min="0" value="${Number(t.minDiamonds) || 0}"><span>ถึง</span><input type="number" min="0" value="${Number(t.maxDiamonds) || 0}"></div><small class="hint">0 ช่องขวา = ไม่จำกัด</small>`, d => {
      const [a, b] = d.querySelectorAll('input');
      a.oninput = e => { t.minDiamonds = Number(e.target.value) || 0; save(); };
      b.oninput = e => { t.maxDiamonds = Number(e.target.value) || 0; save(); };
    });
    add(`<label class="check"><input type="checkbox" ${t.fallback ? 'checked' : ''}> ข้ามกฎนี้ถ้ามีกฎที่เลือกของขวัญชิ้นนั้นไว้แล้ว</label>`, d => d.querySelector('input').onchange = e => { t.fallback = e.target.checked; save(); });
  } else if (t.type === 'like') {
    add(`<label>ทุก ๆ กี่ไลค์</label><input type="number" min="1" value="${Number(t.every) || 100}">`, d => d.querySelector('input').oninput = e => { t.every = Number(e.target.value) || 1; save(); });
  } else if (t.type === 'chat') {
    add(`<label>คำที่พิมพ์</label><input value="${esc(t.match)}">`, d => d.querySelector('input').oninput = e => { t.match = e.target.value; save(); });
    add(`<label>แบบ</label><select><option value="start" ${t.mode !== 'contains' ? 'selected' : ''}>ขึ้นต้นด้วยคำนี้</option><option value="contains" ${t.mode === 'contains' ? 'selected' : ''}>มีคำนี้อยู่ในข้อความ</option></select>`, d => d.querySelector('select').onchange = e => { t.mode = e.target.value; save(); });
  }
  add(`<label>พักระหว่างครั้ง (วินาที, 0 = ไม่พัก)</label><input type="number" min="0" value="${Number(r.cooldown) || 0}">`, d => d.querySelector('input').oninput = e => { r.cooldown = Number(e.target.value) || 0; save(); });
}

function actionRow(r, a, i, redraw) {
  const spec = ACTIONS[a.type];
  const row = document.createElement('div');
  row.className = 'act';
  if (!spec) { row.textContent = `ไม่รู้จัก: ${a.type}`; return row; }
  const head = document.createElement('div'); head.className = 'f';
  head.innerHTML = `<label>${i + 1}.</label><select class="typ">${Object.entries(ACTIONS).map(([k, s]) => `<option value="${k}" ${k === a.type ? 'selected' : ''}>${s.label}</option>`).join('')}</select>`;
  head.querySelector('select').onchange = e => { const k = e.target.value; r.actions[i] = { type: k, ...structuredClone(ACTIONS[k].def) }; redraw(); save(); };
  row.appendChild(head);
  for (const [key, label, kind, opts, allowCustom, step] of spec.fields) { if (a[key] === undefined) a[key] = spec.def[key]; row.appendChild(field(a, key, label, kind, opts, allowCustom, step)); }
  const ops = document.createElement('div'); ops.className = 'ops';
  ops.innerHTML = `<button class="small" title="ลองเฉพาะอันนี้">▶</button><button class="small" title="ขึ้น">↑</button><button class="small danger" title="ลบ">✕</button>`;
  const [bt, bu, bd] = ops.children;
  bt.onclick = () => send({ t: 'testAction', action: a });
  bu.onclick = () => { if (i > 0) { r.actions.splice(i - 1, 0, r.actions.splice(i, 1)[0]); redraw(); save(); } };
  bd.onclick = () => { r.actions.splice(i, 1); redraw(); save(); };
  row.appendChild(ops);
  return row;
}

function field(a, key, label, kind, opts, allowCustom, step) {
  const f = document.createElement('div'); f.className = 'f';
  const set = v => { a[key] = v; save(); };
  if (kind === 'check') {
    f.className = 'f check';
    f.innerHTML = `<input type="checkbox" ${a[key] ? 'checked' : ''}><span>${label}</span>`;
    f.querySelector('input').onchange = e => set(e.target.checked);
    return f;
  }
  f.innerHTML = `<label>${label}</label>`;
  let input;
  if (kind === 'select' || kind === 'hotkey' || kind === 'expression' || kind === 'item') {
    input = document.createElement('select');
    let o = {};
    if (kind === 'select') o = opts();
    if (kind === 'hotkey') vtsLists.hotkeys.forEach(h => o[h.id] = h.name);
    if (kind === 'expression') vtsLists.expressions.forEach(x => o[x.file] = x.name || x.file);
    if (kind === 'item') vtsLists.items.forEach(x => o[x] = x);
    const cur = a[key];
    if (cur && !(cur in o)) o[cur] = kind === 'hotkey' ? (a.name || cur) : kind === 'select' && allowCustom ? 'รูปจากลิงก์' : cur;
    if (kind !== 'select' && !Object.keys(o).length) o[''] = 'กด ↻ ดึงข้อมูลจาก VTS ก่อน';
    else if (kind !== 'select') o = { '': '— เลือก —', ...o };
    if (allowCustom) o.__url = 'รูปจากลิงก์…';
    input.innerHTML = Object.entries(o).map(([k, v]) => `<option value="${esc(k)}" ${k === String(cur) ? 'selected' : ''}>${esc(v)}</option>`).join('');
    input.onchange = e => {
      let v = e.target.value;
      if (v === '__url') { v = prompt('วางลิงก์รูป (png/gif/svg)', '') || cur; }
      if (kind === 'hotkey') a.name = vtsLists.hotkeys.find(h => h.id === v)?.name || '';
      set(v);
      if (v !== e.target.value) { const op = document.createElement('option'); op.value = v; op.textContent = 'รูปจากลิงก์'; op.selected = true; input.appendChild(op); }
    };
  } else if (kind === 'amount') {
    input = document.createElement('select');
    const cur = a[key];
    const vals = { count: 'ตามจำนวนที่ส่ง', 1: '1', 2: '2', 3: '3', 5: '5', 10: '10', 20: '20' };
    if (!(cur in vals)) vals[cur] = cur;
    input.innerHTML = Object.entries(vals).map(([k, v]) => `<option value="${k}" ${String(cur) === k ? 'selected' : ''}>${v}</option>`).join('');
    input.onchange = e => set(e.target.value === 'count' ? 'count' : Number(e.target.value));
  } else if (kind === 'color') {
    input = document.createElement('input'); input.type = 'color'; input.value = a[key] || '#ff8fb8';
    input.oninput = e => set(e.target.value);
  } else {
    input = document.createElement('input');
    input.type = kind === 'number' ? 'number' : 'text';
    if (step) input.step = step;
    input.value = a[key] ?? '';
    if (kind === 'text') f.classList.add('wide');
    input.oninput = e => set(kind === 'number' ? Number(e.target.value) : e.target.value);
  }
  f.appendChild(input);
  return f;
}

$('#btnAddRule').onclick = () => {
  config.rules.unshift({ id: 'r' + Date.now(), enabled: true, name: 'กฎใหม่', trigger: { type: 'gift', gifts: 'Rose', minDiamonds: 0 }, cooldown: 0, actions: [{ type: 'throw', ...structuredClone(ACTIONS.throw.def) }] });
  renderRules(); save();
};
$('#btnRefreshVts').onclick = () => { send({ t: 'vtsLists' }); toast('กำลังดึงคีย์ลัด/ท่าทาง/ไอเท็มจาก VTube Studio'); };
$('#btnResetRules').onclick = () => { if (confirm('คืนค่ากฎทั้งหมดเป็นค่าเริ่มต้น? กฎที่แก้ไว้จะหายหมด')) send({ t: 'resetRules' }); };

// ---------- gift picker ----------
function coinsOf(name) { const g = catalog.find(g => g.th === name || g.en === name); return g ? g.coins : 0; }
function openPicker(selected, onDone) {
  const sel = new Set(selected);
  const box = document.createElement('div'); box.className = 'modal';
  box.innerHTML = `<div class="sheet"><div class="sheet-head"><b>เลือกของขวัญ</b><input class="q" placeholder="ค้นหาชื่อ หรือพิมพ์ราคา เช่น 99"><button class="primary done">เสร็จ</button></div><div class="sheet-body"></div></div>`;
  document.body.appendChild(box);
  const body = box.querySelector('.sheet-body'), q = box.querySelector('.q');
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const seen = seenGifts.filter(g => !g.th && !catalog.some(c => c.en === g.name));
    const items = catalog.filter(g => !term || g.th.toLowerCase().includes(term) || g.en.toLowerCase().includes(term) || String(g.coins) === term);
    const groups = new Map();
    for (const g of items) { if (!groups.has(g.coins)) groups.set(g.coins, []); groups.get(g.coins).push(g); }
    let html = '';
    if (seen.length && !term) html += `<h4>ของขวัญที่เคยได้รับจริง (ชื่อจาก TikTok)</h4><div class="gchips">${seen.map(g => `<button class="g ${sel.has(g.name) ? 'on' : ''}" data-n="${esc(g.name)}">${g.image ? `<img src="${esc(g.image)}" alt="">` : ''}${esc(g.name)} <small>${g.diamonds || ''}</small></button>`).join('')}</div>`;
    for (const [coins, gs] of groups) html += `<h4>🪙 ${coins.toLocaleString()} เหรียญ</h4><div class="gchips">${gs.map(g => `<button class="g ${sel.has(g.th) ? 'on' : ''}" data-n="${esc(g.th)}" title="ท่า: ${esc(styles[g.style] || '')}"><img src="/gifts/${g.img}.png" alt="" loading="lazy">${esc(g.th)}</button>`).join('')}</div>`;
    body.innerHTML = html || '<p class="hint">ไม่เจอ ลองพิมพ์ชื่ออื่น</p>';
    body.querySelectorAll('.g').forEach(b => b.onclick = () => { const n = b.dataset.n; sel.has(n) ? sel.delete(n) : sel.add(n); b.classList.toggle('on'); });
  };
  draw();
  q.oninput = draw;
  const close = () => { onDone([...sel]); box.remove(); };
  box.querySelector('.done').onclick = close;
  box.onclick = e => { if (e.target === box) close(); };
  setTimeout(() => q.focus(), 50);
}

// ---------- home ----------
$('#btnConnect').onclick = () => send({ t: 'connectTikTok', username: $('#tUser').value });
$('#btnDisconnect').onclick = () => send({ t: 'disconnectTikTok' });
$('#tUser').onkeydown = e => { if (e.key === 'Enter') $('#btnConnect').click(); };
$('#autoConnect').onchange = e => { config.autoConnect = e.target.checked; save(); };
$('#btnCopy').onclick = () => { navigator.clipboard.writeText($('#obsUrl').value).then(() => toast('คัดลอกลิงก์แล้ว')); };

// ---------- test ----------
function simGift(name, count, diamonds) { send({ t: 'simulate', ev: { type: 'gift', user: { nickname: $('#sName').value }, gift: { id: '0', name, diamonds: Number(diamonds) || 1, image: seenGifts.find(g => g.name === name)?.image }, count: Math.max(1, Number(count) || 1) } }); }
$('#btnSimGift').onclick = () => simGift($('#sGift').value, $('#sCount').value, $('#sDiamonds').value);
$('#sGift').onchange = () => { const c = coinsOf($('#sGift').value.trim()); if (c) $('#sDiamonds').value = c; };
$$('[data-quick]').forEach(b => b.onclick = () => { const [n, c, d] = b.dataset.quick.split(','); simGift(n, c, d); });
$$('[data-sim]').forEach(b => b.onclick = () => {
  const type = b.dataset.sim;
  send({ t: 'simulate', ev: { type, user: { nickname: $('#sName').value }, count: type === 'like' ? 100 : 1 } });
});
$('#btnSimChat').onclick = () => send({ t: 'simulate', ev: { type: 'chat', user: { nickname: $('#sName').value }, text: $('#sChat').value } });
$('#sChat').onkeydown = e => { if (e.key === 'Enter') $('#btnSimChat').click(); };
$('#btnClear').onclick = () => send({ t: 'clearOverlay' });

// ---------- categories (per-category & per-gift effect settings) ----------
const FX_SOUNDS = { auto: 'ตามท่า', none: 'ปิดเสียง', bonk: 'ป๊อก!', pop: 'ป๊อป', boing: 'ดึ๋ง', ding: 'ติ๊ง', fanfare: 'แตร', crash: 'โครม', whoosh: 'วู้ม', zap: 'ซี้ด', cash: 'กริ๊ง', magic: 'วิ้ง', scream: 'กรี๊ด', munch: 'ง่ำ' };
function fxCfg() { config.fx ||= { showcaseMin: 1000, cats: {}, gifts: {} }; config.fx.cats ||= {}; config.fx.gifts ||= {}; return config.fx; }
function catOf(style) { return { ...catDefault, ...(fxCfg().cats[style] || {}) }; }
function setCat(style, k, v) { const c = fxCfg().cats; c[style] = { ...(c[style] || {}), [k]: v }; save(); }
function giftStyle(g) { return fxCfg().gifts[g.th]?.style || g.style; }
function renderCats() {
  const box = $('#catList'); if (!box || !catalog.length) return;
  $('#showcaseMin').value = String(fxCfg().showcaseMin ?? 1000);
  const groups = {};
  for (const g of catalog) (groups[giftStyle(g)] ||= []).push(g);
  box.innerHTML = '';
  for (const [st, label] of Object.entries(styles)) {
    const c = catOf(st), list = (groups[st] || []).sort((a, b) => a.coins - b.coins);
    const el = document.createElement('div'); el.className = 'cat' + (c.enabled ? '' : ' off');
    const slider = (k, lab, min, max, step, fmt = v => '×' + v) => `<div class="ctl"><span>${lab}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${c[k]}"><output>${fmt(c[k])}</output></div>`;
    el.innerHTML = `<div class="cat-head"><label class="switch"><input type="checkbox" ${c.enabled ? 'checked' : ''}><span></span></label><b>${esc(label)}</b><small>${list.length} ชิ้น</small><button class="small" data-aimcat title="ตั้งจุดที่ท่านี้ไปโดน เช่น ปาก คอ ตัว">🎯 เป้า${c.aim ? ' ✓' : ''}</button><button class="small" data-try>▶ ลอง</button></div>
      ${slider('size', 'ขนาดรูป', 0.4, 2.5, 0.1)}${slider('power', 'ความแรง', 0, 2, 0.1)}${slider('speed', 'ความเร็ว', 0.5, 2, 0.1)}${slider('max', 'สูงสุดต่อครั้ง', 1, 30, 1, v => v)}
      <div class="sel"><div><label>เสียง</label><select data-k="sound">${Object.entries(FX_SOUNDS).map(([k, v]) => `<option value="${k}" ${k === c.sound ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>ใช้ท่า</label><select data-k="as"><option value="same">ท่าของหมวดนี้</option>${Object.entries(styles).filter(([k]) => k !== st).map(([k, v]) => `<option value="${k}" ${k === c.as ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div></div>
      <div class="gifts">${list.map(g => `<button data-g="${esc(g.th)}" class="${fxCfg().gifts[g.th] ? 'own' : ''}" title="${esc(g.th)} · ${g.coins} เหรียญ"><img src="/gifts/${g.img}.png" alt="${esc(g.th)}" loading="lazy"></button>`).join('') || '<small class="hint">ยังไม่มีของขวัญในหมวดนี้</small>'}</div>`;
    el.querySelector('.switch input').onchange = e => { setCat(st, 'enabled', e.target.checked); el.classList.toggle('off', !e.target.checked); };
    el.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { const v = Number(r.value); r.nextElementSibling.textContent = r.dataset.k === 'max' ? v : '×' + v; setCat(st, r.dataset.k, v); });
    el.querySelectorAll('select').forEach(sel => sel.onchange = () => setCat(st, sel.dataset.k, sel.value));
    el.querySelector('[data-aimcat]').onclick = () => goAim('cat:' + st);
    el.querySelector('[data-try]').onclick = () => { const g = list[list.length - 1] || catalog.find(x => x.style === st); if (g) send({ t: 'previewStyle', gift: g.th, count: 1 }); };
    el.querySelectorAll('.gifts button').forEach(b => b.onclick = ev => openGiftPop(catalog.find(g => g.th === b.dataset.g), ev.currentTarget));
    box.appendChild(el);
  }
}
function openGiftPop(g, anchor) {
  const pop = $('#giftPop'), own = fxCfg().gifts[g.th] || {};
  pop.innerHTML = `<div class="ph"><img src="/gifts/${g.img}.png" alt=""><div><b>${esc(g.th)}</b><br><small class="hint">${g.coins.toLocaleString()} เหรียญ</small></div></div>
    <label>ท่าของชิ้นนี้</label><select id="popStyle">${Object.entries(styles).map(([k, v]) => `<option value="${k}" ${k === (own.style || g.style) ? 'selected' : ''}>${esc(v)}${k === g.style ? ' (เดิม)' : ''}</option>`).join('')}</select>
    <div class="ctl" style="display:grid;grid-template-columns:92px 1fr 46px;gap:8px;align-items:center"><span>ขนาดชิ้นนี้</span><input id="popSize" type="range" min="0.4" max="2.5" step="0.1" value="${own.size || 1}"><output>×${own.size || 1}</output></div>
    <div class="row"><button class="primary small" id="popTry">▶ ลอง</button><button class="small" id="popAim">🎯 เป้า${own.aim ? ' ✓' : ''}</button><button class="small" id="popReset">คืนค่าเดิม</button><button class="small" id="popClose">ปิด</button></div>`;
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(window.innerWidth - 296, Math.max(8, r.left - 120)) + 'px';
  pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 6) + 'px';
  const put = () => {
    const st = $('#popStyle').value, sz = Number($('#popSize').value);
    const o = {}; if (st !== g.style) o.style = st; if (sz !== 1) o.size = sz; if (fxCfg().gifts[g.th]?.aim) o.aim = fxCfg().gifts[g.th].aim;
    if (Object.keys(o).length) fxCfg().gifts[g.th] = o; else delete fxCfg().gifts[g.th];
    save();
  };
  $('#popStyle').onchange = () => { put(); renderCats(); };
  $('#popSize').oninput = e => { e.target.nextElementSibling.textContent = '×' + e.target.value; put(); };
  $('#popTry').onclick = () => send({ t: 'previewStyle', gift: g.th, count: 1 });
  $('#popAim').onclick = () => goAim('gift:' + g.th);
  $('#popReset').onclick = () => { delete fxCfg().gifts[g.th]; save(); pop.hidden = true; renderCats(); };
  $('#popClose').onclick = () => { pop.hidden = true; renderCats(); };
}
document.addEventListener('pointerdown', e => { const pop = $('#giftPop'); if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.gifts')) { pop.hidden = true; renderCats(); } });
$('#showcaseMin').onchange = e => { fxCfg().showcaseMin = Number(e.target.value); save(); };
$('#btnCatsReset').onclick = () => { if (confirm('คืนค่าการตั้งค่าทุกหมวดและทุกชิ้น?')) { config.fx = { showcaseMin: 1000, cats: {}, gifts: {} }; save(); renderCats(); } };

// ---------- effect gallery (test tab) ----------
function renderGallery() {
  const box = $('#fxGallery'); if (!box || !catalog.length) return;
  const byStyle = {};
  for (const g of catalog) (byStyle[giftStyle(g)] ||= []).push(g);
  box.innerHTML = Object.entries(styles).map(([k, label]) => {
    const list = byStyle[k] || [];
    return `<div class="fx"><b>${esc(label)}</b><div class="fxg">${list.slice(0, 40).map(g => `<button class="gi" data-g="${esc(g.th)}" title="${esc(g.th)} · ${g.coins} เหรียญ"><img src="/gifts/${g.img}.png" alt="${esc(g.th)}" loading="lazy"></button>`).join('')}</div></div>`;
  }).join('');
  box.querySelectorAll('.gi').forEach(b => b.onclick = () => send({ t: 'previewStyle', gift: b.dataset.g, count: Number($('#fxCount').value) || 1 }));
}

// ---------- aim ----------
// Target being edited: 'head' (main head point), 'cat:<style>' or 'gift:<thai name>'.
// Category/gift targets are stored as offsets from the head: fx.cats[style].aim / fx.gifts[name].aim = {dx, dy}
let aimFor = 'head';
const pad = $('#pad');
const cl01 = v => Math.max(0, Math.min(1, v));
const r3 = v => Math.round(v * 1000) / 1000;
function aimInfo() {
  // -> { style, store (object that holds .aim), base (head + anchor), off (current offset), own (true if set on this target) }
  config.fx = config.fx || {}; config.fx.cats = config.fx.cats || {}; config.fx.gifts = config.fx.gifts || {};
  if (aimFor.startsWith('cat:')) {
    const st = aimFor.slice(4);
    const store = config.fx.cats[st] || {};
    return { st, store, off: store.aim || { dx: 0, dy: 0 }, own: !!store.aim, make: () => (config.fx.cats[st] ||= {}) };
  }
  const name = aimFor.slice(5); const g = catalog.find(x => x.th === name);
  const st = g ? giftStyle(g) : 'bonk';
  const store = config.fx.gifts[name] || {};
  return { st, g, store, off: store.aim || config.fx.cats[st]?.aim || { dx: 0, dy: 0 }, own: !!store.aim, make: () => (config.fx.gifts[name] ||= {}) };
}
function aimPoint() {
  const h = config.head; if (aimFor === 'head') return { x: h.x, y: h.y };
  const i = aimInfo(); const a = anchors[i.st] || { dx: 0, dy: 0 };
  return { x: cl01(h.x + a.dx + i.off.dx), y: cl01(h.y + a.dy + i.off.dy) };
}
function placeDot() {
  const p = aimPoint(); const isHead = aimFor === 'head';
  $('#padDot').style.left = p.x * 100 + '%'; $('#padDot').style.top = p.y * 100 + '%';
  $('#padHead').hidden = isHead;
  $('#padHead').style.left = config.head.x * 100 + '%'; $('#padHead').style.top = config.head.y * 100 + '%';
  $('#aimPos').textContent = `ตำแหน่ง: ${Math.round(p.x * 1920)}, ${Math.round(p.y * 1080)} (จาก 1920×1080)` + (isHead ? '' : aimInfo().own ? ' · ตั้งเองแล้ว' : ' · ค่าเริ่มต้น');
}
function showMarker() {
  const p = aimPoint();
  send(aimFor === 'head' ? { t: 'calibHead', x: config.head.x, y: config.head.y } : { t: 'aimMarker', x: p.x, y: p.y });
}
function setAim(x, y) {
  x = cl01(x); y = cl01(y);
  if (aimFor === 'head') { config.head.x = x; config.head.y = y; }
  else {
    const i = aimInfo(); const a = anchors[i.st] || { dx: 0, dy: 0 };
    i.make().aim = { dx: r3(x - config.head.x - a.dx), dy: r3(y - config.head.y - a.dy) };
  }
  placeDot(); showMarker();
}
function aimLabel(v) {
  if (v === 'head') return '🎯 หัวตัวละคร (จุดหลัก)';
  if (v.startsWith('cat:')) return 'หมวด: ' + (styles[v.slice(4)] || v.slice(4));
  return 'ของขวัญ: ' + v.slice(5);
}
function renderAimFor() {
  const sel = $('#aimFor');
  const giftOpts = Object.entries(config.fx?.gifts || {}).filter(([, o]) => o.aim).map(([n]) => 'gift:' + n);
  if (aimFor.startsWith('gift:') && !giftOpts.includes(aimFor)) giftOpts.unshift(aimFor);
  sel.innerHTML = `<option value="head">${esc(aimLabel('head'))}</option>`
    + `<optgroup label="หมวดของขวัญ">${Object.keys(styles).map(k => `<option value="cat:${esc(k)}">${esc(styles[k])}${config.fx?.cats?.[k]?.aim ? ' ✓' : ''}</option>`).join('')}</optgroup>`
    + (giftOpts.length ? `<optgroup label="ของขวัญเฉพาะชิ้น">${giftOpts.map(v => `<option value="${esc(v)}">${esc(v.slice(5))}</option>`).join('')}</optgroup>` : '');
  sel.value = aimFor;
  $('#aimGiftList').innerHTML = catalog.map(g => `<option value="${esc(g.th)}">`).join('');
  const isHead = aimFor === 'head';
  $('#aimTitle').textContent = isHead ? 'เล็งหัวตัวละคร' : 'เป้า ' + aimLabel(aimFor);
  $('#aimHelp').innerHTML = isHead
    ? 'คลิกหรือลากในกรอบด้านล่าง ให้เป้าสีชมพูใน<b>หน้าต่าง VTube Studio</b> ไปอยู่ตรง<b>หัว</b>ตัวละคร แล้วกดบันทึก'
    : 'ลากเป้าไปตรงจุดที่อยากให้ของขวัญนี้ไปโดน (เช่น ปาก คอ ตัว) แล้วกดบันทึก · จุดจาง ๆ คือหัว';
  $('#btnAimReset').hidden = isHead || !aimInfo().own;
  $('#followWrap').hidden = !isHead;
  $('#btnTestAim').textContent = isHead ? '🌹 ปาทดสอบ 3 ดอก' : '▶ ลองท่านี้';
  const chip = (v, txt, done) => `<button data-aim="${esc(v)}" class="${v === aimFor ? 'on' : ''} ${done ? 'done' : ''}">${esc(txt)}${done ? ' ✓' : ''}</button>`;
  const giftsSet = Object.entries(config.fx?.gifts || {}).filter(([, o]) => o.aim).map(([n]) => n);
  $('#aimList').innerHTML = chip('head', '🎯 หัว (จุดหลัก)', false)
    + Object.keys(styles).map(k => chip('cat:' + k, styles[k], !!config.fx?.cats?.[k]?.aim)).join('')
    + (giftsSet.length ? '<div class="aimsub">ของขวัญที่ตั้งเฉพาะชิ้น</div>' + giftsSet.map(n => chip('gift:' + n, n, true)).join('') : '');
  $$('#aimList [data-aim]').forEach(b => b.onclick = () => pickAim(b.dataset.aim));
  placeDot();
}
function pickAim(v) {
  // drop empty override objects left behind by browsing
  for (const o of [config.fx?.gifts, config.fx?.cats]) for (const k in (o || {})) if (o[k] && !Object.keys(o[k]).length) delete o[k];
  aimFor = v; renderAimFor(); if (aimShown) showMarker();
}
$('#aimFor').onchange = e => pickAim(e.target.value);
function goAim(v) { $('#giftPop').hidden = true; aimFor = v; $('#tabs button[data-tab="aim"]').click(); window.scrollTo(0, 0); }
$('#aimGift').onchange = e => { const g = catalog.find(x => x.th === e.target.value.trim()); if (g) { pickAim('gift:' + g.th); e.target.value = ''; } else toast('ไม่พบของขวัญชื่อนี้'); };
let dragging = false;
const padMove = e => { const r = pad.getBoundingClientRect(); setAim((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
pad.onpointerdown = e => { dragging = true; pad.setPointerCapture(e.pointerId); padMove(e); };
pad.onpointermove = e => { if (dragging) padMove(e); };
pad.onpointerup = () => { dragging = false; };
const nudge = (dx, dy) => { const p = aimPoint(); setAim(p.x + dx * 0.005, p.y + dy * 0.009); };
$$('[data-n]').forEach(b => b.onclick = () => { const [dx, dy] = b.dataset.n.split(',').map(Number); nudge(dx, dy); });
document.addEventListener('keydown', e => {
  if (!$('#aim').classList.contains('on') || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (m) { e.preventDefault(); nudge(m[0], m[1]); }
});
$('#btnCalibSave').onclick = () => {
  if (aimFor === 'head') { send({ t: 'calibDone' }); save(); toast('บันทึกตำแหน่งหัวแล้ว'); setTimeout(showMarker, 300); return; }
  save(); renderAimFor(); renderCats(); toast('บันทึกเป้าของ ' + aimLabel(aimFor).replace(/^.*?: /, '') + ' แล้ว');
};
$('#btnAimReset').onclick = () => { const i = aimInfo(); delete i.store.aim; pickAim(aimFor); save(); renderCats(); showMarker(); toast('กลับไปใช้ค่าเริ่มต้นแล้ว'); };
$('#followModel').onchange = e => { config.head.followModel = e.target.checked; save(); };
$('#btnTestAim').onclick = () => {
  if (aimFor === 'head') return send({ t: 'testAction', action: { type: 'throw', image: 'rose', amount: 3, max: 3, from: 'random', flinch: true, sound: 'bonk' } });
  save();
  if (aimFor.startsWith('gift:')) return send({ t: 'previewStyle', gift: aimFor.slice(5), count: 1 });
  const st = aimFor.slice(4);
  const g = catalog.find(x => giftStyle(x) === st && !config.fx?.gifts?.[x.th]?.aim) || catalog.find(x => x.style === st);
  send(g ? { t: 'previewStyle', gift: g.th, count: 1 } : { t: 'previewStyle', style: st, count: 1 });
};

// ---------- settings ----------
const SLIDERS = [
  ['size', 'ขนาดของที่ปา (px)', 40, 220, 5],
  ['speed', 'ความเร็ว', 0.5, 2.5, 0.1],
  ['spin', 'การหมุน', 0, 3, 0.1],
  ['flinchStrength', 'แรงสะดุ้งรวม', 0, 2, 0.1],
  ['volume', 'ความดังเสียง', 0, 1, 0.05],
  ['stagger', 'ระยะห่างแต่ละชิ้น (ms)', 20, 400, 10],
  ['maxOnScreen', 'ของบนจอพร้อมกันสูงสุด', 5, 150, 5],
];
function renderSliders() {
  const box = $('#throwSliders'); box.innerHTML = '';
  for (const [k, label, min, max, step] of SLIDERS) {
    const d = document.createElement('div'); d.className = 'slider';
    d.innerHTML = `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${config.throwing[k]}"><output>${config.throwing[k]}</output>`;
    d.querySelector('input').oninput = e => { config.throwing[k] = Number(e.target.value); d.querySelector('output').textContent = e.target.value; save(); };
    box.appendChild(d);
  }
}
$('#optTarget').onchange = e => { config.throwing.target = e.target.value; save(); };
$('#optSound').onchange = e => { config.throwing.sound = e.target.checked; save(); };
$('#optEyes').onchange = e => { config.throwing.eyesClose = e.target.checked; save(); };
$('#optKey').onchange = e => { config.eulerApiKey = e.target.value.trim(); save(); };
$('#optVtsPort').onchange = e => { config.vtsPort = Number(e.target.value) || 8001; save(); };

// ---------- chat reader (TTS) ----------
const LANGS = { th: 'ไทย', en: 'อังกฤษ', ja: 'ญี่ปุ่น', zh: 'จีน', ko: 'เกาหลี', vi: 'เวียดนาม', id: 'อินโดนีเซีย', ms: 'มาเลย์', fil: 'ฟิลิปปินส์', lo: 'ลาว', km: 'เขมร', my: 'พม่า', hi: 'ฮินดี', ar: 'อาหรับ', ru: 'รัสเซีย', es: 'สเปน', pt: 'โปรตุเกส', fr: 'ฝรั่งเศส', de: 'เยอรมัน', it: 'อิตาลี', sv: 'สวีเดน' };
const STOP = {
  id: ['yang', 'dan', 'ini', 'itu', 'aku', 'kamu', 'tidak', 'apa', 'ada', 'sama', 'banget', 'kak', 'dong', 'nya'],
  ms: ['saya', 'awak', 'tak', 'boleh', 'lah', 'sangat', 'terima kasih'],
  fil: ['ang', 'ng', 'mga', 'po', 'salamat', 'ako', 'ikaw', 'naman', 'lang', 'sa'],
  es: ['que', 'el', 'la', 'los', 'hola', 'gracias', 'por', 'muy', 'es', 'como', 'pero', 'yo'],
  pt: ['você', 'obrigado', 'obrigada', 'não', 'muito', 'que', 'tudo', 'bem', 'eu'],
  fr: ['je', 'tu', 'est', 'les', 'bonjour', 'merci', 'pas', 'le', 'la', 'trop', 'c\'est'],
  de: ['ich', 'du', 'und', 'nicht', 'danke', 'ist', 'das', 'hallo', 'sehr'],
  it: ['ciao', 'grazie', 'sono', 'non', 'che', 'molto', 'bella'],
  sv: ['jag', 'du', 'och', 'inte', 'tack', 'hej', 'är', 'det', 'mycket'],
  en: ['the', 'you', 'is', 'are', 'i', 'and', 'hi', 'hello', 'love', 'thanks', 'what', 'so', 'my', 'this', 'lol'],
};
function detectLang(t) {
  if (/[฀-๿]/.test(t)) return 'th';
  if (/[぀-ヿ]/.test(t)) return 'ja';
  if (/[가-힯ᄀ-ᇿ]/.test(t)) return 'ko';
  if (/[一-鿿]/.test(t)) return 'zh';
  if (/[຀-໿]/.test(t)) return 'lo';
  if (/[ក-៿]/.test(t)) return 'km';
  if (/[က-႟]/.test(t)) return 'my';
  if (/[ऀ-ॿ]/.test(t)) return 'hi';
  if (/[؀-ۿ]/.test(t)) return 'ar';
  if (/[Ѐ-ӿ]/.test(t)) return 'ru';
  if (/[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t)) return 'vi';
  const words = t.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
  let best = 'en', score = 0;
  for (const [lg, list] of Object.entries(STOP)) { const n = words.filter(w => list.includes(w)).length; if (n > score) { score = n; best = lg; } }
  if (/[ñ¿¡]/.test(t)) return 'es';
  if (/[ãõç]/.test(t)) return 'pt';
  if (/[äöüß]/.test(t) && best !== 'sv') return 'de';
  if (/[åä]/.test(t)) return 'sv';
  return best;
}
let voices = [];
const ct = () => config?.chatTts || {};
const langOf = v => (v.lang || '').toLowerCase().replace('_', '-').split('-')[0].replace('tl', 'fil');
function voicesFor(lang) { return voices.filter(v => langOf(v) === lang); }
function voiceRank(v) { return (/natural|online|neural/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1); }
function bestVoice(lang) { return voicesFor(lang).sort((a, b) => voiceRank(b) - voiceRank(a))[0]; }
function mainVoice() { return voices.find(v => v.name === ct().voice) || bestVoice('th') || voices[0]; }
function voiceForLang(lang) { const n = ct().langVoices?.[lang]; return (n && voices.find(v => v.name === n)) || bestVoice(lang) || null; }
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; };

function loadVoices() {
  voices = speechSynthesis.getVoices();
  renderChatVoices();
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

// --- filters ---
const norm = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[\s​-‍﻿._\-*~|'"`!?,]+/g, '');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hasBanned(text) { const n = norm(text); return (ct().banned || []).find(w => w && n.includes(norm(w))); }
function cleanBanned(text, mode) {
  for (const w of ct().banned || []) {
    if (!w) continue;
    const re = new RegExp(escRe(w).split('').join('[\\s._\\-*~|]*'), 'giu');
    text = text.replace(re, mode === 'beep' ? ' ปี๊บ ' : ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}
function tidy(text) {
  const c = ct();
  if (c.laugh) {
    text = text.replace(/5{3,}\+*/g, ' ฮ่า ๆ ').replace(/(?:ha){3,}|(?:ฮ่า){3,}/gi, ' ฮ่า ๆ ').replace(/w{4,}/gi, ' ฮ่า ๆ ');
    text = text.replace(/(.)\1{3,}/gu, '$1$1$1');
  }
  return text.replace(/\s+/g, ' ').trim();
}
// returns { say: [{text, lang}], why } — why = reason it was skipped
const readWhat = () => ct().readWhat || (ct().readName === false ? 'text' : 'both');
function prepare(name, user, text) {
  const c = ct(), what = readWhat();
  const who = String(name || '');
  if ((c.blockedUsers || []).some(b => { const n = norm(b).replace(/^@/, ''); return n && (norm(who) === n || norm(user) === n); })) return { why: 'คนที่ไม่อ่าน' };
  if (what === 'name') {
    if (!who.trim()) return { why: 'ไม่มีชื่อ' };
    if (hasBanned(who)) return { why: 'ชื่อมีคำต้องห้าม' };
    const lang = detectLang(who);
    return { say: [{ text: tidy(who), lang, part: 'text' }], lang };
  }
  let t = String(text || '').trim();
  if (!t) return { why: 'ข้อความว่าง' };
  if (c.skipCommands && t.startsWith('!')) return { why: 'คำสั่ง !' };
  if (c.skipLinks && /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ly|gg|io|me|co|th)\b)/i.test(t)) return { why: 'มีลิงก์' };
  if (c.skipEmojiOnly && !/[\p{L}\p{N}]/u.test(t)) return { why: 'มีแต่อีโมจิ' };
  const bad = hasBanned(t) || hasBanned(who);
  if (bad) {
    if ((c.bannedMode || 'skip') === 'skip') return { why: 'คำต้องห้าม' };
    t = cleanBanned(t, c.bannedMode);
  }
  const nameSay = bad && hasBanned(who) ? '' : who;
  t = tidy(t);
  const max = Number(c.maxLen) || 120;
  if ([...t].length > max) t = [...t].slice(0, max).join('') + ' …';
  if (!t) return { why: 'ไม่เหลือข้อความ' };
  const lang = detectLang(t);
  const tpl = what === 'both' && nameSay ? (c.template || '{name} บอกว่า {text}') : '{text}';
  const [before, after = ''] = tpl.split('{text}');
  const say = [];
  const pre = before.replaceAll('{name}', nameSay).trim();
  if (pre) say.push({ text: pre, lang: detectLang(pre) === 'th' || /[฀-๿]/.test(tpl) ? 'th' : detectLang(pre), part: 'name' });
  say.push({ text: t, lang, part: 'text' });
  const post = after.replaceAll('{name}', nameSay).trim(); if (post) say.push({ text: post, lang: 'th', part: 'name' });
  return { say, lang };
}

// --- queue ---
const ctQueue = []; let ctBusy = false, ctCur = null;
function pickVoice(item, userKey) {
  const c = ct(), mode = c.mode || 'auto';
  if (mode === 'one') return { voice: mainVoice(), pitch: 1 };
  const byLang = item.part === 'name' && mode !== 'perUser' ? mainVoice() : voiceForLang(item.lang);
  if (mode === 'perUser' && userKey) {
    const list = voicesFor(item.lang).length ? voicesFor(item.lang) : [mainVoice()].filter(Boolean);
    const h = hash(userKey);
    return { voice: list[h % list.length] || byLang || mainVoice(), pitch: 0.8 + (hash(userKey + '#pitch') % 9) * 0.06 };
  }
  return { voice: byLang || mainVoice(), pitch: 1 };
}
function enqueue(entry) {
  const max = Number(ct().maxQueue) || 6;
  while (ctQueue.length >= max) { const old = ctQueue.shift(); markFeed(old, 'ข้าม: คิวเต็ม'); }
  ctQueue.push(entry); showQueue(); if (!ctBusy) nextSpeak();
}
function nextSpeak() {
  ctCur = ctQueue.shift(); showQueue();
  if (!ctCur) { ctBusy = false; return; }
  ctBusy = true; markFeed(ctCur, '🔊 กำลังอ่าน', 'now');
  const parts = ctCur.say.slice(); const c = ct();
  const done = () => { markFeed(ctCur, '✓ อ่านแล้ว', 'read'); setTimeout(nextSpeak, 150); };
  const speakPart = () => {
    const p = parts.shift(); if (!p) return done();
    const u = new SpeechSynthesisUtterance(p.text);
    const { voice, pitch } = pickVoice(p, ctCur.userKey);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = p.lang;
    u.rate = Number(c.rate) || 1; u.pitch = Math.max(0.1, Math.min(2, (Number(c.pitch) || 1) * pitch)); u.volume = c.volume ?? 1;
    let ended = false; const fin = () => { if (!ended) { ended = true; clearTimeout(guard); speakPart(); } };
    u.onend = fin; u.onerror = fin;
    const guard = setTimeout(fin, 4000 + p.text.length * 220 / (u.rate || 1)); // never get stuck
    speechSynthesis.speak(u);
  };
  speakPart();
}
function stopAll() { ctQueue.length = 0; speechSynthesis.cancel(); ctBusy = false; showQueue(); }
function showQueue() { const el = $('#ctQueue'); if (el) el.textContent = ctQueue.length ? `รออ่าน ${ctQueue.length} ข้อความ` : ''; }

// --- feed of the chat tab ---
let ctId = 0;
function addChatFeed(name, text, status) {
  const ul = $('#ctFeed'); ul.querySelector('.empty')?.remove();
  const li = document.createElement('li'); li.dataset.id = ++ctId;
  li.innerHTML = `<span class="who">${esc(name || '?')}</span><span class="msg">${esc(text)}</span><span class="st">${esc(status)}</span>`;
  ul.prepend(li); while (ul.children.length > 60) ul.lastChild.remove();
  return ctId;
}
function markFeed(entry, status, cls = '') {
  if (!entry) return;
  const li = $(`#ctFeed li[data-id="${entry.id}"]`); if (!li) return;
  li.className = cls; li.querySelector('.st').textContent = status;
}
// called for every chat message from the live (and for the "read aloud" rule action)
function readChat(name, user, text, { force = false } = {}) {
  if (!('speechSynthesis' in window)) return;
  if (!force && !ct().enabled) return;
  const r = prepare(name, user, text);
  const id = addChatFeed(name, text, r.why ? `ข้าม: ${r.why}` : `รอ · ${LANGS[r.lang] || r.lang}`);
  if (r.why) return;
  enqueue({ id, say: r.say, userKey: user || name });
}
function speak(text) { // rule action "อ่านออกเสียง": already formatted text, still filtered
  const r = prepare('', '', text);
  const id = addChatFeed('กฎ', text, r.why ? `ข้าม: ${r.why}` : 'รอ');
  if (!r.why) enqueue({ id, say: r.say, userKey: '' });
}

// --- settings UI ---
function setCt(k, v) { config.chatTts = { ...ct(), [k]: v }; save(); }
function voiceOptions(list, sel, auto) {
  return (auto ? `<option value="">${auto}</option>` : '') + list.map(v => `<option value="${esc(v.name)}" ${v.name === sel ? 'selected' : ''}>${esc(v.name.replace(/^Microsoft /, ''))} (${esc(v.lang)})</option>`).join('');
}
function renderChatVoices() {
  if (!config || !$('#ctVoice')) return;
  const c = ct();
  const th = voices.filter(v => langOf(v) === 'th');
  $('#ctVoice').innerHTML = voiceOptions([...th, ...voices.filter(v => langOf(v) !== 'th')], c.voice, 'อัตโนมัติ (เสียงไทยที่ดีที่สุด)') || '<option>ไม่พบเสียงในเครื่อง</option>';
  const nLang = new Set(voices.map(langOf)).size;
  $('#ctLangHint').textContent = `เครื่องนี้มี ${voices.length} เสียง ใน ${nLang} ภาษา · แอปดูตัวอักษรในข้อความแล้วเลือกเสียงภาษานั้นให้เอง (ใช้ตอนเลือก "ตามภาษา" หรือ "คนละเสียง")`;
  $('#ctLangs').innerHTML = Object.entries(LANGS).map(([k, label]) => {
    const list = voicesFor(k);
    return `<div class="lg"><span>${label}</span>${list.length ? `<select data-lang="${k}">${voiceOptions(list, c.langVoices?.[k], 'อัตโนมัติ')}</select>` : '<small>ไม่มีเสียงภาษานี้ในเครื่อง</small>'}<small>${list.length} เสียง</small></div>`;
  }).join('');
  $$('#ctLangs select').forEach(sel => sel.onchange = () => setCt('langVoices', { ...(ct().langVoices || {}), [sel.dataset.lang]: sel.value }));
}
const MODE_HINT = { one: 'อ่านทุกข้อความด้วยเสียงหลักเสียงเดียว', auto: 'ภาษาไทยใช้เสียงไทย ภาษาอังกฤษใช้เสียงอังกฤษ ญี่ปุ่นใช้เสียงญี่ปุ่น ฯลฯ อ่านได้ทุกภาษาที่เครื่องมีเสียง', perUser: 'คนดูแต่ละคนได้เสียงของตัวเอง (สุ่มเสียงและความสูงต่ำแบบคงที่ต่อคน) และยังเลือกตามภาษาให้ด้วย' };
function renderChat() {
  if (!config) return;
  const c = ct();
  $('#ctOn').checked = !!c.enabled;
  $$('#ctMode button').forEach(b => b.classList.toggle('on', b.dataset.m === (c.mode || 'auto')));
  $('#ctModeHint').textContent = MODE_HINT[c.mode || 'auto'];
  for (const [id, k] of [['ctRate', 'rate'], ['ctPitch', 'pitch'], ['ctVol', 'volume']]) { const r = $('#' + id); r.value = c[k] ?? 1; r.nextElementSibling.textContent = Number(r.value).toFixed(2); }
  $$('#ctWhat button').forEach(b => b.classList.toggle('on', b.dataset.w === readWhat()));
  $('#ctTplBox').hidden = readWhat() !== 'both'; $('#ctTemplate').value = c.template || '{name} บอกว่า {text}';
  $('#ctBanMode').value = c.bannedMode || 'skip';
  $('#ctSkipCmd').checked = c.skipCommands !== false; $('#ctSkipLink').checked = c.skipLinks !== false; $('#ctSkipEmoji').checked = c.skipEmojiOnly !== false; $('#ctLaugh').checked = c.laugh !== false;
  $('#ctMaxLen').value = c.maxLen || 120; $('#ctMaxQ').value = c.maxQueue || 6;
  const chips = (arr, cls) => (arr || []).map((w, i) => `<span class="chip ${cls}">${esc(w)}<b data-i="${i}" title="ลบ">×</b></span>`).join('') || '<span class="hint" style="margin:0">ยังไม่มี</span>';
  $('#ctBanned').innerHTML = chips(c.banned, 'ban'); $('#ctUsers').innerHTML = chips(c.blockedUsers, '');
  $$('#ctBanned b').forEach(b => b.onclick = () => { const a = [...ct().banned]; a.splice(+b.dataset.i, 1); setCt('banned', a); renderChat(); });
  $$('#ctUsers b').forEach(b => b.onclick = () => { const a = [...ct().blockedUsers]; a.splice(+b.dataset.i, 1); setCt('blockedUsers', a); renderChat(); });
  renderChatVoices();
}
$('#ctOn').onchange = e => { setCt('enabled', e.target.checked); if (!e.target.checked) stopAll(); toast(e.target.checked ? 'เปิดอ่านแชตแล้ว 🔊' : 'ปิดอ่านแชตแล้ว'); };
$$('#ctMode button').forEach(b => b.onclick = () => { setCt('mode', b.dataset.m); renderChat(); });
$('#ctVoice').onchange = e => setCt('voice', e.target.value);
for (const [id, k] of [['ctRate', 'rate'], ['ctPitch', 'pitch'], ['ctVol', 'volume']]) $('#' + id).oninput = e => { e.target.nextElementSibling.textContent = Number(e.target.value).toFixed(2); setCt(k, Number(e.target.value)); };
$$('#ctWhat button').forEach(b => b.onclick = () => { setCt('readWhat', b.dataset.w); renderChat(); });
$('#ctTemplate').onchange = e => setCt('template', e.target.value.includes('{text}') ? e.target.value : '{name} บอกว่า {text}');
$('#ctBanMode').onchange = e => setCt('bannedMode', e.target.value);
$('#ctSkipCmd').onchange = e => setCt('skipCommands', e.target.checked);
$('#ctSkipLink').onchange = e => setCt('skipLinks', e.target.checked);
$('#ctSkipEmoji').onchange = e => setCt('skipEmojiOnly', e.target.checked);
$('#ctLaugh').onchange = e => setCt('laugh', e.target.checked);
$('#ctMaxLen').onchange = e => setCt('maxLen', Math.max(20, Math.min(400, Number(e.target.value) || 120)));
$('#ctMaxQ').onchange = e => setCt('maxQueue', Math.max(1, Math.min(50, Number(e.target.value) || 6)));
const addWords = (inp, key) => {
  const words = $(inp).value.split(/[,\n]/).map(w => w.trim()).filter(Boolean);
  if (!words.length) return;
  const cur = ct()[key] || [];
  setCt(key, [...cur, ...words.filter(w => !cur.some(c => norm(c) === norm(w)))]);
  $(inp).value = ''; renderChat(); toast(`เพิ่ม ${words.length} รายการแล้ว`);
};
$('#ctBanAdd').onclick = () => addWords('#ctBanIn', 'banned');
$('#ctBanIn').onkeydown = e => { if (e.key === 'Enter') addWords('#ctBanIn', 'banned'); };
$('#ctUserAdd').onclick = () => addWords('#ctUserIn', 'blockedUsers');
$('#ctUserIn').onkeydown = e => { if (e.key === 'Enter') addWords('#ctUserIn', 'blockedUsers'); };
$('#ctTestBtn').onclick = () => { enableSound(); readChat('คนทดสอบ', 'tester' + Math.floor(Math.random() * 5), $('#ctTest').value || 'สวัสดีค่ะ ขอบคุณที่มาดูไลฟ์นะ', { force: true }); };
$('#ctTest').onkeydown = e => { if (e.key === 'Enter') $('#ctTestBtn').click(); };
$('#ctSkip').onclick = () => speechSynthesis.cancel();
$('#ctStop').onclick = () => { stopAll(); toast('หยุดอ่านแล้ว'); };

// Browsers only allow sound after a click on the page.
let soundOn = false;
function enableSound() {
  if (soundOn) return;
  soundOn = true; KBSound.unlock();
  const b = $('#pSound'); b.className = 'pill sound-on'; b.textContent = '🔊 เสียงเปิดอยู่';
  $('#ckSound')?.classList.add('done');
}
$('#pSound').onclick = () => { if (soundOn) KBSound.play('bonk', config?.throwing.volume); enableSound(); };
document.addEventListener('pointerdown', enableSound, { once: true });
// In the KuminBonk app window sound is allowed straight away.
setTimeout(() => { if (KBSound.running()) enableSound(); }, 300);
$('#btnQuit').onclick = () => { if (confirm('ปิดโปรแกรม KuminBonk?')) { send({ t: 'quit' }); setTimeout(() => window.close(), 300); } };

connect();
