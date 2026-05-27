"use strict";

const SUIT_BG = {
  engine:     { dark: '#1a3a1a', mid: '#2d6b2d' },
  weapons:    { dark: '#3a1a1a', mid: '#7a2a2a' },
  navigation: { dark: '#1e1e08', mid: '#5a4a08' },
  shield:     { dark: '#0e1f3a', mid: '#1a3a6a' },
  neutral:    { dark: '#111122', mid: '#1e1e3a' }
};

const ART_IMG_BASE = (typeof ART_IMG_BASE_OVERRIDE !== 'undefined') ? ART_IMG_BASE_OVERRIDE : 'art/';
const ART_FALLBACKS = {};

function artFallback(el, cardId) {
  el.outerHTML = ART_FALLBACKS[cardId] || '<div class="card-art" style="background:#2d2d4a;display:flex;align-items:center;justify-content:center;font-size:2em;">🐹</div>';
}

function makeArtElement(cardId, title, suit, power) {
  try {
    ART_FALLBACKS[cardId] = generatePlaceholder(cardId, title, suit || 'neutral', power || null);
  } catch(e) {
    ART_FALLBACKS[cardId] = `<div class="card-art" style="background:#2d2d4a;display:flex;align-items:center;justify-content:center;font-size:2em;">🐹</div>`;
  }
  return `<img class="card-art" src="${ART_IMG_BASE}${cardId}.png" onerror="artFallback(this,'${cardId}')" alt="">`;
}

