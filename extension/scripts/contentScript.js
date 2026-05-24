let DEFAULT_SETTINGS = {};

let currentSettings = { ...DEFAULT_SETTINGS };

// We'll use local color utility implementations only - removed dynamic import attempt to avoid conflicts

async function loadDefaults() {
  try {
    const url = chrome.runtime.getURL('defaults.json');
    const resp = await fetch(url);
    const json = await resp.json();
    DEFAULT_SETTINGS = json;
  } catch (err) {
    console.warn('Failed to load defaults:', err);
    DEFAULT_SETTINGS = {};
  }
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeFontChoice(choice) {
  if (!choice || typeof choice !== 'string') return DEFAULT_FONT_CHOICE;
  return Object.prototype.hasOwnProperty.call(FONT_STACKS, choice) ? choice : DEFAULT_FONT_CHOICE;
}

function getFontStack(choice) {
  const normalized = normalizeFontChoice(choice);
  return FONT_STACKS[normalized] || FONT_STACKS[DEFAULT_FONT_CHOICE];
}

function resolveFontChoice() {
  if (currentSettings && currentSettings.fontFamilyChoice) {
    return normalizeFontChoice(currentSettings.fontFamilyChoice);
  }
  if (DEFAULT_SETTINGS && DEFAULT_SETTINGS.fontFamilyChoice) {
    return normalizeFontChoice(DEFAULT_SETTINGS.fontFamilyChoice);
  }
  return DEFAULT_FONT_CHOICE;
}

// Helper for optional debug logging controlled by settings.
function dbg() {}

const FONT_CLASS = 'neuro-friendly-font';
const DEFAULT_FONT_CHOICE = 'open-dyslexic';
const FONT_STACKS = {
  'open-dyslexic': "'Open-Dyslexic','Open-Dyslexic Alta','OpenDyslexic','OpenDyslexicAlta',Arial,sans-serif",
  'easytype-dyslexic': "'EasyType Dyslexic','Open-Dyslexic','Open-Dyslexic Alta','OpenDyslexic','OpenDyslexicAlta',Arial,sans-serif",
  'easytype-focus': "'EasyType Focus','EasyType Sans','Open-Dyslexic','Open-Dyslexic Alta','OpenDyslexic','OpenDyslexicAlta',Arial,sans-serif",
  'easytype-sans': '"EasyType Sans","Atkinson Hyperlegible",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
};
const STYLE_ELEMENT_ID = 'neuro-friendly-style';
const OVERLAY_ID = 'neuro-friendly-overlay';
const FOCUS_OVERLAY_ID = 'neuro-friendly-focus-overlay';
const REDUCE_MOTION_STYLE_ID = 'neuro-friendly-reduce-motion-style';
const REDUCE_MOTION_CLASS = 'neuro-friendly-reduce-motion';
const ANCHOR_WRAPPER_CLASS = 'neuro-friendly-anchor-wrapper';
const ANCHOR_WRAPPER_ATTR = 'data-nf-anchor-original';
const ANCHOR_BOLD_CLASS = 'neuro-friendly-anchor-bold';
const ANCHOR_TAIL_CLASS = 'neuro-friendly-anchor-tail';
const NUMBER_WRAPPER_CLASS = 'neuro-friendly-number-wrapper';
const NUMBER_WRAPPER_ATTR = 'data-nf-number-original';
const ANCHOR_CADENCE_BEAT = 9;
const INTERACTIVE_SELECTOR = 'a, button, strong, em, [role="button"], [aria-hidden="true"]';
const TEXT_EXCLUDE_SELECTOR = 'script, style, code, pre, textarea';
const EXTRA_EXCLUDE_SELECTOR = 'head, template, svg, noscript';
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const LETTER_OR_NUMBER_PATTERN = /[\p{L}\p{N}]/u;
const WHITESPACE_SPLIT_REGEX = /(\s+)/;
const WHITESPACE_ONLY_REGEX = /^\s+$/;
const CADENCE_CHAR_PATTERN = /[\p{L}\p{N}]/gu;
const HEX_BLACK = '#000000';
const HEX_WHITE = '#FFFFFF';
const AUTO_ANCHOR_BASES = ['#2563EB', '#0F172A', '#1098AD', '#F59E0B', '#EF4444', '#F1F5F9'];
const ANCHOR_LANGUAGE_RULES = {
  en: { anchorRatio: 0.4 },
  de: { anchorRatio: 0.45 },
  nl: { anchorRatio: 0.4 },
  fr: { anchorRatio: 0.32 },
  es: { anchorRatio: 0.32 },
  it: { anchorRatio: 0.32 },
  pt: { anchorRatio: 0.32 },
  sv: { anchorRatio: 0.36 },
  da: { anchorRatio: 0.36 },
  no: { anchorRatio: 0.36 },
  pl: { anchorRatio: 0.35 },
  cs: { anchorRatio: 0.35 },
  sk: { anchorRatio: 0.35 },
  tr: { anchorRatio: 0.34 },
  ro: { anchorRatio: 0.34 },
  ru: { anchorRatio: 0.35 },
  uk: { anchorRatio: 0.35 },
  el: { anchorRatio: 0.34 },
  ja: { useColorOnly: true },
  zh: { useColorOnly: true },
  ko: { useColorOnly: true },
  ar: { useColorOnly: true },
  he: { useColorOnly: true },
  fa: { useColorOnly: true },
  default: { anchorRatio: 0.35 }
};

function getAnchorLanguageRules() {
  const code = getLanguageCode();
  const entry = ANCHOR_LANGUAGE_RULES[code] || ANCHOR_LANGUAGE_RULES.default;
  const baseRatio = typeof entry.anchorRatio === 'number' ? entry.anchorRatio : ANCHOR_LANGUAGE_RULES.default.anchorRatio;
  const ratio = clamp(baseRatio, 0.2, 0.6);
  return {
    anchorRatio: ratio,
    useColorOnly: Boolean(entry && entry.useColorOnly)
  };
}

function isGoogleDocsPage() {
  if (!location || !location.hostname) return false;
  if (!location.hostname.endsWith('docs.google.com')) return false;
  return location.pathname.includes('/document/');
}

function getGoogleDocsIframe() {
  if (!isGoogleDocsPage()) return null;
  const iframe = document.querySelector('iframe.docs-texteventtarget-iframe');
  return iframe || null;
}

function getGoogleDocsDocument() {
  const iframe = getGoogleDocsIframe();
  if (!iframe) return null;
  try {
    return iframe.contentDocument || null;
  } catch (err) {
    return null;
  }
}

function getGoogleDocsBody() {
  const doc = getGoogleDocsDocument();
  if (!doc) return null;
  return doc.body || null;
}

function createCadenceState() {
  return { current: 0, nextBeat: ANCHOR_CADENCE_BEAT };
}

function advanceCadenceState(contribution, cadenceState) {
  if (!cadenceState || !Number.isFinite(contribution) || contribution <= 0) return false;
  cadenceState.current = Math.max(0, cadenceState.current) + contribution;
  if (cadenceState.current < cadenceState.nextBeat) return false;
  while (cadenceState.current >= cadenceState.nextBeat) {
    cadenceState.nextBeat += ANCHOR_CADENCE_BEAT;
  }
  return true;
}

function countCadenceCharacters(text) {
  if (!text) return 0;
  const matches = text.match(CADENCE_CHAR_PATTERN);
  return matches ? matches.length : 0;
}

function getAnchorLeadLength(wordLength) {
  if (!Number.isFinite(wordLength) || wordLength <= 0) return 0;
  if (wordLength <= 3) return 1;
  if (wordLength <= 6) return 2;
  if (wordLength <= 8) return 3;
  return 4;
}

function createAnchorNodeFilter() {
  return {
    acceptNode(node) {
      if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentNode;
      if (!parent || !(parent instanceof Element)) return NodeFilter.FILTER_REJECT;
      if (!node.textContent || !LETTER_OR_NUMBER_PATTERN.test(node.textContent)) {
        return NodeFilter.FILTER_SKIP;
      }
      if (parent.closest(`.${ANCHOR_WRAPPER_CLASS}`)) return NodeFilter.FILTER_REJECT;
      if (parent.closest(TEXT_EXCLUDE_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (parent.closest(EXTRA_EXCLUDE_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('nav, header, footer, aside')) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`[${NUMBER_WRAPPER_ATTR}]`)) return NodeFilter.FILTER_REJECT;
      const interactive = parent.closest(INTERACTIVE_SELECTOR);
      if (interactive && interactive.tagName && interactive.tagName.toLowerCase() !== 'a') {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest('input, textarea, select, button, option, optgroup')) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.closest('[aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
      if (parent.isContentEditable || parent.closest('[contenteditable]')) return NodeFilter.FILTER_REJECT;
      const namespace = parent.namespaceURI;
      if (namespace && namespace !== HTML_NAMESPACE) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  };
}
// MAX_OVERLAY_OPACITY and focus-related values are now sourced from DEFAULT_SETTINGS

// --- WCAG contrast helpers ---
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

function hexToRgbLocal(hex) {
  try {
    if (!hex) return null;
    const h = hex.trim().replace(/^#/, '');
    const hex6 = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    if (!/^[0-9a-fA-F]{6}$/.test(hex6)) return null;
    try {
      return {
        r: parseInt(hex6.slice(0, 2), 16),
        g: parseInt(hex6.slice(2, 4), 16),
        b: parseInt(hex6.slice(4, 6), 16)
      };
    } catch (e) {
      return null;
    }
  } catch (e) {
    return null;
  }
}

function rgbToHexLocal({ r, g, b }) {
  const clampChannel = (v) => Math.min(255, Math.max(0, Math.round(v)));
  return `#${clampChannel(r).toString(16).padStart(2, '0')}${clampChannel(g).toString(16).padStart(2, '0')}${clampChannel(b).toString(16).padStart(2, '0')}`;
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function rgbToHslLocal({ r, g, b }) {
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

function hslToRgbLocal({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255)
  };
}

function adjustLightness(rgb, delta) {
  if (!rgb) return null;
  const hsl = rgbToHslLocal(rgb);
  hsl.l = clamp01(hsl.l + delta);
  return hslToRgbLocal(hsl);
}

function rotateHue(rgb, degrees) {
  if (!rgb) return null;
  const hsl = rgbToHslLocal(rgb);
  hsl.h = (hsl.h + degrees) % 360;
  if (hsl.h < 0) hsl.h += 360;
  return hslToRgbLocal(hsl);
}

function parseCssColor(color) {
  if (!color) return null;
  const value = color.trim();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const rgbaMatch = value.match(/^rgba?\(\s*([^)]+)\)/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((p) => p.trim());
    if (parts.length >= 3) {
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      const a = parts.length >= 4 ? Number(parts[3]) : 1;
      if ([r, g, b].every((n) => Number.isFinite(n))) {
        return {
          r: Math.min(255, Math.max(0, Math.round(r))),
          g: Math.min(255, Math.max(0, Math.round(g))),
          b: Math.min(255, Math.max(0, Math.round(b))),
          a: Number.isFinite(a) ? clamp01(a) : 1
        };
      }
    }
    return null;
  }
  if (value.startsWith('#')) {
    const rgb = hexToRgbLocal(value);
    if (rgb) return { ...rgb, a: 1 };
  }
  const hslMatch = value.match(/^hsla?\(\s*([^)]+)\)/i);
  if (hslMatch) {
    const parts = hslMatch[1].split(',').map((p) => p.trim().replace('%', ''));
    if (parts.length >= 3) {
      const h = Number(parts[0]);
      const s = Number(parts[1]) / 100;
      const l = Number(parts[2]) / 100;
      const a = parts.length >= 4 ? Number(parts[3]) : 1;
      if ([h, s, l].every((n) => Number.isFinite(n))) {
        const rgb = hslToRgbLocal({ h, s, l });
        return { ...rgb, a: Number.isFinite(a) ? clamp01(a) : 1 };
      }
    }
  }
  return null;
}

function getEffectiveBackgroundColor(element) {
  const WHITE = { r: 255, g: 255, b: 255, a: 1 };

  const clampAlpha = (alpha) => clamp01(typeof alpha === 'number' ? alpha : 1);

  const blend = (top, bottom) => {
    if (!top) return bottom || WHITE;
    const alpha = clampAlpha(top.a);
    const base = bottom || WHITE;
    if (alpha <= 0.001) return base;
    if (alpha >= 0.999) return { r: top.r, g: top.g, b: top.b, a: 1 };
    const inv = 1 - alpha;
    return {
      r: Math.round(top.r * alpha + base.r * inv),
      g: Math.round(top.g * alpha + base.g * inv),
      b: Math.round(top.b * alpha + base.b * inv),
      a: 1
    };
  };

  const resolveBaseBackground = () => {
    let base = WHITE;
    try {
      const docStyle = getComputedStyle(document.documentElement);
      const docBg = parseCssColor(docStyle.backgroundColor);
      if (docBg) {
        base = blend(docBg, base);
      }
    } catch (err) {
      // ignore
    }
    if (document.body) {
      try {
        const bodyStyle = getComputedStyle(document.body);
        const bodyBg = parseCssColor(bodyStyle.backgroundColor);
        if (bodyBg) {
          base = blend(bodyBg, base);
        }
      } catch (err) {
        // ignore
      }
    }
    return base;
  };

  const baseBackground = resolveBaseBackground();

  const resolve = (node) => {
    if (!node || node === document.documentElement) {
      return baseBackground;
    }
    const parentResolved = resolve(node.parentElement);
    try {
      const style = getComputedStyle(node);
      const bg = parseCssColor(style.backgroundColor);
      if (!bg) return parentResolved;
      const alpha = clampAlpha(bg.a);
      if (alpha <= 0.001) return parentResolved;
      return blend(bg, parentResolved);
    } catch (err) {
      return parentResolved;
    }
  };

  return resolve(element);
}

function normalizeAccentColor(color) {
  const fallback = '#2563EB';
  if (!color || typeof color !== 'string') return fallback;
  let hex = color.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  return fallback;
}

function getConfiguredAnchorColorHex() {
  const configured = (currentSettings && currentSettings.anchorHighlightColor) ||
    (DEFAULT_SETTINGS && DEFAULT_SETTINGS.anchorHighlightColor) ||
    '#2563eb';
  return normalizeAccentColor(configured);
}

function isCustomAnchorColorEnabled() {
  return Boolean(currentSettings && currentSettings.anchorColorCustomEnabled);
}

function isAutoAnchorColorEnabled() {
  return Boolean(currentSettings && currentSettings.anchorColorCustomEnabled && currentSettings.anchorAutoColorEnabled);
}

function getAnchorContrastLevel() {
  const raw = (currentSettings && currentSettings.anchorColorContrastLevel) ||
    (DEFAULT_SETTINGS && DEFAULT_SETTINGS.anchorColorContrastLevel) ||
    'AA';
  return String(raw).toUpperCase() === 'AAA' ? 'AAA' : 'AA';
}

function deriveAnchorColorWithContrast(baseHex, contrastLevel, backgroundRgb) {
  const baseRgb = hexToRgbLocal(baseHex);
  if (!baseRgb) return normalizeAccentColor(baseHex);
  const bg = backgroundRgb || { r: 255, g: 255, b: 255 };
  const target = contrastLevel === 'AAA' ? 7 : 4.5;
  let candidate = { ...baseRgb };
  let ratio = contrastRatio(candidate, bg);
  if (ratio >= target) {
    return normalizeAccentColor(rgbToHexLocal(candidate));
  }
  const bgLum = relativeLuminance(bg);
  const direction = bgLum > 0.5 ? -1 : 1;
  let hsl = rgbToHslLocal(candidate);
  for (let i = 0; i < 12 && ratio < target; i += 1) {
    hsl.l = clamp01(hsl.l + direction * 0.05);
    candidate = hslToRgbLocal(hsl);
    ratio = contrastRatio(candidate, bg);
  }
  if (ratio >= target) {
    return normalizeAccentColor(rgbToHexLocal(candidate));
  }
  const blackRatio = contrastRatio({ r: 0, g: 0, b: 0 }, bg);
  const whiteRatio = contrastRatio({ r: 255, g: 255, b: 255 }, bg);
  return normalizeAccentColor(blackRatio >= whiteRatio ? HEX_BLACK : HEX_WHITE);
}

function rgbToCacheKey(rgb) {
  if (!rgb) return 'null';
  return `${rgb.r},${rgb.g},${rgb.b}`;
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
  const configured = getConfiguredAnchorColorHex();
  const bases = new Set([...AUTO_ANCHOR_BASES, configured]);
  const candidates = [];
  bases.forEach((base) => {
    const derived = deriveAnchorColorWithContrast(base, contrastLevel, bg);
    const rgb = hexToRgbLocal(derived);
    if (!rgb) return;
    const bgRatio = contrastRatio(rgb, bg);
    const textRatio = textRgb ? contrastRatio(rgb, textRgb) : null;
    const score = computeCandidateScore(bgRatio, textRatio, contrastLevel);
    candidates.push({
      color: normalizeAccentColor(derived),
      rgb,
      bgRatio,
      textRatio,
      score
    });
  });
  const blackRatio = contrastRatio({ r: 0, g: 0, b: 0 }, bg);
  const blackTextRatio = textRgb ? contrastRatio({ r: 0, g: 0, b: 0 }, textRgb) : null;
  const blackScore = computeCandidateScore(blackRatio, blackTextRatio, contrastLevel);
  candidates.push({
    color: HEX_BLACK,
    rgb: { r: 0, g: 0, b: 0 },
    bgRatio: blackRatio,
    textRatio: blackTextRatio,
    score: blackScore
  });
  candidates.sort((a, b) => b.score - a.score);
  const bgLum = relativeLuminance(bg);
  const lumThreshold = bgLum > 0.75 || bgLum < 0.25 ? 0.2 : 0.12;
  const choice = candidates.find((candidate) => {
    if (!candidate?.rgb) return false;
    const lum = relativeLuminance(candidate.rgb);
    return Math.abs(lum - bgLum) >= lumThreshold;
  }) || candidates[0];
  if (!choice) return HEX_BLACK;
  if (typeof choice.textRatio === 'number' && choice.textRatio < 1.6) {
    const selectedRgb = hexToRgbLocal(choice.color);
    const configuredRgb = hexToRgbLocal(configured);
    if (selectedRgb && configuredRgb) {
      const blended = {
        r: Math.round(selectedRgb.r * 0.7 + configuredRgb.r * 0.3),
        g: Math.round(selectedRgb.g * 0.7 + configuredRgb.g * 0.3),
        b: Math.round(selectedRgb.b * 0.7 + configuredRgb.b * 0.3)
      };
      return normalizeAccentColor(rgbToHexLocal(blended));
    }
  }
  return normalizeAccentColor(choice.color);
}

function getAnchorColorForElement(element) {
  if (!isCustomAnchorColorEnabled()) return null;
  const level = getAnchorContrastLevel();
  const configured = getConfiguredAnchorColorHex();
  const autoEnabled = isAutoAnchorColorEnabled();
  if (!element) {
    if (autoEnabled) return deriveAutoAnchorColor(level, null, null);
    return deriveAnchorColorWithContrast(configured, level, null);
  }
  let background = null;
  let textColor = null;
  try {
    const style = getComputedStyle(element);
    const bgParsed = parseCssColor(style.backgroundColor);
    if (bgParsed && bgParsed.a > 0.001) {
      if (bgParsed.a >= 0.999) {
        background = { r: bgParsed.r, g: bgParsed.g, b: bgParsed.b };
      } else {
        const blended = getEffectiveBackgroundColor(element);
        background = blended ? { r: blended.r, g: blended.g, b: blended.b } : null;
      }
    } else {
      const resolved = getEffectiveBackgroundColor(element);
      background = resolved ? { r: resolved.r, g: resolved.g, b: resolved.b } : null;
    }
    const fgParsed = parseCssColor(style.color);
    if (fgParsed && fgParsed.a > 0.01) {
      textColor = { r: fgParsed.r, g: fgParsed.g, b: fgParsed.b };
    }
  } catch (err) {
    try {
      const bg = getEffectiveBackgroundColor(element);
      background = bg ? { r: bg.r, g: bg.g, b: bg.b } : null;
    } catch (e) {
      background = null;
    }
  }
  const bgKey = rgbToCacheKey(background);
  const textKey = rgbToCacheKey(textColor);
  const cacheEntry = anchorColorCache.get(element);
  if (cacheEntry &&
    cacheEntry.auto === autoEnabled &&
    cacheEntry.level === level &&
    cacheEntry.configured === configured &&
    cacheEntry.bg === bgKey &&
    cacheEntry.text === textKey
  ) {
    return cacheEntry.color;
  }
  const color = autoEnabled
    ? deriveAutoAnchorColor(level, background, textColor)
    : deriveAnchorColorWithContrast(configured, level, background);
  const normalized = color ? normalizeAccentColor(color) : null;
  if (normalized) {
    anchorColorCache.set(element, { auto: autoEnabled, level, configured, bg: bgKey, text: textKey, color: normalized });
  }
  return normalized;
}

function getAnchorColorForTextNode(textNode) {
  if (!isCustomAnchorColorEnabled()) return null;
  const autoEnabled = isAutoAnchorColorEnabled();
  const level = getAnchorContrastLevel();
  if (!textNode) {
    if (autoEnabled) {
      return deriveAutoAnchorColor(level, null, null);
    }
    return deriveAnchorColorWithContrast(getConfiguredAnchorColorHex(), level, null);
  }
  const parent = textNode.parentElement || (textNode.parentNode instanceof Element ? textNode.parentNode : null);
  if (!parent) {
    if (autoEnabled) return deriveAutoAnchorColor(level, null, null);
    return deriveAnchorColorWithContrast(getConfiguredAnchorColorHex(), level, null);
  }
  return getAnchorColorForElement(parent);
}

let focusOverlayCenter = null;
let focusHandlersAttached = false;

function ensureStyleElement() {
  let styleEl = document.getElementById(STYLE_ELEMENT_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    styleEl.textContent = `
      .${FONT_CLASS}, .${FONT_CLASS} :not(i):not([class*="icon"]):not([class*="fa-"]) {
        font-family: var(--neuro-friendly-font) !important;
        font-kerning: normal;
      }
      .${FONT_CLASS} p,
      .${FONT_CLASS} a,
      .${FONT_CLASS} li,
      .${FONT_CLASS} dd,
      .${FONT_CLASS} blockquote,
      .${FONT_CLASS} td,
      .${FONT_CLASS} th,
      .${FONT_CLASS} article,
      .${FONT_CLASS} section,
      .${FONT_CLASS} h1,
      .${FONT_CLASS} h2,
      .${FONT_CLASS} h3,
      .${FONT_CLASS} h4,
      .${FONT_CLASS} h5,
      .${FONT_CLASS} h6 {
        line-height: 1.5 !important;
      }
      .${FONT_CLASS} input,
      .${FONT_CLASS} textarea,
      .${FONT_CLASS} select,
      .${FONT_CLASS} button {
        font-family: var(--neuro-friendly-font), sans-serif !important;
      }
      .${ANCHOR_WRAPPER_CLASS} {
        display: contents;
        white-space: inherit;
      }
      .${ANCHOR_BOLD_CLASS} {
        font-weight: 700;
        color: inherit;
        letter-spacing: 0.03em;
        min-width:auto!important;
      }
      .${ANCHOR_TAIL_CLASS} {
        opacity: 0.85;
        display: inline;
      }
    `;
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

function ensureReduceMotionStyle() {
  let styleEl = document.getElementById(REDUCE_MOTION_STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = REDUCE_MOTION_STYLE_ID;
    styleEl.textContent = `
      html.${REDUCE_MOTION_CLASS},
      html.${REDUCE_MOTION_CLASS} * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0s !important;
        scroll-behavior: auto !important;
      }
      html.${REDUCE_MOTION_CLASS} * {
        animation-play-state: paused !important;
      }
    `;
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

function applyFontPreference() {
  const root = document.documentElement;
  if (!root) return;
  try {
    const stack = getFontStack(resolveFontChoice());
    if (stack) {
      root.style.setProperty('--neuro-friendly-font', stack);
    }
  } catch (err) {
    // ignore style issues
  }

  if (currentSettings.fontsEnabled) {
    ensureStyleElement();
    root.classList.add(FONT_CLASS);
  } else {
    root.classList.remove(FONT_CLASS);
  }
}

function ensureOverlayElement() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      mixBlendMode: 'multiply',
      zIndex: '2147483646',
      transition: 'background-color 0.2s ease, opacity 0.2s ease'
    });
    document.documentElement.appendChild(overlay);
  }
  return overlay;
}

function ensureFocusOverlayElement() {
  let overlay = document.getElementById(FOCUS_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = FOCUS_OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transition: 'opacity 0.2s ease',
      opacity: '0',
      display: 'none'
    });
    document.documentElement.appendChild(overlay);
  }

  if (!overlay.querySelector('[data-role="focus-top"]')) {
    const topShade = document.createElement('div');
    topShade.dataset.role = 'focus-top';
    const softness = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.focusEdgeSoftness === 'number') ? DEFAULT_SETTINGS.focusEdgeSoftness : 64;
    const shadeOpacity = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.focusShadeOpacity === 'number') ? DEFAULT_SETTINGS.focusShadeOpacity : 0.5;
    Object.assign(topShade.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      // Keep the outer area opaque and fade only at the inner edge.
      // Use calc(100% - softness px) so the gradient transition occurs at the bottom of this element.
      background: `linear-gradient(to bottom, rgba(17,24,39,${shadeOpacity}) calc(100% - ${softness}px), rgba(17,24,39,0) 100%)`,
      backgroundRepeat: 'no-repeat'
    });
    overlay.appendChild(topShade);
  }

  if (!overlay.querySelector('[data-role="focus-bottom"]')) {
    const bottomShade = document.createElement('div');
    bottomShade.dataset.role = 'focus-bottom';
    const softnessB = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.focusEdgeSoftness === 'number') ? DEFAULT_SETTINGS.focusEdgeSoftness : 64;
    const shadeOpacityB = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.focusShadeOpacity === 'number') ? DEFAULT_SETTINGS.focusShadeOpacity : 0.5;
    Object.assign(bottomShade.style, {
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: '0',
      // For bottom shade we fade at the top edge of this element (inner edge).
      background: `linear-gradient(to top, rgba(17,24,39,${shadeOpacityB}) calc(100% - ${softnessB}px), rgba(17,24,39,0) 100%)`,
      backgroundRepeat: 'no-repeat'
    });
    overlay.appendChild(bottomShade);
  }
  return overlay;
}

