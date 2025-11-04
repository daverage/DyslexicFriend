# Dyslexic Friend

Dyslexic Friend is a Chrome extension that helps dyslexic readers tailor any website to their preferences. It can replace fonts across a page with the OpenDyslexic typeface and layer a configurable, high-contrast color tint that eases glare without blocking page interactions.

## Features

- Toggle OpenDyslexic on any page for consistent, dyslexia-friendly typography.
- Apply a translucent color overlay with recommended tints (warm cream, mint, blue, amber) or any custom color.
- Adjust overlay opacity up to 85% while keeping forms, links, and scrolling fully interactive.
- Enable a focus spotlight that gently dims the top and bottom thirds of the page to reduce visual noise.
- Preferences persist via Chrome sync storage so they automatically apply across tabs and devices.

## Getting started

1. Open **chrome://extensions** in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select the `extension` folder in this repository.
3. Pin Dyslexic Friend from the extensions toolbar button (optional).
4. Use the popup to toggle the OpenDyslexic font, fine-tune the overlay color and strength, and enable the focus spotlight as needed.

Settings update instantly in the active tab and propagate automatically to every open page.

### Prefer a ZIP download?

Run the helper script to generate a fresh archive locally:

```bash
./scripts/package-extension.sh
```

The script outputs `dyslexic-friend-extension.zip` in the repository root. Load the extracted `extension` folder in Chrome using the **Load unpacked** flow above.

## Credits

- [OpenDyslexic](https://opendyslexic.org/) typeface by Abelardo Gonzalez, used under its open license.