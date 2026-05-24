// MAX_OVERLAY_OPACITY moved to defaults.json as `maxOverlayOpacity`

import { hexToRgb, relativeLuminance, contrastRatio } from './scripts/colorUtils.js';

let DEFAULT_SETTINGS = {};

const DEFAULT_FONT_CHOICE = 'open-dyslexic';
const FONT_STACKS = {
  'open-dyslexic': "'Open-Dyslexic','Open-Dyslexic Alta','OpenDyslexic','OpenDyslexicAlta',Arial,sans-serif",
  'easytype-dyslexic': "'EasyType Dyslexic','Open-Dyslexic','Open-Dyslexic Alta','OpenDyslexic','OpenDyslexicAlta',Arial,sans-serif",
  'easytype-focus': "'EasyType Focus','EasyType Sans','Open-Dyslexic','Open-Dyslexic Alta','OpenDyslexic','OpenDyslexicAlta',Arial,sans-serif",
  'easytype-sans': '"EasyType Sans","Atkinson Hyperlegible",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
};
const TYPOGRAPHY_FALLBACKS = {
  lineHeightOverride: 1.5,
  letterSpacingOverride: 0.05,
  paragraphSpacingOverride: 1.2
};

function getTypographyDefault(key) {
  const value = DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS[key] === 'number'
    ? DEFAULT_SETTINGS[key]
    : TYPOGRAPHY_FALLBACKS[key];
  return typeof value === 'number' ? value : TYPOGRAPHY_FALLBACKS[key];
}

async function loadDefaults() {
  try {
    const url = chrome.runtime.getURL('defaults.json');
    const resp = await fetch(url);
    if (resp.ok) {
      const json = await resp.json();
      DEFAULT_SETTINGS = json;
    } else {
      console.warn('Could not load defaults.json, using empty defaults');
      DEFAULT_SETTINGS = {};
    }
  } catch (err) {
    console.warn('loadDefaults failed', err);
    DEFAULT_SETTINGS = {};
  }
}

// === DOM ELEMENTS ===
const el = (id) => document.getElementById(id);
const masterToggle = el('masterToggle');
const fontsToggle = el('fontsToggle');
const fontChoiceSelect = el('fontChoice');
const overlayToggle = el('overlayToggle');
const overlayColor = el('overlayColor');
const overlayColorHex = el('overlayColorHex');
const overlayColorRed = el('overlayColorRed');
const overlayColorGreen = el('overlayColorGreen');
const overlayColorBlue = el('overlayColorBlue');
const overlayOpacity = el('overlayOpacity');
const opacityValue = el('opacityValue');
const focusToggle = el('focusToggle');
const reduceMotionToggle = el('reduceMotionToggle');
const anchorToggle = el('anchorToggle');
const anchorSentenceToggle = el('anchorSentenceToggle');
const numberToggle = el('numberToggle');
const anchorColorCustomToggle = el('anchorColorCustomToggle');
const anchorColorContrastLevelSelect = el('anchorColorContrastLevel');
const anchorColorModeSelect = el('anchorColorMode');
const anchorColorSwatchContainer = document.querySelector('.anchor-color-swatches');
const anchorColorFieldset = document.querySelector('.anchor-color-fieldset');
let anchorColorButtons = [];
let anchorSwatchesInitialized = false;
let lastKnownAnchorColor = null;

// new ones
const lineHeightInput = el('lineHeightInput');
const letterSpacingInput = el('letterSpacingInput');
const paragraphSpacingInput = el('paragraphSpacingInput');
const typographyToggle = el('typographyToggle');

// minimalUiToggle and plainReaderToggle removed (Layout & Predictability)
const reduceColourSaturationToggle = el('reduceColourSaturationToggle');
const disableAutoPlayToggle = el('disableAutoPlayToggle');
const noFlashAnimationsToggle = el('noFlashAnimationsToggle');
const aggressiveMediaBlockToggle = el('aggressiveMediaBlockToggle');

const breakReminderToggle = el('breakReminderToggle');
const breakIntervalInput = el('breakIntervalInput');
// taskStepModeToggle and highlightNextActionToggle removed

const tableSimplifyToggle = el('tableSimplifyToggle');
const restoreTypographyBtn = el('restoreTypographyDefaults');

// helper: list of boolean keys we will toggle off during a master "all off" action
const BOOLEAN_KEYS_TO_DISABLE = [
  'fontsEnabled', 'overlayEnabled', 'focusModeEnabled', 'reduceMotionEnabled',
  'anchorHighlightEnabled', 'anchorSentenceHighlightEnabled', 'numberHighlightEnabled',
  'anchorColorCustomEnabled', 'anchorAutoColorEnabled',
  'reduceColourSaturationEnabled', 'disableAutoPlayMedia', 'noFlashAnimationsEnabled',
  'aggressiveMediaBlockEnabled', 'typographyEnabled', 'breakReminderEnabled',
  'tableSimplifyEnabled'
];

// overlayOpacity max is set after defaults load so we can centralize the value

const overlaySwatches = Array.from(document.querySelectorAll('.overlay-options .swatch'));
const rgbInputs = [overlayColorRed, overlayColorGreen, overlayColorBlue].filter(Boolean);