function generatePlaceholder(cardId, title, suit, power) {
  const h = hashString(cardId);
  const s = hashString(title || '');
  const bg = SUIT_BG[suit] || SUIT_BG.neutral;
  const isShipPart = cardId.startsWith('SPC_');

  let stars = '';
  const numStars = 6 + (h % 8);
  for (let i = 0; i < numStars; i++) {
    const sx = ((h * (i + 7) * 13 + s * 31) & 0xffff) % 90 + 5;
    const sy = ((h * (i + 3) * 17 + s * 19) & 0xffff) % 55 + 2;
    const sr = (i % 3 === 0) ? 1.2 : 0.7;
    const op = 0.4 + ((h * i) & 0xff) / 255 * 0.6;
    stars += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="white" opacity="${op.toFixed(2)}"/>`;
  }

  let art = '';
  if      (suit === 'engine')          art = drawEngine(isShipPart);
  else if (suit === 'weapons')         art = drawWeapons(isShipPart);
  else if (suit === 'navigation')      art = drawNavigation(isShipPart);
  else if (suit === 'shield')          art = drawShield(isShipPart);
  else if (power === 'steal')          art = drawHamsterPirate(h);
  else if (power === 'block')          art = drawHamsterPolice(h);
  else if (power === 'doubleNext')     art = drawHamsterAmplifier(h);
  else                                 art = drawHamsterSpace(h);

  return `<svg class="card-art" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect width="100" height="100" fill="${bg.dark}"/>
    <rect y="40" width="100" height="60" fill="${bg.mid}" opacity="0.7"/>
    ${stars}
    ${art}
  </svg>`;
}

// ─── Suited card art ─────────────────────────────────────────────────────────

function drawEngine(isPremium) {
  const cx = 50, cy = isPremium ? 40 : 43;
  const teeth = 8, rOut = isPremium ? 28 : 22, rIn = isPremium ? 20 : 16, rHole = isPremium ? 10 : 8;

  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const base = (i / teeth) * Math.PI * 2 - Math.PI / 2;
    const a = [base - 0.13, base + 0.38, base + 0.75, base + 1.25].map(x => x % (Math.PI * 2));
    pts.push(`${f(cx + Math.cos(a[0]) * rIn)},${f(cy + Math.sin(a[0]) * rIn)}`);
    pts.push(`${f(cx + Math.cos(a[1]) * rOut)},${f(cy + Math.sin(a[1]) * rOut)}`);
    pts.push(`${f(cx + Math.cos(a[2]) * rOut)},${f(cy + Math.sin(a[2]) * rOut)}`);
    pts.push(`${f(cx + Math.cos(a[3]) * rIn)},${f(cy + Math.sin(a[3]) * rIn)}`);
  }

  const flameY = cy + rIn + 8;
  return `
    <polygon points="${pts.join(' ')}" fill="#4caf50" opacity="0.9"/>
    <circle cx="${cx}" cy="${cy}" r="${rHole}" fill="${SUIT_BG.engine.dark}"/>
    <circle cx="${cx}" cy="${cy}" r="${f(rHole * 0.38)}" fill="#4caf50" opacity="0.55"/>
    <ellipse cx="${cx}" cy="${flameY + 9}" rx="${isPremium ? 9 : 7}" ry="${isPremium ? 17 : 14}" fill="#ff6600" opacity="0.9"/>
    <ellipse cx="${cx}" cy="${flameY + 11}" rx="${isPremium ? 5 : 4}" ry="${isPremium ? 12 : 10}" fill="#ffcc00"/>
    ${isPremium ? `<ellipse cx="${cx - 15}" cy="${flameY + 7}" rx="5" ry="11" fill="#ff6600" opacity="0.7"/>
    <ellipse cx="${cx + 15}" cy="${flameY + 7}" rx="5" ry="11" fill="#ff6600" opacity="0.7"/>` : ''}`;
}

function drawWeapons(isPremium) {
  const cx = 50, cy = 50;
  const r1 = isPremium ? 36 : 28, r2 = r1 * 0.62, r3 = r1 * 0.28;
  const col = '#ef5350';

  let bursts = '';
  const burstCount = isPremium ? 8 : 4;
  for (let i = 0; i < burstCount; i++) {
    const a = (i / burstCount) * Math.PI * 2 - Math.PI / burstCount;
    bursts += `<line x1="${f(cx + Math.cos(a) * (r1 + 3))}" y1="${f(cy + Math.sin(a) * (r1 + 3))}"
      x2="${f(cx + Math.cos(a) * (r1 + (isPremium ? 11 : 7)))}" y2="${f(cy + Math.sin(a) * (r1 + (isPremium ? 11 : 7)))}"
      stroke="#ff9800" stroke-width="2" opacity="0.75"/>`;
  }

  return `
    ${bursts}
    <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="${col}" stroke-width="2" opacity="0.7"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}" fill="${col}" opacity="0.12"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.65"/>
    <circle cx="${cx}" cy="${cy}" r="${r3}" fill="${col}" opacity="0.75"/>
    <line x1="${f(cx-r1-5)}" y1="${cy}" x2="${f(cx-r3-2)}" y2="${cy}" stroke="${col}" stroke-width="2.5"/>
    <line x1="${f(cx+r3+2)}" y1="${cy}" x2="${f(cx+r1+5)}" y2="${cy}" stroke="${col}" stroke-width="2.5"/>
    <line x1="${cx}" y1="${f(cy-r1-5)}" x2="${cx}" y2="${f(cy-r3-2)}" stroke="${col}" stroke-width="2.5"/>
    <line x1="${cx}" y1="${f(cy+r3+2)}" x2="${cx}" y2="${f(cy+r1+5)}" stroke="${col}" stroke-width="2.5"/>`;
}

function drawNavigation(isPremium) {
  const cx = 50, cy = 50, r = isPremium ? 37 : 30;
  const col = '#ffd740';

  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const len = (i % 3 === 0) ? 6 : 3;
    ticks += `<line x1="${f(cx+Math.cos(a)*(r-len))}" y1="${f(cy+Math.sin(a)*(r-len))}"
      x2="${f(cx+Math.cos(a)*r)}" y2="${f(cy+Math.sin(a)*r)}"
      stroke="${col}" stroke-width="${i%3===0?1.5:0.9}" opacity="0.55"/>`;
  }

  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.45"/>
    ${ticks}
    <circle cx="${cx}" cy="${cy}" r="${f(r * 0.13)}" fill="${col}" opacity="0.9"/>
    <polygon points="${cx},${f(cy-r*.87)} ${f(cx-7)},${f(cy-r*.24)} ${f(cx+7)},${f(cy-r*.24)}" fill="${col}"/>
    <polygon points="${cx},${f(cy+r*.87)} ${f(cx-5)},${f(cy+r*.24)} ${f(cx+5)},${f(cy+r*.24)}" fill="${col}" opacity="0.32"/>
    <polygon points="${f(cx+r*.87)},${cy} ${f(cx+r*.24)},${f(cy-5)} ${f(cx+r*.24)},${f(cy+5)}" fill="${col}" opacity="0.42"/>
    <polygon points="${f(cx-r*.87)},${cy} ${f(cx-r*.24)},${f(cy-5)} ${f(cx-r*.24)},${f(cy+5)}" fill="${col}" opacity="0.42"/>
    ${isPremium ? `<text x="${cx}" y="${f(cy-r*.87-5)}" font-size="9" fill="${col}" text-anchor="middle" opacity="0.9" font-family="monospace">N</text>` : ''}`;
}

