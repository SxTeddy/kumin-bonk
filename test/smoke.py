# KuminBonk — สร้างโดย HXZ ! · clicks through the whole dashboard like a user (run by tools/check.mjs)
# usage: python3 test/smoke.py <port> <work-dir>
import sys, json, wave, struct, math, os
from playwright.sync_api import sync_playwright

port, work = sys.argv[1], sys.argv[2]
URL = f'http://localhost:{port}/'
fails = []
TABS = ['home', 'cats', 'rules', 'test', 'aim', 'chat', 'helpers', 'jar', 'sboard', 'widgets', 'subs', 'summary', 'settings', 'lang']

THAI_JS = r"""() => {
  const TH = /[฀-๿]/, out = new Set();
  const ok = new Set([...(catalog || []).map(g => g.th), ...(config.rules || []).map(r => r.name), ...(config.rules || []).map(r => r.trigger?.match || ''), ...Object.keys(config.profiles || {})]);
  const allowed = v => ok.has(v) || v.startsWith('!') || v.startsWith('+ !') || [...ok].some(o => o && v.includes(o));
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) {
      const p = n.parentElement; if (!p || p.closest('script,style,textarea,[data-noi18n]') || !p.offsetParent) continue;
      const v = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (TH.test(v) && !allowed(v)) out.add(v);
    } else if (!n.closest('[data-noi18n]')) for (const a of ['placeholder', 'aria-label']) { const v = n.getAttribute(a); if (v && TH.test(v) && !allowed(v)) out.add(a + ': ' + v); }
  }
  return [...out];
}"""

