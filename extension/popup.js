const MAX_OVERLAY_OPACITY = 0.85;

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

const fontsToggle = document.getElementById('fontsToggle');
const overlayToggle = document.getElementById('overlayToggle');
const overlayColor = document.getElementById('overlayColor');
const overlayColorHex = document.getElementById('overlayColorHex');
const overlayColorRed = document.getElementById('overlayColorRed');
const overlayColorGreen = document.getElementById('overlayColorGreen');
const overlayColorBlue = document.getElementById('overlayColorBlue');
const overlayOpacity = document.getElementById('overlayOpacity');
const opacityValue = document.getElementById('opacityValue');
const focusToggle = document.getElementById('focusToggle');
const reduceMotionToggle = document.getElementById('reduceMotionToggle');
const anchorToggle = document.getElementById('anchorToggle');
const anchorSentenceToggle = document.getElementById('anchorSentenceToggle');
const numberToggle = document.getElementById('numberToggle');

if (overlayOpacity) {
  overlayOpacity.setAttribute('max', String(MAX_OVERLAY_OPACITY));
}
const swatches = Array.from(document.querySelectorAll('.swatch'));
const rgbInputs = [overlayColorRed, overlayColorGreen, overlayColorBlue].filter(Boolean);

function limitOpacity(value) {
  return Math.min(Math.max(Number.parseFloat(value) || 0, 0), MAX_OVERLAY_OPACITY);
}

function clampChannel(value) {
  return Math.min(Math.max(Number.parseInt(value, 10) || 0, 0), 255);
}

function normalizeHex(value, fallback = DEFAULT_SETTINGS.overlayColor) {
  const normalizeSix = (input) => `#${input.toUpperCase()}`;

  const fallbackSanitized = typeof fallback === 'string' ? fallback.trim().replace(/^#/, '') : '';
  const normalizedFallback = /^[0-9a-fA-F]{6}$/.test(fallbackSanitized)
    ? normalizeSix(fallbackSanitized)
    : DEFAULT_SETTINGS.overlayColor;

  if (typeof value !== 'string') {
    return normalizedFallback;
}

  const sanitized = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(sanitized)) {
    const expanded = sanitized.split('').map((char) => char + char).join('');
    return normalizeSix(expanded);
  }

  if (/^[0-9a-fA-F]{6}$/.test(sanitized)) {
    return normalizeSix(sanitized);
  }

  return normalizedFallback;
}

function hexToRgb(normalizedHex) {
  const hex = normalizeHex(normalizedHex);
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
}

function rgbToHex({ r, g, b }) {
  const format = (channel) => clampChannel(channel).toString(16).padStart(2, '0');
  return `#${format(r)}${format(g)}${format(b)}`.toUpperCase();
}

function formatOpacity(value) {
  return `${Math.round(limitOpacity(value) * 100)}%`;
}

function setOverlayControlsDisabled(disabled) {
  overlayColor.disabled = disabled;
  if (overlayColorHex) {
    overlayColorHex.disabled = disabled;
  }
  rgbInputs.forEach((input) => {
    input.disabled = disabled;
  });
  if (overlayOpacity) {
    overlayOpacity.disabled = disabled;
  }
  swatches.forEach((swatch) => {
    swatch.disabled = disabled;
    swatch.setAttribute('aria-disabled', String(disabled));
  });
}

function sendUpdate(partialSettings) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const [tab] = tabs;
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'neuroFriendlyUpdateSettings',
        payload: partialSettings
      });
    }
  });
}

function persistSettings(partialSettings) {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    const nextSettings = { ...DEFAULT_SETTINGS, ...stored, ...partialSettings };
    chrome.storage.sync.set(nextSettings, () => {
      sendUpdate(nextSettings);
    });
  });
}

