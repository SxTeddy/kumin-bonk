// Effect sounds, synthesised in the browser (no audio files).
(function () {
let VOL = 0.6;

let ac = null;
function audio() { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; }
function tone({ type = 'sine', f0, f1, dur, vol = 1, delay = 0 }) {
  const a = audio(), t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * VOL, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol) {
  const a = audio(), b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const s = a.createBufferSource(), g = a.createGain(); s.buffer = b; g.gain.value = vol * VOL; s.connect(g).connect(a.destination); s.start();
}
const SOUNDS = {
  bonk: () => { tone({ type: 'triangle', f0: 520, f1: 120, dur: 0.18, vol: 0.9 }); noise(0.05, 0.4); },
  pop: () => tone({ type: 'sine', f0: 400 + Math.random() * 300, f1: 1400, dur: 0.08, vol: 0.6 }),
  ding: () => { tone({ f0: 1320, dur: 0.5, vol: 0.4 }); tone({ f0: 1980, dur: 0.4, vol: 0.2 }); },
  boing: () => { const a = audio(), t = a.currentTime, o = a.createOscillator(), g = a.createGain(), l = a.createOscillator(), lg = a.createGain();
    o.frequency.value = 180; l.frequency.value = 18; lg.gain.value = 70; l.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.6 * VOL, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(a.destination); o.start(t); l.start(t); o.stop(t + 0.5); l.stop(t + 0.5); },
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 3 ? 0.5 : 0.14, vol: 0.18, delay: i * 0.12 })),
  crash: () => { noise(0.35, 0.9); tone({ type: 'sawtooth', f0: 160, f1: 40, dur: 0.35, vol: 0.6 }); },
  whoosh: () => { const a = audio(), t = a.currentTime, b = a.createBuffer(1, a.sampleRate * 0.6, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / d.length);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2500, t + 0.6); g.gain.value = 0.7 * VOL;
    s.connect(f).connect(g).connect(a.destination); s.start(); },
  rumble: () => { tone({ type: 'sawtooth', f0: 55, f1: 40, dur: 1.4, vol: 0.5 }); noise(1.2, 0.25); },
  roar: () => { tone({ type: 'sawtooth', f0: 140, f1: 70, dur: 0.9, vol: 0.5 }); tone({ type: 'square', f0: 95, f1: 60, dur: 0.9, vol: 0.25 }); noise(0.8, 0.3); },
  zap: () => { for (let i = 0; i < 4; i++) tone({ type: 'square', f0: 1800 - i * 300, f1: 200, dur: 0.07, vol: 0.25, delay: i * 0.05 }); noise(0.15, 0.4); },
  cash: () => { tone({ type: 'square', f0: 1568, dur: 0.06, vol: 0.12 }); tone({ type: 'square', f0: 2093, dur: 0.12, vol: 0.12, delay: 0.06 }); },
  tune: () => { const sc = [523, 587, 659, 784, 880, 1047]; for (let i = 0; i < 4; i++) tone({ type: 'triangle', f0: sc[Math.floor(Math.random() * sc.length)], dur: 0.2, vol: 0.3, delay: i * 0.16 }); },
  scream: () => { tone({ type: 'sawtooth', f0: 500, f1: 1400, dur: 0.45, vol: 0.3 }); tone({ type: 'square', f0: 520, f1: 1450, dur: 0.45, vol: 0.12 }); },
  ice: () => [1760, 2093, 2637, 3136].forEach((f, i) => tone({ f0: f, dur: 0.3, vol: 0.18, delay: i * 0.08 })),
  magic: () => [784, 988, 1175, 1568, 1976].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.35, vol: 0.2, delay: i * 0.07 })),
  munch: () => { noise(0.06, 0.5); tone({ type: 'square', f0: 220, f1: 140, dur: 0.06, vol: 0.2 }); },
  none: () => {},
};



window.KBSound = { play(name, volume) { if (volume != null) VOL = volume; try { (SOUNDS[name] || SOUNDS.pop)(); } catch {} }, unlock() { try { audio(); } catch {} }, running() { try { return audio().state === 'running'; } catch { return false; } } };
})();
