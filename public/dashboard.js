// KuminBonk dashboard
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let config = null;
let vtsLists = { hotkeys: [], expressions: [], items: [] };
let seenGifts = [];
let catalog = []; // Thai gift list {coins, th, en, img, style}
let styles = {};  // effect style id -> Thai description
let catDefault = { enabled: true, size: 1, power: 1, speed: 1, max: 30, sound: 'auto', as: 'same' };

// ---------- socket ----------
let ws;
function send(m) { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); }
function connect() {
  ws = new WebSocket(`ws://${location.host}/ws?role=dashboard`);
  ws.onopen = () => send({ t: 'vtsLists' });
  ws.onclose = () => { setPill('pTik', 'bad', 'TikTok'); setPill('pVts', 'bad', 'VTube Studio'); toast('โปรแกรมปิดอยู่ — เปิด KuminBonk แล้วรีเฟรชหน้านี้'); setTimeout(connect, 2000); };
  ws.onmessage = e => handle(JSON.parse(e.data));
}

function handle(m) {
  switch (m.t) {
    case 'state':
      config = m.config; seenGifts = m.gifts || []; if (m.catalog) catalog = m.catalog; if (m.styles) styles = m.styles; if (m.catDefault) catDefault = m.catDefault;
      (m.logs || []).forEach(addLog);
      renderAll();
      break;
    case 'status': renderStatus(m); break;
    case 'log': addLog(m); break;
    case 'event': addFeed(m); if (m.ev.type === 'gift' && !seenGifts.some(g => g.name === m.ev.gift.name)) { seenGifts.push(m.ev.gift); fillGiftList(); } break;
    case 'fired': break;
    case 'vtsLists': vtsLists = m; if (config) renderRules(); break;
    case 'tts': speak(m.text); break;
    case 'sound': if (soundOn) KBSound.play(m.sound, m.volume); break;
    case 'saved': flashSaved(); break;
    case 'update': renderUpdate(m); break;
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
function renderUpdate(u) {
  const bar = $('#updBar'), txt = $('#updText'), btn = $('#btnRestart');
  $('#verInfo').textContent = `เวอร์ชัน ${u.current || ''}` + (u.status === 'off' ? ' · อัปเดตอัตโนมัติใช้ได้เมื่อติดตั้งด้วยตัวติดตั้ง' : u.status === 'uptodate' ? ' · ล่าสุดแล้ว ✓' : u.status === 'error' ? ` · ตรวจอัปเดตไม่ได้ (${u.detail || ''})` : '');
  if (u.status === 'downloading') { bar.hidden = false; btn.hidden = true; txt.textContent = `⬇️ กำลังดาวน์โหลดเวอร์ชันใหม่ ${u.latest}…`; }
  else if (u.status === 'ready') { bar.hidden = false; btn.hidden = false; txt.textContent = `✨ เวอร์ชันใหม่ ${u.latest} พร้อมแล้ว — จะใช้ตอนเปิดครั้งหน้า หรือรีสตาร์ทตอนนี้ (ถ้ากำลังไลฟ์ รอปิดไลฟ์ก่อนก็ได้)`; }
  else bar.hidden = true;
}
$('#btnRestart').onclick = () => { send({ t: 'restartForUpdate' }); $('#updText').textContent = 'กำลังรีสตาร์ท…'; };
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
  if (b.dataset.tab === 'aim') send({ t: 'calibHead', x: config.head.x, y: config.head.y });
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
  $('#tUser').value = config.tiktokUsername || '';
  $('#autoConnect').checked = !!config.autoConnect;
  $('#obsUrl').value = `${location.origin}/overlay`;
  $('#optKey').value = config.eulerApiKey || '';
  $('#optVtsPort').value = config.vtsPort || 8001;
  $('#optSound').checked = config.throwing.sound;
  $('#optTarget').value = config.throwing.target || 'vts';
  $('#optEyes').checked = config.throwing.eyesClose;
  $('#followModel').checked = config.head.followModel;
  renderSliders(); renderRules(); fillGiftList(); placeDot(); renderGallery(); renderCats();
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
    el.innerHTML = `<div class="cat-head"><label class="switch"><input type="checkbox" ${c.enabled ? 'checked' : ''}><span></span></label><b>${esc(label)}</b><small>${list.length} ชิ้น</small><button class="small" data-try>▶ ลอง</button></div>
      ${slider('size', 'ขนาดรูป', 0.4, 2.5, 0.1)}${slider('power', 'ความแรง', 0, 2, 0.1)}${slider('speed', 'ความเร็ว', 0.5, 2, 0.1)}${slider('max', 'สูงสุดต่อครั้ง', 1, 30, 1, v => v)}
      <div class="sel"><div><label>เสียง</label><select data-k="sound">${Object.entries(FX_SOUNDS).map(([k, v]) => `<option value="${k}" ${k === c.sound ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>ใช้ท่า</label><select data-k="as"><option value="same">ท่าของหมวดนี้</option>${Object.entries(styles).filter(([k]) => k !== st).map(([k, v]) => `<option value="${k}" ${k === c.as ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div></div>
      <div class="gifts">${list.map(g => `<button data-g="${esc(g.th)}" class="${fxCfg().gifts[g.th] ? 'own' : ''}" title="${esc(g.th)} · ${g.coins} เหรียญ"><img src="/gifts/${g.img}.png" alt="${esc(g.th)}" loading="lazy"></button>`).join('') || '<small class="hint">ยังไม่มีของขวัญในหมวดนี้</small>'}</div>`;
    el.querySelector('.switch input').onchange = e => { setCat(st, 'enabled', e.target.checked); el.classList.toggle('off', !e.target.checked); };
    el.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { const v = Number(r.value); r.nextElementSibling.textContent = r.dataset.k === 'max' ? v : '×' + v; setCat(st, r.dataset.k, v); });
    el.querySelectorAll('select').forEach(sel => sel.onchange = () => setCat(st, sel.dataset.k, sel.value));
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
    <div class="row"><button class="primary small" id="popTry">▶ ลอง</button><button class="small" id="popReset">คืนค่าเดิม</button><button class="small" id="popClose">ปิด</button></div>`;
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(window.innerWidth - 296, Math.max(8, r.left - 120)) + 'px';
  pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 6) + 'px';
  const put = () => {
    const st = $('#popStyle').value, sz = Number($('#popSize').value);
    const o = {}; if (st !== g.style) o.style = st; if (sz !== 1) o.size = sz;
    if (Object.keys(o).length) fxCfg().gifts[g.th] = o; else delete fxCfg().gifts[g.th];
    save();
  };
  $('#popStyle').onchange = () => { put(); renderCats(); };
  $('#popSize').oninput = e => { e.target.nextElementSibling.textContent = '×' + e.target.value; put(); };
  $('#popTry').onclick = () => send({ t: 'previewStyle', gift: g.th, count: 1 });
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
const pad = $('#pad');
function placeDot() { $('#padDot').style.left = config.head.x * 100 + '%'; $('#padDot').style.top = config.head.y * 100 + '%'; $('#aimPos').textContent = `ตำแหน่ง: ${Math.round(config.head.x * 1920)}, ${Math.round(config.head.y * 1080)} (จาก 1920×1080)`; }
function setHead(x, y) { config.head.x = Math.max(0, Math.min(1, x)); config.head.y = Math.max(0, Math.min(1, y)); placeDot(); send({ t: 'calibHead', x: config.head.x, y: config.head.y }); }
let dragging = false;
const padMove = e => { const r = pad.getBoundingClientRect(); setHead((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
pad.onpointerdown = e => { dragging = true; pad.setPointerCapture(e.pointerId); padMove(e); };
pad.onpointermove = e => { if (dragging) padMove(e); };
pad.onpointerup = () => { dragging = false; };
$$('[data-n]').forEach(b => b.onclick = () => { const [dx, dy] = b.dataset.n.split(',').map(Number); setHead(config.head.x + dx * 0.005, config.head.y + dy * 0.009); });
document.addEventListener('keydown', e => {
  if (!$('#aim').classList.contains('on') || e.target.tagName === 'INPUT') return;
  const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (m) { e.preventDefault(); setHead(config.head.x + m[0] * 0.005, config.head.y + m[1] * 0.009); }
});
$('#btnCalibSave').onclick = () => { send({ t: 'calibDone' }); save(); toast('บันทึกตำแหน่งหัวแล้ว'); setTimeout(() => send({ t: 'calibHead', x: config.head.x, y: config.head.y }), 300); };
$('#followModel').onchange = e => { config.head.followModel = e.target.checked; save(); };
$('#btnTestAim').onclick = () => send({ t: 'testAction', action: { type: 'throw', image: 'rose', amount: 3, max: 3, from: 'random', flinch: true, sound: 'bonk' } });

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

// ---------- TTS ----------
let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices();
  const saved = (() => { try { return localStorage.getItem('kbVoice'); } catch { return null; } })();
  const th = voices.filter(v => v.lang.startsWith('th'));
  const list = [...th, ...voices.filter(v => !v.lang.startsWith('th'))];
  $('#ttsVoice').innerHTML = list.map(v => `<option value="${esc(v.name)}" ${v.name === saved ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('') || '<option>ไม่พบเสียงในเครื่อง</option>';
}
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
$('#ttsVoice').onchange = e => { try { localStorage.setItem('kbVoice', e.target.value); } catch {} };
function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = voices.find(v => v.name === $('#ttsVoice').value);
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'th-TH';
  speechSynthesis.speak(u);
}
$('#btnTtsTest').onclick = () => speak('สวัสดีค่ะ ขอบคุณสำหรับกุหลาบนะ');

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