const ANCHOR_COLOR_SWATCHES = [
  { base: '#0F172A', label: 'Midnight' },
  { base: '#2563EB', label: 'Azure' },
  { base: '#1098AD', label: 'Teal' },
  { base: '#F59E0B', label: 'Amber' },
  { base: '#EF4444', label: 'Crimson' }
];

// === HELPERS ===
function limitOpacity(value) {
  const max = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.maxOverlayOpacity !== 'undefined') ? DEFAULT_SETTINGS.maxOverlayOpacity : 1;
  return Math.min(Math.max(Number.parseFloat(value) || 0, 0), max);
}
function clampChannel(value) {
  return Math.min(Math.max(Number.parseInt(value, 10) || 0, 0), 255);
}
function normalizeHex(value, fallback) {
  const normalizeSix = (input) => `#${input.toUpperCase()}`;
  const resolvedFallback = (typeof fallback === 'string' && fallback) ? fallback : (DEFAULT_SETTINGS && DEFAULT_SETTINGS.overlayColor) ? DEFAULT_SETTINGS.overlayColor : '#f7f4d8';
  const fallbackSanitized = typeof resolvedFallback === 'string' ? resolvedFallback.trim().replace(/^#/, '') : '';
  const normalizedFallback = /^[0-9a-fA-F]{6}$/.test(fallbackSanitized)
    ? normalizeSix(fallbackSanitized)
    : '#f7f4d8';
  if (typeof value !== 'string') return normalizedFallback;
  const sanitized = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(sanitized)) {
    const expanded = sanitized.split('').map((char) => char + char).join('');
    return normalizeSix(expanded);
  }
  if (/^[0-9a-fA-F]{6}$/.test(sanitized)) return normalizeSix(sanitized);
  return normalizedFallback;
}
function rgbToHex({ r, g, b }) {
  const format = (c) => clampChannel(c).toString(16).padStart(2, '0');
  return `#${format(r)}${format(g)}${format(b)}`.toUpperCase();
}
function formatOpacity(value) {
  return `${Math.round(limitOpacity(value) * 100)}%`;
}
function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
function rgbToHslColor({ r, g, b }) {
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
function hslToRgbColor({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255)
  };
}
function deriveAccentForLevel(baseHex, contrastLevel, backgroundRgb) {
  const baseRgb = hexToRgb(baseHex);
  if (!baseRgb) return normalizeColorValue(baseHex);
  const bg = backgroundRgb || { r: 255, g: 255, b: 255 };
  const target = contrastLevel === 'AAA' ? 7 : 4.5;
  let candidate = { ...baseRgb };
  let ratio = contrastRatio(candidate, bg);
  if (ratio >= target) {
    return normalizeColorValue(rgbToHex(candidate));
  }
  const bgLum = relativeLuminance(bg);
  const direction = bgLum > 0.5 ? -1 : 1;
  let hsl = rgbToHslColor(candidate);
  for (let i = 0; i < 12 && ratio < target; i += 1) {
    hsl.l = clamp01(hsl.l + direction * 0.05);
    candidate = hslToRgbColor(hsl);
    ratio = contrastRatio(candidate, bg);
  }
  if (ratio >= target) {
    return normalizeColorValue(rgbToHex(candidate));
  }
  const blackRatio = contrastRatio({ r: 0, g: 0, b: 0 }, bg);
  const whiteRatio = contrastRatio({ r: 255, g: 255, b: 255 }, bg);
  return normalizeColorValue(blackRatio >= whiteRatio ? '#000000' : '#FFFFFF');
}
function normalizeContrastLevel(value) {
  return value === 'AAA' ? 'AAA' : 'AA';
}
function getAnchorPalette() {
  return ANCHOR_COLOR_SWATCHES;
}
function renderAnchorSwatches(level) {
  if (!anchorColorSwatchContainer) {
    anchorColorButtons = [];
    return;
  }
  const palette = getAnchorPalette();
  if (!anchorSwatchesInitialized) {
    const fragment = document.createDocumentFragment();
    palette.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'swatch';
      const base = normalizeColorValue(entry.base);
      button.dataset.baseColor = base;
      button.dataset.label = entry.label;
      button.setAttribute('aria-pressed', 'false');
      fragment.appendChild(button);
    });
    anchorColorSwatchContainer.appendChild(fragment);
    anchorColorButtons = Array.from(anchorColorSwatchContainer.querySelectorAll('.swatch'));
    anchorColorButtons.forEach((button) => button.addEventListener('click', handleAnchorSwatchClick));
    anchorSwatchesInitialized = true;
  }
  const normalizedLevel = normalizeContrastLevel(level);
  const previewBackground = { r: 255, g: 255, b: 255 };
  anchorColorButtons.forEach((button) => {
    const base = normalizeColorValue(button.dataset.baseColor || button.dataset.color || '#2563EB');
    const derived = deriveAccentForLevel(base, normalizedLevel, previewBackground);
    button.dataset.derivedColor = derived;
    button.style.setProperty('--swatch-color', derived);
    const label = button.dataset.label || 'Accent';
    button.setAttribute('aria-label', `${label} (${normalizedLevel} contrast)`);
  });
}
function ensureAnchorSwatchExists(color, level) {
  if (!anchorColorSwatchContainer) return;
  const normalized = normalizeColorValue(color);
  const exists = anchorColorButtons.some((btn) => normalizeColorValue(btn.dataset.baseColor || btn.dataset.color || '') === normalized);
  if (exists) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'swatch';
  button.dataset.baseColor = normalized;
  button.dataset.label = 'Custom';
  button.setAttribute('aria-pressed', 'false');
  anchorColorSwatchContainer.appendChild(button);
  button.addEventListener('click', handleAnchorSwatchClick);
  anchorColorButtons = Array.from(anchorColorSwatchContainer.querySelectorAll('.swatch'));
  const derived = deriveAccentForLevel(normalized, normalizeContrastLevel(level), { r: 255, g: 255, b: 255 });
  button.dataset.derivedColor = derived;
  button.style.setProperty('--swatch-color', derived);
  button.setAttribute('aria-label', `Custom (${normalizeContrastLevel(level)} contrast)`);
}
function handleAnchorSwatchClick(event) {
  const button = event.currentTarget;
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.disabled) return;
  const autoModeActive = !!(anchorColorModeSelect && anchorColorModeSelect.value === 'auto');
  if (autoModeActive && anchorColorModeSelect) {
    anchorColorModeSelect.value = 'manual';
    persistSettingsDebounced({ anchorAutoColorEnabled: false });
  }
  const baseValue = button.dataset.baseColor || button.dataset.color;
  if (!baseValue) return;
  const normalized = normalizeColorValue(baseValue);
  lastKnownAnchorColor = normalized;
  if (anchorColorCustomToggle && !anchorColorCustomToggle.checked) {
    anchorColorCustomToggle.checked = true;
    persistSettingsDebounced({ anchorColorCustomEnabled: true, anchorHighlightColor: normalized });
  } else {
    persistSettingsDebounced({ anchorHighlightColor: normalized });
  }
  const highlightEnabled = !!anchorToggle?.checked;
  const customEnabled = highlightEnabled && !!anchorColorCustomToggle?.checked;
  const autoEnabled = customEnabled && !!(anchorColorModeSelect && anchorColorModeSelect.value === 'auto');
  updateAnchorColorUI(highlightEnabled, customEnabled, autoEnabled, normalized);
}
function setOverlayControlsDisabled(disabled) {
  overlayColor.disabled = disabled;
  if (overlayColorHex) overlayColorHex.disabled = disabled;
  rgbInputs.forEach((i) => (i.disabled = disabled));
  if (overlayOpacity) overlayOpacity.disabled = disabled;
  overlaySwatches.forEach((s) => {
    s.disabled = disabled;
    s.setAttribute('aria-disabled', String(disabled));
  });
}

