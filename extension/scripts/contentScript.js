const DEFAULT_SETTINGS = {
  fontsEnabled: true,
  overlayEnabled: false,
  overlayColor: '#f7f4d8',
  overlayOpacity: 0.25,
  focusModeEnabled: false,
  reduceMotionEnabled: false,
  anchorHighlightEnabled: false,
  anchorSentenceHighlightEnabled: false,
  numberHighlightEnabled: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const FONT_CLASS = 'neuro-friendly-font';
const STYLE_ELEMENT_ID = 'neuro-friendly-style';
const OVERLAY_ID = 'neuro-friendly-overlay';
const FOCUS_OVERLAY_ID = 'neuro-friendly-focus-overlay';
const REDUCE_MOTION_STYLE_ID = 'neuro-friendly-reduce-motion-style';
const REDUCE_MOTION_CLASS = 'neuro-friendly-reduce-motion';
const ANCHOR_WRAPPER_CLASS = 'neuro-friendly-anchor-wrapper';
const ANCHOR_WRAPPER_ATTR = 'data-nf-anchor-original';
const ANCHOR_BOLD_CLASS = 'neuro-friendly-anchor-bold';
const SENTENCE_START_CLASS = 'neuro-friendly-sentence-start';
const NUMBER_WRAPPER_CLASS = 'neuro-friendly-number-wrapper';
const NUMBER_WRAPPER_ATTR = 'data-nf-number-original';
const NUMBER_HIGHLIGHT_CLASS = 'neuro-friendly-number-highlight';
const STOPWORDS_RESOURCE_URL = chrome.runtime.getURL('stopwords-iso.json');
const DEFAULT_STOPWORD_LANG = 'en';
const MIN_WORD_LENGTH_TO_BOLD = 4;
const SENTENCE_PATTERN = /([.!?])\s+(\p{Lu})/gu;
const INTERACTIVE_SELECTOR = 'a, button, strong, em, [role="button"], [aria-hidden="true"]';
const TEXT_EXCLUDE_SELECTOR = 'script, style, code, pre, textarea';
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const LETTER_OR_NUMBER_PATTERN = /[\p{L}\p{N}]/u;
const LEADING_PUNCTUATION = /^[^\p{L}\p{N}]+/u;
const TRAILING_PUNCTUATION = /[^\p{L}\p{N}]+$/u;
const NUMBER_TOKEN_PATTERN = /^\d[\d.,]*$/;
const MAX_OVERLAY_OPACITY = 0.85;
const FOCUS_SHADE_OPACITY = 0.5;
const FOCUS_EDGE_SOFTNESS = 64;
const FOCUS_WINDOW_RATIO = 0.36;
const MIN_FOCUS_WINDOW_HEIGHT = 180;

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
        letter-spacing: 0.05em;
        word-spacing: 0.08em;
        font-kerning: normal;
      }
      .${FONT_CLASS} p,
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
        display: inline;
      }
      .${ANCHOR_BOLD_CLASS} {
        font-weight: 700;
      }
      .${SENTENCE_START_CLASS} {
        background-color: rgba(200, 200, 0, 0.08);
        border-radius: 2px;
        display: inline;
        padding: 0 1px;
      }
      .${NUMBER_HIGHLIGHT_CLASS} {
        background-color: rgba(255, 235, 150, 0.35);
        border-radius: 2px;
        padding: 0 1px;
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
    Object.assign(topShade.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      background: `linear-gradient(to bottom, rgba(17, 24, 39, ${FOCUS_SHADE_OPACITY}) 0%, rgba(17, 24, 39, 0) ${FOCUS_EDGE_SOFTNESS}px), rgba(17, 24, 39, ${FOCUS_SHADE_OPACITY})`
    });
    overlay.appendChild(topShade);
  }

  if (!overlay.querySelector('[data-role="focus-bottom"]')) {
    const bottomShade = document.createElement('div');
    bottomShade.dataset.role = 'focus-bottom';
    Object.assign(bottomShade.style, {
      position: 'absolute',
      bottom: '0',
      left: '0',
      right: '0',
      background: `linear-gradient(to top, rgba(17, 24, 39, ${FOCUS_SHADE_OPACITY}) 0%, rgba(17, 24, 39, 0) ${FOCUS_EDGE_SOFTNESS}px), rgba(17, 24, 39, ${FOCUS_SHADE_OPACITY})`
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

  const windowHeight = clamp(
    viewportHeight * FOCUS_WINDOW_RATIO,
    MIN_FOCUS_WINDOW_HEIGHT,
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

let stopwordsMapCache = null;
let stopwordsMapPromise = null;
let anchorRequestId = 0;
let lastAnchorSettings = {
  anchorsEnabled: null,
  sentenceHighlightEnabled: null
};

function fetchStopwordsMap() {
  if (stopwordsMapCache) {
    return Promise.resolve(stopwordsMapCache);
  }

  if (!stopwordsMapPromise) {
    stopwordsMapPromise = fetch(STOPWORDS_RESOURCE_URL)
      .then((response) => (response.ok ? response.json() : {}))
      .then((json) => {
        stopwordsMapCache = json || {};
        return stopwordsMapCache;
      })
      .catch(() => {
        stopwordsMapCache = {};
        return stopwordsMapCache;
      })
      .finally(() => {
        stopwordsMapPromise = null;
      });
  }

  return stopwordsMapPromise;
}

function clearAnchorHighlights() {
  const wrappers = document.querySelectorAll(`.${ANCHOR_WRAPPER_CLASS}`);
  wrappers.forEach((wrapper) => {
    const original = wrapper.getAttribute(ANCHOR_WRAPPER_ATTR);
    const fallback = wrapper.textContent || '';
    const textNode = document.createTextNode(original ?? fallback);
    wrapper.replaceWith(textNode);
  });
}

function clearNumberHighlights() {
  const wrappers = document.querySelectorAll(`.${NUMBER_WRAPPER_CLASS}[${NUMBER_WRAPPER_ATTR}]`);
  wrappers.forEach((wrapper) => {
    const original = wrapper.getAttribute(NUMBER_WRAPPER_ATTR);
    const fallback = wrapper.textContent || '';
    const textNode = document.createTextNode(original ?? fallback);
    wrapper.replaceWith(textNode);
  });
}

function highlightNumbersInNode(node) {
  const text = node.textContent;
  if (!text || !/\d/.test(text)) {
    return;
  }

  const parent = node.parentNode;
  if (!parent) return;

  const wrapper = document.createElement('span');
  wrapper.className = NUMBER_WRAPPER_CLASS;
  wrapper.setAttribute(NUMBER_WRAPPER_ATTR, text);

  const parts = text.split(/(\d[\d.,]*)/);
  parts.forEach((part) => {
    if (!part) {
      return;
    }

    if (NUMBER_TOKEN_PATTERN.test(part)) {
      const span = document.createElement('span');
      span.className = NUMBER_HIGHLIGHT_CLASS;
      span.textContent = part;
      wrapper.appendChild(span);
    } else {
      wrapper.appendChild(document.createTextNode(part));
    }
  });

  parent.replaceChild(wrapper, node);
}

function applyNumberHighlightPreference() {
  clearNumberHighlights();

  if (!currentSettings.numberHighlightEnabled) {
    return;
  }

  const root = document.body || document.documentElement;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node?.parentNode) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentNode;
      if (!(parent instanceof Element)) {
        return NodeFilter.FILTER_SKIP;
      }

      if (!node.textContent || !/\d/.test(node.textContent)) {
        return NodeFilter.FILTER_SKIP;
      }

      if (parent.closest(TEXT_EXCLUDE_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest(`.${NUMBER_WRAPPER_CLASS}`)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest(INTERACTIVE_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest('input, select')) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.hasAttribute('aria-hidden') && parent.getAttribute('aria-hidden') === 'true') {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.isContentEditable) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  nodes.forEach((textNode) => {
    if (textNode instanceof Text) {
      highlightNumbersInNode(textNode);
    }
  });
}

function getLanguageCode() {
  const lang = (document.documentElement.lang || navigator.language || DEFAULT_STOPWORD_LANG).toLowerCase();
  const [code] = lang.split('-');
  return code || DEFAULT_STOPWORD_LANG;
}

function highlightAnchorsWithStopwords(stopwords, options) {
  const { anchorsEnabled, sentenceHighlightEnabled } = options;
  if (!anchorsEnabled && !sentenceHighlightEnabled) {
    return;
  }

  const stopwordList = Array.isArray(stopwords) ? stopwords : [];
  const stopwordSet = new Set(stopwordList.map((word) => word.toLowerCase()));
  const root = document.body || document.documentElement;
  if (!root) {
    return;
  }

  /**
   * @param {Text} textNode
   */
  function processTextNode(textNode) {
    const originalText = textNode.textContent;
    if (!originalText?.trim()) {
      return;
    }

    const sentenceStartPositions = new Set();
    if (sentenceHighlightEnabled) {
      let match;
      while ((match = SENTENCE_PATTERN.exec(originalText)) !== null) {
        const index = match.index + match[0].length - 1;
        if (Number.isFinite(index)) {
          sentenceStartPositions.add(index);
        }
      }
      SENTENCE_PATTERN.lastIndex = 0;
    }

    const parts = originalText.split(/(\s+)/);
    const wrapper = document.createElement('span');
    wrapper.className = ANCHOR_WRAPPER_CLASS;
    wrapper.setAttribute(ANCHOR_WRAPPER_ATTR, originalText);

    let charIndex = 0;

    parts.forEach((part) => {
      if (/^\s+$/.test(part)) {
        wrapper.appendChild(document.createTextNode(part));
        charIndex += part.length;
        return;
      }

      const trimmed = part.trim();
      if (!trimmed) {
        wrapper.appendChild(document.createTextNode(part));
        charIndex += part.length;
        return;
      }

      if (!LETTER_OR_NUMBER_PATTERN.test(trimmed)) {
        wrapper.appendChild(document.createTextNode(part));
        charIndex += part.length;
        return;
      }

      const leading = trimmed.match(LEADING_PUNCTUATION)?.[0] ?? '';
      const trailing = trimmed.match(TRAILING_PUNCTUATION)?.[0] ?? '';
      const coreStart = leading.length;
      const coreEnd = trimmed.length - trailing.length;
      const core = trimmed.slice(coreStart, coreEnd > coreStart ? coreEnd : trimmed.length);

      if (!core) {
        wrapper.appendChild(document.createTextNode(part));
        charIndex += part.length;
        return;
      }

      const sanitizedLower = core.toLowerCase();
      const isStopword = sanitizedLower ? stopwordSet.has(sanitizedLower) : false;
      const highlightStart = sentenceHighlightEnabled && sentenceStartPositions.has(charIndex + leading.length);
      const canBold = anchorsEnabled && core.length >= MIN_WORD_LENGTH_TO_BOLD && !isStopword;
      const rawBoldCount = Math.ceil(core.length * 0.4);
      const boldCount = canBold ? Math.min(core.length, Math.max(rawBoldCount, 1)) : 0;

      if (leading) {
        wrapper.appendChild(document.createTextNode(leading));
      }

      if (!boldCount) {
        if (highlightStart) {
          const startSpan = document.createElement('span');
          startSpan.className = SENTENCE_START_CLASS;
          startSpan.textContent = core.charAt(0);
          wrapper.appendChild(startSpan);
          if (core.length > 1) {
            wrapper.appendChild(document.createTextNode(core.slice(1)));
          }
        } else {
          wrapper.appendChild(document.createTextNode(core));
        }
      } else if (highlightStart) {
        const startSpan = document.createElement('span');
        startSpan.className = SENTENCE_START_CLASS;
        startSpan.textContent = core.charAt(0);
        wrapper.appendChild(startSpan);
        if (boldCount > 1) {
          const remainderBold = document.createElement('span');
          remainderBold.className = ANCHOR_BOLD_CLASS;
          remainderBold.textContent = core.slice(1, boldCount);
          wrapper.appendChild(remainderBold);
        }
        if (core.length > boldCount) {
          wrapper.appendChild(document.createTextNode(core.slice(boldCount)));
        }
      } else {
        const boldSpan = document.createElement('span');
        boldSpan.className = ANCHOR_BOLD_CLASS;
        boldSpan.textContent = core.slice(0, boldCount);
        wrapper.appendChild(boldSpan);
        if (core.length > boldCount) {
          wrapper.appendChild(document.createTextNode(core.slice(boldCount)));
        }
      }

      if (trailing) {
        wrapper.appendChild(document.createTextNode(trailing));
      }

      charIndex += part.length;
    });

    textNode.parentNode?.replaceChild(wrapper, textNode);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Text)) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentNode;
      if (!parent || !(parent instanceof Element)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (!node.textContent || !LETTER_OR_NUMBER_PATTERN.test(node.textContent)) {
        return NodeFilter.FILTER_SKIP;
      }

      if (parent.classList.contains(ANCHOR_WRAPPER_CLASS) || parent.closest(`.${ANCHOR_WRAPPER_CLASS}`)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest(TEXT_EXCLUDE_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest('nav, header, footer, aside')) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest(INTERACTIVE_SELECTOR)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest('input, textarea, select, button, option, optgroup')) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest(`.${NUMBER_WRAPPER_CLASS}`)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.isContentEditable || parent.closest('[contenteditable]')) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest('[aria-hidden="true"]')) {
        return NodeFilter.FILTER_REJECT;
      }

      const namespace = parent.namespaceURI;
      if (namespace && namespace !== HTML_NAMESPACE) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodesToProcess = [];
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current instanceof Text) {
      nodesToProcess.push(current);
    }
  }

  nodesToProcess.forEach((node) => processTextNode(node));
}

