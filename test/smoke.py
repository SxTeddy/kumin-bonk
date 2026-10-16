# KuminBonk — สร้างโดย HXZ ! · clicks through the whole dashboard like a user (run by tools/check.mjs)
# usage: python3 test/smoke.py <port> <work-dir>
import sys, json, wave, struct, math, os
from playwright.sync_api import sync_playwright

port, work = sys.argv[1], sys.argv[2]
URL = f'http://localhost:{port}/'
fails = []
TABS = ['home', 'cats', 'rules', 'test', 'aim', 'chat', 'helpers', 'summary', 'settings', 'lang']

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
    pg.click('#tabs button[data-tab=cats]'); pg.wait_for_timeout(300)
    pg.click('#catQuick button >> nth=0'); pg.wait_for_timeout(200)
    if pg.locator('#catQuick button.off').count() != 1: fails.append('quick category toggle failed')
    pg.click('#catQuick button >> nth=0'); pg.wait_for_timeout(200)
    pg.click('#tabs button[data-tab=summary]'); pg.wait_for_timeout(500)
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