function setAllControlsDisabled(disabled) {
  // don't disable masterToggle itself when called from event handler
  const controls = [
    fontsToggle, fontChoiceSelect, overlayToggle, overlayColor, overlayColorHex, overlayColorRed, overlayColorGreen, overlayColorBlue,
    overlayOpacity, focusToggle, reduceMotionToggle, anchorToggle, anchorSentenceToggle, numberToggle,
    anchorColorCustomToggle, anchorColorModeSelect, anchorColorContrastLevelSelect,
    lineHeightInput, letterSpacingInput, paragraphSpacingInput, typographyToggle,
    reduceColourSaturationToggle, disableAutoPlayToggle, noFlashAnimationsToggle, aggressiveMediaBlockToggle,
    breakReminderToggle, breakIntervalInput, tableSimplifyToggle
  ];
  controls.forEach((c) => {
    if (!c) return;
    c.disabled = disabled;
    c.setAttribute && c.setAttribute('aria-disabled', String(disabled));
    if (c.style) {
      c.style.opacity = disabled ? '0.6' : '';
      c.style.pointerEvents = disabled ? 'none' : '';
    }
  });
  // keep overlay-specific helper in sync
  setOverlayControlsDisabled(disabled || !(overlayToggle && overlayToggle.checked));
  const highlightEnabled = !disabled && !!(anchorToggle && anchorToggle.checked);
  const customEnabled = highlightEnabled && !!(anchorColorCustomToggle && anchorColorCustomToggle.checked);
  const autoEnabled = customEnabled && !!(anchorColorModeSelect && anchorColorModeSelect.value === 'auto');
  updateAnchorColorUI(highlightEnabled, customEnabled, autoEnabled, getSelectedAnchorColor());
}

function applyPopupFontState(enabled, choice = getCurrentFontChoice()) {
  try {
    applyPopupFontPreview(choice);
    document.body?.classList.toggle('popup-font-dyslexic', !!enabled);
  } catch (err) {
    // ignore DOM issues
  }
}

function normalizeFontChoice(choice) {
  if (!choice || typeof choice !== 'string') return DEFAULT_FONT_CHOICE;
  return Object.prototype.hasOwnProperty.call(FONT_STACKS, choice) ? choice : DEFAULT_FONT_CHOICE;
}

function getCurrentFontChoice() {
  if (fontChoiceSelect) {
    return normalizeFontChoice(fontChoiceSelect.value);
  }
  return DEFAULT_FONT_CHOICE;
}

