/*
  Quick sanity check for anchor accent colour derivation.
  Run with: node test/check-anchor-colors.mjs
*/

const AUTO_ANCHOR_BASES = ['#2563EB', '#0F172A', '#1098AD', '#F59E0B', '#EF4444', '#F1F5F9'];
const CONFIGURED_DEFAULT = '#2563EB';

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function srgbToLinear(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(rgbA, rgbB) {
  const L1 = relativeLuminance(rgbA);
  const L2 = relativeLuminance(rgbB);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexToRgb(hex) {
  const h = (hex || '').trim().replace(/^#/, '');
  const hex6 = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(hex6)) return null;
  return {
    r: parseInt(hex6.slice(0, 2), 16),
    g: parseInt(hex6.slice(2, 4), 16),
    b: parseInt(hex6.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const clampChannel = (v) => Math.min(255, Math.max(0, Math.round(v)));
  return `#${clampChannel(r).toString(16).padStart(2, '0')}${clampChannel(g).toString(16).padStart(2, '0')}${clampChannel(b).toString(16).padStart(2, '0')}`.toUpperCase();
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
  }
  h = (h * 60 + 360) % 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255)
  };
}

function deriveAnchorColorWithContrast(baseHex, contrastLevel, backgroundRgb) {
  const baseRgb = hexToRgb(baseHex);
  if (!baseRgb) return baseHex;
  const bg = backgroundRgb || { r: 255, g: 255, b: 255 };
  const target = contrastLevel === 'AAA' ? 7 : 4.5;
  let candidate = { ...baseRgb };
  let ratio = contrastRatio(candidate, bg);
  if (ratio >= target) {
    return rgbToHex(candidate);
  }
  const bgLum = relativeLuminance(bg);
  const direction = bgLum > 0.5 ? -1 : 1;
  let hsl = rgbToHsl(candidate);
  for (let i = 0; i < 12 && ratio < target; i += 1) {
    hsl.l = clamp01(hsl.l + direction * 0.05);
    candidate = hslToRgb(hsl);
    ratio = contrastRatio(candidate, bg);
  }
  if (ratio >= target) {
    return rgbToHex(candidate);
  }
  const blackRatio = contrastRatio({ r: 0, g: 0, b: 0 }, bg);
  const whiteRatio = contrastRatio({ r: 255, g: 255, b: 255 }, bg);
  return blackRatio >= whiteRatio ? '#000000' : '#FFFFFF';
}

function computeCandidateScore(bgRatio, textRatio, contrastLevel) {
  const target = contrastLevel === 'AAA' ? 7 : 4.5;
  const cappedBg = Math.min(bgRatio, target + 2);
  let score = cappedBg;
  if (typeof textRatio === 'number') {
    if (textRatio < 2) {
      score -= (2 - textRatio) * 5;
    } else {
      const boost = Math.min(textRatio - 2, 3);
      score += boost * 1.2;
    }
  }
  return score;
}

function deriveAutoAnchorColor(contrastLevel, backgroundRgb, textRgb) {
  const bg = backgroundRgb
    ? { r: backgroundRgb.r, g: backgroundRgb.g, b: backgroundRgb.b }
    : { r: 255, g: 255, b: 255 };
  const configured = CONFIGURED_DEFAULT;
  const palette = new Set([...AUTO_ANCHOR_BASES, configured]);
  const candidates = [];
  for (const base of palette) {
    const derived = deriveAnchorColorWithContrast(base, contrastLevel, bg);
    const rgb = hexToRgb(derived);
    if (!rgb) continue;
    const bgRatio = contrastRatio(rgb, bg);
    const textRatio = textRgb ? contrastRatio(rgb, textRgb) : null;
    candidates.push({
      color: derived,
      rgb,
      bgRatio,
      textRatio,
      score: computeCandidateScore(bgRatio, textRatio, contrastLevel)
    });
  }
  const blackRgb = { r: 0, g: 0, b: 0 };
  const blackBgRatio = contrastRatio(blackRgb, bg);
  const blackTextRatio = textRgb ? contrastRatio(blackRgb, textRgb) : null;
  candidates.push({
    color: '#000000',
    rgb: blackRgb,
    bgRatio: blackBgRatio,
    textRatio: blackTextRatio,
    score: computeCandidateScore(blackBgRatio, blackTextRatio, contrastLevel)
  });
  candidates.sort((a, b) => b.score - a.score);
  const bgLum = relativeLuminance(bg);
  const lumThreshold = bgLum > 0.75 || bgLum < 0.25 ? 0.2 : 0.12;
  const selected = candidates.find((candidate) => {
    if (!candidate?.rgb) return false;
    const lum = relativeLuminance(candidate.rgb);
    return Math.abs(lum - bgLum) >= lumThreshold;
  }) || candidates[0];
  if (!selected) return '#000000';
  if (typeof selected.textRatio === 'number' && selected.textRatio < 1.6) {
    const selRgb = hexToRgb(selected.color);
    const confRgb = hexToRgb(configured);
    if (selRgb && confRgb) {
      const blended = {
        r: Math.round(selRgb.r * 0.7 + confRgb.r * 0.3),
        g: Math.round(selRgb.g * 0.7 + confRgb.g * 0.3),
        b: Math.round(selRgb.b * 0.7 + confRgb.b * 0.3)
      };
      return rgbToHex(blended);
    }
  }
  return selected.color;
}

const BACKGROUNDS = [
  { name: 'Light card', bgHex: '#FFFFFF', textHex: '#1F2933' },
  { name: 'Dark card', bgHex: '#111827', textHex: '#F8FAFC' },
  { name: 'Warm card', bgHex: '#FEF3C7', textHex: '#78350F' },
  { name: 'Cool card', bgHex: '#E0F2FE', textHex: '#0F172A' },
  { name: 'Accent card', bgHex: '#FEE2E2', textHex: '#7F1D1D' },
  { name: 'Muted card', bgHex: '#F5F5F5', textHex: '#374151' },
  { name: 'Mono card', bgHex: '#1F2933', textHex: '#CBD5F5' },
  { name: 'Gradient (approx)', bgHex: '#9333EA', textHex: '#FFF7ED' }
].map((entry) => ({
  ...entry,
  bgRgb: hexToRgb(entry.bgHex),
  textRgb: hexToRgb(entry.textHex)
}));

const results = BACKGROUNDS.map(({ name, bgHex, textHex, bgRgb, textRgb }) => {
  const autoColor = deriveAutoAnchorColor('AA', bgRgb, textRgb);
  const autoRatioBg = bgRgb ? contrastRatio(hexToRgb(autoColor), bgRgb) : null;
  const autoRatioText = textRgb ? contrastRatio(hexToRgb(autoColor), textRgb) : null;
  const aaaColor = deriveAnchorColorWithContrast(CONFIGURED_DEFAULT, 'AAA', bgRgb);
  const aaaRatio = bgRgb ? contrastRatio(hexToRgb(aaaColor), bgRgb) : null;
  return {
    background: name,
    bgHex,
    textHex,
    autoColor,
    autoContrastBg: autoRatioBg ? autoRatioBg.toFixed(2) : 'n/a',
    autoContrastText: autoRatioText ? autoRatioText.toFixed(2) : 'n/a',
    aaaColor,
    aaaRatio: aaaRatio ? aaaRatio.toFixed(2) : 'n/a'
  };
});

console.table(results);