function getFocusOverlaySections(overlay) {
  return {
    top: overlay.querySelector('[data-role="focus-top"]'),
    bottom: overlay.querySelector('[data-role="focus-bottom"]')
  };
}

function calculateFocusSections(centerPx) {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!viewportHeight) {
    return { top: 0, windowHeight: 0, bottom: 0, center: centerPx || 0 };
  }
  const windowRatio = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.focusWindowRatio === 'number') ? DEFAULT_SETTINGS.focusWindowRatio : 0.36;
  const minHeight = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.minFocusWindowHeight === 'number') ? DEFAULT_SETTINGS.minFocusWindowHeight : 180;
  const windowHeight = clamp(
    viewportHeight * windowRatio,
    minHeight,
    viewportHeight
  );
  const halfWindow = windowHeight / 2;
  const fallbackCenter = viewportHeight / 2;
  const targetCenter = typeof centerPx === 'number' ? centerPx : (focusOverlayCenter ?? fallbackCenter);
  const clampedCenter = clamp(targetCenter, halfWindow, viewportHeight - halfWindow);
  const top = clamp(clampedCenter - halfWindow, 0, viewportHeight);
  const bottom = clamp(viewportHeight - clampedCenter - halfWindow, 0, viewportHeight);

  return {
    top,
    windowHeight,
    bottom,
    center: clampedCenter
  };
}