function applyPopupFontPreview(choice) {
  const normalized = normalizeFontChoice(choice);
  const stack = FONT_STACKS[normalized] || FONT_STACKS[DEFAULT_FONT_CHOICE];
  try {
    document.documentElement?.style.setProperty('--nf-popup-font-preview', stack);
    if (fontChoiceSelect) {
      fontChoiceSelect.value = normalized;
      fontChoiceSelect.style.fontFamily = stack;
    }
  } catch (err) {
    // ignore style issues
  }
}

function getSelectedAnchorColor() {
  if (lastKnownAnchorColor) return normalizeColorValue(lastKnownAnchorColor);
  const selected = anchorColorButtons.find((btn) => btn.classList.contains('selected'));
  if (selected) return normalizeColorValue(selected.dataset.baseColor || selected.dataset.color || (DEFAULT_SETTINGS && DEFAULT_SETTINGS.anchorHighlightColor) || '#2563eb');
  if (anchorColorButtons[0]) return normalizeColorValue(anchorColorButtons[0].dataset.baseColor || anchorColorButtons[0].dataset.color);
  return normalizeColorValue((DEFAULT_SETTINGS && DEFAULT_SETTINGS.anchorHighlightColor) || '#2563eb');
}

function normalizeColorValue(value) {
  if (typeof value !== 'string') return '#2563EB';
  let hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  return '#2563EB';
}

function updateAnchorColorUI(highlightEnabled, customEnabled, autoEnabled, selectedColor) {
  const normalizedHex = normalizeColorValue(selectedColor);
  lastKnownAnchorColor = normalizedHex;
  let normalized = normalizedHex.toLowerCase();
  if (!normalized && anchorColorButtons.length) {
    normalized = normalizeColorValue(anchorColorButtons[0].dataset.baseColor || anchorColorButtons[0].dataset.color || '#2563EB').toLowerCase();
  }
  if (anchorColorCustomToggle) {
    anchorColorCustomToggle.disabled = !highlightEnabled;
    anchorColorCustomToggle.setAttribute('aria-disabled', String(!highlightEnabled));
  }
  if (anchorColorFieldset) {
    const fieldsetDisabled = !(highlightEnabled && customEnabled);
    anchorColorFieldset.setAttribute('aria-disabled', String(fieldsetDisabled));
    if ('disabled' in anchorColorFieldset) {
      anchorColorFieldset.disabled = fieldsetDisabled;
    }
  }
  if (anchorColorModeSelect) {
    const modeDisabled = !(highlightEnabled && customEnabled);
    anchorColorModeSelect.disabled = modeDisabled;
    anchorColorModeSelect.setAttribute('aria-disabled', String(modeDisabled));
  }
  if (anchorColorContrastLevelSelect) {
    const selectDisabled = !(highlightEnabled && customEnabled);
    anchorColorContrastLevelSelect.disabled = selectDisabled;
    anchorColorContrastLevelSelect.setAttribute('aria-disabled', String(selectDisabled));
  }
  anchorColorButtons.forEach((btn) => {
    const base = normalizeColorValue(btn.dataset.baseColor || btn.dataset.color || '');
    const isSelected = normalized && base.toLowerCase() === normalized;
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', String(isSelected));
    const disabled = !(highlightEnabled && customEnabled && !autoEnabled);
    btn.disabled = disabled;
    btn.setAttribute('aria-disabled', String(disabled));
    btn.style.pointerEvents = disabled ? 'none' : 'auto';
  });
}

// === CORE COMMUNICATION ===
function sendUpdate(partialSettings) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const [tab] = tabs;
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'neuroFriendlyUpdateSettings',
        payload: partialSettings
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignore missing receiver errors (e.g., unsupported pages)
        }
      });
    }
  });
}

// === DEBOUNCED STORAGE ===
let persistTimeout = null;
function persistSettingsDebounced(partial, delay) {
  clearTimeout(persistTimeout);
  if (partial && typeof partial === 'object') {
    sendUpdate(partial);
  }
  if (typeof delay === 'undefined' || delay === null) {
    delay = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.persistDebounceMs === 'number') ? DEFAULT_SETTINGS.persistDebounceMs : 250;
  }
  const apply = () => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      const next = { ...DEFAULT_SETTINGS, ...stored, ...partial };
      chrome.storage.sync.set(next, () => {});
    });
  };
  if (delay === 0) {
    apply();
    return;
  }
  persistTimeout = setTimeout(apply, delay);
}

// === COLOR CONTROL ===
function setOverlayColorInputs(color, { persist = false } = {}) {
  const fallback = overlayColor?.value || DEFAULT_SETTINGS.overlayColor;
  const normalized = normalizeHex(color, fallback);
  const rgb = hexToRgb(normalized) || { r: 0, g: 0, b: 0 };
  overlayColor.value = normalized;
  if (overlayColorHex) overlayColorHex.value = normalized;
  if (overlayColorRed) overlayColorRed.value = String(rgb.r);
  if (overlayColorGreen) overlayColorGreen.value = String(rgb.g);
  if (overlayColorBlue) overlayColorBlue.value = String(rgb.b);
  if (persist) persistSettingsDebounced({ overlayColor: normalized });
  return normalized;
}

