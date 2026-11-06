// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// 🫙 Gift jar themes: containers other than the glass jars (factory, gacha machine, treasure chest, piggy bank…).
// Each theme: geo(g, env) sets the inside shape (half-width hw(y) per height), back()/front() draw it around the gifts.
// Uses the drawing helpers and state of jar.html (ctx, cfg, rr, shade, rgba, outline, J).
/* global ctx, cfg, rr, shade, rgba, outline, J, W, H */
(() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // inside shapes
  function rectHW(g, R = 0) {
    const { half, top, bottom } = g;
    g.neck = g.neck ?? half;
    g.hw = y => y < top ? g.neck : y > bottom ? 0 : (R && y > bottom - R) ? half - R + Math.sqrt(Math.max(0, R * R - (y - bottom + R) ** 2)) : half;
  }
  function taperHW(g, topHalf, botHalf, R = 0) {
    const { top, bottom } = g;
    g.neck = g.neck ?? topHalf;
    g.hw = y => {
      if (y < top) return g.neck; if (y > bottom) return 0;
      const w = topHalf + (botHalf - topHalf) * (y - top) / (bottom - top);
      return R && y > bottom - R ? w - R + Math.sqrt(Math.max(0, R * R - (y - bottom + R) ** 2)) : w;
    };
  }
  function ellipseHW(g, cy, a, b) {
    g.neck = g.neck ?? a * Math.sqrt(Math.max(0, 1 - ((g.top - cy) / b) ** 2));
    g.hw = y => y < g.top ? g.neck : y > g.bottom ? 0 : a * Math.sqrt(Math.max(0, 1 - ((y - cy) / b) ** 2));
  }
  // drawing helpers
  const fillPath = (style, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = style; ctx.fill(); ctx.globalAlpha = 1; };
  const strokePath = (style, w) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); };
  function body(g, color, alpha, edge) { // the container's own outline, filled see-through so the gifts show
    outline(g.wall); fillPath(color, alpha);
    outline(g.wall); strokePath(edge || shade(color, 0.7), g.wall * 1.3);
  }
  function glassShine(g, from = 0.15, to = 0.6) {
    ctx.save(); ctx.globalAlpha = 0.45; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, g.half * 0.06); ctx.beginPath();
    const y0 = g.top + (g.bottom - g.top) * from, y1 = g.top + (g.bottom - g.top) * to;
    for (let y = y0; y <= y1; y += 4) { const x = g.cx - g.hw(y) * 0.8; y === y0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.restore();
  }
  function ellipse(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function gear(x, y, r, teeth, ang, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const a = i / (teeth * 2) * TAU, rr2 = i % 2 ? r : r * 1.22; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); circle(0, 0, r * 0.35); ctx.fillStyle = shade(color, 0.6); ctx.fill(); ctx.restore();
  }
  // particles a theme owns (bubbles, snow, smoke)
  function puffs(list, max, spawn, update, draw, dt) {
    while (list.length < max && Math.random() < 0.5) list.push(spawn());
    for (let i = list.length - 1; i >= 0; i--) { const p = list[i]; p.age = (p.age || 0) + dt; if (update(p, dt) === false) list.splice(i, 1); else draw(p); }
  }
  const accent = () => cfg.lidColor || '#ff7aa8';
  const ribbon = () => cfg.bowColor || '#ff4f8b';
  const glass = () => cfg.glass || '#bfe6ff';
  function bowKnot(x, y, s, c) {
    ctx.fillStyle = shade(c, 0.85);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + d * s * 1.4, y - s * 1.2, x + d * s * 1.6, y + s * 0.6, x, y); ctx.fill(); }
    ctx.fillStyle = shade(c, 0.75); for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + d * s * 0.7, y + s * 1.5); ctx.lineTo(x + d * s * 0.2, y + s * 1.4); ctx.closePath(); ctx.fill(); }
    circle(x, y, s * 0.32); ctx.fillStyle = c; ctx.fill();
  }

  const T = {};

  // 🏭 gift factory: gifts ride a conveyor out of a machine and drop into a crate
  T.factory = {
    open: true,
    entry: 'belt', interval: 260,
    geo(g, e) {
      g.half = Math.min(e.W * 0.27, e.HH * 0.26); g.cx = e.W * 0.64; g.bottom = e.floor; g.top = g.bottom - g.half * 1.45;
      g.beltY = g.top - g.half * 0.32; g.ceil = 0; rectHW(g, g.half * 0.06);
      g.beltX0 = e.W * 0.04; g.beltX1 = g.cx - g.half * 0.25; g.machX = e.W * 0.05; g.machW = Math.min(e.W * 0.3, g.half * 1.25); g.machH = g.half * 1.05;
      g.spawn = g.top; g.labelY = g.top + (g.bottom - g.top) * 0.55;
      g.belt = { x0: g.machX + g.machW * 0.85, x1: g.beltX1 + g.half * 0.08, y: g.beltY };
      g.smoke = [];
    },
    back(g, t, dt) {
      // belt legs + belt
      const bt = Math.max(10, g.half * 0.1);
      ctx.fillStyle = '#5b6170'; for (const x of [g.beltX0 + 10, (g.beltX0 + g.beltX1) / 2]) ctx.fillRect(x, g.beltY + bt, Math.max(4, bt * 0.4), g.floor - g.beltY - bt);
      rr(g.beltX0, g.beltY, g.beltX1 - g.beltX0 + bt, bt, bt / 2); ctx.fillStyle = '#2e323c'; ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(g.beltX0 + bt / 2, g.beltY + 2, g.beltX1 - g.beltX0, bt - 4); ctx.clip();
      ctx.strokeStyle = '#59606e'; ctx.lineWidth = 3; const off = (t / 8) % 18;
      for (let x = g.beltX0 - 18 + off; x < g.beltX1 + bt; x += 18) { ctx.beginPath(); ctx.moveTo(x, g.beltY + 2); ctx.lineTo(x - 6, g.beltY + bt - 2); ctx.stroke(); }
      ctx.restore();
      for (const x of [g.beltX0 + bt / 2, g.beltX1 + bt / 2]) { circle(x, g.beltY + bt / 2, bt * 0.42); ctx.fillStyle = '#9aa3b5'; ctx.fill(); }
      // crate inside
      outline(0); fillPath('#6b4423', 0.55);
    },
    front(g, t, dt) {
      // crate front: see-through planks
      outline(g.wall); fillPath('#c08a4e', 0.35);
      ctx.strokeStyle = 'rgba(90,55,25,.8)'; ctx.lineWidth = Math.max(2, g.wall * 0.6);
      for (let i = 1; i < 4; i++) { const y = g.top + (g.bottom - g.top) * i / 4; ctx.beginPath(); ctx.moveTo(g.cx - g.half, y); ctx.lineTo(g.cx + g.half, y); ctx.stroke(); }
      outline(g.wall); strokePath('#7a4a22', g.wall * 1.6);
      // machine
      const mx = g.machX, my = g.beltY - g.machH, mw = g.machW, mh = g.machH, c = accent();
      // chimney + smoke
      const chx = mx + mw * 0.22, chw = mw * 0.18;
      ctx.fillStyle = '#7d8597'; ctx.fillRect(chx, my - mh * 0.45, chw, mh * 0.5);
      ctx.fillStyle = '#5b6170'; ctx.fillRect(chx - 3, my - mh * 0.5, chw + 6, mh * 0.1);
      puffs(g.smoke, 14, () => ({ x: chx + chw / 2, y: my - mh * 0.5, r: chw * 0.4, vx: 10 + Math.random() * 15 }),
        (p, d) => { p.y -= 30 * d; p.x += p.vx * d; p.r += 9 * d; return p.age < 2.4; },
        p => { circle(p.x, p.y, p.r); ctx.fillStyle = `rgba(230,230,240,${0.5 * (1 - p.age / 2.4)})`; ctx.fill(); }, dt);
      rr(mx, my, mw, mh, mh * 0.12); ctx.fillStyle = c; ctx.fill(); strokePath(shade(c, 0.6), 3);
      rr(mx + mw * 0.08, my + mh * 0.12, mw * 0.84, mh * 0.42, 8); ctx.fillStyle = shade(c, 1.25); ctx.fill();
      gear(mx + mw * 0.3, my + mh * 0.33, mh * 0.13, 8, t / 400, '#ffd23f');
      gear(mx + mw * 0.55, my + mh * 0.33, mh * 0.09, 6, -t / 280, '#ffffff');
      gear(mx + mw * 0.75, my + mh * 0.3, mh * 0.11, 7, t / 330, '#5ce1e6');
      // exit hatch + blinking light
      rr(mx + mw * 0.66, my + mh * 0.62, mw * 0.3, mh * 0.38, 6); ctx.fillStyle = '#20232b'; ctx.fill();
      circle(mx + mw * 0.12, my + mh * 0.75, mh * 0.07); ctx.fillStyle = (t / 300 | 0) % 2 ? '#7cf29c' : '#2f7a45'; ctx.fill();
      ctx.font = `800 ${Math.max(10, mh * 0.16)}px ${FONT}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🎁 GIFT', mx + mw * 0.36, my + mh * 0.8);
    },
  };

  // 🍬 gacha machine: glass dome on a coloured base, gifts sit in capsules
  T.gacha = {
    capsule: true,
    geo(g, e) {
      const R = Math.min(e.W * 0.4, e.HH * 0.3); g.R = R; g.half = R; g.baseH = R * 1.05;
      g.cy = e.floor - g.baseH - R * 0.6; g.bottom = g.cy + R * 0.62; g.top = g.cy - R * 0.93;
      ellipseHW(g, g.cy, R, R); g.labelY = e.floor - g.baseH * 0.42; g.labelW = R * 1.5; g.crank = 0;
    },
    back(g) { circle(g.cx, g.cy, g.R + g.wall); fillPath(glass(), 0.18); },
    front(g, t) {
      circle(g.cx, g.cy, g.R + g.wall); strokePath(rgba(glass(), 0.9), g.wall * 1.4); glassShine(g, 0.1, 0.55);
      const c = accent(), bx = g.cx - g.R * 0.92, by = g.bottom - g.R * 0.04, bw = g.R * 1.84, bh = g.floor - by;
      // cap on the dome
      ellipse(g.cx, g.top - g.wall, g.R * 0.32, g.R * 0.12); ctx.fillStyle = c; ctx.fill();
      rr(g.cx - g.R * 0.12, g.top - g.wall - g.R * 0.2, g.R * 0.24, g.R * 0.14, 6); ctx.fillStyle = shade(c, 0.8); ctx.fill();
      // base
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, shade(c, 0.75)); gr.addColorStop(0.4, shade(c, 1.15)); gr.addColorStop(1, shade(c, 0.7));
      ctx.beginPath(); ctx.moveTo(bx + bw * 0.06, by); ctx.lineTo(bx + bw * 0.94, by); ctx.lineTo(bx + bw, g.floor); ctx.lineTo(bx, g.floor); ctx.closePath(); ctx.fillStyle = gr; ctx.fill();
      rr(bx + bw * 0.04, by - g.R * 0.06, bw * 0.92, g.R * 0.12, g.R * 0.06); ctx.fillStyle = shade(c, 0.6); ctx.fill();
      // crank (turns as gifts come in), coin slot, chute
      const kx = g.cx, ky = by + bh * 0.3, kr = g.R * 0.17;
      circle(kx, ky, kr); ctx.fillStyle = '#f2f2f2'; ctx.fill(); strokePath('#b9b9c4', 3);
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(g.crank); ctx.fillStyle = '#c9c9d6'; rr(-kr * 0.18, -kr * 0.95, kr * 0.36, kr * 1.9, 4); ctx.fill(); ctx.restore();
      rr(kx + kr * 1.5, ky - kr * 0.5, kr * 0.25, kr, 3); ctx.fillStyle = '#333'; ctx.fill();
      rr(kx - kr * 0.9, g.floor - bh * 0.3, kr * 1.8, bh * 0.22, 6); ctx.fillStyle = '#1f1f27'; ctx.fill();
    },
    onDrop(g) { g.crank += 0.9; },
  };

  // 💰 treasure chest
  T.chest = {
    open: true,
    geo(g, e) {
      g.half = Math.min(e.W * 0.42, e.HH * 0.34); g.bottom = e.floor; g.top = g.bottom - g.half * 1.05;
      rectHW(g, g.half * 0.05); g.labelY = g.top + (g.bottom - g.top) * 0.6;
    },
    back(g, t) {
      const lh = g.half * 0.85, x = g.cx - g.half - g.wall, w = (g.half + g.wall) * 2, y = g.top - lh;
      // rays of gold from inside
      ctx.save(); ctx.translate(g.cx, g.top); for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + Math.sin(t / 1600 + i) * 0.15 + (i - 4) * 0.28; ctx.rotate(0); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, g.half * 1.6, a - 0.06, a + 0.06); ctx.closePath(); ctx.fillStyle = 'rgba(255,215,90,.18)'; ctx.fill(); } ctx.restore();
      // open lid behind
      ctx.beginPath(); ctx.moveTo(x, g.top); ctx.lineTo(x, y + lh * 0.45); ctx.quadraticCurveTo(g.cx, y - lh * 0.35, x + w, y + lh * 0.45); ctx.lineTo(x + w, g.top); ctx.closePath();
      ctx.fillStyle = '#5a3416'; ctx.fill(); strokePath('#3b210d', g.wall);
      ctx.fillStyle = '#e0a82e'; for (const f of [0.18, 0.82]) ctx.fillRect(x + w * f - g.wall, y + lh * 0.1, g.wall * 2, lh * 0.9);
      outline(0); fillPath('#4a0f1e', 0.75);
    },
    front(g) {
      outline(g.wall); fillPath('#8b5a2b', 0.42);
      ctx.strokeStyle = 'rgba(60,30,10,.7)'; ctx.lineWidth = 2; for (let i = 1; i < 3; i++) { const y = g.top + (g.bottom - g.top) * i / 3; ctx.beginPath(); ctx.moveTo(g.cx - g.half, y); ctx.lineTo(g.cx + g.half, y); ctx.stroke(); }
      outline(g.wall); strokePath('#e0a82e', g.wall * 1.8);
      ctx.fillStyle = '#e0a82e'; for (const f of [-0.62, 0.62]) ctx.fillRect(g.cx + g.half * f - g.wall, g.top, g.wall * 2, g.bottom - g.top);
      const lw = g.half * 0.32, lh = g.half * 0.36; rr(g.cx - lw / 2, g.top - g.wall, lw, lh, 6); ctx.fillStyle = '#f2c04a'; ctx.fill(); strokePath('#a87613', 2);
      circle(g.cx, g.top - g.wall + lh * 0.4, lw * 0.12); ctx.fillStyle = '#3b210d'; ctx.fill(); ctx.fillRect(g.cx - lw * 0.05, g.top - g.wall + lh * 0.4, lw * 0.1, lh * 0.35);
    },
  };

  // 🐷 piggy bank: gifts go in through the slot on its back
  T.piggy = {
    entry: 'slot',
    geo(g, e) {
      const a = Math.min(e.W * 0.36, e.HH * 0.36), b = a * 0.8, legs = a * 0.24;
      g.half = a; g.a = a; g.b = b; g.cy = e.floor - legs - b; g.top = g.cy - b * 0.88; g.bottom = g.cy + b; g.ceil = g.top;
      ellipseHW(g, g.cy, a, b); g.slotW = a * 0.22; g.labelY = g.cy + b * 0.25;
    },
    back(g) {
      const c = accent(), legs = g.floor - g.bottom + g.b * 0.15;
      ctx.fillStyle = shade(c, 0.8); for (const f of [-0.6, -0.25, 0.25, 0.6]) rr(g.cx + g.a * f - g.a * 0.11, g.cy + g.b * 0.82, g.a * 0.22, g.floor - g.cy - g.b * 0.82, g.a * 0.06), ctx.fill();
      ctx.strokeStyle = shade(c, 0.8); ctx.lineWidth = Math.max(3, g.a * 0.05); ctx.beginPath();
      for (let i = 0; i <= 30; i++) { const a = i / 30 * TAU * 1.5, r = g.a * 0.1 * (1 - i / 45); ctx.lineTo(g.cx - g.a * 1.02 - r * Math.cos(a) - i * 0.6, g.cy - g.b * 0.1 + r * Math.sin(a)); } ctx.stroke();
      ellipse(g.cx, g.cy, g.a + g.wall, g.b + g.wall); fillPath(c, 0.28);
    },
    front(g) {
      const c = accent();
      ellipse(g.cx, g.cy, g.a + g.wall, g.b + g.wall); fillPath(c, 0.22); strokePath(shade(c, 0.75), g.wall * 1.4);
      // ears
      for (const f of [0.2, 0.48]) { ctx.beginPath(); ctx.moveTo(g.cx + g.a * f, g.cy - g.b * 0.9); ctx.lineTo(g.cx + g.a * (f + 0.12), g.cy - g.b * 1.25); ctx.lineTo(g.cx + g.a * (f + 0.24), g.cy - g.b * 0.82); ctx.closePath(); ctx.fillStyle = shade(c, 0.9); ctx.fill(); }
      // snout, eye, cheek
      ellipse(g.cx + g.a * 0.98, g.cy + g.b * 0.05, g.a * 0.16, g.b * 0.24); ctx.fillStyle = shade(c, 1.12); ctx.fill(); strokePath(shade(c, 0.7), 3);
      for (const d of [-1, 1]) { ellipse(g.cx + g.a * 0.98, g.cy + g.b * (0.05 + d * 0.09), g.a * 0.035, g.b * 0.05); ctx.fillStyle = shade(c, 0.55); ctx.fill(); }
      circle(g.cx + g.a * 0.62, g.cy - g.b * 0.35, g.a * 0.05); ctx.fillStyle = '#2b1b26'; ctx.fill();
      circle(g.cx + g.a * 0.63, g.cy - g.b * 0.37, g.a * 0.017); ctx.fillStyle = '#fff'; ctx.fill();
      ellipse(g.cx + g.a * 0.62, g.cy - g.b * 0.05, g.a * 0.1, g.b * 0.07); fillPath('#ff6b9a', 0.45);
      rr(g.cx - g.slotW / 2, g.top - g.wall * 1.4, g.slotW, g.wall * 2, g.wall); ctx.fillStyle = '#2b1b26'; ctx.fill();
      glassShine(g, 0.2, 0.55);
    },
  };

  // 🐠 aquarium: gifts sink slowly through the water
  T.aquarium = {
    open: true,
    damp: 0.94,
    geo(g, e) {
      g.half = Math.min(e.W * 0.45, e.HH * 0.42); g.bottom = e.floor - g.half * 0.12; g.top = g.bottom - g.half * 1.2;
      rectHW(g); g.bubbles = [];
    },
    back(g, t) {
      const wt = g.top + g.half * 0.08, gr = ctx.createLinearGradient(0, wt, 0, g.bottom);
      gr.addColorStop(0, rgba(glass(), 0.25)); gr.addColorStop(1, 'rgba(40,110,200,.45)');
      ctx.fillStyle = gr; ctx.fillRect(g.cx - g.half, wt, g.half * 2, g.bottom - wt);
      ctx.fillStyle = '#e8cf8f'; ctx.beginPath(); ctx.moveTo(g.cx - g.half, g.bottom);
      for (let x = -1; x <= 1.001; x += 0.1) ctx.lineTo(g.cx + g.half * x, g.bottom - g.half * (0.07 + 0.03 * Math.sin(x * 9))); ctx.lineTo(g.cx + g.half, g.bottom); ctx.fill();
      ctx.strokeStyle = '#2fa84f'; ctx.lineWidth = Math.max(4, g.half * 0.05); ctx.lineCap = 'round';
      for (const [f, h] of [[-0.75, 0.6], [-0.55, 0.42], [0.62, 0.55], [0.8, 0.35]]) { ctx.beginPath(); const x0 = g.cx + g.half * f; ctx.moveTo(x0, g.bottom); for (let k = 1; k <= 8; k++) ctx.lineTo(x0 + Math.sin(t / 700 + k * 0.7 + f * 5) * g.half * 0.05 * k / 8, g.bottom - g.half * h * k / 8); ctx.stroke(); }
    },
    front(g, t, dt) {
      const wt = g.top + g.half * 0.08;
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = -1; x <= 1.001; x += 0.05) ctx.lineTo(g.cx + g.half * x, wt + Math.sin(x * 12 + t / 300) * 2); ctx.stroke();
      puffs(g.bubbles, 18, () => ({ x: g.cx + (Math.random() - 0.5) * g.half * 1.8, y: g.bottom - 6, r: 2 + Math.random() * 5, s: 30 + Math.random() * 40 }),
        (p, d) => { p.y -= p.s * d; p.x += Math.sin(p.age * 4) * 0.4; return p.y > wt + 4; },
        p => { circle(p.x, p.y, p.r); strokePath('rgba(255,255,255,.75)', 1.5); }, dt);
      ctx.fillStyle = '#2e323c'; ctx.fillRect(g.cx - g.half - g.wall * 2, g.top - g.wall * 2, (g.half + g.wall * 2) * 2, g.wall * 2.2);
      rr(g.cx - g.half - g.wall * 2, g.bottom, (g.half + g.wall * 2) * 2, g.floor - g.bottom + 2, 4); ctx.fillStyle = '#6b4a2f'; ctx.fill();
      ctx.strokeStyle = '#2e323c'; ctx.lineWidth = g.wall * 1.6; ctx.strokeRect(g.cx - g.half - g.wall, g.top - g.wall, (g.half + g.wall) * 2, g.bottom - g.top + g.wall);
      glassShine(g, 0.12, 0.5);
    },
  };

  // 🧪 witch's cauldron
  T.cauldron = {
    open: true,
    geo(g, e) {
      g.half = Math.min(e.W * 0.42, e.HH * 0.34); g.bottom = e.floor - g.half * 0.16; g.top = g.bottom - g.half * 1.45; g.neck = g.half * 0.8;
      g.hw = y => {
        if (y < g.top) return g.neck; if (y > g.bottom) return 0;
        const t = (y - g.top) / (g.bottom - g.top);
        if (t < 0.08) return g.half * 0.8;
        if (t < 0.58) return g.half * (0.8 + 0.2 * Math.sin(((t - 0.08) / 0.5) * Math.PI / 2));
        return g.half * Math.sqrt(Math.max(0, 1 - ((t - 0.58) / 0.42) ** 2 * 0.92));
      };
      g.bubbles = []; g.smoke = [];
    },
    back(g) {
      ctx.fillStyle = '#26262e'; for (const f of [-0.55, 0.55]) { ctx.beginPath(); ctx.moveTo(g.cx + g.half * f, g.bottom - 10); ctx.lineTo(g.cx + g.half * (f * 1.3), g.floor); ctx.lineTo(g.cx + g.half * (f * 1.3) + (f < 0 ? 10 : -10), g.floor); ctx.closePath(); ctx.fill(); }
      outline(0); const gr = ctx.createLinearGradient(0, g.top, 0, g.bottom); gr.addColorStop(0, 'rgba(124,255,107,.45)'); gr.addColorStop(1, 'rgba(40,120,40,.6)'); ctx.fillStyle = gr; ctx.fill();
    },
    front(g, t, dt) {
      outline(g.wall); fillPath('#2b2b36', 0.45); outline(g.wall); strokePath('#16161c', g.wall * 1.4);
      ellipse(g.cx, g.top, g.neck + g.wall * 2.2, g.half * 0.1); strokePath('#4a4a58', g.wall * 2);
      puffs(g.bubbles, 10, () => ({ x: g.cx + (Math.random() - 0.5) * g.neck * 1.6, y: g.top + 2, r: 3 + Math.random() * 8 }),
        (p, d) => { p.y -= 18 * d; return p.age < 0.9; }, p => { circle(p.x, p.y, p.r * (0.6 + p.age)); ctx.fillStyle = `rgba(150,255,120,${0.7 * (1 - p.age / 0.9)})`; ctx.fill(); }, dt);
      puffs(g.smoke, 10, () => ({ x: g.cx + (Math.random() - 0.5) * g.neck, y: g.top - 6, r: 8, c: Math.random() < 0.5 ? '170,120,255' : '120,255,140' }),
        (p, d) => { p.y -= 40 * d; p.x += Math.sin(p.age * 3) * 0.6; p.r += 10 * d; return p.age < 2; }, p => { circle(p.x, p.y, p.r); ctx.fillStyle = `rgba(${p.c},${0.35 * (1 - p.age / 2)})`; ctx.fill(); }, dt);
    },
  };

  // 🎁 gift box (open, lid leaning on the side)
  T.giftbox = {
    open: true,
    geo(g, e) { g.half = Math.min(e.W * 0.38, e.HH * 0.34); g.bottom = e.floor; g.top = g.bottom - g.half * 1.35; rectHW(g); },
    back(g) {
      const c = accent(); ctx.save(); ctx.translate(g.cx + g.half * 1.02, g.bottom); ctx.rotate(0.32);
      rr(-g.half * 0.25, -g.half * 1.1, g.half * 0.28, g.half * 1.1, 6); ctx.fillStyle = shade(c, 0.8); ctx.fill();
      ctx.fillStyle = ribbon(); ctx.fillRect(-g.half * 0.25, -g.half * 0.62, g.half * 0.28, g.half * 0.16); ctx.restore();
      outline(0); fillPath(shade(c, 0.55), 0.5);
    },
    front(g) {
      const c = accent(); outline(g.wall); fillPath(c, 0.4);
      ctx.save(); outline(g.wall); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.5)';
      for (let y = g.top + 14, r = 0; y < g.bottom; y += g.half * 0.24, r++) for (let x = g.cx - g.half + (r % 2 ? g.half * 0.12 : 0); x < g.cx + g.half; x += g.half * 0.24) { circle(x, y, g.half * 0.035); ctx.fill(); }
      ctx.restore(); outline(g.wall); strokePath(shade(c, 0.7), g.wall * 1.4);
      ctx.globalAlpha = 0.85; ctx.fillStyle = ribbon(); ctx.fillRect(g.cx - g.half * 0.1, g.top - g.wall, g.half * 0.2, g.bottom - g.top + g.wall); ctx.globalAlpha = 1;
      if (cfg.bow) bowKnot(g.cx, g.top - g.wall, Math.max(10, g.half * 0.18), ribbon());
    },
  };

  // 🧺 picnic basket
  T.basket = {
    open: true,
    geo(g, e) { g.half = Math.min(e.W * 0.44, e.HH * 0.38); g.bottom = e.floor; g.top = g.bottom - g.half * 1.0; taperHW(g, g.half, g.half * 0.78, g.half * 0.1); g.ceil = g.top - g.half * 0.5; },
    back(g) { outline(0); fillPath('#6e4a26', 0.45); },
    front(g) {
      outline(g.wall); fillPath('#c69455', 0.38);
      ctx.save(); outline(g.wall); ctx.clip(); ctx.strokeStyle = 'rgba(110,70,30,.65)'; ctx.lineWidth = 2;
      for (let y = g.top; y < g.bottom; y += g.half * 0.12) { ctx.beginPath(); ctx.moveTo(g.cx - g.half * 1.2, y); ctx.lineTo(g.cx + g.half * 1.2, y); ctx.stroke(); }
      for (let x = -1.1, k = 0; x < 1.1; x += 0.14, k++) { ctx.beginPath(); ctx.moveTo(g.cx + g.half * x, g.top); ctx.lineTo(g.cx + g.half * x * 0.8, g.bottom); ctx.stroke(); }
      ctx.restore(); outline(g.wall); strokePath('#7a4f22', g.wall * 1.4);
      // handle and cloth
      ctx.beginPath(); ctx.moveTo(g.cx - g.half * 0.9, g.top); ctx.bezierCurveTo(g.cx - g.half * 0.9, g.top - g.half * 1.1, g.cx + g.half * 0.9, g.top - g.half * 1.1, g.cx + g.half * 0.9, g.top); strokePath('#8a5a2a', Math.max(6, g.half * 0.08));
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(g.cx + d * g.half * 1.02, g.top); ctx.lineTo(g.cx + d * g.half * 0.55, g.top); ctx.lineTo(g.cx + d * g.half * 0.9, g.top + g.half * 0.32); ctx.closePath(); ctx.fillStyle = ribbon(); ctx.fill(); }
      rr(g.cx - g.half - g.wall * 2, g.top - g.wall * 1.5, (g.half + g.wall * 2) * 2, g.wall * 3, g.wall * 1.5); ctx.fillStyle = '#9b6a35'; ctx.fill();
    },
  };

  // 🧋 bubble tea cup
  T.boba = {
    geo(g, e) { g.half = Math.min(e.W * 0.34, e.HH * 0.26); g.bottom = e.floor; g.top = g.bottom - g.half * 2.4; taperHW(g, g.half, g.half * 0.74, g.half * 0.08); g.ceil = g.top; g.labelY = g.top + (g.bottom - g.top) * 0.42; },
    back(g) { outline(0); const gr = ctx.createLinearGradient(0, g.top, 0, g.bottom); gr.addColorStop(0, 'rgba(230,200,160,.35)'); gr.addColorStop(1, 'rgba(190,140,95,.55)'); ctx.fillStyle = gr; ctx.fill();
      ctx.save(); ctx.translate(g.cx + g.half * 0.25, g.top - g.half * 0.25); ctx.rotate(0.22); rr(-g.half * 0.09, 0, g.half * 0.18, g.bottom - g.top, 6); ctx.fillStyle = ribbon(); ctx.globalAlpha = 0.8; ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; },
    front(g) {
      outline(g.wall); strokePath(rgba(glass(), 0.95), g.wall * 1.2); glassShine(g, 0.1, 0.7);
      ctx.beginPath(); ctx.ellipse(g.cx, g.top, g.half + g.wall * 1.5, g.half * 0.55, 0, Math.PI, TAU); ctx.closePath(); fillPath(rgba(glass(), 0.5)); strokePath(rgba(glass(), 1), 3);
      rr(g.cx - g.half - g.wall * 2, g.top - g.wall, (g.half + g.wall * 2) * 2, g.wall * 2.4, g.wall); ctx.fillStyle = accent(); ctx.fill();
    },
  };

  // 🛍️ shopping bag
  T.bag = {
    open: true,
    geo(g, e) { g.half = Math.min(e.W * 0.38, e.HH * 0.32); g.bottom = e.floor; g.top = g.bottom - g.half * 1.6; taperHW(g, g.half * 0.92, g.half); g.ceil = g.top - g.half * 0.4; },
    back(g) {
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(g.cx + d * g.half * 0.55, g.top); ctx.bezierCurveTo(g.cx + d * g.half * 0.55, g.top - g.half * 0.75, g.cx + d * g.half * 0.1, g.top - g.half * 0.75, g.cx + d * g.half * 0.1, g.top); strokePath(shade(accent(), 0.6), Math.max(4, g.half * 0.05)); }
      outline(0); fillPath(shade(accent(), 0.5), 0.45);
    },
    front(g) {
      const c = accent(); outline(g.wall); fillPath(c, 0.4); outline(g.wall); strokePath(shade(c, 0.7), g.wall * 1.3);
      ctx.fillStyle = shade(c, 1.2); ctx.globalAlpha = 0.85; ctx.fillRect(g.cx - g.half * 0.92 - g.wall, g.top - g.wall, (g.half * 0.92 + g.wall) * 2, g.half * 0.16); ctx.globalAlpha = 1;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(g.cx + d * g.half * 0.55, g.top); ctx.bezierCurveTo(g.cx + d * g.half * 0.55, g.top - g.half * 0.65, g.cx + d * g.half * 0.1, g.top - g.half * 0.65, g.cx + d * g.half * 0.1, g.top); strokePath(shade(c, 0.8), Math.max(4, g.half * 0.05)); }
    },
  };

  // 🪣 beach bucket
  T.bucket = {
    open: true,
    geo(g, e) { g.half = Math.min(e.W * 0.4, e.HH * 0.34); g.bottom = e.floor; g.top = g.bottom - g.half * 1.3; taperHW(g, g.half, g.half * 0.78); g.ceil = g.top - g.half * 0.3; },
    back(g) { outline(0); fillPath(shade(accent(), 0.5), 0.45); },
    front(g) {
      const c = accent(); outline(g.wall); fillPath(c, 0.38); outline(g.wall); strokePath(shade(c, 0.7), g.wall * 1.3);
      ctx.globalAlpha = 0.8; ctx.fillStyle = shade(c, 0.75); for (const f of [0.2, 0.75]) { const y = g.top + (g.bottom - g.top) * f; ctx.fillRect(g.cx - g.hw(y) - g.wall, y, (g.hw(y) + g.wall) * 2, g.half * 0.07); } ctx.globalAlpha = 1;
      rr(g.cx - g.half - g.wall * 2, g.top - g.wall * 1.5, (g.half + g.wall * 2) * 2, g.wall * 3, g.wall * 1.5); ctx.fillStyle = shade(c, 1.15); ctx.fill();
      ctx.beginPath(); ctx.moveTo(g.cx - g.half * 0.98, g.top + g.half * 0.1); ctx.quadraticCurveTo(g.cx, g.top - g.half * 1.0, g.cx + g.half * 0.98, g.top + g.half * 0.1); strokePath('#7d8597', 4);
      rr(g.cx - g.half * 0.18, g.top - g.half * 0.5, g.half * 0.36, g.half * 0.1, 5); ctx.fillStyle = '#ffd23f'; ctx.fill();
    },
  };

  // 🕹️ claw machine: the claw carries each gift in and drops it
  T.claw = {
    entry: 'claw', interval: 330,
    geo(g, e) {
      const cw = Math.min(e.W * 0.9, e.HH * 0.62); g.cw = cw; g.half = cw * 0.42; g.cabTop = Math.max(6, e.H * 0.02);
      g.top = g.cabTop + cw * 0.3; g.bottom = e.floor - cw * 0.36; g.ceil = g.top; rectHW(g); g.rail = g.top + 6; g.home = g.cx - g.half * 0.8;
    },
    back(g, t) {
      const c = accent(), x = g.cx - g.cw / 2;
      rr(x, g.cabTop, g.cw, g.floor - g.cabTop, 14); ctx.fillStyle = c; ctx.fill(); strokePath(shade(c, 0.6), 3);
      rr(x + g.cw * 0.06, g.cabTop + g.cw * 0.04, g.cw * 0.88, g.cw * 0.18, 10); ctx.fillStyle = shade(c, 0.6); ctx.fill();
      ctx.font = `900 ${g.cw * 0.1}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('CLAW', g.cx, g.cabTop + g.cw * 0.135);
      for (let i = 0; i < 12; i++) { circle(x + g.cw * (0.08 + i * 0.077), g.cabTop + g.cw * 0.235, g.cw * 0.012); ctx.fillStyle = ((t / 200 | 0) + i) % 2 ? '#ffd23f' : '#fff7c2'; ctx.fill(); }
      ctx.fillStyle = rgba(glass(), 0.3); ctx.fillRect(g.cx - g.half, g.top, g.half * 2, g.bottom - g.top);
      // control panel
      const py = g.bottom + g.wall * 2; rr(x + g.cw * 0.05, py, g.cw * 0.9, g.cw * 0.16, 8); ctx.fillStyle = shade(c, 0.75); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(g.cx - g.cw * 0.25, py + g.cw * 0.03, 5, g.cw * 0.07); circle(g.cx - g.cw * 0.25 + 2, py + g.cw * 0.03, g.cw * 0.03); ctx.fillStyle = '#ff3d5a'; ctx.fill();
      circle(g.cx + g.cw * 0.05, py + g.cw * 0.08, g.cw * 0.03); ctx.fillStyle = '#ffd23f'; ctx.fill();
      rr(g.cx + g.cw * 0.2, py + g.cw * 0.2, g.cw * 0.2, g.cw * 0.12, 6); ctx.fillStyle = '#1f1f27'; ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(g.cx - g.half, g.rail); ctx.lineTo(g.cx + g.half, g.rail); ctx.stroke();
    },
    front(g) {
      ctx.strokeStyle = shade(accent(), 0.55); ctx.lineWidth = g.wall * 1.6; ctx.strokeRect(g.cx - g.half - g.wall, g.top - g.wall, (g.half + g.wall) * 2, g.bottom - g.top + g.wall * 2);
      glassShine(g, 0.1, 0.6);
      if (!g.busy) T.claw.drawClaw(g, g.home, g.top + 30, true);
    },
    drawClaw(g, x, y, open) {
      ctx.strokeStyle = '#777'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, g.rail); ctx.lineTo(x, y - 14); ctx.stroke();
      rr(x - 12, y - 18, 24, 10, 4); ctx.fillStyle = '#9aa3b5'; ctx.fill();
      ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 4; const s = open ? 1.4 : 1;
      for (const d of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(x + d * 6, y - 8); ctx.quadraticCurveTo(x + d * 16 * s, y + 4, x + d * 8 * s, y + 16); ctx.stroke(); }
    },
  };

  // 🏆 trophy cup
  T.trophy = {
    open: true,
    geo(g, e) {
      g.half = Math.min(e.W * 0.34, e.HH * 0.3); g.stand = g.half * 0.95; g.bottom = e.floor - g.stand; g.top = g.bottom - g.half * 1.25;
      g.hw = y => { if (y < g.top) return g.half; if (y > g.bottom) return 0; const t = (y - g.top) / (g.bottom - g.top); return g.half * Math.sqrt(Math.max(0.02, 1 - Math.pow(t, 2.2) * 0.9)); };
      g.neck = g.half; g.ceil = g.top - g.half * 0.2;
    },
    back(g) { outline(0); fillPath('#7a5a10', 0.5); },
    front(g, t) {
      const gold = ctx.createLinearGradient(g.cx - g.half, 0, g.cx + g.half, 0); gold.addColorStop(0, '#b8860b'); gold.addColorStop(0.35, '#ffe27a'); gold.addColorStop(1, '#a87613');
      outline(g.wall); ctx.globalAlpha = 0.42; ctx.fillStyle = gold; ctx.fill(); ctx.globalAlpha = 1; outline(g.wall); strokePath('#c9971c', g.wall * 1.5);
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(g.cx + d * g.half * 1.05, g.top + g.half * 0.45, g.half * 0.32, d < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, d < 0 ? Math.PI * 1.5 : Math.PI * 0.5, false); strokePath('#e0b23a', Math.max(6, g.half * 0.09)); }
      ellipse(g.cx, g.top, g.half + g.wall, g.half * 0.1); strokePath('#ffe27a', g.wall * 1.6);
      ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(g.cx - g.half * 0.12, g.bottom); ctx.lineTo(g.cx + g.half * 0.12, g.bottom); ctx.lineTo(g.cx + g.half * 0.22, g.floor - g.stand * 0.38); ctx.lineTo(g.cx - g.half * 0.22, g.floor - g.stand * 0.38); ctx.fill();
      rr(g.cx - g.half * 0.6, g.floor - g.stand * 0.4, g.half * 1.2, g.stand * 0.4, 6); ctx.fillStyle = '#3b2a1a'; ctx.fill();
      rr(g.cx - g.half * 0.35, g.floor - g.stand * 0.3, g.half * 0.7, g.stand * 0.2, 4); ctx.fillStyle = '#e0b23a'; ctx.fill();
      for (let i = 0; i < 3; i++) { const a = t / 900 + i * 2.1, x = g.cx + Math.cos(a) * g.half * 0.9, y = g.top - g.half * 0.15 + Math.sin(a * 1.3) * g.half * 0.12; ctx.font = `${g.half * 0.16}px sans-serif`; ctx.fillText('✨', x, y); }
    },
  };

  // 📮 post box: gifts drop in through the slot
  T.mailbox = {
    entry: 'slot',
    geo(g, e) {
      g.half = Math.min(e.W * 0.34, e.HH * 0.26); g.post = g.half * 0.35; g.bottom = e.floor - g.post; g.top = g.bottom - g.half * 2.1;
      const archY = g.top + g.half; g.neck = g.half * 0.25; g.slotY = g.top + g.half * 0.55; g.ceil = g.top + g.half * 0.25;
      g.hw = y => y < g.top ? g.neck : y > g.bottom ? 0 : y < archY ? Math.sqrt(Math.max(0, g.half ** 2 - (archY - y) ** 2)) : g.half;
      g.spawn = g.slotY; g.slotW = g.half * 0.7; g.labelY = g.top + (g.bottom - g.top) * 0.62;
    },
    back(g) { ctx.fillStyle = '#2e323c'; ctx.fillRect(g.cx - g.half * 0.18, g.bottom, g.half * 0.36, g.post); outline(0); fillPath(shade(accent(), 0.45), 0.5); },
    front(g) {
      const c = accent(); outline(g.wall); fillPath(c, 0.4); outline(g.wall); strokePath(shade(c, 0.65), g.wall * 1.4);
      rr(g.cx - g.slotW / 2, g.slotY - g.wall * 1.4, g.slotW, g.wall * 2.8, g.wall); ctx.fillStyle = '#1b1b22'; ctx.fill();
      rr(g.cx - g.half * 0.45, g.slotY + g.half * 0.2, g.half * 0.9, g.half * 0.3, 5); ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;
      ctx.font = `900 ${g.half * 0.2}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = shade(c, 0.6); ctx.fillText('POST', g.cx, g.slotY + g.half * 0.36);
      glassShine(g, 0.3, 0.8);
    },
  };

  // 🥤 vending machine
  T.vending = {
    geo(g, e) {
      const cw = Math.min(e.W * 0.86, e.HH * 0.56); g.cw = cw; g.cabX = e.W / 2 - cw / 2; g.cabTop = Math.max(6, e.H * 0.03);
      g.half = cw * 0.31; g.cx = g.cabX + cw * 0.06 + g.half; g.top = g.cabTop + cw * 0.12; g.bottom = e.floor - cw * 0.32; g.ceil = g.top; rectHW(g);
    },
    back(g, t) {
      const c = accent(); rr(g.cabX, g.cabTop, g.cw, g.floor - g.cabTop, 12); ctx.fillStyle = c; ctx.fill(); strokePath(shade(c, 0.6), 3);
      ctx.fillStyle = 'rgba(20,30,50,.55)'; ctx.fillRect(g.cx - g.half, g.top, g.half * 2, g.bottom - g.top);
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; for (let i = 1; i < 4; i++) { const y = g.top + (g.bottom - g.top) * i / 4; ctx.beginPath(); ctx.moveTo(g.cx - g.half, y); ctx.lineTo(g.cx + g.half, y); ctx.stroke(); }
      const px = g.cabX + g.cw * 0.74, pw = g.cw * 0.2;
      rr(px, g.top, pw, g.cw * 0.12, 4); ctx.fillStyle = '#0d1f12'; ctx.fill();
      ctx.font = `700 ${g.cw * 0.05}px monospace`; ctx.fillStyle = '#7cf29c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(total).slice(-6), px + pw / 2, g.top + g.cw * 0.06);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) { rr(px + k * pw * 0.52, g.top + g.cw * (0.17 + r * 0.08), pw * 0.46, g.cw * 0.06, 4); ctx.fillStyle = (r + k) % 2 ? '#fff' : shade(c, 1.3); ctx.fill(); }
      rr(px + pw * 0.3, g.top + g.cw * 0.52, pw * 0.4, g.cw * 0.03, 3); ctx.fillStyle = '#222'; ctx.fill();
      rr(g.cabX + g.cw * 0.08, g.bottom + g.cw * 0.08, g.cw * 0.6, g.cw * 0.16, 8); ctx.fillStyle = '#1b1b22'; ctx.fill();
      ctx.font = `800 ${g.cw * 0.045}px ${FONT}`; ctx.fillStyle = '#aaa'; ctx.fillText('PUSH', g.cabX + g.cw * 0.38, g.bottom + g.cw * 0.16);
    },
    front(g) { ctx.strokeStyle = shade(accent(), 0.55); ctx.lineWidth = g.wall * 1.4; ctx.strokeRect(g.cx - g.half - g.wall / 2, g.top - g.wall / 2, g.half * 2 + g.wall, g.bottom - g.top + g.wall); glassShine(g, 0.08, 0.7); },
  };

  // ⏳ hourglass: gifts trickle through the narrow middle
  T.hourglass = {
    geo(g, e) {
      g.half = Math.min(e.W * 0.36, e.HH * 0.24); g.cap = g.half * 0.2; g.top = Math.max(e.H * 0.04, e.floor - g.half * 4) + g.cap; g.bottom = e.floor - g.cap;
      const nk = () => Math.max(0.16, (g.r || 10) * 1.3 / g.half);
      g.hw = y => { if (y < g.top) return g.half * 0.3; if (y > g.bottom) return 0; const d = Math.abs((y - g.top) / (g.bottom - g.top) - 0.5) * 2, n = nk(); return g.half * (n + (1 - n) * Math.sin(Math.PI * (0.08 + 0.84 * d))); };
      g.neck = g.half * 0.3; g.ceil = g.top; g.spawn = g.top + (g.bottom - g.top) * 0.08;
    },
    back(g) { outline(g.wall); fillPath(glass(), 0.15); },
    front(g) {
      outline(g.wall); strokePath(rgba(glass(), 0.9), g.wall * 1.3); glassShine(g, 0.08, 0.35);
      for (const y of [g.top - g.cap, g.bottom]) { rr(g.cx - g.half * 1.15, y, g.half * 2.3, g.cap, g.cap * 0.4); ctx.fillStyle = '#8a5a2b'; ctx.fill(); strokePath('#5a3416', 2); }
      ctx.fillStyle = '#a8743f'; for (const d of [-1, 1]) ctx.fillRect(g.cx + d * g.half * 1.05 - g.cap * 0.18, g.top, g.cap * 0.36, g.bottom - g.top);
    },
  };

  // 🎃 jack-o'-lantern pumpkin
  T.pumpkin = {
    open: true,
    geo(g, e) { const a = Math.min(e.W * 0.44, e.HH * 0.4), b = a * 0.8; g.half = a; g.a = a; g.b = b; g.cy = e.floor - b; g.top = g.cy - b * 0.78; g.bottom = g.cy + b; ellipseHW(g, g.cy, a, b); g.ceil = g.top; g.labelY = g.cy + b * 0.42; },
    back(g) { ellipse(g.cx, g.cy, g.a, g.b); fillPath('#5a2600', 0.55); },
    front(g, t) {
      ellipse(g.cx, g.cy, g.a + g.wall, g.b + g.wall); fillPath('#ff8a1f', 0.38); strokePath('#c25400', g.wall * 1.4);
      ctx.strokeStyle = 'rgba(194,84,0,.7)'; ctx.lineWidth = 3; for (const f of [-0.6, -0.25, 0.25, 0.6]) { ellipse(g.cx + g.a * f * 0.5, g.cy, g.a * Math.abs(f) * 0.7, g.b); ctx.stroke(); }
      const glow = `rgba(255,220,80,${0.55 + 0.2 * Math.sin(t / 200)})`;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(g.cx + d * g.a * 0.45, g.cy - g.b * 0.15); ctx.lineTo(g.cx + d * g.a * 0.25, g.cy - g.b * 0.15); ctx.lineTo(g.cx + d * g.a * 0.35, g.cy - g.b * 0.45); ctx.closePath(); ctx.fillStyle = glow; ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(g.cx - g.a * 0.5, g.cy + g.b * 0.05); for (let i = 0; i <= 8; i++) ctx.lineTo(g.cx - g.a * 0.5 + g.a * i / 8, g.cy + g.b * (i % 2 ? 0.12 : 0.2)); ctx.lineTo(g.cx + g.a * 0.5, g.cy + g.b * 0.05); ctx.quadraticCurveTo(g.cx, g.cy + g.b * 0.45, g.cx - g.a * 0.5, g.cy + g.b * 0.05); ctx.fillStyle = glow; ctx.fill();
      ctx.save(); ctx.translate(g.cx + g.a * 0.55, g.top - g.a * 0.25); ctx.rotate(0.4); ellipse(0, 0, g.a * 0.35, g.b * 0.13); ctx.fillStyle = '#ff8a1f'; ctx.fill(); ctx.fillStyle = '#4a7a2a'; ctx.fillRect(-g.a * 0.04, -g.b * 0.32, g.a * 0.08, g.b * 0.22); ctx.restore();
    },
  };

  // ❄️ snow globe
  T.snowglobe = {
    geo(g, e) { const R = Math.min(e.W * 0.42, e.HH * 0.36); g.R = R; g.half = R; g.baseH = R * 0.5; g.cy = e.floor - g.baseH - R * 0.72; g.bottom = g.cy + R * 0.75; g.top = g.cy - R * 0.97; ellipseHW(g, g.cy, R, R); g.ceil = g.top; g.labelY = e.floor - g.baseH * 0.5; g.labelW = R * 1.5; g.snow = []; },
    back(g) { circle(g.cx, g.cy, g.R + g.wall); fillPath(glass(), 0.18); ellipse(g.cx, g.bottom, g.R * 0.66, g.R * 0.12); fillPath('#ffffff', 0.85); },
    front(g, t, dt) {
      const n = shakeT > 0 ? 90 : 45;
      puffs(g.snow, n, () => { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * g.R * 0.9; return { x: g.cx + Math.cos(a) * r, y: g.cy + Math.sin(a) * r, s: 10 + Math.random() * 20, z: 1 + Math.random() * 2.5 }; },
        (p, d) => { p.y += p.s * d * (shakeT > 0 ? -1.5 : 1); p.x += Math.sin(p.age * 2 + p.z) * 0.4; return p.age < 6 && Math.hypot(p.x - g.cx, p.y - g.cy) < g.R * 0.95; },
        p => { circle(p.x, p.y, p.z); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); }, dt);
      circle(g.cx, g.cy, g.R + g.wall); strokePath(rgba(glass(), 0.9), g.wall * 1.3); glassShine(g, 0.1, 0.5);
      const by = g.floor - g.baseH; ctx.beginPath(); ctx.moveTo(g.cx - g.R * 0.75, by); ctx.lineTo(g.cx + g.R * 0.75, by); ctx.lineTo(g.cx + g.R * 0.92, g.floor); ctx.lineTo(g.cx - g.R * 0.92, g.floor); ctx.closePath(); ctx.fillStyle = '#7a4a22'; ctx.fill();
      ctx.fillStyle = '#e0b23a'; ctx.fillRect(g.cx - g.R * 0.77, by, g.R * 1.54, g.baseH * 0.12);
    },
  };

  // 🪴 flower pot
  T.flowerpot = {
    open: true,
    geo(g, e) { g.half = Math.min(e.W * 0.4, e.HH * 0.32); g.bottom = e.floor; g.top = g.bottom - g.half * 1.3; taperHW(g, g.half, g.half * 0.72, g.half * 0.05); g.ceil = g.top - g.half * 0.2; },
    back(g, t) {
      for (const [f, h, c] of [[-0.45, 1.1, '#ff7aa8'], [0.05, 1.45, '#ffd23f'], [0.5, 1.05, '#b28dff']]) {
        const sway = Math.sin(t / 900 + f * 4) * g.half * 0.06, x = g.cx + g.half * f, y = g.top - g.half * (h - 0.6);
        ctx.beginPath(); ctx.moveTo(g.cx + g.half * f * 0.6, g.bottom - 10); ctx.quadraticCurveTo(x, g.top, x + sway, y); strokePath('#3f9a3a', Math.max(4, g.half * 0.04));
        ellipse(x + sway - g.half * 0.1, (y + g.top) / 2 + g.half * 0.2, g.half * 0.12, g.half * 0.05, -0.6); ctx.fillStyle = '#4caf50'; ctx.fill();
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t / 3000; circle(x + sway + Math.cos(a) * g.half * 0.11, y + Math.sin(a) * g.half * 0.11, g.half * 0.08); ctx.fillStyle = c; ctx.fill(); }
        circle(x + sway, y, g.half * 0.07); ctx.fillStyle = '#ffb000'; ctx.fill();
      }
      outline(0); fillPath('#5a3016', 0.5);
    },
    front(g) {
      outline(g.wall); fillPath('#d2693c', 0.4); outline(g.wall); strokePath('#9a4422', g.wall * 1.3);
      rr(g.cx - g.half * 1.1, g.top - g.half * 0.05, g.half * 2.2, g.half * 0.22, 6); ctx.fillStyle = '#c45b30'; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1; strokePath('#9a4422', 2);
    },
  };

  // 💰 money sack
  T.moneybag = {
    geo(g, e) {
      g.half = Math.min(e.W * 0.42, e.HH * 0.34); g.bottom = e.floor; g.top = g.bottom - g.half * 1.75; g.neck = g.half * 0.3; g.ceil = g.top - g.half * 0.1;
      g.hw = y => { if (y < g.top) return g.neck; if (y > g.bottom) return 0; const t = (y - g.top) / (g.bottom - g.top);
        if (t < 0.12) return g.half * 0.3; if (t < 0.55) return g.half * (0.3 + 0.7 * Math.sin(((t - 0.12) / 0.43) * Math.PI / 2)); return g.half * Math.sqrt(Math.max(0.05, 1 - ((t - 0.55) / 0.45) ** 2 * 0.85)); };
      g.spawn = g.top + (g.bottom - g.top) * 0.18; g.labelY = g.top + (g.bottom - g.top) * 0.42;
    },
    back(g) { outline(0); fillPath('#6b4f2a', 0.5); },
    front(g) {
      outline(g.wall); fillPath('#c9a46a', 0.4); outline(g.wall); strokePath('#8a6a3a', g.wall * 1.4);
      ctx.beginPath(); ctx.moveTo(g.cx - g.half * 0.3, g.top); for (let i = 0; i <= 6; i++) ctx.lineTo(g.cx - g.half * 0.45 + g.half * 0.9 * i / 6, g.top - g.half * (i % 2 ? 0.3 : 0.12)); ctx.lineTo(g.cx + g.half * 0.3, g.top); ctx.closePath(); ctx.fillStyle = '#c9a46a'; ctx.fill(); strokePath('#8a6a3a', 2);
      const ty = g.top + (g.bottom - g.top) * 0.1; ctx.fillStyle = '#8a5a2b'; ctx.fillRect(g.cx - g.half * 0.36, ty - 4, g.half * 0.72, 8);
      if (cfg.bow) bowKnot(g.cx + g.half * 0.1, ty, Math.max(8, g.half * 0.13), ribbon());
      ctx.font = `900 ${g.half * 0.55}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(110,80,30,.5)'; ctx.fillText('฿', g.cx, g.top + (g.bottom - g.top) * 0.75);
    },
  };

  window.JAR_THEMES = T;
})();