wav = os.path.join(work, 'beep.wav')
w = wave.open(wav, 'w'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
w.writeframes(b''.join(struct.pack('<h', int(8000 * math.sin(i / 5))) for i in range(4000))); w.close()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append('page error: ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and not any(x in m.text for x in ('favicon', 'ERR_TUNNEL', 'ERR_NAME', 'fonts.g', 'ERR_INTERNET')) and errs.append('console: ' + m.text))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#yay')?.remove()")  # first-run welcome card
    # every tab in Thai
    for tab in TABS:
        pg.click(f'#tabs button[data-tab={tab}]'); pg.wait_for_timeout(250)
    # user actions
    pg.click('#tabs button[data-tab=test]'); pg.wait_for_timeout(200)
    pg.evaluate("send({t:'simulate', ev:{type:'gift', user:{nickname:'<b>x</b>'}, gift:{name:'Rose', diamonds:'1<img src=x onerror=alert(1)>'}, count:'3<script>'}})")
    pg.evaluate("send({t:'simulate', ev:{type:'chat', user:{nickname:'tester'}, text:'hello <img src=x onerror=alert(2)>'}})")
    pg.evaluate("send({t:'simulate', ev:null})")
    pg.wait_for_timeout(800)
    if pg.locator('#feed img[src="x"]').count(): fails.append('feed shows injected HTML')
    pg.click('#tabs button[data-tab=helpers]'); pg.wait_for_timeout(200)
    pg.click('#pPause'); pg.wait_for_timeout(600)
    if pg.is_hidden('#pauseBar'): fails.append('pause bar did not show')
    pg.click('#btnResume'); pg.wait_for_timeout(600)
    if not pg.is_hidden('#pauseBar'): fails.append('pause bar did not hide')
    pg.click('#cmdPresets button >> nth=0'); pg.wait_for_timeout(200)
    pg.set_input_files('#sndFile', wav); pg.wait_for_timeout(800)
    if '🎵' not in pg.inner_text('#sndList'): fails.append('uploaded sound not listed')
    pg.fill('#pfName', 'test'); pg.click('#pfSave'); pg.wait_for_timeout(200)
    pg.click('.pflist [data-use] >> nth=0'); pg.wait_for_timeout(500)
    # 🫙 gift jar: its own page fills up when gifts arrive
    jp = b.new_page(viewport={'width': 600, 'height': 800})
    jp.on('pageerror', lambda e: errs.append('jar page error: ' + str(e)))
    jp.goto(URL + 'jar'); jp.wait_for_timeout(800)
    before = jp.evaluate('items.length')
    pg.click('#tabs button[data-tab=jar]'); pg.wait_for_timeout(300)
    pg.click('#jrShape button[data-shape=heart]'); pg.click('#btnJarTest'); pg.wait_for_timeout(1800)
    if jp.evaluate('items.length') <= before: fails.append('gift jar did not fill')
    if jp.evaluate("cfg.shape") != 'heart': fails.append('gift jar did not get the new shape')
    bad = jp.evaluate("(() => { const bad = []; for (const k of ['jar','tall','round','heart', ...Object.keys(JAR_THEMES)]) { try { cfg.shape = k; J = geometry(); fillNow(Array(30).fill({ p: 'rose', g: 1 })); drop({ p: 'heart' }); for (let i = 0; i < 90; i++) step(1 / 60); tnow = 1000; fdt = 1 / 60; drawBack(); for (const it of items) drawItem(it); drawFront(); if (items.some(it => !Number.isFinite(it.x + it.y))) bad.push(k + ' NaN'); } catch (e) { bad.push(k + ': ' + e.message); } } return bad; })()")
    if bad: fails.append('gift jar shapes broken: ' + '; '.join(bad))
    # the preview loads while its tab is closed (size 0): the drawing loop must survive that
    z = jp.evaluate("(() => { const w = W, h = H; W = 0; H = 0; J = geometry(); try { frame(performance.now() + 16); } catch (e) { return e.message; } finally { W = w; H = h; J = geometry(); } return ''; })()")
    if z: fails.append('gift jar breaks when hidden: ' + z)
    # flood every shape: nothing goes through glass, walls or lids, closed ones never leak, nothing flies off screen
    leak = jp.evaluate("""(() => { const bad = []; for (const [k, lid] of [['jar','metal'],['jar','none'],['round','cloth'],['heart','metal'], ...Object.keys(JAR_THEMES).map(t => [t, 'metal'])]) {
      cfg.shape = k; cfg.lid = lid; J = geometry(); items.length = 0; lidLift = 0;
      for (let i = 0; i < 120; i++) { drop({ p: 'rose' }); for (let s = 0; s < 14; s++) step(1 / 120); } for (let s = 0; s < 360; s++) step(1 / 120);
      const inside = items.filter(o => !o.spill && !o.carry && !o.out);
      const esc = inside.filter(o => o.y > J.floor + 2 || Math.abs(o.x - J.cx) > Math.max(J.hw(Math.min(Math.max(o.y, J.top), J.bottom)), J.neck) + o.r * 1.1 || o.y < J.ceil - (J.liftable ? lidLift : 0) - 2).length;
      const off = items.filter(o => o.y < -o.r || o.x < -o.r || o.x > W + o.r).length, leaked = !J.open && !J.liftable && items.some(o => o.spill);
      if (esc || off || leaked) bad.push(`${k}/${lid}: through ${esc}, off screen ${off}${leaked ? ', leaked' : ''}`); } return bad; })()""")
    if leak: fails.append('gift jar flood: ' + '; '.join(leak))
    if jp.evaluate('Object.keys(JAR_THEMES).length') < 20: fails.append('gift jar themes missing')
    jp.close()
    pg.click('#tabs button[data-tab=cats]'); pg.wait_for_timeout(300)
    pg.evaluate("toast('ทดสอบ')"); pg.wait_for_timeout(400)
    if not pg.evaluate("(() => { const t = document.querySelector('#toast'); t.style.pointerEvents = 'auto'; const r = t.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); const ok = !!e && e.closest('#toast') !== null; t.style.pointerEvents = ''; return ok; })()"): fails.append('toast message is hidden behind the page')
    if not pg.is_disabled('#btnGiftList'): fails.append('gift-list button clickable while not live')
    if 'กดได้ตอนเชื่อมต่อไลฟ์อยู่' not in pg.inner_text('#listInfo'): fails.append('gift-list hint missing while not live')
    pg.click('#catQuick button >> nth=0'); pg.wait_for_timeout(200)
    if pg.locator('#catQuick button.off').count() != 1: fails.append('quick category toggle failed')
    pg.click('#catQuick button >> nth=0'); pg.wait_for_timeout(200)
    pg.click('#tabs button[data-tab=summary]'); pg.wait_for_timeout(500)
    # 🎛️🖼️📝 soundboard, widgets, subtitles
    wpages = {}
    for k in ['garden', 'fireworks', 'timer', 'board', 'goal', 'stage', 'subs']:
        wp = b.new_page(viewport={'width': 800, 'height': 500}); wp.on('pageerror', lambda e, k=k: errs.append(f'{k} page error: ' + str(e)))
        wp.goto(URL + k); wpages[k] = wp
    pg.click('#tabs button[data-tab=sboard]'); pg.wait_for_timeout(300)
    pg.evaluate("(() => { window._played = []; const o = padPlay; padPlay = m => { window._played.push(m.pad.id); o(m); }; })()")
    pads0 = pg.locator('.pad').count()
    pg.click('.pad >> nth=0'); pg.wait_for_timeout(400)
    if not pg.evaluate('window._played.length'): fails.append('soundboard pad did not play')
    pg.set_input_files('#mediaFile', wav); pg.wait_for_timeout(1500)
    if pg.locator('.pad').count() != pads0 + 1: fails.append('uploaded song did not become a pad')
    pg.click('#btnGsAdd'); pg.wait_for_timeout(700)
    pg.evaluate("window._played = []; send({t:'simulate', ev:{type:'gift', user:{nickname:'t'}, gift:{name:'Rose', diamonds:1}, count:1}})"); pg.wait_for_timeout(800)
    if not pg.evaluate('window._played.length'): fails.append('gift did not play its song')
    import urllib.request, urllib.error
    for hdr in ({'Content-Type': 'audio/wav'}, {'Content-Type': 'audio/wav', 'X-KB': '1', 'Origin': 'http://evil.example'}):
        try: code = urllib.request.urlopen(urllib.request.Request(URL + 'api/media?name=x', data=b'abc', headers=hdr, method='POST')).status
        except urllib.error.HTTPError as e: code = e.code
        if code != 403: fails.append(f'media upload accepted from outside the app ({hdr})')
    mid = pg.evaluate('config.media[0].id')
    if pg.evaluate(f"fetch('/media/{mid}', {{headers:{{Range:'bytes=0-9'}}}}).then(r => r.status)") != 206: fails.append('songs cannot be seeked (no Range)')
    pg.click('#tabs button[data-tab=widgets]'); pg.wait_for_timeout(300)
    pg.click('[data-tc=start] >> nth=0')
    for i in range(3): pg.click('[data-wtest] >> nth=0'); pg.wait_for_timeout(400)
    pg.wait_for_timeout(1500)
    if wpages['board'].locator('.row').count() < 1: fails.append('leaderboard widget empty')
    if wpages['garden'].evaluate('plants.length') < 3: fails.append('garden widget empty')
    if '00:00:00' in wpages['timer'].inner_text('#timer'): fails.append('timer widget not counting')
    pg.evaluate("send({t:'subLine', id:'s1', text:'ทดสอบซับ', final:false})"); pg.wait_for_timeout(800)
    if 'ทดสอบซับ' not in wpages['subs'].inner_text('#subs'): fails.append('subtitle not shown')
    pg.evaluate("send({t:'wReset', what:'all'})")
    for wp in wpages.values(): wp.close()
    # every language: every tab, look for Thai left untranslated
    for lang in ['en', 'ja', 'es']:
        pg.evaluate(f"KBI18N.setLang('{lang}')"); pg.wait_for_timeout(200)
        left = set()
        for tab in TABS:
            pg.click(f'#tabs button[data-tab={tab}]'); pg.wait_for_timeout(250)
            left |= set(pg.evaluate(THAI_JS))
        if left: fails.append(f'untranslated in {lang}: ' + ' | '.join(sorted(left)[:15]))
    pg.evaluate("KBI18N.setLang('th')")
    fails += errs
    b.close()

for f in fails: print('✗', f)
print('smoke:', 'passed' if not fails else f'{len(fails)} problem(s)')
sys.exit(1 if fails else 0)