function updateFocusOverlay(centerPx) {
  const overlay = ensureFocusOverlayElement();
  const { top, bottom, center } = calculateFocusSections(centerPx);
  const { top: topShade, bottom: bottomShade } = getFocusOverlaySections(overlay);

  focusOverlayCenter = center;

  if (topShade) {
    topShade.style.height = `${Math.round(top)}px`;
  }
  if (bottomShade) {
    bottomShade.style.height = `${Math.round(bottom)}px`;
  }
}

function handleFocusMouseMove(event) {
  if (!currentSettings.focusModeEnabled) return;
  updateFocusOverlay(event.clientY);
}

function handleFocusTouch(event) {
  if (!currentSettings.focusModeEnabled) return;
  const touch = event.touches?.[0];
  if (!touch) return;
  updateFocusOverlay(touch.clientY);
}

function handleFocusIn(event) {
  if (!currentSettings.focusModeEnabled) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const rect = target.getBoundingClientRect?.();
  if (!rect) return;
  const center = rect.top + rect.height / 2;
  if (!Number.isFinite(center)) return;
  updateFocusOverlay(center);
}

function handleFocusResize() {
  if (!currentSettings.focusModeEnabled) return;
  updateFocusOverlay();
}

function attachFocusHandlers() {
  if (focusHandlersAttached) return;
  focusHandlersAttached = true;
  window.addEventListener('mousemove', handleFocusMouseMove, { passive: true });
  window.addEventListener('touchstart', handleFocusTouch, { passive: true });
  window.addEventListener('touchmove', handleFocusTouch, { passive: true });
  document.addEventListener('focusin', handleFocusIn, true);
  window.addEventListener('resize', handleFocusResize);
}

