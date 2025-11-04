const MAX_OVERLAY_OPACITY = 0.85;

const DEFAULT_SETTINGS = {
  fontsEnabled: true,
  overlayEnabled: false,
  overlayColor: '#f7f4d8',
  overlayOpacity: 0.25,
  focusModeEnabled: false
};

const fontsToggle = document.getElementById('fontsToggle');
const overlayToggle = document.getElementById('overlayToggle');
const overlayColor = document.getElementById('overlayColor');
const overlayOpacity = document.getElementById('overlayOpacity');
const opacityValue = document.getElementById('opacityValue');
const focusToggle = document.getElementById('focusToggle');

if (overlayOpacity) {
  overlayOpacity.setAttribute('max', String(MAX_OVERLAY_OPACITY));
}
const swatches = Array.from(document.querySelectorAll('.swatch'));

function limitOpacity(value) {
  return Math.min(Math.max(Number.parseFloat(value) || 0, 0), MAX_OVERLAY_OPACITY);
}

function formatOpacity(value) {
  return `${Math.round(limitOpacity(value) * 100)}%`;
}

function setOverlayControlsDisabled(disabled) {
  overlayColor.disabled = disabled;
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
        type: 'dyslexicFriendUpdateSettings',
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

function render(settings) {
  fontsToggle.checked = Boolean(settings.fontsEnabled);
  overlayToggle.checked = Boolean(settings.overlayEnabled);
  overlayColor.value = settings.overlayColor || DEFAULT_SETTINGS.overlayColor;
  if (overlayOpacity) {
    overlayOpacity.value = limitOpacity(settings.overlayOpacity);
  }
  if (opacityValue) {
    opacityValue.textContent = formatOpacity(settings.overlayOpacity);
  }
  if (focusToggle) {
    focusToggle.checked = Boolean(settings.focusModeEnabled);
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
    persistSettings({ overlayColor: overlayColor.value });
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
      overlayColor.value = swatch.dataset.color;
      persistSettings({ overlayColor: swatch.dataset.color });
    });
  });

  focusToggle?.addEventListener('change', () => {
    persistSettings({ focusModeEnabled: focusToggle.checked });
  });
}

document.addEventListener('DOMContentLoaded', init);
