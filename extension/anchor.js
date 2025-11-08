/**
 * Focus Anchors v2
 * Multilingual, contrast-aware reading anchors for ADHD/dyslexic readers.
 * - Anchors only "content" words (via language stopwords)
 * - Anchor length proportional to word length (language rules)
 * - Accent color auto-picked for WCAG contrast vs current text+background
 * - Gentle sentence-start cue (first letter after . ! ?)
 * - Works inside links; skips inputs/pre/code/etc; no innerHTML rewrites
 *
 * Usage:
 *   await applyFocusAnchors({
 *     enableAnchors: true,
 *     enableSentenceCues: true,
 *     useDynamicColor: true,
 *     stopwordsMap: undefined, // optional: inject your own { lang: [..] }
 *     stopwordsUrl: './stopwords-iso.json' // local file, same folder
 *   });
 */

async function applyFocusAnchors({
  enableAnchors = true,
  enableSentenceCues = true,
  useDynamicColor = true,
  stopwordsMap,
  stopwordsUrl = './stopwords-iso.json'
} = {}) {
  const lang = (document.documentElement.lang || navigator.language || 'en').split('-')[0].toLowerCase();
  const dir = document.documentElement.dir || (['ar', 'he', 'fa', 'ur'].includes(lang) ? 'rtl' : 'ltr');

  // Language tuning (anchor proportion; non-Latin scripts use color-only cueing)
  const langRules = {
    en: { anchorRatio: 0.40 }, de: { anchorRatio: 0.45 }, nl: { anchorRatio: 0.40 },
    fr: { anchorRatio: 0.32 }, es: { anchorRatio: 0.32 }, it: { anchorRatio: 0.32 }, pt: { anchorRatio: 0.32 },
    sv: { anchorRatio: 0.36 }, da: { anchorRatio: 0.36 }, no: { anchorRatio: 0.36 },
    pl: { anchorRatio: 0.35 }, cs: { anchorRatio: 0.35 }, sk: { anchorRatio: 0.35 },
    tr: { anchorRatio: 0.34 }, ro: { anchorRatio: 0.34 },
    ru: { anchorRatio: 0.35 }, uk: { anchorRatio: 0.35 },
    el: { anchorRatio: 0.34 },
    ja: { useColorOnly: true }, zh: { useColorOnly: true }, ko: { useColorOnly: true },
    ar: { useColorOnly: true }, he: { useColorOnly: true }, fa: { useColorOnly: true },
    default: { anchorRatio: 0.35 }
  };
  const rules = langRules[lang] || langRules.default;

  // --- Stopwords (function words) ---
  let stopwords = [];
  try {
    if (Array.isArray(stopwordsMap?.[lang])) {
      stopwords = stopwordsMap[lang];
    } else if (Array.isArray(window?.stopwordsISO?.[lang])) {
      stopwords = window.stopwordsISO[lang];
    } else {
      // Local fetch; if CSP blocks or file missing, we fall back to []
      const res = await fetch(stopwordsUrl);
      const data = await res.json();
      stopwords = Array.isArray(data[lang]) ? data[lang] : [];
    }
  } catch {
    stopwords = []; // graceful fallback
  }
  const stopset = new Set(stopwords.map(w => String(w).toLowerCase()));

  // --- Contrast helpers (WCAG) ---
  const parseColor = (cssColor) => {
    // Canvas trick to normalize any CSS color to rgb(r,g,b)
    const ctx = parseColor._ctx || (parseColor._ctx = document.createElement('canvas').getContext('2d'));
    ctx.fillStyle = '#000'; // reset
    ctx.fillStyle = cssColor;
    const m = ctx.fillStyle.match(/\d+/g);
    return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  };
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  const contrast = (rgb1, rgb2) => {
    const L1 = luminance(rgb1), L2 = luminance(rgb2);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  const rgbToHex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const lighten = ([r, g, b], amt = 0.2) => [r, g, b].map(v => Math.min(255, v + 255 * amt));
  const darken = ([r, g, b], amt = 0.2) => [r, g, b].map(v => Math.max(0, v - 255 * amt));

  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  const getEffectiveBackgroundColor = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(bg)) return parseColor(bg);
      node = node.parentElement;
    }
    // fallback to body or theme
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    if (bodyBg && !/rgba?\(0,\s*0,\s*0,\s*0\)/.test(bodyBg)) return parseColor(bodyBg);
    return parseColor(prefersDark ? '#111' : '#fff');
  };

  // Cache accent color decisions by (textColor|bgColor) signature
  const accentCache = new Map();
  const getReadableAccentColor = (el) => {
    const cs = getComputedStyle(el);
    const textRGB = parseColor(cs.color);
    const bgRGB = getEffectiveBackgroundColor(el);
    const key = cs.color + '|' + rgbToHex(bgRGB);
    if (accentCache.has(key)) return accentCache.get(key);

    const textL = luminance(textRGB);
    const bgL = luminance(bgRGB);
    const direction = textL > bgL ? 'darker' : 'lighter';

    const candidates = [];
    for (let i = 0.1; i <= 0.5; i += 0.1) {
      const variant = direction === 'lighter' ? lighten(textRGB, i) : darken(textRGB, i);
      const score = contrast(variant, bgRGB) + contrast(variant, textRGB);
      candidates.push({ color: rgbToHex(variant), score });
    }
    // Prefer subtle but readable; enforce AA (4.5) against background when possible
    candidates.sort((a, b) => b.score - a.score);
    const aa = candidates.find(c => contrast(parseColor(c.color), bgRGB) >= 4.5) || candidates[0];
    accentCache.set(key, aa.color);
    return aa.color;
  };

  // --- DOM traversal (safe text-node rewrite) ---
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'SVG']);
  const isSkippable = (el) => {
    if (!el) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.closest('textarea, input, select, iframe')) return true;
    // Respect ARIA: don't touch hidden regions
    if (el.closest('[aria-hidden="true"]')) return true;
    return false;
  };

  // Sentence start finder (inline, Unicode-aware)
  const SENTENCE_RE = /([.!?])\s+(\p{L})/gu;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p || isSkippable(p)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const textNode of nodes) {
    const parent = textNode.parentElement;
    // Determine accent once per container for coherence
    const accent = useDynamicColor ? getReadableAccentColor(parent) : (prefersDark ? '#cbd5ff' : '#333366');

    const text = textNode.nodeValue;
    const frag = document.createDocumentFragment();

    // Precompute sentence-start character indices (relative to text)
    const starts = new Set();
    if (enableSentenceCues) {
      let m;
      while ((m = SENTENCE_RE.exec(text)) !== null) {
        // Index of the first letter after punctuation+space
        const idx = m.index + m[0].length - 1;
        starts.add(idx);
      }
    }

    // Split on whitespace but preserve it
    const parts = text.split(/(\s+)/);
    let globalIndex = 0;

    for (const part of parts) {
      if (!part) continue;

      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
        globalIndex += part.length;
        continue;
      }

      const raw = part;
      const word = raw; // keep punctuation with word; visual flow matters
      const lower = word.toLowerCase();

      const isStop = stopset.has(lower);
      const isShort = word.length < 3;

      // Sentence-start cue (first character at this globalIndex)
      const startsHere = starts.has(globalIndex);

      if (!enableAnchors || isStop || isShort || rules.useColorOnly) {
        // No anchoring; maybe a sentence-start tint
        if (startsHere) {
          const s = document.createElement('span');
          s.textContent = word.charAt(0);
          s.style.backgroundColor = 'rgba(200,200,0,0.08)';
          s.style.borderRadius = '2px';
          s.style.padding = '0 1px';
          s.setAttribute('aria-hidden', 'true');
          frag.appendChild(s);
          frag.appendChild(document.createTextNode(word.slice(1)));
        } else {
          frag.appendChild(document.createTextNode(word));
        }
        globalIndex += word.length;
        continue;
      }

      // Anchoring: proportion of the word (letters) based on language rules
      const ratio = Math.max(0.2, Math.min(0.6, (rules.anchorRatio ?? 0.35)));
      const anchorLen = Math.max(1, Math.ceil(word.length * ratio));

      // If sentence starts here, isolate first char for the soft cue, then anchor the rest
      if (startsHere) {
        const cue = document.createElement('span');
        cue.textContent = word.charAt(0);
        cue.style.backgroundColor = 'rgba(200,200,0,0.08)';
        cue.style.borderRadius = '2px';
        cue.style.padding = '0 1px';
        cue.setAttribute('aria-hidden', 'true');
        frag.appendChild(cue);

        // Now anchor the next slice (1..anchorLen)
        if (anchorLen > 1) {
          const anchor = document.createElement('span');
          anchor.textContent = word.slice(1, anchorLen);
          anchor.style.color = accent;
          anchor.style.letterSpacing = '0.03em';
          anchor.style.fontWeight = '500'; // mid weight: better with OpenDyslexic
          anchor.setAttribute('aria-hidden', 'true');
          frag.appendChild(anchor);
          frag.appendChild(document.createTextNode(word.slice(anchorLen)));
        } else {
          frag.appendChild(document.createTextNode(word.slice(1)));
        }
      } else {
        const anchor = document.createElement('span');
        anchor.textContent = word.slice(0, anchorLen);
        anchor.style.color = accent;
        anchor.style.letterSpacing = '0.03em';
        anchor.style.fontWeight = '500';
        anchor.setAttribute('aria-hidden', 'true');

        frag.appendChild(anchor);
        frag.appendChild(document.createTextNode(word.slice(anchorLen)));
      }

      globalIndex += word.length;
    }

    // Swap text node with enhanced fragment
    textNode.parentNode.replaceChild(frag, textNode);
  }

  // Direction sensitivity (no visual flips needed, but keep for future)
  document.documentElement.setAttribute('dir', dir);
}

// Optional: expose as global for console usage
window.applyFocusAnchors = applyFocusAnchors;