function detachFocusHandlers() {
  if (!focusHandlersAttached) return;
  focusHandlersAttached = false;
  window.removeEventListener('mousemove', handleFocusMouseMove);
  window.removeEventListener('touchstart', handleFocusTouch);
  window.removeEventListener('touchmove', handleFocusTouch);
  document.removeEventListener('focusin', handleFocusIn, true);
  window.removeEventListener('resize', handleFocusResize);
}

let anchorColorCache = new WeakMap();
let lastAnchorSettings = {
  anchorsEnabled: null,
  sentenceHighlightEnabled: null,
  customEnabled: null,
  autoEnabled: null,
  color: null
};

const pendingAnchorColorNodes = new Set();
let anchorColorApplyScheduled = false;
let pendingAnchorCoverageCheck = null;

function queueAnchorColorNode(node) {
  if (!(node instanceof HTMLElement)) return;
  pendingAnchorColorNodes.add(node);
  if (!anchorColorApplyScheduled) {
    anchorColorApplyScheduled = true;
    setTimeout(applyQueuedAnchorAccentColors, 0);
  }
}

function applyQueuedAnchorAccentColors() {
  anchorColorApplyScheduled = false;
  if (pendingAnchorColorNodes.size === 0) return;
  const nodes = Array.from(pendingAnchorColorNodes);
  pendingAnchorColorNodes.clear();
  const customEnabled = isCustomAnchorColorEnabled();
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (!node.isConnected) return;
    if (!customEnabled) {
      node.style.color = '';
      return;
    }
    const color = getAnchorColorForElement(node) || getAnchorColorForElement(node.parentElement);
    if (color) {
      node.style.color = color;
    } else {
      node.style.color = '';
    }
  });
}

