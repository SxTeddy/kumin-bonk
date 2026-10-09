// KuminBonk — สร้างโดย HXZ ! · Copyright (c) 2026 HXZ ! · ดูเงื่อนไขใน LICENSE
// Default settings and starter rules (all editable in the dashboard).
let n = 0;
const id = () => `r${++n}`;

export const DEFAULT_CONFIG = {
  tiktokUsername: 'kumin01_',
  eulerApiKey: '',
  autoConnect: false,
  vtsPort: 8001,
  port: 3939,
  head: { x: 0.5, y: 0.32, followModel: true, modelX: null, modelY: null },
  throwing: {
    target: 'vts',     // 'vts' = items fly inside VTube Studio, 'overlay' = browser overlay
    size: 90,          // px
    speed: 1,          // flight speed multiplier
    spin: 1,
    maxOnScreen: 60,
    sound: true,
    volume: 0.6,
    flinchStrength: 1,
    eyesClose: true,
    stagger: 90,       // ms between items in one burst
  },
  fx: { showcaseMin: 1000, cats: {}, gifts: {} }, // per-category / per-gift effect settings
  // Live chat reader (text-to-speech in the app window)
  chatTts: {
    enabled: false,
    mode: 'auto',            // 'one' = one voice, 'auto' = voice by language, 'perUser' = each viewer gets their own voice
    voice: '',               // main voice ('' = best Thai voice)
    langVoices: {},          // language code -> voice name
    rate: 1, pitch: 1, volume: 1,
    readName: true, template: '{name} บอกว่า {text}',
    maxLen: 120, maxQueue: 6,
    skipCommands: true, skipLinks: true, skipEmojiOnly: true, laugh: true,
    banned: [], bannedMode: 'skip',   // 'skip' = don't read the message, 'remove' = read without the word, 'beep' = say "ปี๊บ"
    blockedUsers: [],
  },
  rulesVersion: 4,
  rules: [
    {
      id: id(), enabled: true, name: '🌹 กุหลาบ = โดนตีหัว',
      trigger: { type: 'gift', gifts: 'กุหลาบ', minDiamonds: 0, maxDiamonds: 0, fallback: false }, cooldown: 0,
      actions: [{ type: 'giftfx', style: 'auto' }],
    },
    {
      id: id(), enabled: true, name: '1–9 เหรียญ: ท่าตามของขวัญ',
      trigger: { type: 'gift', gifts: '*', minDiamonds: 1, maxDiamonds: 9, fallback: true }, cooldown: 0,
      actions: [{ type: 'giftfx', style: 'auto' }],
    },
    {
      id: id(), enabled: true, name: '10–99 เหรียญ: ท่าตามของขวัญ',
      trigger: { type: 'gift', gifts: '*', minDiamonds: 10, maxDiamonds: 99, fallback: true }, cooldown: 0,
      actions: [{ type: 'giftfx', style: 'auto' }],
    },
    {
      id: id(), enabled: true, name: '100–999 เหรียญ: ท่าตามของขวัญ + ขอบคุณ',
      trigger: { type: 'gift', gifts: '*', minDiamonds: 100, maxDiamonds: 999, fallback: true }, cooldown: 0,
      actions: [
        { type: 'alert', text: 'ขอบคุณ {name} ที่ส่ง {gift} x{count} นะ! 💖', seconds: 5 },
        { type: 'giftfx', style: 'auto' },
      ],
    },
    {
      id: id(), enabled: true, name: '1,000–9,999 เหรียญ: ท่าตามของขวัญ + หมุนตัว',
      trigger: { type: 'gift', gifts: '*', minDiamonds: 1000, maxDiamonds: 9999, fallback: true }, cooldown: 0,
      actions: [
        { type: 'alert', text: 'ว้าววว {name} ส่ง {gift}! ขอบคุณมาก ๆ เลย 😭💖', seconds: 6 },
        { type: 'giftfx', style: 'auto' },
        { type: 'wait', ms: 600 },
        { type: 'move', kind: 'spin', power: 1 },
      ],
    },
    {
      id: id(), enabled: true, name: '10,000+ เหรียญ: ท่าตามของขวัญ + ปาร์ตี้จัดเต็ม 👑',
      trigger: { type: 'gift', gifts: '*', minDiamonds: 10000, maxDiamonds: 0, fallback: true }, cooldown: 0,
      actions: [
        { type: 'alert', text: '👑 {name} ส่ง {gift}!!! ขอบคุณที่สุดในโลกเลย 👑', seconds: 8 },
        { type: 'giftfx', style: 'auto' },
        { type: 'giftfx', style: 'party' },
        { type: 'move', kind: 'spin', power: 1 },
        { type: 'throw', image: 'star', amount: 20, multiply: 1, max: 30, from: 'top', flinch: false, sound: 'pop' },
      ],
    },
    {
      id: id(), enabled: true, name: 'ฟอลโลว์ = กระโดดดีใจ + หัวใจ',
      trigger: { type: 'follow' }, cooldown: 2,
      actions: [
        { type: 'alert', text: 'ขอบคุณที่ฟอลโลว์นะ {name}! 🥰', seconds: 4 },
        { type: 'move', kind: 'jump', power: 1 },
        { type: 'throw', image: 'heart', amount: 3, multiply: 1, max: 10, from: 'bottom', flinch: false, sound: 'ding' },
      ],
    },
    {
      id: id(), enabled: true, name: 'แชร์ไลฟ์ = ดาวตกใส่หัว',
      trigger: { type: 'share' }, cooldown: 2,
      actions: [{ type: 'throw', image: 'star', amount: 2, multiply: 1, max: 10, from: 'top', flinch: true, sound: 'boing' }],
    },
    {
      id: id(), enabled: true, name: 'ทุก 100 ไลค์ = ฝนหัวใจ',
      trigger: { type: 'like', every: 100 }, cooldown: 0,
      actions: [{ type: 'throw', image: 'heart', amount: 5, multiply: 1, max: 20, from: 'top', flinch: false, sound: 'pop' }],
    },
    {
      id: id(), enabled: true, name: 'พิมพ์ !bonk = ค้อนของเล่น',
      trigger: { type: 'chat', match: '!bonk' }, cooldown: 10,
      actions: [{ type: 'throw', image: 'hammer', amount: 1, multiply: 1, max: 1, from: 'random', flinch: true, strength: 1.4, sound: 'bonk' }],
    },
    {
      id: id(), enabled: false, name: 'พิมพ์ !ปา = ปารูปโปรไฟล์คนพิมพ์',
      trigger: { type: 'chat', match: '!ปา' }, cooldown: 5,
      actions: [{ type: 'throw', image: 'avatar', amount: 1, multiply: 1, max: 1, from: 'random', flinch: true, sound: 'boing' }],
    },
    {
      id: id(), enabled: false, name: 'อ่านแชตที่ขึ้นต้นด้วย !พูด',
      trigger: { type: 'chat', match: '!พูด' }, cooldown: 3,
      actions: [{ type: 'tts', text: '{name} บอกว่า {text}' }],
    },
  ],
};
