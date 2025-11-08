// Minimal background service worker placeholder.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;
  if (message.type === 'neuroFriendlyHeartbeat') {
    sendResponse?.({ ok: true });
    return true;
  }
  return false;
});