function applyAnchorHighlightPreference() {
  const anchorsEnabled = Boolean(currentSettings.anchorHighlightEnabled);
  const sentenceHighlightEnabled = Boolean(currentSettings.anchorSentenceHighlightEnabled);

  if (
    anchorsEnabled === lastAnchorSettings.anchorsEnabled &&
    sentenceHighlightEnabled === lastAnchorSettings.sentenceHighlightEnabled
  ) {
    return;
  }

  lastAnchorSettings = { anchorsEnabled, sentenceHighlightEnabled };

  clearAnchorHighlights();

  if (!anchorsEnabled && !sentenceHighlightEnabled) {
    return;
  }

  const requestId = ++anchorRequestId;

  fetchStopwordsMap().then((map) => {
    if (requestId !== anchorRequestId) {
      return;
    }

    const language = getLanguageCode();
    const stopwords = Array.isArray(map?.[language])
      ? map[language]
      : Array.isArray(map?.[DEFAULT_STOPWORD_LANG])
      ? map[DEFAULT_STOPWORD_LANG]
      : [];

    highlightAnchorsWithStopwords(stopwords, {
      anchorsEnabled,
      sentenceHighlightEnabled
    });
  });
}

function applyOverlayPreference() {
  const overlay = ensureOverlayElement();
  const { overlayEnabled, overlayColor, overlayOpacity } = currentSettings;
  if (overlayEnabled && overlayOpacity > 0) {
    overlay.style.backgroundColor = overlayColor;
    overlay.style.opacity = String(Math.min(Math.max(overlayOpacity, 0), MAX_OVERLAY_OPACITY));
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

function applySettings() {
  applyFontPreference();
  applyOverlayPreference();
  applyFocusPreference();
  applyReduceMotionPreference();
  applyAnchorHighlightPreference();
  applyNumberHighlightPreference();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'neuroFriendlyUpdateSettings') {
    currentSettings = { ...currentSettings, ...message.payload };
    applySettings();
  }
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
  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    currentSettings = { ...DEFAULT_SETTINGS, ...stored };
    applySettings();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
