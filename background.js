/**
 * AO3 Companion - Background Service Worker
 */

importScripts('lib/storage.js');

chrome.runtime.onInstalled.addListener(function() {
  console.log('AO3 Companion extension installed');
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'GET_ACTIVE_TAB_URL') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0]) {
        sendResponse({ url: tabs[0].url });
      } else {
        sendResponse({ url: null });
      }
    });
    return true; // async response
  }
});
