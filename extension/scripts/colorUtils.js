export function srgbToLinear(c) {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

export function relativeLuminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(rgbA, rgbB) {
  const L1 = relativeLuminance(rgbA);
  const L2 = relativeLuminance(rgbB);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function hexToRgb(hex) {
  try {
    const h = (hex || '').trim().replace(/^#/, '');
    const hex6 = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    if (!/^[0-9a-fA-F]{6}$/.test(hex6)) return null;
    return {
      r: parseInt(hex6.slice(0, 2), 16),
      g: parseInt(hex6.slice(2, 4), 16),
      b: parseInt(hex6.slice(4, 6), 16)
    };
  } catch (e) {
    return null;
  }
}

export function pickBestColorFromPalette(palette, bgRgb, targetRatio) {
  if (!Array.isArray(palette) || palette.length === 0) return '#111111';
  let best = null;
  let bestRatio = 0;
  for (const hex of palette) {
    const rgb = hexToRgb(hex);
    if (!rgb) continue;
    const r = contrastRatio(rgb, bgRgb);
    if (r >= targetRatio) return hex; // short-circuit when meeting target
    if (r > bestRatio) { bestRatio = r; best = hex; }
  }
  return best || palette[0];
}