function drawShield(isPremium) {
  const cx = 50, w = isPremium ? 40 : 33, top = isPremium ? 10 : 15;
  const midY = isPremium ? 62 : 57, botY = isPremium ? 90 : 85;
  const col = '#42a5f5';

  const outer = `M ${cx-w},${top} L ${cx+w},${top} L ${cx+w},${midY} Q ${cx+w},${botY} ${cx},${botY} Q ${cx-w},${botY} ${cx-w},${midY} Z`;
  const iw = w - 7, it = top + 6, im = midY - 2, ib = botY - 11;
  const inner = `M ${cx-iw},${it} L ${cx+iw},${it} L ${cx+iw},${im} Q ${cx+iw},${ib} ${cx},${ib} Q ${cx-iw},${ib} ${cx-iw},${im} Z`;

  return `
    <path d="${outer}" fill="${col}" opacity="0.22" stroke="${col}" stroke-width="2.5"/>
    <path d="${inner}" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.55"/>
    <path d="M ${cx-w+4},${top+3} L ${cx},${top+3} L ${cx},${midY-15} Q ${cx-6},${midY-4} ${cx-w+4},${midY-4}" fill="white" opacity="0.07"/>
    ${isPremium
      ? `<line x1="${cx}" y1="${it+4}" x2="${cx}" y2="${im}" stroke="${col}" stroke-width="3" opacity="0.8"/>
         <line x1="${cx-16}" y1="${it+22}" x2="${cx+16}" y2="${it+22}" stroke="${col}" stroke-width="3" opacity="0.8"/>`
      : `<circle cx="${cx}" cy="${f((it+im)/2+2)}" r="9" fill="${col}" opacity="0.32"/>`}`;
}

// ─── Neutral card hamster art ─────────────────────────────────────────────────

function hamsterFace(hue) {
  const body = `hsl(${hue},65%,62%)`, ear = `hsl(${hue},58%,52%)`;
  const iear = `hsl(${(hue+10)%360},58%,76%)`, nose = `hsl(${(hue+180)%360},78%,54%)`;
  return { body, ear, iear, nose,
    base: `<ellipse cx="28" cy="30" rx="11" ry="13" fill="${ear}"/>
      <ellipse cx="72" cy="30" rx="11" ry="13" fill="${ear}"/>
      <ellipse cx="28" cy="32" rx="6" ry="8" fill="${iear}"/>
      <ellipse cx="72" cy="32" rx="6" ry="8" fill="${iear}"/>
      <ellipse cx="50" cy="58" rx="35" ry="32" fill="${body}"/>
      <ellipse cx="50" cy="78" rx="20" ry="10" fill="${iear}" opacity="0.6"/>
      <ellipse cx="50" cy="63" rx="3.5" ry="2.5" fill="${nose}"/>
      <g stroke="#222" stroke-width="0.7" stroke-linecap="round">
        <line x1="20" y1="63" x2="32" y2="65"/>
        <line x1="20" y1="68" x2="32" y2="68"/>
        <line x1="68" y1="65" x2="80" y2="63"/>
        <line x1="68" y1="68" x2="80" y2="68"/>
      </g>`
  };
}

function drawHamsterPirate(h) {
  const { base } = hamsterFace(h % 360);
  return `
    ${base}
    <circle cx="38" cy="50" r="7" fill="white"/>
    <circle cx="38" cy="51" r="3" fill="black"/>
    <circle cx="36" cy="49" r="1.2" fill="white"/>
    <ellipse cx="63" cy="50" rx="9" ry="6" fill="#111"/>
    <line x1="54" y1="44" x2="73" y2="44" stroke="#111" stroke-width="2.5"/>
    <path d="M 38 68 Q 50 80 62 68 Z" fill="#2a1200" stroke="black" stroke-width="1"/>
    <rect x="45" y="68" width="3" height="5" fill="white"/>
    <rect x="52" y="68" width="3" height="5" fill="white"/>
    <rect x="22" y="26" width="56" height="8" rx="2" fill="#111"/>
    <polygon points="34,26 50,6 66,26" fill="#111"/>
    <circle cx="50" cy="19" r="5.5" fill="white" opacity="0.9"/>
    <circle cx="47" cy="17" r="1.3" fill="#111"/>
    <circle cx="53" cy="17" r="1.3" fill="#111"/>
    <path d="M 47 22 L 49 21 L 51 22 L 53 21" stroke="#111" stroke-width="1" fill="none"/>
    <line x1="44" y1="24" x2="56" y2="26" stroke="white" stroke-width="1.2" opacity="0.7"/>
    <line x1="56" y1="24" x2="44" y2="26" stroke="white" stroke-width="1.2" opacity="0.7"/>
    <path d="M 16 65 Q 50 72 84 65" stroke="#cc2200" stroke-width="5" fill="none" opacity="0.7"/>`;
}