function requestAnchorCoverageCheck() {
  if (pendingAnchorCoverageCheck) {
    clearTimeout(pendingAnchorCoverageCheck);
  }
  pendingAnchorCoverageCheck = setTimeout(() => {
    pendingAnchorCoverageCheck = null;
    if (!currentSettings.anchorHighlightEnabled && !currentSettings.anchorSentenceHighlightEnabled) return;
    try {
      const root = document.body || document.documentElement;
      if (root) {
        scheduleIncrementalTextRescan(root);
      }
    } catch (err) {
      scheduleTextFeatureRescan();
    }
  }, 250);
}

let anchorVerificationTimer = null;
let anchorVerificationAttempts = 0;
const MAX_ANCHOR_VERIFICATION_ATTEMPTS = 4;

function handleAnchorTextNode(node, anchorsEnabled, sentenceHighlightEnabled, anchorRules, highlightNumbers, cadenceState) {
  if (!(node instanceof Text)) return;
  if (!node.textContent) return;
  if (!node.parentNode) return;
  if (!anchorsEnabled) return;
  processSingleTextNode(node, anchorsEnabled, sentenceHighlightEnabled, anchorRules, cadenceState);
}

function scheduleAnchorVerification(reason) {
  if (!currentSettings.anchorHighlightEnabled && !currentSettings.anchorSentenceHighlightEnabled) {
    anchorVerificationAttempts = 0;
    if (anchorVerificationTimer) {
      clearTimeout(anchorVerificationTimer);
      anchorVerificationTimer = null;
    }
    return;
  }
  if (anchorVerificationAttempts >= MAX_ANCHOR_VERIFICATION_ATTEMPTS) return;
  if (anchorVerificationTimer) return;
  anchorVerificationTimer = setTimeout(() => {
    anchorVerificationTimer = null;
    if (!currentSettings.anchorHighlightEnabled && !currentSettings.anchorSentenceHighlightEnabled) {
      anchorVerificationAttempts = 0;
      return;
    }
    const wrapperCount = document.querySelectorAll(`.${ANCHOR_WRAPPER_CLASS}`).length;
    if (wrapperCount === 0) {
      anchorVerificationAttempts += 1;
      applyAnchorHighlightPreference();
    } else {
      anchorVerificationAttempts = 0;
    }
  }, reason === 'post-toggle' ? 400 : 700);
}

function processAnchorNodesWithPrioritization(nodes, anchorsEnabled, sentenceHighlightEnabled, anchorRules, highlightNumbers, cadenceState) {
  if (!Array.isArray(nodes) || nodes.length === 0) return;
  const workingCadenceState = anchorsEnabled
    ? (cadenceState || createCadenceState())
    : null;

  nodes.forEach((node) => {
    if (!(node instanceof Text)) return;
    handleAnchorTextNode(node, anchorsEnabled, sentenceHighlightEnabled, anchorRules, highlightNumbers, workingCadenceState);
  });
}

// Process a single text node for anchor highlighting (extracted for incremental updates)
function processSingleTextNode(textNode, anchorsEnabled, sentenceHighlightEnabled, anchorRules, cadenceState) {
  if (!anchorsEnabled) return;
  const originalText = textNode.textContent;
  if (!originalText?.trim()) return;

  const rules = anchorRules || getAnchorLanguageRules();
  const useColorOnly = Boolean(rules && rules.useColorOnly);
  if (useColorOnly) return;

  const cadence = cadenceState || createCadenceState();
  const tokens = originalText.split(WHITESPACE_SPLIT_REGEX);
  const fragment = document.createDocumentFragment();
  let mutated = false;

  tokens.forEach((token) => {
    if (!token) return;
    if (WHITESPACE_ONLY_REGEX.test(token)) {
      fragment.appendChild(document.createTextNode(token));
      return;
    }
    if (!LETTER_OR_NUMBER_PATTERN.test(token)) {
      fragment.appendChild(document.createTextNode(token));
      return;
    }

    const contribution = countCadenceCharacters(token);
    const shouldAnchor = cadence && contribution > 0
      ? advanceCadenceState(contribution, cadence)
      : false;

    if (!shouldAnchor) {
      fragment.appendChild(document.createTextNode(token));
      return;
    }

    mutated = true;
    const leadLength = Math.min(token.length, Math.max(1, getAnchorLeadLength(token.length)));
    const leadSpan = document.createElement('span');
    leadSpan.className = ANCHOR_BOLD_CLASS;
    leadSpan.textContent = token.slice(0, leadLength);
    queueAnchorColorNode(leadSpan);
    fragment.appendChild(leadSpan);

    if (leadLength < token.length) {
      const tailSpan = document.createElement('span');
      tailSpan.className = ANCHOR_TAIL_CLASS;
      tailSpan.textContent = token.slice(leadLength);
      fragment.appendChild(tailSpan);
    }
  });

  if (!mutated) return;

  const wrapper = document.createElement('span');
  wrapper.className = ANCHOR_WRAPPER_CLASS;
  wrapper.setAttribute(ANCHOR_WRAPPER_ATTR, originalText);
  try {
    wrapper.style.display = 'inline';
    wrapper.style.whiteSpace = 'inherit';
    wrapper.style.minWidth = '0';
    wrapper.style.width = 'auto';
    wrapper.style.flex = '0 0 auto';
  } catch (err) {
    // ignore style issues
  }
  wrapper.appendChild(fragment);

  textNode.parentNode?.replaceChild(wrapper, textNode);
}

