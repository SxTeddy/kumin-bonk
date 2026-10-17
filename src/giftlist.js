// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// 🔄 TikTok's own gift list for the live room, fetched in Thai and in English.
// The same gift id in both lists tells us which English name (what live events carry) is which Thai gift (our catalog),
// and gifts whose Thai name is not in our catalog are new ones the streamer can set up before anyone sends them.
const norm = s => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const imgOf = g => {
  const u = g?.image?.url_list?.[0] || g?.icon?.url_list?.[0] || '';
  return /^https:\/\//.test(u) ? String(u).slice(0, 1000) : '';
};
const clean = list => (Array.isArray(list) ? list : []).filter(g => g && g.id != null && g.name).slice(0, 3000);

// th, en: raw gift arrays from TikTok (Thai / English) · catalog: CATALOG · learned: GiftMatcher.learned (english → thai), changed in place
// returns { learned: how many new english→thai names, list: [{ id, name (english), label (thai), coins, image, known }] }
export function mergeGiftLists(th, en, catalog, learned) {
  const byId = new Map();
  for (const g of clean(en)) byId.set(String(g.id), { id: String(g.id), name: String(g.name).slice(0, 120), coins: Number(g.diamond_count) || 0, image: imgOf(g) });
  for (const g of clean(th)) {
    const id = String(g.id), cur = byId.get(id) || { id, name: '', coins: Number(g.diamond_count) || 0, image: imgOf(g) };
    cur.label = String(g.name).slice(0, 120);
    if (!cur.image) cur.image = imgOf(g);
    byId.set(id, cur);
  }
  // TikTok may ignore the Thai language request: then names can't be matched to our Thai list,
  // so only gifts at a price none of ours has are treated as new (no flood of "unknown" gifts)
  const thNames = clean(th).map(g => String(g.name));
  const thaiOk = thNames.length > 0 && thNames.filter(n => /[\u0E00-\u0E7F]/.test(n)).length / thNames.length >= 0.3;
  const prices = new Set(catalog.map(c => c.coins));
  const catTh = new Map(catalog.map(c => [norm(c.th), c])), catEn = new Map(catalog.filter(c => c.en).map(c => [norm(c.en), c]));
  let added = 0;
  const list = [];
  for (const g of byId.values()) {
    if (!g.name) g.name = g.label || '';
    if (!g.name) continue;
    const hit = catTh.get(norm(g.label)) || catEn.get(norm(g.name)) || (learned[norm(g.name)] && catTh.get(norm(learned[norm(g.name)])));
    if (hit && !catEn.has(norm(g.name)) && learned[norm(g.name)] !== hit.th) { learned[norm(g.name)] = hit.th; added++; }
    list.push({ ...g, label: thaiOk ? g.label || '' : '', known: !!hit || (!thaiOk && prices.has(g.coins)) });
  }
  list.sort((a, b) => b.coins - a.coins);
  return { learned: added, list, thaiOk };
}