function drawHamsterPolice(h) {
  const { base } = hamsterFace(h % 360);
  // 5-pointed star badge at (50,73) r_outer=11 r_inner=5
  const starPts = star5(50, 73, 11, 5);
  return `
    ${base}
    <circle cx="38" cy="50" r="7" fill="white"/><circle cx="62" cy="50" r="7" fill="white"/>
    <circle cx="38" cy="51" r="3" fill="black"/><circle cx="62" cy="51" r="3" fill="black"/>
    <circle cx="36" cy="49" r="1.2" fill="white"/><circle cx="60" cy="49" r="1.2" fill="white"/>
    <path d="M 40 70 Q 50 78 60 70" stroke="black" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <rect x="24" y="26" width="52" height="7" rx="2" fill="#1a3a7a"/>
    <rect x="18" y="32" width="64" height="4" rx="2" fill="#1a3a7a"/>
    <rect x="28" y="20" width="44" height="10" rx="3" fill="#2a52cc"/>
    <polygon points="${starPts}" fill="#ffd700" opacity="0.95"/>
    <polygon points="${starPts}" fill="none" stroke="#aa8800" stroke-width="0.8"/>`;
}

function drawHamsterAmplifier(h) {
  const { base } = hamsterFace(h % 360);
  return `
    <ellipse cx="50" cy="55" rx="42" ry="40" fill="#ffd700" opacity="0.06"/>
    ${base}
    <circle cx="38" cy="50" r="7" fill="#ffd740"/><circle cx="62" cy="50" r="7" fill="#ffd740"/>
    <circle cx="38" cy="51" r="3" fill="black"/><circle cx="62" cy="51" r="3" fill="black"/>
    <circle cx="36" cy="48" r="1.5" fill="white"/><circle cx="60" cy="48" r="1.5" fill="white"/>
    <path d="M 36 68 Q 50 82 64 68 Z" fill="#2a1a00" stroke="black" stroke-width="1.2"/>
    <polygon points="32,26 37,13 42,22 47,11 50,22 53,11 58,22 63,13 68,26" fill="#ffd740" opacity="0.95"/>
    <line x1="14" y1="42" x2="24" y2="49" stroke="#ffd740" stroke-width="1.5" opacity="0.55"/>
    <line x1="11" y1="53" x2="21" y2="55" stroke="#ffd740" stroke-width="1" opacity="0.45"/>
    <line x1="79" y1="49" x2="89" y2="42" stroke="#ffd740" stroke-width="1.5" opacity="0.55"/>
    <line x1="79" y1="55" x2="89" y2="53" stroke="#ffd740" stroke-width="1" opacity="0.45"/>`;
}

function drawHamsterSpace(h) {
  const face = hamsterFace(h % 360);
  const eyeStyle = h % 5, mouthStyle = (h >> 4) % 5, accStyle = (h >> 8) % 5;
  return `
    ${face.base}
    ${buildEyes(eyeStyle)}
    ${buildMouth(mouthStyle, h % 360)}
    ${buildAccessory(accStyle, h % 360)}
    <ellipse cx="50" cy="50" rx="40" ry="38" fill="none" stroke="#88aaff" stroke-width="2.5" opacity="0.45"/>
    <path d="M 12 50 Q 10 20 50 16 Q 90 20 88 50" fill="rgba(136,170,255,0.06)" stroke="#88aaff" stroke-width="1.2" opacity="0.35"/>
    <path d="M 20 39 Q 27 28 39 26" stroke="white" stroke-width="2.5" fill="none" opacity="0.18" stroke-linecap="round"/>`;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function f(n) { return n.toFixed(1); }

function star5(cx, cy, ro, ri) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? ro : ri;
    pts.push(`${f(cx + Math.cos(a) * r)},${f(cy + Math.sin(a) * r)}`);
  }
  return pts.join(' ');
}

