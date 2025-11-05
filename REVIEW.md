# Code review

> **Note:** The observations below capture the gaps identified before the follow-up implementation. They are retained for historical context.

## Summary of original findings (now resolved)
- The content script initially only applied font, overlay, and focus spotlight preferences; it did not load the ADHD anchor highlighting routine or any local stopword data, and settings did not expose anchor-specific toggles.
- The popup lacked UI controls for anchor emphasis or sentence-start highlighting, so end users had no way to enable the requested behaviour.
- The repository did not package the `stopwords-iso.json` asset or expose it through the manifest, preventing offline lookups even if the script were present.
- Settings persistence flowed through shared defaults and sync updates, but the anchor-related fields were absent. Any attempt to store those values would have been dropped.

## Update
- Follow-up work implemented the focus anchor routine, bundled stopword dictionary, popup toggles, and manifest exposure so the issues above are now resolved. 【F:extension/scripts/contentScript.js†L1-L480】【F:extension/popup.html†L1-L200】【F:extension/popup.js†L1-L240】【F:extension/manifest.json†L1-L40】【F:extension/stopwords-iso.json†L1-L4000】
- The latest iteration also rebrands the project as **Neuro Friendly** and adds reduce-motion and number-highlighting options to broaden support for autistic, ADHD, and dyscalculic readers. 【F:README.md†L1-L60】【F:extension/popup.html†L1-L200】【F:extension/scripts/contentScript.js†L1-L560】【F:extension/popup.js†L1-L220】

