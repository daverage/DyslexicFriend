# Neuro Friendly

Neuro Friendly is a Chrome extension that helps neurodivergent readers tailor any website to their preferences. It can replace fonts across a page with the OpenDyslexic typeface, layer a configurable, high-contrast color tint that eases glare without blocking page interactions, and provide optional sensory and attention supports that work across reading styles.

## Features

- Toggle OpenDyslexic on any page for consistent, dyslexia-friendly typography.
- Automatically cushions letter and line spacing to prevent crowding or overlap when the font is applied.
- Apply a translucent color overlay with recommended tints (warm cream, mint, blue, pink, amber) or any custom color via a full-spectrum picker with HEX/RGB inputs.
- Adjust overlay opacity up to 85% while keeping forms, links, and scrolling fully interactive.
- Enable a focus spotlight that gently dims the page while letting you steer the bright reading lane with your cursor, touch, or focused form field.
- Activate ADHD-friendly focus anchors that bold key word openings and highlight sentence starts, backed by a multilingual stopword dictionary bundled with the extension.
- Calm overstimulating motion with a reduce-motion switch that pauses CSS animations and transitions for sensory relief.
- Highlight every number in-line so calculations and statistics stand out for dyscalculic readers.
- Preferences persist via Chrome sync storage so they automatically apply across tabs and devices.

## Getting started

1. Open **chrome://extensions** in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select the `extension` folder in this repository.
3. Pin Neuro Friendly from the extensions toolbar button (optional).
4. Use the popup to toggle the OpenDyslexic font, fine-tune the overlay color and strength, enable the focus spotlight, configure focus anchors, pause motion, and highlight numbers to suit your reading flow.

Settings update instantly in the active tab and propagate automatically to every open page.

### Prefer a ZIP download?

Run the helper script to generate a fresh archive locally:

```bash
./scripts/package-extension.sh
```

The script outputs `neuro-friendly-extension.zip` in the repository root. Load the extracted `extension` folder in Chrome using the **Load unpacked** flow above.

## Ideas for future neurodivergent supports

- Offer optional dyscalculia-friendly number formatting such as digit grouping and spoken feedback.
- Add a quick way to silence auto-playing audio or video for sensory-sensitive readers.
- Provide a writing helper that gently surfaces repeated words or long sentences for executive function support.
- Let users save multiple preset profiles so they can switch between reading, focus, and relaxation modes quickly.

## Credits

- [OpenDyslexic](https://opendyslexic.org/) typeface by Abelardo Gonzalez, used under its open license.
- [stopwords-iso](https://github.com/stopwords-iso/stopwords-iso) project for the bundled multilingual stopword lists.