function buildEyes(style) {
  if (style === 0) return `<g>
    <circle cx="38" cy="50" r="7" fill="white"/><circle cx="62" cy="50" r="7" fill="white"/>
    <circle cx="38" cy="51" r="3" fill="black"/><circle cx="62" cy="51" r="3" fill="black"/>
    <circle cx="36" cy="49" r="1.2" fill="white"/><circle cx="60" cy="49" r="1.2" fill="white"/></g>`;
  if (style === 1) return `<g>
    <circle cx="37" cy="48" r="9" fill="white" stroke="black" stroke-width="1.2"/>
    <circle cx="63" cy="48" r="9" fill="white" stroke="black" stroke-width="1.2"/>
    <circle cx="40" cy="51" r="4" fill="black"/><circle cx="60" cy="46" r="4" fill="black"/></g>`;
  if (style === 2) return `<g stroke="black" stroke-width="2.2" stroke-linecap="round">
    <line x1="33" y1="45" x2="43" y2="55"/><line x1="43" y1="45" x2="33" y2="55"/>
    <line x1="57" y1="45" x2="67" y2="55"/><line x1="67" y1="45" x2="57" y2="55"/></g>`;
  if (style === 3) return `<g stroke="black" stroke-width="2.5" fill="none" stroke-linecap="round">
    <path d="M 32 53 Q 38 45 44 53"/><path d="M 56 53 Q 62 45 68 53"/></g>`;
  return `<g stroke="black" stroke-width="2.2" stroke-linecap="round">
    <line x1="32" y1="50" x2="44" y2="50"/><line x1="56" y1="50" x2="68" y2="50"/>
    <line x1="34" y1="55" x2="42" y2="58"/><line x1="58" y1="58" x2="66" y2="55"/></g>`;
}

function buildMouth(style, hue) {
  if (style === 0) return `<path d="M 40 70 Q 50 78 60 70" stroke="black" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  if (style === 1) return `<ellipse cx="50" cy="73" rx="5" ry="6" fill="#3a1a1a"/>`;
  if (style === 2) return `<path d="M 42 70 Q 50 75 58 70" stroke="black" stroke-width="2" fill="none"/>
    <ellipse cx="50" cy="76" rx="4" ry="5" fill="#ff7799"/>`;
  if (style === 3) return `<path d="M 38 68 Q 50 82 62 68 Z" fill="#3a1a1a" stroke="black" stroke-width="1.2"/>
    <rect x="44" y="68" width="3" height="6" fill="white"/>
    <rect x="53" y="68" width="3" height="6" fill="white"/>`;
  return `<path d="M 40 73 Q 45 68 50 73 T 60 73" stroke="black" stroke-width="2" fill="none"/>`;
}

function buildAccessory(style, hue) {
  if (style === 0) return `<g>
    <line x1="50" y1="22" x2="50" y2="6" stroke="#222" stroke-width="2"/>
    <circle cx="50" cy="5" r="4" fill="hsl(${(hue+90)%360},90%,60%)"/></g>`;
  if (style === 1) return `<g>
    <rect x="36" y="14" width="28" height="9" fill="#222"/>
    <rect x="30" y="22" width="40" height="3" fill="#222"/></g>`;
  if (style === 2) return `<g>
    <polygon points="40,89 50,82 50,94" fill="hsl(${(hue+200)%360},70%,55%)"/>
    <polygon points="60,89 50,82 50,94" fill="hsl(${(hue+200)%360},70%,55%)"/>
    <circle cx="50" cy="88" r="2" fill="#222"/></g>`;
  if (style === 3) return `<g>
    <path d="M 30 28 Q 50 8 70 28" stroke="hsl(${(hue+150)%360},80%,70%)" stroke-width="3" fill="none"/>
    <circle cx="30" cy="28" r="2.5" fill="hsl(${(hue+150)%360},80%,70%)"/>
    <circle cx="70" cy="28" r="2.5" fill="hsl(${(hue+150)%360},80%,70%)"/></g>`;
  return `<g font-family="serif">
    <text x="18" y="30" font-size="11" fill="#fff8">✦</text>
    <text x="78" y="42" font-size="9" fill="#fff8">✧</text>
    <text x="22" y="82" font-size="8" fill="#fff6">✦</text>
    <text x="80" y="80" font-size="10" fill="#fff7">✧</text></g>`;
}
