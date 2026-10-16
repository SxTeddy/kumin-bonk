# KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ !
# Render a mock-VTS timeline into a contact sheet of frames (sanity check of effect choreography).
import sys, json, math
from PIL import Image, ImageDraw
rec, out, t_from, t_to = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
ev = [json.loads(l) for l in open(rec)]
t0 = ev[0]['t']
W, H = 480, 270
head = (0.5, 0.32)
cache = {}
def img(f):
    if f not in cache:
        try: cache[f] = Image.open(rec + '.' + f).convert('RGBA')
        except Exception: cache[f] = None
    return cache[f]
def ease(fade, u):
    if fade == 'easeIn': return u * u
    if fade == 'easeOut': return 1 - (1 - u) ** 2
    if fade == 'easeBoth': return u * u * (3 - 2 * u)
    if fade == 'overshoot': return 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2 if u < 1 else 1
    return u
def state_at(T):
    items = {}; inj = {}; tint = (255, 255, 255)
    for e in ev:
        t = (e['t'] - t0) / 1000
        if t > T: break
        if e['e'] == 'load': items[e['id']] = dict(file=e['file'], cur=[e['x'], e['y'], e['size'], e['rot']], mv=None, flip=False)
        elif e['e'] == 'move' and e['id'] in items:
            it = items[e['id']]
            # settle previous move at its interpolated value
            it['cur'] = cur(it, t); tgt = [e['x'], e['y'], e['size'], e['rot']]
            tgt = [c if v is None or v <= -1000 else v for v, c in zip(tgt, it['cur'])]
            it['mv'] = (t, e['time'] or 0, e['fade'], list(it['cur']), tgt)
            if e.get('flip') is not None: it['flip'] = e['flip']
        elif e['e'] == 'unload':
            for i in e['ids'] or []: items.pop(i, None)
        elif e['e'] == 'inject': inj = e['p']
        elif e['e'] == 'tint': c = e['c']; tint = (c['colorR'], c['colorG'], c['colorB'])
    for it in items.values(): it['now'] = cur(it, T)
    return items, inj, tint
def cur(it, T):
    if not it['mv']: return list(it['cur'])
    ts, dur, fade, a, b = it['mv']
    u = 1 if dur <= 0 else max(0, min(1, (T - ts) / dur))
    k = ease(fade, u)
    return [x + (y - x) * k for x, y in zip(a, b)]
frames = []
T = t_from
while T <= t_to:
    items, inj, tint = state_at(T)
    im = Image.new('RGBA', (W, H), (40, 40, 52, 255))
    d = ImageDraw.Draw(im)
    hx = head[0] * W + inj.get('FaceAngleX', 0) * 1.2; hy = head[1] * H - inj.get('FaceAngleY', 0) * 0.8
    col = tuple(int(c * v / 255) for c, v in zip((255, 220, 200), tint))
    d.rectangle([W * 0.38, H * 0.48, W * 0.62, H], fill=tuple(int(c * v / 255) for c, v in zip((120, 140, 220), tint)))
    d.ellipse([hx - 40, hy - 45, hx + 40, hy + 45], fill=col)
    eye = 6 * max(0.1, 1 + inj.get('EyeOpenLeft', 0))
    d.ellipse([hx - 20, hy - eye / 2, hx - 10, hy + eye / 2], fill=(30, 30, 30)); d.ellipse([hx + 10, hy - eye / 2, hx + 20, hy + eye / 2], fill=(30, 30, 30))
    mo = 3 + 10 * max(0, inj.get('MouthOpen', 0))
    d.ellipse([hx - 10, hy + 20, hx + 10, hy + 20 + mo], fill=(160, 40, 60))
    for it in items.values():
        x, y, s, r = it['now']; pic = img(it['file'])
        if pic is None: continue
        px = int(max(8, s * H * 0.9))
        p = pic.resize((px, px))
        if it['flip']: p = p.transpose(Image.FLIP_LEFT_RIGHT)
        p = p.rotate(-r, expand=True)
        cx = (x + 1) / 2 * W; cy = (1 - y) / 2 * H
        im.alpha_composite(p, (int(cx - p.size[0] / 2), int(cy - p.size[1] / 2)))
    d.text((4, 4), f'{T:.1f}s', fill=(255, 255, 0))
    frames.append(im.convert('RGB'))
    T += 0.25
cols = 6
rows = math.ceil(len(frames) / cols)
sheet = Image.new('RGB', (cols * W // 2, rows * H // 2))
for i, f in enumerate(frames): sheet.paste(f.resize((W // 2, H // 2)), ((i % cols) * W // 2, (i // cols) * H // 2))
sheet.save(out)
print(len(frames), 'frames')