// Incremental processing for added subtrees: process text nodes and numbers inside the subtree only.
function processAddedTextNodes(root) {
  if (!root) return;
  scheduleTextFeatureRescan();
}

function clearAnchorHighlights() {
  const docs = [document, getGoogleDocsDocument()].filter(Boolean);
  docs.forEach((doc) => {
    doc.querySelectorAll(`.${ANCHOR_WRAPPER_CLASS}`).forEach((wrapper) => {
      const original = wrapper.getAttribute(ANCHOR_WRAPPER_ATTR);
      const fallback = wrapper.textContent || '';
      const textNode = doc.createTextNode(original ?? fallback);
      wrapper.replaceWith(textNode);
    });
  });
}

function clearNumberHighlights() {
  const docs = [document, getGoogleDocsDocument()].filter(Boolean);
  docs.forEach((doc) => {
    doc.querySelectorAll(`.${NUMBER_WRAPPER_CLASS}[${NUMBER_WRAPPER_ATTR}]`).forEach((wrapper) => {
      const original = wrapper.getAttribute(NUMBER_WRAPPER_ATTR);
      const fallback = wrapper.textContent || '';
      const textNode = doc.createTextNode(original ?? fallback);
      wrapper.replaceWith(textNode);
    });
  });
}

function applyNumberHighlightPreference() {
  clearNumberHighlights();
}

function getLanguageCode() {
  const defaultLang = (DEFAULT_SETTINGS && DEFAULT_SETTINGS.defaultStopwordLang) ? DEFAULT_SETTINGS.defaultStopwordLang : 'en';
  const lang = (document.documentElement.lang || navigator.language || defaultLang).toLowerCase();
  const [code] = lang.split('-');
  return code || defaultLang;
}

function highlightAnchors({ anchorsEnabled, sentenceHighlightEnabled }) {
  if (!anchorsEnabled && !sentenceHighlightEnabled) {
    return;
  }

  const contexts = [];
  const defaultRoot = document.body || document.documentElement;
  if (defaultRoot) contexts.push({ type: 'default', root: defaultRoot });
  const gdocsRoot = getGoogleDocsBody();
  if (gdocsRoot) contexts.push({ type: 'gdocs', root: gdocsRoot });

  if (!contexts.length) return;

  const anchorRules = getAnchorLanguageRules();

  contexts.forEach((ctx) => {
    const nodes = ctx.type === 'gdocs'
      ? collectGoogleDocsNodes(ctx.root)
      : collectDocumentNodes(ctx.root);
    if (!nodes.length) return;
    const cadenceState = anchorsEnabled ? createCadenceState() : null;
    processAnchorNodesWithPrioritization(nodes, anchorsEnabled, sentenceHighlightEnabled, anchorRules, false, cadenceState);
  });
}

function collectDocumentNodes(root) {
  if (!root || !root.ownerDocument) return [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, createAnchorNodeFilter());
  const nodes = [];
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current instanceof Text) {
      nodes.push(current);
    }
  }
  return nodes;
}

function collectGoogleDocsNodes(root) {
  if (!root || !root.ownerDocument) return [];
  const doc = root.ownerDocument;
  const paragraphs = root.querySelectorAll('.kix-paragraphrenderer');
  if (!paragraphs.length) return [];
  const nodes = [];
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const buffer = Math.max(300, Math.round(viewportHeight * 0.4));
  const filter = createAnchorNodeFilter();

  paragraphs.forEach((para) => {
    let rect;
    try {
      rect = para.getBoundingClientRect();
    } catch (err) {
      rect = null;
    }
    if (!rect) return;
    if (rect.bottom < -buffer || rect.top > viewportHeight + buffer) return;
    const walker = doc.createTreeWalker(para, NodeFilter.SHOW_TEXT, filter);
    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (current instanceof Text) {
        nodes.push(current);
      }
    }
  });

  return nodes;
}

function applyAnchorHighlightPreference() {
  const anchorsEnabled = Boolean(currentSettings.anchorHighlightEnabled);
  const sentenceHighlightEnabled = Boolean(currentSettings.anchorSentenceHighlightEnabled);
  const customEnabled = isCustomAnchorColorEnabled();
  const autoEnabled = isAutoAnchorColorEnabled();
  const colorKey = customEnabled ? (autoEnabled ? 'auto' : getConfiguredAnchorColorHex()) : null;

  if (
    anchorsEnabled === lastAnchorSettings.anchorsEnabled &&
    sentenceHighlightEnabled === lastAnchorSettings.sentenceHighlightEnabled &&
    customEnabled === lastAnchorSettings.customEnabled &&
    autoEnabled === lastAnchorSettings.autoEnabled &&
    colorKey === lastAnchorSettings.color
  ) {
    return;
  }

  lastAnchorSettings = { anchorsEnabled, sentenceHighlightEnabled, customEnabled, autoEnabled, color: colorKey };
  anchorColorCache = new WeakMap();

  if (!anchorsEnabled && !sentenceHighlightEnabled) {
    anchorVerificationAttempts = 0;
    if (anchorVerificationTimer) {
      clearTimeout(anchorVerificationTimer);
      anchorVerificationTimer = null;
    }
    clearAnchorHighlights();
    return;
  }

  clearAnchorHighlights();

  try {
    highlightAnchors({ anchorsEnabled, sentenceHighlightEnabled });
    requestAnchorCoverageCheck();
    scheduleAnchorVerification('post-apply');
  } catch (err) {
    scheduleTextFeatureRescan();
  }
}

function applyOverlayPreference() {
  const overlay = ensureOverlayElement();
  const { overlayEnabled, overlayColor, overlayOpacity } = currentSettings;
  if (overlayEnabled && overlayOpacity > 0) {
    overlay.style.backgroundColor = overlayColor;
    const max = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.maxOverlayOpacity === 'number') ? DEFAULT_SETTINGS.maxOverlayOpacity : 1;
    overlay.style.opacity = String(Math.min(Math.max(overlayOpacity, 0), max));
    overlay.style.display = 'block';
  } else {
    overlay.style.display = 'none';
  }
}

function applyFocusPreference() {
  const overlay = currentSettings.focusModeEnabled
    ? ensureFocusOverlayElement()
    : document.getElementById(FOCUS_OVERLAY_ID);

  if (currentSettings.focusModeEnabled) {
    overlay.style.display = 'block';
    updateFocusOverlay();
    overlay.style.opacity = '1';
    attachFocusHandlers();
  } else if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.display = 'none';
    focusOverlayCenter = null;
    detachFocusHandlers();
  }
}

function applyReduceMotionPreference() {
  const root = document.documentElement;
  if (!root) return;

  if (currentSettings.reduceMotionEnabled) {
    ensureReduceMotionStyle();
    root.classList.add(REDUCE_MOTION_CLASS);
  } else {
    root.classList.remove(REDUCE_MOTION_CLASS);
  }
}
/* === NEW FEATURES === */