// === RENDER ===
function render(s) {
  const fontChoice = normalizeFontChoice(s.fontFamilyChoice);
  applyPopupFontPreview(fontChoice);
  fontsToggle.checked = !!s.fontsEnabled;
  overlayToggle.checked = !!s.overlayEnabled;
  setOverlayColorInputs(s.overlayColor || DEFAULT_SETTINGS.overlayColor);
  overlayOpacity.value = limitOpacity(s.overlayOpacity);
  opacityValue.textContent = formatOpacity(s.overlayOpacity);
  focusToggle.checked = !!s.focusModeEnabled;
  reduceMotionToggle.checked = !!s.reduceMotionEnabled;
  anchorToggle.checked = !!s.anchorHighlightEnabled;
  anchorSentenceToggle.checked = !!s.anchorSentenceHighlightEnabled;
  numberToggle.checked = !!s.numberHighlightEnabled;
  const highlightEnabled = !!s.anchorHighlightEnabled;
  const customEnabled = !!s.anchorColorCustomEnabled;
  if (anchorColorCustomToggle) {
    anchorColorCustomToggle.checked = customEnabled;
  }
  const autoPreference = (typeof s.anchorAutoColorEnabled === 'boolean')
    ? s.anchorAutoColorEnabled
    : (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.anchorAutoColorEnabled === 'boolean')
      ? DEFAULT_SETTINGS.anchorAutoColorEnabled
      : true;
  const autoColorEnabled = customEnabled && autoPreference;
  if (anchorColorModeSelect) {
    anchorColorModeSelect.value = autoPreference ? 'auto' : 'manual';
  }
  const contrastLevel = normalizeContrastLevel(
    s.anchorColorContrastLevel ||
    (DEFAULT_SETTINGS && DEFAULT_SETTINGS.anchorColorContrastLevel) ||
    'AA'
  );
  if (anchorColorContrastLevelSelect) {
    anchorColorContrastLevelSelect.value = contrastLevel;
  }
  renderAnchorSwatches(contrastLevel);
  const currentColor = normalizeColorValue(
    s.anchorHighlightColor ||
    (DEFAULT_SETTINGS && DEFAULT_SETTINGS.anchorHighlightColor) ||
    '#2563EB'
  );
  ensureAnchorSwatchExists(currentColor, contrastLevel);
  lastKnownAnchorColor = currentColor;
  updateAnchorColorUI(highlightEnabled, customEnabled, autoColorEnabled, currentColor);

  applyPopupFontState(s.fontsEnabled);

  lineHeightInput.value = typeof s.lineHeightOverride === 'number' ? s.lineHeightOverride : getTypographyDefault('lineHeightOverride');
  letterSpacingInput.value = typeof s.letterSpacingOverride === 'number' ? s.letterSpacingOverride : getTypographyDefault('letterSpacingOverride');
  paragraphSpacingInput.value = typeof s.paragraphSpacingOverride === 'number' ? s.paragraphSpacingOverride : getTypographyDefault('paragraphSpacingOverride');
  typographyToggle.checked = !!s.typographyEnabled;

  // Keep typography controls disabled when typography is off
  setTypographyControlsDisabled(!s.typographyEnabled);


  reduceColourSaturationToggle.checked = !!s.reduceColourSaturationEnabled;
  disableAutoPlayToggle.checked = !!s.disableAutoPlayMedia;
  noFlashAnimationsToggle.checked = !!s.noFlashAnimationsEnabled;
  aggressiveMediaBlockToggle.checked = !!s.aggressiveMediaBlockEnabled;

  breakReminderToggle.checked = !!s.breakReminderEnabled;
  breakIntervalInput.value = s.breakIntervalMinutes;
  // taskStepMode and highlightNextAction removed from UI

  tableSimplifyToggle.checked = !!s.tableSimplifyEnabled;

  setOverlayControlsDisabled(!s.overlayEnabled);

  // If master all-off is active, disable the rest of the controls visually
  if (s.masterAllOff) {
    setAllControlsDisabled(true);
    // ensure masterToggle itself is checked (visible state)
    if (masterToggle) masterToggle.checked = true;
  } else {
    // ensure master toggle off and controls enabled per their own state
    if (masterToggle) masterToggle.checked = false;
    setAllControlsDisabled(false);
  }
}