function setOverlayColorInputs(color, options = {}) {
  const { persist = false } = options;
  const fallback = overlayColor?.value || DEFAULT_SETTINGS.overlayColor;
  const normalized = normalizeHex(color, fallback);
  const rgb = hexToRgb(normalized);

  overlayColor.value = normalized;
  if (overlayColorHex) {
    overlayColorHex.value = normalized;
  }
  if (overlayColorRed) {
    overlayColorRed.value = String(rgb.r);
  }
  if (overlayColorGreen) {
    overlayColorGreen.value = String(rgb.g);
  }
  if (overlayColorBlue) {
    overlayColorBlue.value = String(rgb.b);
  }

  if (persist) {
    persistSettings({ overlayColor: normalized });
  }

  return normalized;
}

function render(settings) {
  fontsToggle.checked = Boolean(settings.fontsEnabled);
  overlayToggle.checked = Boolean(settings.overlayEnabled);
  setOverlayColorInputs(settings.overlayColor || DEFAULT_SETTINGS.overlayColor);
  if (overlayOpacity) {
    overlayOpacity.value = limitOpacity(settings.overlayOpacity);
  }
  if (opacityValue) {
    opacityValue.textContent = formatOpacity(settings.overlayOpacity);
  }
  if (focusToggle) {
    focusToggle.checked = Boolean(settings.focusModeEnabled);
  }
  if (reduceMotionToggle) {
    reduceMotionToggle.checked = Boolean(settings.reduceMotionEnabled);
  }
  if (anchorToggle) {
    anchorToggle.checked = Boolean(settings.anchorHighlightEnabled);
  }
  if (anchorSentenceToggle) {
    anchorSentenceToggle.checked = Boolean(settings.anchorSentenceHighlightEnabled);
  }
  if (numberToggle) {
    numberToggle.checked = Boolean(settings.numberHighlightEnabled);
  }
  setOverlayControlsDisabled(!overlayToggle.checked);
}

function init() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    render(settings);
  });

  fontsToggle.addEventListener('change', () => {
    persistSettings({ fontsEnabled: fontsToggle.checked });
  });

  overlayToggle.addEventListener('change', () => {
    const overlayEnabled = overlayToggle.checked;
    setOverlayControlsDisabled(!overlayEnabled);
    persistSettings({ overlayEnabled });
  });

  overlayColor.addEventListener('input', () => {
    setOverlayColorInputs(overlayColor.value, { persist: true });
  });

  overlayColorHex?.addEventListener('change', () => {
    const normalized = setOverlayColorInputs(overlayColorHex.value, { persist: true });
    overlayColorHex.value = normalized;
  });

  rgbInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const channels = {
        r: overlayColorRed ? clampChannel(overlayColorRed.value) : 0,
        g: overlayColorGreen ? clampChannel(overlayColorGreen.value) : 0,
        b: overlayColorBlue ? clampChannel(overlayColorBlue.value) : 0
      };
      if (overlayColorRed) {
        overlayColorRed.value = String(channels.r);
      }
      if (overlayColorGreen) {
        overlayColorGreen.value = String(channels.g);
      }
      if (overlayColorBlue) {
        overlayColorBlue.value = String(channels.b);
      }
      setOverlayColorInputs(rgbToHex(channels), { persist: true });
    });
  });

  overlayOpacity?.addEventListener('input', () => {
    const value = limitOpacity(overlayOpacity.value);
    if (opacityValue) {
      opacityValue.textContent = formatOpacity(value);
    }
    persistSettings({ overlayOpacity: value });
  });

  swatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      setOverlayColorInputs(swatch.dataset.color, { persist: true });
    });
  });

  focusToggle?.addEventListener('change', () => {
    persistSettings({ focusModeEnabled: focusToggle.checked });
  });

  reduceMotionToggle?.addEventListener('change', () => {
    persistSettings({ reduceMotionEnabled: reduceMotionToggle.checked });
  });

  anchorToggle?.addEventListener('change', () => {
    persistSettings({ anchorHighlightEnabled: anchorToggle.checked });
  });

  anchorSentenceToggle?.addEventListener('change', () => {
    persistSettings({ anchorSentenceHighlightEnabled: anchorSentenceToggle.checked });
  });

  numberToggle?.addEventListener('change', () => {
    persistSettings({ numberHighlightEnabled: numberToggle.checked });
  });
}

document.addEventListener('DOMContentLoaded', init);