function applySpacingPreferences() {
  const root = document.documentElement;
  if (!root) return;
  const { lineHeightOverride, letterSpacingOverride, paragraphSpacingOverride, typographyEnabled } = currentSettings;
  let style = document.getElementById('nf-spacing-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'nf-spacing-style';
    document.head.appendChild(style);
  }
  if (typographyEnabled) {
    style.textContent = `
    body, p, li, span, div, a {
      line-height: ${lineHeightOverride};
      letter-spacing: ${letterSpacingOverride}em;
    }
    p { margin-bottom: ${paragraphSpacingOverride}em; }
  `;
  } else {
    style.textContent = '';
  }
}

function applySensoryPreferences() {
  const { reduceColourSaturationEnabled, disableAutoPlayMedia, noFlashAnimationsEnabled } = currentSettings;

  let style = document.getElementById('nf-sensory-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'nf-sensory-style';
    document.head.appendChild(style);
  }

  let css = '';
  // Layout & Predictability (minimal UI / plain reader) removed

  if (reduceColourSaturationEnabled)
    css += `html { filter:saturate(70%); }`;
  if (noFlashAnimationsEnabled)
    css += `*, *::before, *::after { animation:none !important; }`;

  style.textContent = css;

  if (disableAutoPlayMedia) {
    document.querySelectorAll('video, audio').forEach((m) => {
      m.autoplay = false;
      m.pause?.();
    });
  }
}

function applyTableSimplification() {
  const { tableSimplifyEnabled } = currentSettings;
  let style = document.getElementById('nf-table-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'nf-table-style';
    document.head.appendChild(style);
  }
  style.textContent = tableSimplifyEnabled
    ? `
    table { border-collapse: collapse !important; width: 100% !important; font-size: 0.9em !important; }
    table tr:nth-child(even) { background: #f9f9f9; }
    table td, table th { border: 1px solid #ccc !important; padding: 4px 6px !important; }
    `
    : '';
}

let breakReminderTimer = null;
function applyBreakReminder() {
  clearTimeout(breakReminderTimer);
  if (!currentSettings.breakReminderEnabled) return;
  const interval = (currentSettings.breakIntervalMinutes || 15) * 60 * 1000;
  breakReminderTimer = setTimeout(() => {
    alert('Time for a quick break! Stretch, breathe, or hydrate.');
  }, interval);
}

// -------------------------
// Mutation observer helpers
// -------------------------
let globalMutationObserver = null;
let googleDocsObserver = null;
let googleDocsFrameMonitor = null;
let pendingTextRescan = null;
let pendingMediaScan = null;
const processedMedia = new WeakSet();
let originalMediaPlay = null;
let healTimer = null;

function enableAggressiveMediaBlock() {
  try {
    if (originalMediaPlay) return;
    originalMediaPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      // If disableAutoPlayMedia is enabled or aggressive block requested, prevent playback
      if (currentSettings.disableAutoPlayMedia || currentSettings.aggressiveMediaBlockEnabled) {
        try {
          this.pause?.();
        } catch (e) {
          // ignore
        }
        return Promise.resolve();
      }
      return originalMediaPlay.apply(this, arguments);
    };
  } catch (err) {
    console.error('enableAggressiveMediaBlock failed', err);
  }
}

function disableAggressiveMediaBlock() {
  try {
    dbg('disableAggressiveMediaBlock called');
    if (!originalMediaPlay) return;
    HTMLMediaElement.prototype.play = originalMediaPlay;
    originalMediaPlay = null;
  } catch (err) {
    console.error('disableAggressiveMediaBlock failed', err);
  }
}

function scanAndDisableMedia(root = document) {
  try {
    dbg('scanAndDisableMedia', root);
    // Normalize scope so we only call querySelectorAll on objects that implement it
    let scope;
    if (root instanceof Document) {
      scope = document;
    } else if (root instanceof Element) {
      scope = root;
    } else if (root && root.parentElement) {
      // e.g. Text nodes or similar — use their parent element as the scope
      scope = root.parentElement;
    } else {
      scope = document;
    }

    let media;
    if (scope === document) {
      media = document.querySelectorAll('video, audio');
    } else if (scope instanceof Element && scope.matches && scope.matches('video, audio')) {
      media = [scope];
    } else if (typeof scope.querySelectorAll === 'function') {
      media = scope.querySelectorAll('video, audio');
    } else {
      media = document.querySelectorAll('video, audio');
    }
    media.forEach((m) => {
      if (!(m instanceof HTMLMediaElement)) return;
      // avoid re-processing same element too often
      if (processedMedia.has(m)) return;
      try {
        m.autoplay = false;
        m.pause?.();
        dbg('disabled media element', m);
      } catch (err) {
        // ignore
      }
      processedMedia.add(m);
    });
  } catch (err) {
    console.error('scanAndDisableMedia failed', err);
  }
}

function scheduleMediaScan(root) {
  if (pendingMediaScan) clearTimeout(pendingMediaScan);
  const ms = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.scanDebounceMs === 'number') ? DEFAULT_SETTINGS.scanDebounceMs : 120;
  pendingMediaScan = setTimeout(() => {
    pendingMediaScan = null;
    scanAndDisableMedia(root);
  }, ms);
}

function scheduleTextFeatureRescan() {
  if (pendingTextRescan) clearTimeout(pendingTextRescan);
  const ms = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.textRescanDebounceMs === 'number') ? DEFAULT_SETTINGS.textRescanDebounceMs : 150;
  pendingTextRescan = setTimeout(() => {
    pendingTextRescan = null;
    try {
      // re-run the global anchor/number highlight passes
      applyAnchorHighlightPreference();
      applyNumberHighlightPreference();
    } catch (err) {
      console.error('scheduleTextFeatureRescan failed', err);
    }
  }, ms);
}

let pendingIncrementalRescan = null;
function scheduleIncrementalTextRescan(root) {
  if (pendingIncrementalRescan) clearTimeout(pendingIncrementalRescan);
  const ms = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.scanDebounceMs === 'number') ? DEFAULT_SETTINGS.scanDebounceMs : 120;
  pendingIncrementalRescan = setTimeout(() => {
    pendingIncrementalRescan = null;
    try {
      processAddedTextNodes(root);
    } catch (err) {
      // fallback to full rescan
      scheduleTextFeatureRescan();
    }
  }, ms);
}

function processAddedNode(node) {
  if (!(node instanceof Node)) return;
  // If media blocking enabled, scan media under node
  if (currentSettings.disableAutoPlayMedia) scheduleMediaScan(node);
  // If anchor or sentence highlighting or number highlighting enabled, schedule a text rescan
  if (currentSettings.anchorHighlightEnabled || currentSettings.anchorSentenceHighlightEnabled || currentSettings.numberHighlightEnabled) {
    scheduleIncrementalTextRescan(node);
  }
}

function observerCallback(mutations) {
  for (const m of mutations) {
    if (m.type === 'childList') {
      m.addedNodes.forEach((n) => processAddedNode(n));
    } else if (m.type === 'attributes') {
      // attribute changes may indicate our elements were removed or altered; run a light heal
      try {
        processAddedNode(m.target);
      } catch (err) {
        // ignore — we'll run verifyAndHeal below
      }
      // run a lightweight verification to ensure our artifacts still exist
      try {
        dbg('observerCallback: attribute change, running verifyAndHeal');
        if (typeof verifyAndHeal === 'function') verifyAndHeal();
      } catch (err) {
        console.error('observerCallback: verifyAndHeal failed', err);
      }
    }
  }
}

function ensureGlobalMutationObserver() {
  if (globalMutationObserver) return globalMutationObserver;
  try {
    globalMutationObserver = new MutationObserver(observerCallback);
  } catch (err) {
    globalMutationObserver = null;
  }
  return globalMutationObserver;
}