// === INIT ===
function init() {
  function isContentScriptPresent(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, { type: 'neuroFriendlyPing' }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve(false);
          } else {
            resolve(Boolean(resp));
          }
        });
      } catch (err) {
        resolve(false);
      }
    });
  }

  function injectContentScript(tabId) {
    return new Promise((resolve) => {
      try {
        if (chrome.scripting && typeof chrome.scripting.executeScript === 'function') {
          chrome.scripting.executeScript({ target: { tabId }, files: ['scripts/contentScript.js'] }, () => {
            if (chrome.runtime.lastError) {
              console.warn('scripting.executeScript failed:', chrome.runtime.lastError);
              resolve(false);
            } else {
              resolve(true);
            }
          });
        } else if (chrome.tabs && typeof chrome.tabs.executeScript === 'function') {
          chrome.tabs.executeScript(tabId, { file: 'scripts/contentScript.js' }, () => {
            if (chrome.runtime.lastError) {
              console.warn('tabs.executeScript failed:', chrome.runtime.lastError);
              resolve(false);
            } else {
              resolve(true);
            }
          });
        } else {
          resolve(false);
        }
      } catch (err) {
        console.warn('injectContentScript error', err);
        resolve(false);
      }
    });
  }

  async function ensureContentScriptInActiveTab() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tab = tabs?.[0];
        if (!tab || typeof tab.id !== 'number') return;
        const url = tab.url || '';
        if (!/^https?:|^file:/.test(url)) return;
        const present = await isContentScriptPresent(tab.id);
        if (present) return;
        await injectContentScript(tab.id);
      });
    } catch (err) {
      console.warn('ensureContentScriptInActiveTab error', err);
    }
  }

  // Kick off presence check / injection when popup opens
  ensureContentScriptInActiveTab();
  function notifyActiveTabSettings(partial) {
    if (!partial || typeof partial !== 'object') return;
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs?.[0];
        if (!tab || typeof tab.id !== 'number') return;
        chrome.tabs.sendMessage(tab.id, { type: 'neuroFriendlyUpdateSettings', payload: partial }, () => {});
      });
    } catch (err) {
      console.warn('notifyActiveTabSettings failed', err);
    }
  }
  // Load centralized defaults then render based on sync settings.
  loadDefaults().then(() => {
    // overlay slider limit: use centralized default if available
    const overlayMax = (DEFAULT_SETTINGS && typeof DEFAULT_SETTINGS.maxOverlayOpacity === 'number') ? DEFAULT_SETTINGS.maxOverlayOpacity : 0.85;
    if (overlayOpacity) overlayOpacity.setAttribute('max', String(overlayMax));
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => render({ ...DEFAULT_SETTINGS, ...stored }));
  }).catch((err) => {
    console.warn('loadDefaults in init failed', err);
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => render({ ...DEFAULT_SETTINGS, ...stored }));
  });
  // Base controls
  fontsToggle?.addEventListener('change', () => {
    applyPopupFontState(fontsToggle.checked);
    persistSettingsDebounced({ fontsEnabled: fontsToggle.checked });
    notifyActiveTabSettings({ fontsEnabled: fontsToggle.checked });
  });
  fontChoiceSelect?.addEventListener('change', () => {
    const choice = getCurrentFontChoice();
    applyPopupFontPreview(choice);
    if (typeof fontsToggle?.checked === 'boolean') {
      applyPopupFontState(fontsToggle.checked, choice);
    }
    persistSettingsDebounced({ fontFamilyChoice: choice });
    notifyActiveTabSettings({ fontFamilyChoice: choice });
  });
  overlayToggle?.addEventListener('change', () => {
    const enabled = overlayToggle.checked;
    setOverlayControlsDisabled(!enabled);
    persistSettingsDebounced({ overlayEnabled: enabled });
  });
  overlayColor?.addEventListener('input', () => setOverlayColorInputs(overlayColor.value, { persist: true }));
  overlayColorHex?.addEventListener('change', () => {
    const n = setOverlayColorInputs(overlayColorHex.value, { persist: true });
    if (overlayColorHex) overlayColorHex.value = n;
  });
  rgbInputs.forEach((i) =>
    i?.addEventListener('change', () => {
      const c = {
        r: overlayColorRed ? clampChannel(overlayColorRed.value) : 0,
        g: overlayColorGreen ? clampChannel(overlayColorGreen.value) : 0,
        b: overlayColorBlue ? clampChannel(overlayColorBlue.value) : 0
      };
      setOverlayColorInputs(rgbToHex(c), { persist: true });
    })
  );
  overlayOpacity?.addEventListener('input', () => {
    const v = limitOpacity(overlayOpacity.value);
    if (opacityValue) opacityValue.textContent = formatOpacity(v);
    persistSettingsDebounced({ overlayOpacity: v });
  });
  overlaySwatches.forEach((s) => s.addEventListener('click', () => setOverlayColorInputs(s.dataset.color, { persist: true })));
  focusToggle?.addEventListener('change', () => persistSettingsDebounced({ focusModeEnabled: focusToggle.checked }));
  reduceMotionToggle?.addEventListener('change', () => persistSettingsDebounced({ reduceMotionEnabled: reduceMotionToggle.checked }));
  anchorToggle?.addEventListener('change', () => {
    persistSettingsDebounced({ anchorHighlightEnabled: anchorToggle.checked });
    const customEnabled = !!anchorColorCustomToggle?.checked;
    const autoEnabled = customEnabled && !!(anchorColorModeSelect && anchorColorModeSelect.value === 'auto');
    updateAnchorColorUI(!!anchorToggle.checked, customEnabled, autoEnabled, getSelectedAnchorColor());
  });
  anchorSentenceToggle?.addEventListener('change', () => persistSettingsDebounced({ anchorSentenceHighlightEnabled: anchorSentenceToggle.checked }));
  numberToggle?.addEventListener('change', () => persistSettingsDebounced({ numberHighlightEnabled: numberToggle.checked }));
  anchorColorCustomToggle?.addEventListener('change', () => {
    const enabled = !!anchorColorCustomToggle.checked;
    const highlightEnabled = !!anchorToggle?.checked;
    const autoSelected = !!(anchorColorModeSelect && anchorColorModeSelect.value === 'auto');
    const color = getSelectedAnchorColor();
    updateAnchorColorUI(highlightEnabled, enabled, enabled && autoSelected, color);
    persistSettingsDebounced({ anchorColorCustomEnabled: enabled, anchorAutoColorEnabled: autoSelected });
  });
  anchorColorContrastLevelSelect?.addEventListener('change', () => {
    const level = normalizeContrastLevel(anchorColorContrastLevelSelect.value);
    anchorColorContrastLevelSelect.value = level;
    renderAnchorSwatches(level);
    const currentSelection = getSelectedAnchorColor();
    ensureAnchorSwatchExists(currentSelection, level);
    const highlightEnabled = !!anchorToggle?.checked;
    const customEnabled = highlightEnabled && !!anchorColorCustomToggle?.checked;
    const autoEnabled = customEnabled && !!(anchorColorModeSelect && anchorColorModeSelect.value === 'auto');
    updateAnchorColorUI(highlightEnabled, customEnabled, autoEnabled, currentSelection);
    persistSettingsDebounced({ anchorColorContrastLevel: level });
  });
  anchorColorModeSelect?.addEventListener('change', () => {
    const autoSelected = anchorColorModeSelect.value === 'auto';
    const highlightEnabled = !!anchorToggle?.checked;
    const customEnabled = !!anchorColorCustomToggle?.checked;
    const color = getSelectedAnchorColor();
    updateAnchorColorUI(highlightEnabled, customEnabled, customEnabled && autoSelected, color);
    persistSettingsDebounced({ anchorAutoColorEnabled: autoSelected });
  });
  // Typography & spacing
  lineHeightInput?.addEventListener('change', () => {
    const value = parseFloat(lineHeightInput.value);
    const next = Number.isFinite(value) ? value : getTypographyDefault('lineHeightOverride');
    persistSettingsDebounced({ lineHeightOverride: next });
    notifyActiveTabSettings({ lineHeightOverride: next });
  });
  letterSpacingInput?.addEventListener('change', () => {
    const value = parseFloat(letterSpacingInput.value);
    const next = Number.isFinite(value) ? value : getTypographyDefault('letterSpacingOverride');
    persistSettingsDebounced({ letterSpacingOverride: next });
    notifyActiveTabSettings({ letterSpacingOverride: next });
  });
  paragraphSpacingInput?.addEventListener('change', () => {
    const value = parseFloat(paragraphSpacingInput.value);
    const next = Number.isFinite(value) ? value : getTypographyDefault('paragraphSpacingOverride');
    persistSettingsDebounced({ paragraphSpacingOverride: next });
    notifyActiveTabSettings({ paragraphSpacingOverride: next });
  });
  typographyToggle?.addEventListener('change', () => {
    persistSettingsDebounced({ typographyEnabled: typographyToggle.checked });
    notifyActiveTabSettings({ typographyEnabled: typographyToggle.checked });
  });
  typographyToggle?.addEventListener('change', () => setTypographyControlsDisabled(!typographyToggle.checked));

  // Restore typography defaults
  restoreTypographyBtn?.addEventListener('click', () => {
    const defaults = {
      lineHeightOverride: getTypographyDefault('lineHeightOverride'),
      letterSpacingOverride: getTypographyDefault('letterSpacingOverride'),
      paragraphSpacingOverride: getTypographyDefault('paragraphSpacingOverride'),
      typographyEnabled: true
    };
    // update inputs immediately for visual feedback
    if (lineHeightInput) lineHeightInput.value = defaults.lineHeightOverride;
    if (letterSpacingInput) letterSpacingInput.value = defaults.letterSpacingOverride;
    if (paragraphSpacingInput) paragraphSpacingInput.value = defaults.paragraphSpacingOverride;
    // persist and notify content script
    persistSettingsDebounced(defaults);
    notifyActiveTabSettings(defaults);
  });

  // Layout & Predictability controls removed

  // Sensory
  reduceColourSaturationToggle?.addEventListener('change', () => persistSettingsDebounced({ reduceColourSaturationEnabled: reduceColourSaturationToggle.checked }));
  disableAutoPlayToggle?.addEventListener('change', () => persistSettingsDebounced({ disableAutoPlayMedia: disableAutoPlayToggle.checked }));
  noFlashAnimationsToggle?.addEventListener('change', () => persistSettingsDebounced({ noFlashAnimationsEnabled: noFlashAnimationsToggle.checked }));
  aggressiveMediaBlockToggle?.addEventListener('change', () => persistSettingsDebounced({ aggressiveMediaBlockEnabled: aggressiveMediaBlockToggle.checked }));

  // Executive function
  breakReminderToggle?.addEventListener('change', () => persistSettingsDebounced({ breakReminderEnabled: breakReminderToggle.checked }));
  breakIntervalInput?.addEventListener('change', () => persistSettingsDebounced({ breakIntervalMinutes: parseInt(breakIntervalInput.value, 10) || 15 }));
  // taskStepModeToggle and highlightNextActionToggle removed

  // Tables
  tableSimplifyToggle?.addEventListener('change', () => persistSettingsDebounced({ tableSimplifyEnabled: tableSimplifyToggle.checked }));

  // Master "Quick pause" toggle: save current settings locally, then set booleans to off.
  if (masterToggle) {
    masterToggle.addEventListener('change', () => {
      const turningOff = masterToggle.checked;
      if (turningOff) {
        // Disable controls immediately so users get instant visual feedback.
        setAllControlsDisabled(true);
        // Save current sync settings to local storage
        chrome.storage.sync.get(DEFAULT_SETTINGS, (current) => {
          const lastError = chrome.runtime?.lastError;
          const snapshot = { ...DEFAULT_SETTINGS, ...(lastError ? {} : current) };
          chrome.storage.local.set({ nf_saved_settings: snapshot }, () => {});
          // Build an object that forces boolean features off and keep other values intact.
          const offPartial = { masterAllOff: true };
          BOOLEAN_KEYS_TO_DISABLE.forEach((k) => { offPartial[k] = false; });
          // Persist the off state to sync (will send message to content script)
          persistSettingsDebounced(offPartial, 0);
        });
      } else {
        // Restore saved settings from local storage (if available)
        chrome.storage.local.get('nf_saved_settings', (res) => {
          const lastError = chrome.runtime?.lastError;
          const savedSnapshot = (!lastError && res && typeof res === 'object') ? res.nf_saved_settings : null;
          const restore = { ...DEFAULT_SETTINGS, ...(savedSnapshot || {}) };
          restore.masterAllOff = false;
          chrome.storage.sync.set(restore, () => {});
          chrome.storage.local.remove('nf_saved_settings', () => {});
          // update UI and notify content script immediately so no refresh is needed
          render(restore);
          sendUpdate(restore);
        });
      }
    });
  }

  // === Tabs: simple tab navigation for the popup panes ===
  try {
    const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
    const tabPanes = Array.from(document.querySelectorAll('.tab-pane'));

    function showTab(name) {
      if (!name) name = 'general';
      tabPanes.forEach((p) => {
        try {
          p.style.display = (p.dataset && p.dataset.tab === name) ? '' : 'none';
        } catch (e) { /* ignore */ }
      });
      tabButtons.forEach((b) => {
        try {
          const is = (b.dataset && b.dataset.tab === name);
          b.setAttribute('aria-selected', is ? 'true' : 'false');
          // ensure tab buttons get basic button styling and an active state
          b.classList.add('btn');
          b.classList.toggle('active', is);
        } catch (e) { /* ignore */ }
      });
      try { chrome.storage.local.set({ nf_selected_tab: name }); } catch (e) { /* ignore */ }
    }

    tabButtons.forEach((btn) => {
      try {
        btn.addEventListener('click', () => showTab(btn.dataset?.tab || 'general'));
      } catch (e) { /* ignore */ }
    });

    // Keyboard navigation: allow arrows, home/end and activate with Enter/Space
    tabButtons.forEach((btn, idx) => {
      try {
        btn.addEventListener('keydown', (ev) => {
          const key = ev.key;
          if (!key) return;
          const len = tabButtons.length || 1;
          let next = -1;
          if (key === 'ArrowRight') { ev.preventDefault(); next = (idx + 1) % len; tabButtons[next].focus(); }
          else if (key === 'ArrowLeft') { ev.preventDefault(); next = (idx - 1 + len) % len; tabButtons[next].focus(); }
          else if (key === 'Home') { ev.preventDefault(); tabButtons[0].focus(); }
          else if (key === 'End') { ev.preventDefault(); tabButtons[len - 1].focus(); }
          else if (key === 'Enter' || key === ' ') { ev.preventDefault(); showTab(btn.dataset?.tab || 'general'); }
        });
      } catch (e) { /* ignore */ }
    });

    // Restore last selected tab or default to 'general'
    try {
      chrome.storage.local.get({ nf_selected_tab: 'general' }, (res) => {
        const sel = res?.nf_selected_tab || 'general';
        showTab(sel);
      });
    } catch (e) {
      // fallback: show general tab
      showTab('general');
    }
  } catch (e) { /* ignore tab wiring failures */ }

}
// Disable or enable the typography input controls in one place (DRY)
function setTypographyControlsDisabled(disabled) {
  const inputs = [lineHeightInput, letterSpacingInput, paragraphSpacingInput];
  inputs.forEach((i) => {
    if (!i) return;
    i.disabled = disabled;
    i.setAttribute('aria-disabled', String(disabled));
    i.style.opacity = disabled ? '0.6' : '';
    i.style.pointerEvents = disabled ? 'none' : '';
  });
  if (restoreTypographyBtn) {
    restoreTypographyBtn.disabled = disabled;
    restoreTypographyBtn.setAttribute('aria-disabled', String(disabled));
    restoreTypographyBtn.style.opacity = disabled ? '0.6' : '';
    restoreTypographyBtn.style.pointerEvents = disabled ? 'none' : '';
  }
}

document.addEventListener('DOMContentLoaded', init);
