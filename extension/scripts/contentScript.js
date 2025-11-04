const DEFAULT_SETTINGS = {
  fontsEnabled: true,
  overlayEnabled: false,
  overlayColor: '#f7f4d8',
  overlayOpacity: 0.25,
  focusModeEnabled: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const FONT_CLASS = 'dyslexic-friend-font';
const STYLE_ELEMENT_ID = 'dyslexic-friend-style';
const OVERLAY_ID = 'dyslexic-friend-overlay';
const FOCUS_OVERLAY_ID = 'dyslexic-friend-focus-overlay';
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