function ensureGoogleDocsObserver() {
  if (googleDocsObserver) return googleDocsObserver;
  try {
    googleDocsObserver = new MutationObserver(observerCallback);
  } catch (err) {
    googleDocsObserver = null;
  }
  return googleDocsObserver;
}

function disconnectGoogleDocsObserver() {
  if (!googleDocsObserver) return;
  try {
    googleDocsObserver.disconnect();
  } catch (err) {
    console.error('GoogleDocs observer disconnect failed', err);
  }
  googleDocsObserver = null;
}

function updateMutationObserverState() {
  const needsObserver = !!(
    currentSettings.disableAutoPlayMedia ||
    currentSettings.aggressiveMediaBlockEnabled ||
    currentSettings.anchorHighlightEnabled ||
    currentSettings.anchorSentenceHighlightEnabled ||
    currentSettings.numberHighlightEnabled
  );

  const obs = ensureGlobalMutationObserver();
  if (!obs) return;

  const target = document.documentElement || document.body || document;
  if (needsObserver) {
    // start observing
    try {
      obs.observe(target, { childList: true, subtree: true, attributes: false });
    } catch (err) {
      console.error('MutationObserver.observe failed', err);
    }
    // run an initial scan for current content
    if (currentSettings.disableAutoPlayMedia) scanAndDisableMedia(document);
    if (currentSettings.anchorHighlightEnabled || currentSettings.anchorSentenceHighlightEnabled || currentSettings.numberHighlightEnabled) scheduleTextFeatureRescan();
  } else {
    try {
      obs.disconnect();
    } catch (err) {
      console.error('MutationObserver.disconnect failed', err);
    }
  }

  updateGoogleDocsObserverState(needsObserver);
}

function updateGoogleDocsObserverState(needsObserver) {
  if (!isGoogleDocsPage()) {
    disconnectGoogleDocsObserver();
    if (googleDocsFrameMonitor) {
      clearInterval(googleDocsFrameMonitor);
      googleDocsFrameMonitor = null;
    }
    return;
  }

  if (!needsObserver) {
    disconnectGoogleDocsObserver();
    return;
  }

  const target = getGoogleDocsBody();
  if (!target) {
    if (!googleDocsFrameMonitor) {
      googleDocsFrameMonitor = setInterval(() => {
        if (getGoogleDocsBody()) {
          clearInterval(googleDocsFrameMonitor);
          googleDocsFrameMonitor = null;
          updateGoogleDocsObserverState(needsObserver);
          scheduleTextFeatureRescan();
        }
      }, 1200);
    }
    return;
  }

  const obs = ensureGoogleDocsObserver();
  if (!obs) return;
  try {
    obs.observe(target, { childList: true, subtree: true, attributes: false });
  } catch (err) {
    console.error('GoogleDocs observer failed', err);
  }
}

// Verify presence of our injected artifacts and re-apply preferences if needed.
function verifyAndHeal() {
  try {
    dbg('verifyAndHeal start');
    // Ensure base style exists (font rules)
    ensureStyleElement();

    // Re-apply global preferences that create DOM artifacts or classes
    applyFontPreference();
    applyOverlayPreference();
    applyFocusPreference();
    applyReduceMotionPreference();
    applySpacingPreferences();
    applySensoryPreferences();
    applyTableSimplification();

    // Ensure media blocking is applied if requested
    if (currentSettings.disableAutoPlayMedia) scanAndDisableMedia(document);
    if (currentSettings.aggressiveMediaBlockEnabled) enableAggressiveMediaBlock(); else disableAggressiveMediaBlock();

    // Ensure incremental text features are scheduled
    if (currentSettings.anchorHighlightEnabled || currentSettings.anchorSentenceHighlightEnabled || currentSettings.numberHighlightEnabled) {
      // schedule an incremental rescan for new/changed content
      scheduleTextFeatureRescan();
    }
  } catch (err) {
    console.error('verifyAndHeal failed', err);
  }
}

function applySettings() {
  applyFontPreference();
  applyOverlayPreference();
  applyFocusPreference();
  applyReduceMotionPreference();
  applyAnchorHighlightPreference();
  applyNumberHighlightPreference();
  applySpacingPreferences();
  applySensoryPreferences();
  applyTableSimplification();
  applyBreakReminder();
  // Ensure mutation observer state reflects current settings
  try {
    updateMutationObserverState();
  } catch (err) {
    // ignore
  }
  try {
    if (currentSettings.aggressiveMediaBlockEnabled) enableAggressiveMediaBlock(); else disableAggressiveMediaBlock();
  } catch (err) {
    // ignore
  }

  // Start or stop a periodic verification/heal loop when features that
  // inject DOM artifacts are enabled. This helps recover if page scripts
  // remove our elements or CSS.
  try {
    const needsHealing = !!(
      currentSettings.fontsEnabled ||
      currentSettings.overlayEnabled ||
      currentSettings.focusModeEnabled ||
      currentSettings.anchorHighlightEnabled ||
      currentSettings.anchorSentenceHighlightEnabled ||
      currentSettings.numberHighlightEnabled ||
      currentSettings.typographyEnabled ||
      currentSettings.reduceColourSaturationEnabled ||
      currentSettings.disableAutoPlayMedia ||
      currentSettings.noFlashAnimationsEnabled ||
      currentSettings.tableSimplifyEnabled
    );

    if (needsHealing) {
      if (!healTimer) {
        // run an immediate verify and then schedule periodic checks
        verifyAndHeal();
        const healMs = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.healingIntervalMs === 'number') ? DEFAULT_SETTINGS.healingIntervalMs : 5000;
        healTimer = setInterval(verifyAndHeal, healMs);
      }
    } else {
      if (healTimer) {
        clearInterval(healTimer);
        healTimer = null;
      }
    }
  } catch (err) {
    console.error('applySettings: healing timer failed', err);
  }
}

try {
  window.__nfAnchors = window.__nfAnchors || {};
  Object.assign(window.__nfAnchors, {
    apply: () => applyAnchorHighlightPreference(),
    status: () => ({
      wrappers: document.querySelectorAll(`.${ANCHOR_WRAPPER_CLASS}`).length,
      attempts: anchorVerificationAttempts
    })
  });
} catch (err) {
  // ignore exposure issues
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  switch (message.type) {
    case 'neuroFriendlyFontChoiceChanged': {
      const choice = message.payload?.fontFamilyChoice;
      if (choice) {
        currentSettings.fontFamilyChoice = choice;
        applyFontPreference();
      }
      sendResponse({ ok: true });
      return true;
    }
    case 'neuroFriendlyUpdateSettings':
      currentSettings = { ...currentSettings, ...message.payload };
      applySettings();
      sendResponse({ ok: true });
      return true;

    case 'neuroFriendlyPing':
      sendResponse({ present: true });
      return true;

  }
  return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;

  const updated = { ...currentSettings };
  let shouldApply = false;

  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in currentSettings && newValue !== undefined) {
      updated[key] = newValue;
      shouldApply = true;
    }
  }

  if (shouldApply) {
    currentSettings = updated;
    applySettings();
  }
});

function init() {
  ensureStyleElement();
  loadDefaults().finally(() => {
    chrome.storage.sync.get(null, (stored) => {
      currentSettings = { ...DEFAULT_SETTINGS, ...stored };
      applySettings();
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
