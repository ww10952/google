chrome.runtime.onInstalled.addListener(() => {
  console.log('Tab Manager Pro 已安装');
});

chrome.tabs.onCreated.addListener(async (tab) => {
  await trackTabActivity(tab.id);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await trackTabActivity(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    await trackTabActivity(tabId);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await cleanupTabActivity(tabId);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-manager') {
    chrome.action.openPopup();
  }
});

async function trackTabActivity(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) return;
    
    const { tabActivity } = await chrome.storage.local.get('tabActivity');
    const activity = tabActivity || {};
    
    const now = Date.now();
    activity[tabId] = {
      title: tab.title,
      url: tab.url,
      lastActive: now,
      activateCount: (activity[tabId]?.activateCount || 0) + 1
    };
    
    await chrome.storage.local.set({ tabActivity: activity });
  } catch (error) {
    console.error('追踪标签页活动失败:', error);
  }
}

async function cleanupTabActivity(tabId) {
  try {
    const { tabActivity } = await chrome.storage.local.get('tabActivity');
    if (tabActivity && tabActivity[tabId]) {
      delete tabActivity[tabId];
      await chrome.storage.local.set({ tabActivity });
    }
  } catch (error) {
    console.error('清理标签页活动失败:', error);
  }
}

async function getMostActiveTabs() {
  const { tabActivity } = await chrome.storage.local.get('tabActivity');
  if (!tabActivity) return [];
  
  return Object.entries(tabActivity)
    .map(([tabId, data]) => ({
      tabId: parseInt(tabId),
      ...data
    }))
    .sort((a, b) => b.activateCount - a.activateCount);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatistics') {
    getMostActiveTabs()
      .then(tabs => sendResponse({ tabs }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});
