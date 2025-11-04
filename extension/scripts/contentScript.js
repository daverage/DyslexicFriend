const DEFAULT_SETTINGS = {
  fontsEnabled: true,
  overlayEnabled: false,
  overlayColor: '#f7f4d8',
  overlayOpacity: 0.25,
  focusModeEnabled: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

const FONT_CLASS = 'dyslexic-friend-font';
const STYLE_ELEMENT_ID = 'dyslexic-friend-style';
const OVERLAY_ID = 'dyslexic-friend-overlay';
const FOCUS_OVERLAY_ID = 'dyslexic-friend-focus-overlay';
const MAX_OVERLAY_OPACITY = 0.85;
const FOCUS_SHADE_OPACITY = 0.5;

function ensureStyleElement() {
  let styleEl = document.getElementById(STYLE_ELEMENT_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    styleEl.textContent = `
      .${FONT_CLASS}, .${FONT_CLASS} :not(i):not([class*="icon"]):not([class*="fa-"]) {
        font-family: var(--dyslexic-friendly-font) !important;
        letter-spacing: 0.02em;
        word-spacing: 0.04em;
      }
      .${FONT_CLASS} input,
      .${FONT_CLASS} textarea,
      .${FONT_CLASS} select,
      .${FONT_CLASS} button {
        font-family: var(--dyslexic-friendly-font), sans-serif !important;
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
      background: `linear-gradient(
        to bottom,
        rgba(17, 24, 39, ${FOCUS_SHADE_OPACITY}) 0%,
        rgba(17, 24, 39, ${FOCUS_SHADE_OPACITY}) 33%,
        rgba(17, 24, 39, 0) 40%,
        rgba(17, 24, 39, 0) 60%,
        rgba(17, 24, 39, ${FOCUS_SHADE_OPACITY}) 67%,
        rgba(17, 24, 39, ${FOCUS_SHADE_OPACITY}) 100%
      )`
    });
    document.documentElement.appendChild(overlay);
  }
  return overlay;
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
  const existingOverlay = document.getElementById(FOCUS_OVERLAY_ID);
  if (currentSettings.focusModeEnabled) {
    const overlay = existingOverlay || ensureFocusOverlayElement();
    overlay.style.opacity = '1';
    overlay.style.display = 'block';
  } else if (existingOverlay) {
    existingOverlay.style.opacity = '0';
    existingOverlay.style.display = 'none';
  }
}

function applySettings() {
  applyFontPreference();
  applyOverlayPreference();
  applyFocusPreference();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'dyslexicFriendUpdateSettings') {
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
