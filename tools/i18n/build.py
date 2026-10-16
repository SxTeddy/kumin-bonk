# Generates public/i18n.js from the translation tables. Run: python3 tools/i18n/build.py
import json, re, os, importlib.util
H = os.path.dirname(os.path.abspath(__file__))
def ld(n):
    s = importlib.util.spec_from_file_location(n, os.path.join(H, n + '.py')); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
keys = json.load(open(os.path.join(H, 'keys.json'), encoding='utf8'))
T = ld('tr1').T + ld('tr2').T + ld('tr3').T
assert len(T) == len(keys), (len(T), len(keys))
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
D = {}
for k, v in zip(keys, T):
    assert len(v) == 7, k
    D[norm(k)] = list(v)
x = ld('tr4')
for e in x.EXTRA:
    assert len(e) == 8, e[0]
    D[norm(e[0])] = list(e[1:])
P = []
for p in x.PATS:
    assert len(p) == 8, p[0]
    re.compile(p[0]); P.append([p[0], list(p[1:])])
src = open(os.path.join(H, 'runtime.js'), encoding='utf8').read()
out = src.replace('__DICT__', json.dumps(D, ensure_ascii=False, separators=(',', ':'))).replace('__PATS__', json.dumps(P, ensure_ascii=False, separators=(',', ':')))
open(os.path.join(H, '..', '..', 'public', 'i18n.js'), 'w', encoding='utf8').write(out)
print('i18n.js:', len(D), 'strings,', len(P), 'patterns,', len(out.encode()), 'bytes')
