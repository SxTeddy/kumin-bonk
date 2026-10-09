# Cut each gift icon out of the gift-panel screenshots and make the dark background transparent.
import sys, json, glob, os, hashlib
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(__file__))
from grids import GRIDS

src_dir, out_dir, map_out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out_dir, exist_ok=True)
files = {os.path.basename(f)[:8]: f for f in glob.glob(os.path.join(src_dir, '*.jpg'))}
catalog = json.load(open('/tmp/claude-0/gifts/catalog.json'))
idx = {c['th']: i for i, c in enumerate(catalog)}
result = {}

for key, grid in GRIDS.items():
    im = Image.open(files[key]).convert('RGB')
    a = np.asarray(im).astype(int)
    H, W, _ = a.shape
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # gold coin pixels next to the price
    coin = (r > 200) & (g > 160) & (b > 40) & (b < 170) & (r - b > 60)
    coin[int(H * 0.80):, :] = False  # bottom bar ("28" coins)
    lab, n = ndimage.label(coin)
    blobs = []
    for s_ in ndimage.find_objects(lab):
        h, w = s_[0].stop - s_[0].start, s_[1].stop - s_[1].start
        if 20 <= h <= 27 and 20 <= w <= 27 and abs(h - w) <= 3:
            fill = coin[s_].mean()
            if 0.68 <= fill <= 0.86:
                blobs.append(((s_[0].start + s_[0].stop) / 2, (s_[1].start + s_[1].stop) / 2))
    # price rows repeat every 330px: find the phase most coins agree on (across different columns)
    best = None
    for y0, _ in blobs:
        ph = y0 % 330
        hits = [(y, x) for y, x in blobs if min(abs(y % 330 - ph), 330 - abs(y % 330 - ph)) < 8]
        cols = len(set(int(x // (W / 4)) for _, x in hits))
        score = (cols, len(hits))
        if best is None or score > best[0]: best = (score, ph)
    ph = best[1]
    first = ph if ph >= 200 else ph + 330
    rowy = [first, first + 330, first + 660]
    print(key, [round(y) for y in rowy], best[0])
    names = grid.split('|')
    colw = W / 4
    for i, name in enumerate(names):
        if not name: continue
        ri, ci = divmod(i, 4)
        cy = rowy[ri]; cx = colw * ci + colw / 2
        box = (int(cx - 88), max(0, int(cy - 255)), int(cx + 88), int(cy - 62))
        crop = np.asarray(im.crop(box)).astype(int)
        bg = np.array([44, 44, 46])
        dist = np.sqrt(((crop - bg) ** 2).sum(-1))
        near = dist < 22
        # background = near-bg pixels connected to the crop border
        lab2, _ = ndimage.label(near)
        border = set(np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]]))) - {0}
        bgmask = np.isin(lab2, list(border))
        alpha = np.where(bgmask, 0, 255).astype(float)
        # soft edge: semi-transparent for dark-ish pixels touching background
        edge = ndimage.binary_dilation(bgmask, iterations=2) & ~bgmask
        alpha[edge] = np.clip((dist[edge] - 22) * 6, 60, 255)
        # drop tiny specks (badge fragments, text bits)
        solid = alpha > 0
        lab3, n3 = ndimage.label(solid)
        if n3:
            sizes = ndimage.sum(solid, lab3, range(1, n3 + 1))
            objs = ndimage.find_objects(lab3)
            ok = []
            for j, (s_, o) in enumerate(zip(sizes, objs)):
                hh, ww = o[0].stop - o[0].start, o[1].stop - o[1].start
                if s_ >= 120 and min(hh, ww) >= 12: ok.append(j + 1)
            keep = np.isin(lab3, ok)
            alpha[~keep] = 0
        rgba = np.dstack([crop, alpha]).astype(np.uint8)
        out = Image.fromarray(rgba, 'RGBA')
        bb = out.getbbox()
        if not bb: print('EMPTY', name); continue
        out = out.crop(bb)
        side = max(out.size) + 8
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(out, ((side - out.size[0]) // 2, (side - out.size[1]) // 2))
        sq = sq.resize((160, 160), Image.LANCZOS)
        fid = 'g%03d' % idx[name]
        sq.save(os.path.join(out_dir, fid + '.png'), optimize=True)
        result[name] = fid
json.dump(result, open(map_out, 'w'), ensure_ascii=False)
print('saved', len(result))
