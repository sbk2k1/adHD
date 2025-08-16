// Background service worker for the extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('adHD Reading Assistant installed');
});

// Handle any background tasks here
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    console.log('Settings updated:', changes);
  }
});