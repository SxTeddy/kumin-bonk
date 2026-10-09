// KuminBonk — สร้างโดย HXZ ! · UI translator (Thai source → other languages)
(() => {
  const LANGS = [['th', 'ไทย', 'TH'], ['en', 'English', 'EN'], ['ja', '日本語', 'JA'], ['zh', '中文', 'ZH'], ['ko', '한국어', 'KO'], ['vi', 'Tiếng Việt', 'VI'], ['id', 'Bahasa Indonesia', 'ID'], ['es', 'Español', 'ES']];
  const IDX = { en: 0, ja: 1, zh: 2, ko: 3, vi: 4, id: 5, es: 6 };
  const DICT = __DICT__;
  const PATS = __PATS__.map(([re, outs]) => [new RegExp(re), outs]);
  const TH = /[฀-๿]/;
  const ATTRS = ['placeholder', 'title', 'label', 'aria-label'];
  let lang = 'th';
  try { const s = localStorage.getItem('kbLang'); if (s && (s === 'th' || s in IDX)) lang = s; } catch (e) {}

  const cache = new Map();
  function tr(s, depth = 0) {
    if (lang === 'th' || !s || !TH.test(s) || depth > 4) return null;
    const i = IDX[lang];
    const d = DICT[s]; if (d) return d[i];
    for (const [re, outs] of PATS) {
      const m = s.match(re);
      if (m) return outs[i].replace(/\$(\d)/g, (_, n) => { const g = m[n] || ''; return tr(g.trim(), depth + 1) ?? g; });
    }
    if (s.includes(' · ')) {
      let any = false;
      const out = s.split(' · ').map(p => { const r = tr(p.trim(), depth + 1); if (r != null) any = true; return r ?? p; });
      if (any) return out.join(' · ');
    }
    let m = s.match(/^([·•]\s*)(.+)$/);
    if (m) { const r = tr(m[2], depth + 1); if (r != null) return m[1] + r; }
    m = s.match(/^(.+?)(\s*(?:✓|×[\d,]+|:)\s*)$/);
    if (m) { const r = tr(m[1], depth + 1); if (r != null) return r + m[2]; }
    return null;
  }
  function t(s) {
    if (lang === 'th' || s == null) return s;
    s = String(s);
    const key = lang + '\u0001' + s;
    if (cache.has(key)) return cache.get(key);
    const n = s.replace(/\s+/g, ' ').trim();
    const r = tr(n);
    const out = r == null ? s : (s.match(/^\s*/)[0] + r + s.match(/\s*$/)[0]);
    if (cache.size > 5000) cache.clear();
    cache.set(key, out);
    return out;
  }

  const origText = new WeakMap(), lastText = new WeakMap();
  const origAttr = new WeakMap();
  const skip = el => el && el.closest && el.closest('script,style,textarea,[data-noi18n]');
  function doText(node) {
    const cur = node.nodeValue;
    let src;
    if (lastText.has(node) && lastText.get(node) === cur) src = origText.get(node);
    else { if (!TH.test(cur) && !origText.has(node)) return; src = cur; origText.set(node, cur); }
    if (skip(node.parentElement)) return;
    const out = t(src);
    if (out !== cur) node.nodeValue = out;
    lastText.set(node, out);
  }
  function doAttrs(el) {
    if (skip(el)) return;
    let o = origAttr.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      if (!o) { o = {}; origAttr.set(el, o); }
      const rec = o[a];
      let src;
      if (rec && rec.last === cur) src = rec.src; else { if (!TH.test(cur) && !rec) continue; src = cur; }
      const out = t(src);
      o[a] = { src, last: out };
      if (out !== cur) el.setAttribute(a, out);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skip(root)) return; doAttrs(root); }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  let obs = null;
  function start() {
    walk(document.body);
    if (obs) return;
    obs = new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') doAttrs(r.target);
        else r.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function setLang(l) {
    if (!(l === 'th' || l in IDX)) l = 'th';
    lang = l;
    try { localStorage.setItem('kbLang', l); } catch (e) {}
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : l;
    if (document.body) walk(document.body);
  }
  const oc = window.confirm.bind(window), op = window.prompt.bind(window), oa = window.alert.bind(window);
  window.confirm = m => oc(t(m));
  window.prompt = (m, d) => op(t(m), d);
  window.alert = m => oa(t(m));
  window.KBI18N = { LANGS, t, setLang, get lang() { return lang; }, refresh: () => document.body && walk(document.body) };
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
