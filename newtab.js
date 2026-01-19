let allTabs = [];
let allGroups = [];
let virtualGroups = [];
let tabGroupMapping = {};
let storedTabs = {};
let sidebarCollapsed = false;
let backgroundSettings = {
  type: 'seasonal',
  season: 'auto',
  customUrl: ''
};
let faviconCache = {};
let historyOffset = 0;
let allHistoryItems = [];
let hasMoreHistory = true;

document.addEventListener('DOMContentLoaded', async () => {
  loadBackgroundSettings();
  applyBackground();
  updateTime();
  setInterval(updateTime, 1000);
  
  await loadFaviconCache();
  loadTabs();
  setupEventListeners();
  setupDragEvents();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    console.log('Page became visible, reloading tabs');
    loadTabs();
  }
});

async function loadBackgroundSettings() {
  const result = await chrome.storage.local.get('backgroundSettings');
  if (result.backgroundSettings) {
    backgroundSettings = result.backgroundSettings;
  }
}

function applyBackground() {
  const body = document.body;
  body.className = '';
  body.style.background = '';
  body.style.backgroundImage = '';
  
  if (backgroundSettings.type === 'seasonal') {
    const season = backgroundSettings.season === 'auto' ? getCurrentSeason() : backgroundSettings.season;
    body.classList.add(season);
    
    const seasonGradients = {
      spring: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
      summer: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      autumn: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      winter: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)'
    };
    
    if (seasonGradients[season]) {
      body.style.background = seasonGradients[season];
    }
  } else if (backgroundSettings.type === 'custom') {
    if (backgroundSettings.customUrl) {
      body.style.backgroundImage = `url(${backgroundSettings.customUrl})`;
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      body.style.backgroundRepeat = 'no-repeat';
    }
  }
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function updateTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  document.getElementById('clock').textContent = `${hours}:${minutes}:${seconds}`;
  
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  document.getElementById('date').textContent = now.toLocaleDateString('zh-CN', options);
}

async function loadTabs() {
  try {
    const [tabs, groups, categoriesResult, virtualGroupsResult, groupDataResult, tabGroupMappingResult, storedTabsResult] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabGroups.query({}),
      chrome.storage.local.get('categories'),
      chrome.storage.local.get('virtualGroups'),
      chrome.storage.local.get('groupData'),
      chrome.storage.local.get('tabGroupMapping'),
      chrome.storage.local.get('storedTabs')
    ]);
    
    const categories = categoriesResult.categories || [];
    const groupData = groupDataResult.groupData || {};
    virtualGroups = virtualGroupsResult.virtualGroups || [];
    tabGroupMapping = tabGroupMappingResult.tabGroupMapping || {};
    storedTabs = storedTabsResult.storedTabs || {};
    
    allTabs = tabs;
    allGroups = groups;
    
    allGroups.forEach(group => {
      if (groupData[group.id]) {
        group.note = groupData[group.id].note;
        group.categoryId = groupData[group.id].categoryId;
      }
    });
    storedTabs = storedTabsResult.storedTabs || {};
    
    console.log('loadTabs - tabs:', allTabs.length, 'groups:', allGroups.length, 'virtualGroups:', virtualGroups.length);
    
    updateStats();
    renderTabsList();
    renderCategories(categories);
    renderHistory();
  } catch (error) {
    showError('加载标签页失败', error);
  }
}

function updateStats() {
  document.getElementById('tabCount').textContent = `${allTabs.length} 个标签页`;
  const totalGroups = allGroups.length + virtualGroups.length;
  document.getElementById('groupCount').textContent = `${totalGroups} 个分组`;
}

function renderTabsList() {
  const tabsList = document.getElementById('tabsList');
  
  if (allTabs.length === 0) {
    tabsList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📑</div><div>暂无打开的标签页</div></div>';
    return;
  }
  
  tabsList.innerHTML = allTabs.map(tab => {
    const group = allGroups.find(g => g.id === tab.groupId);
    let domain = '';
    try {
      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        domain = new URL(tab.url).hostname;
      }
    } catch (error) {
      console.warn('Invalid URL for tab:', tab.url);
    }
    return `
      <div class="tab-item ${tab.active ? 'active' : ''}" 
           data-tab-id="${tab.id}" 
           draggable="true">
        <img src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>'}" 
             alt="icon" 
             class="tab-icon"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>'">
        <div class="tab-info">
          <div class="tab-title">${escapeHtml(tab.title)}</div>
          <div class="tab-url">${escapeHtml(domain)}</div>
        </div>
        <div class="tab-actions">
          <button class="tab-action-btn activate" data-id="${tab.id}">👁️</button>
          <button class="tab-action-btn close" data-id="${tab.id}">❌</button>
        </div>
      </div>
    `;
  }).join('');
  
  setupTabEventListeners();
}

function renderCategories(categories) {
  const categoriesList = document.getElementById('categoriesList');
  
  if (!categories || categories.length === 0) {
    document.getElementById('groups-overview').style.display = 'none';
    return;
  }
  
  document.getElementById('groups-overview').style.display = 'block';
  
  console.log('renderCategories - categories:', categories.length, 'allGroups:', allGroups.length, 'virtualGroups:', virtualGroups.length);
  
  categoriesList.innerHTML = categories.map((category, catIndex) => {
    const categoryGroups = allGroups.filter(g => g.categoryId === category.id);
    const categoryVirtualGroups = virtualGroups.filter(g => g.categoryId === category.id);
    const allCategoryGroups = [...categoryGroups, ...categoryVirtualGroups];
    
    console.log(`Category ${category.name}: ${categoryGroups.length} real groups, ${categoryVirtualGroups.length} virtual groups`);
    
    return `
      <div class="category-item">
        <div class="category-header" data-category-id="${category.id}">
          <span class="category-title">${escapeHtml(category.name)}</span>
          <div class="category-actions">
            <button class="category-icon-btn add-group" data-category-id="${category.id}" title="添加分组">➕</button>
            <button class="category-icon-btn edit-category" data-category-id="${category.id}" title="编辑">✏️</button>
            <button class="category-icon-btn delete-category" data-category-id="${category.id}" title="删除">❌</button>
          </div>
        </div>
        ${allCategoryGroups.length > 0 ? `
          <div class="groups-grid">
            ${allCategoryGroups.map(group => {
              const isVirtual = group.isVirtual;
              let tabs = [];
              let storedTabIds = [];
              
              if (isVirtual) {
                const tabIds = Object.keys(tabGroupMapping).filter(tabId => tabGroupMapping[tabId] === group.id);
                storedTabIds = tabIds;
                tabs = allTabs.filter(t => tabIds.includes(String(t.id)));
                
                if (tabs.length < tabIds.length) {
                  const missingTabIds = tabIds.filter(tabId => !tabs.find(t => String(t.id) === tabId));
                  missingTabIds.forEach(tabId => {
                    if (storedTabs[tabId]) {
                      tabs.push({
                        id: parseInt(tabId),
                        title: storedTabs[tabId].title,
                        url: storedTabs[tabId].url,
                        favIconUrl: storedTabs[tabId].favicon,
                        isStored: true
                      });
                    }
                  });
                }
              } else {
                tabs = allTabs.filter(t => t.groupId === group.id);
              }
              
              return `
                <div class="group-card ${isVirtual ? 'virtual-group' : ''}" data-group-id="${group.id}" data-is-virtual="${isVirtual}" style="--group-color: ${getGroupColorHex(group.color)}">
                  <div class="group-card-header">
                    <div class="group-color-indicator"></div>
                    <div class="group-title">${escapeHtml(group.title)}</div>
                    ${group.note ? `<div class="group-note">${escapeHtml(group.note)}</div>` : ''}
                    <div class="group-actions">
                      <button class="action-icon-btn group-edit" data-id="${group.id}">✏️</button>
                      ${isVirtual ? `<button class="action-icon-btn group-ungroup" data-id="${group.id}">❌</button>` : ''}
                    </div>
                  </div>
                  ${tabs.length > 0 ? `
                    <div class="group-tabs-grid">
                      ${tabs.map(tab => {
                        const url = tab.url || '';
                        const displayUrl = url.length > 20 ? url.substring(0, 20) + '...' : url;
                        const isStored = tab.isStored;
                        return `
                          <div class="tab-card ${isStored ? 'stored-tab' : ''}" data-tab-id="${tab.id}" data-is-virtual="${isVirtual}" data-is-stored="${isStored}" data-group-id="${group.id}">
                            <img src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>'}" 
                                 alt="icon" 
                                 class="tab-card-icon">
                            <div class="tab-card-info">
                              <div class="tab-card-title">${escapeHtml(tab.title)}</div>
                              <div class="tab-card-url">${escapeHtml(displayUrl)}</div>
                            </div>
                            <div class="tab-card-actions">
                              <button class="tab-card-activate" data-tab-id="${tab.id}" title="${isStored ? '重新打开' : '激活'}">${isStored ? '🔄' : '👁️'}</button>
                              <button class="tab-card-delete" data-tab-id="${tab.id}" title="从分组删除">❌</button>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  ` : '<div class="group-empty">暂无标签页</div>'}
                </div>
              `;
            }).join('')}
          </div>
        ` : '<div style="color: #999; padding: 10px;">暂无分组</div>'}
      </div>
    `;
  }).join('');
  
  setupCategoryEventListeners();
  setupGroupCardEventListeners();
  setupDragEvents();
}

async function renderHistory() {
  const historyList = document.getElementById('historyList');
  
  if (!historyList) {
    console.error('historyList element not found');
    return;
  }
  
  try {
    // Show loading indicator
    if (historyOffset === 0) {
      historyList.innerHTML = '<div class="loading-state">加载历史记录中...</div>';
    }
    
    console.log('开始加载历史记录...');
    const historyItems = await chrome.history.search({
      text: '',
      maxResults: CONFIG.HISTORY_MAX_RESULTS,
      startTime: Date.now() - CONFIG.HISTORY_DAYS * 24 * 60 * 60 * 1000
    });
    
    console.log('历史记录数量:', historyItems.length);
    
    if (!historyItems || historyItems.length === 0) {
      historyList.innerHTML = '<div class="empty-state">暂无访问历史</div>';
      return;
    }
    
    const domainMap = {};
    let validUrlCount = 0;
    let invalidUrlCount = 0;
    
    historyItems.forEach(item => {
      try {
        const url = new URL(item.url);
        const domain = url.hostname;
        validUrlCount++;
        
        if (!domainMap[domain]) {
          domainMap[domain] = {
            title: item.title || url.hostname,
            visits: item.visitCount || 1,
            lastVisited: item.lastVisitTime || Date.now(),
            urls: []
          };
        } else {
          domainMap[domain].visits += item.visitCount || 1;
          if (item.lastVisitTime > domainMap[domain].lastVisited) {
            domainMap[domain].lastVisited = item.lastVisitTime;
            domainMap[domain].title = item.title || url.hostname;
          }
        }
        
        const existingUrl = domainMap[domain].urls.find(u => u.url === item.url);
        if (existingUrl) {
          existingUrl.visitCount += item.visitCount || 1;
          if (item.lastVisitTime > existingUrl.lastVisited) {
            existingUrl.lastVisited = item.lastVisitTime;
            existingUrl.title = item.title;
          }
        } else {
          domainMap[domain].urls.push({
            url: item.url,
            title: item.title,
            visitCount: item.visitCount || 1,
            lastVisited: item.lastVisitTime || Date.now()
          });
        }
      } catch (e) {
        invalidUrlCount++;
        console.warn('Invalid URL:', item.url);
      }
    });
    
    console.log('有效URL:', validUrlCount, '无效URL:', invalidUrlCount);
    console.log('域名数量:', Object.keys(domainMap).length);
    
    if (Object.keys(domainMap).length === 0) {
      historyList.innerHTML = '<div class="empty-state">没有有效的访问记录</div>';
      return;
    }
    
    const sortedDomains = Object.entries(domainMap)
      .sort((a, b) => b[1].lastVisited - a[1].lastVisited)
      .slice(0, 10);
    
    console.log('排序后的域名数量:', sortedDomains.length);
    console.log('排序后的域名:', sortedDomains.map(([d]) => d));
    
    if (sortedDomains.length === 0) {
      historyList.innerHTML = '<div class="empty-state">暂无访问历史</div>';
      return;
    }
    
    const domainFavicons = await Promise.all(
      sortedDomains.map(([domain]) => getFaviconUrl(domain))
    );
    
    console.log('获取到的favicon数量:', domainFavicons.length);
    console.log('开始渲染历史列表...');
    
    historyList.innerHTML = sortedDomains.map(([domain, data], index) => {
      const favicon = domainFavicons[index];
      return `
        <div class="history-item" data-domain="${escapeHtml(domain)}">
          <img src="${favicon}" alt="icon" class="history-icon" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>'">
          <div class="history-info">
            <div class="history-title">${escapeHtml(data.title)}</div>
            <div class="history-domain">${escapeHtml(domain)}</div>
            <div class="history-visits">访问 ${data.visits} 次</div>
          </div>
          <div class="history-actions">
            <button class="history-btn view" data-domain="${escapeHtml(domain)}">查看</button>
            <button class="history-btn delete" data-domain="${escapeHtml(domain)}">删除</button>
          </div>
        </div>
      `;
    }).join('');
    
    console.log('历史记录渲染完成');
    setupHistoryEventListeners();
  } catch (error) {
    showError('加载历史记录失败', error);
    historyList.innerHTML = '<div class="empty-state">加载历史记录失败: ' + error.message + '</div>';
  }
}

function setupTabEventListeners() {
  document.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-action-btn')) {
        const tabId = parseInt(item.dataset.tabId);
        activateTab(tabId);
      }
    });
  });
  
  document.querySelectorAll('.tab-action-btn.activate').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.id);
      activateTab(tabId);
    });
  });
  
  document.querySelectorAll('.tab-action-btn.close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.id);
      closeTab(tabId);
    });
  });
}

function setupCategoryEventListeners() {
  document.querySelectorAll('.add-group').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const categoryId = parseInt(btn.dataset.categoryId);
      showCreateGroupModal(categoryId);
    });
  });
  
  document.querySelectorAll('.edit-category').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const categoryId = parseInt(btn.dataset.categoryId);
      editCategory(categoryId);
    });
  });
  
  document.querySelectorAll('.delete-category').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const categoryId = parseInt(btn.dataset.categoryId);
      if (!confirm('确定要删除这个分类及其所有分组吗？')) return;
      
      const result = await chrome.storage.local.get('categories');
      const categories = result.categories || [];
      const updated = categories.filter(c => c.id !== categoryId);
      await chrome.storage.local.set({ categories: updated });
      await loadTabs();
    });
  });
}

function setupGroupCardEventListeners() {
  document.querySelectorAll('.tab-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-card-activate') && !e.target.classList.contains('tab-card-delete')) {
        const tabId = parseInt(card.dataset.tabId);
        const isVirtual = card.dataset.isVirtual === 'true';
        const groupId = parseInt(card.dataset.groupId);
        
        activateStoredTab(tabId, isVirtual, groupId);
      }
    });
  });
  
  document.querySelectorAll('.tab-card-activate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.tabId);
      const tabCard = btn.closest('.tab-card');
      const isVirtual = tabCard?.dataset.isVirtual === 'true';
      const groupId = parseInt(tabCard?.dataset.groupId);
      
      await activateStoredTab(tabId, isVirtual, groupId);
    });
  });
  
  document.querySelectorAll('.tab-card-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.tabId);
      const tabCard = btn.closest('.tab-card');
      const isVirtual = tabCard?.dataset.isVirtual === 'true';
      const groupId = parseInt(tabCard?.dataset.groupId);
      
      if (isVirtual) {
        await removeTabFromVirtualGroup(tabId, groupId);
      }
    });
  });
  
  document.querySelectorAll('.action-icon-btn.group-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = parseInt(btn.dataset.id);
      chrome.action.openPopup();
    });
  });
  
  document.querySelectorAll('.action-icon-btn.group-ungroup').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = parseInt(btn.dataset.id);
      const groupCard = btn.closest('.group-card');
      const isVirtual = groupCard?.dataset.isVirtual === 'true';
      
      if (isVirtual) {
        deleteVirtualGroup(groupId);
      } else {
        ungroup(groupId);
      }
    });
  });
}
async function activateVirtualGroup(groupId) {
  try {
      const tabIds = Object.keys(tabGroupMapping).filter((tabId) => tabGroupMapping[tabId] === groupId).map((id) => parseInt(id));
    if (tabIds.length > 0) {
      const tabId = tabIds[0];
      const tab = allTabs.find(t => t.id === tabId);
      
      if (tab) {
        await chrome.tabs.create({
          url: tab.url,
          active: true
        });
        showNotification(`已在新标签打开分组中的第一个标签页`);
      } else {
        const tabIdStr = String(tabId);
        if (storedTabs[tabIdStr]) {
          const storedTab = storedTabs[tabIdStr];
          await chrome.tabs.create({
            url: storedTab.url,
            active: true
          });
          showNotification(`已在新标签打开分组中的第一个标签页`);
        }
      }
    } else {
      showNotification('此分组中没有标签页');
    }
  } catch (error) {
    console.error('激活虚拟分组失败:', error);
    showNotification('激活失败');
  }
}

async function activateStoredTab(tabId, isVirtual, groupId) {
  try {
    if (isVirtual) {
      const tab = allTabs.find(t => t.id === tabId);
      if (!tab) {
        const tabIdStr = String(tabId);
        if (tabGroupMapping[tabIdStr] && storedTabs[tabIdStr]) {
          const storedTab = storedTabs[tabIdStr];
          
          const newTab = await chrome.tabs.create({
            url: storedTab.url,
            active: true
          });
          
          delete tabGroupMapping[tabIdStr];
          tabGroupMapping[newTab.id] = groupId;
          storedTabs[newTab.id] = storedTab;
          delete storedTabs[tabIdStr];
          
          await chrome.storage.local.set({ tabGroupMapping, storedTabs });
          await loadTabs();
          return;
        }
        alert('该标签页已关闭且无法恢复');
        return;
      }
      
      await chrome.tabs.create({
        url: tab.url,
        active: true
      });
      
      showNotification(`已在新标签打开"${escapeHtml(tab.title)}"`);
    } else {
      await activateTab(tabId);
    }
  } catch (error) {
    console.error('激活标签页失败:', error);
    alert('激活标签页失败');
  }
}

async function removeTabFromVirtualGroup(tabId, groupId) {
  try {
    const tabIdStr = String(tabId);
    
    if (tabGroupMapping[tabIdStr] && tabGroupMapping[tabIdStr] === groupId) {
      delete tabGroupMapping[tabIdStr];
      
      if (storedTabs[tabIdStr]) {
        delete storedTabs[tabIdStr];
      }
      
      await chrome.storage.local.set({ tabGroupMapping, storedTabs });
      await loadTabs();
      showNotification('已从分组移除该标签页');
    }
  } catch (error) {
    console.error('移除标签页失败:', error);
    showNotification('移除失败');
  }
}

async function deleteVirtualGroup(groupId) {
  if (!confirm('确定要删除这个分组吗？')) return;
  
  try {
    Object.keys(tabGroupMapping).forEach(tabId => {
      if (tabGroupMapping[tabId] === groupId) {
        delete tabGroupMapping[tabId];
        if (storedTabs[tabId]) {
          delete storedTabs[tabId];
        }
      }
    });
    virtualGroups = virtualGroups.filter(g => g.id !== groupId);
    await chrome.storage.local.set({ virtualGroups, tabGroupMapping, storedTabs });
    await loadTabs();
    showNotification('分组已删除');
  } catch (error) {
    console.error('删除虚拟分组失败:', error);
    showNotification('删除失败');
  }
}

function setupHistoryEventListeners() {
  document.querySelectorAll('.history-btn.view').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = btn.dataset.domain;
      await showDomainHistoryModal(domain);
    });
  });
  
  document.querySelectorAll('.history-btn.delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = btn.dataset.domain;
      if (!confirm(`确定要删除 ${domain} 的所有访问历史吗？此操作不可恢复！`)) return;
      
      try {
        // Show deleting notification
        showNotification(`正在删除 ${domain} 的访问记录...`);
        
        const historyItems = await chrome.history.search({
          text: '',
          maxResults: 1000
        });
        
        const domainItems = historyItems.filter(item => {
          try {
            return new URL(item.url).hostname === domain;
          } catch (e) {
            return false;
          }
        });
        
        // Use Promise.all() for concurrent deletion with batching
        // Process in batches of 50 to avoid overwhelming the API
        const BATCH_SIZE = 50;
        for (let i = 0; i < domainItems.length; i += BATCH_SIZE) {
          const batch = domainItems.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(item => chrome.history.deleteUrl({ url: item.url }))
          );
          
          // Show progress for large deletions
          if (domainItems.length > BATCH_SIZE) {
            const progress = Math.min(100, Math.round(((i + batch.length) / domainItems.length) * 100));
            showNotification(`删除进度: ${progress}%`);
          }
        }
        
        await renderHistory();
        showNotification(`已删除 ${domain} 的 ${domainItems.length} 条访问记录`);
      } catch (error) {
        showError('删除历史记录失败', error);
      }
    });
  });
  
  document.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (!e.target.classList.contains('history-btn')) {
        const domain = item.dataset.domain;
        const historyItems = await chrome.history.search({
          text: '',
          maxResults: 100
        });
        
        const domainItems = historyItems.filter(item => {
          try {
            return new URL(item.url).hostname === domain;
          } catch (e) {
            return false;
          }
        });
        
        if (domainItems.length > 0) {
          const sortedItems = domainItems.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
          chrome.tabs.create({ url: sortedItems[0].url });
        }
      }
    });
  });
}

async function showDomainHistoryModal(domain) {
  try {
    const historyItems = await chrome.history.search({
      text: '',
      maxResults: 1000
    });
    
    const domainItems = historyItems.filter(item => {
      try {
        return new URL(item.url).hostname === domain;
      } catch (e) {
        return false;
      }
    }).sort((a, b) => b.lastVisitTime - a.lastVisitTime);
    
    if (domainItems.length === 0) {
      alert('未找到该域名的历史记录');
      return;
    }
    
    const totalVisits = domainItems.reduce((sum, item) => sum + (item.visitCount || 1), 0);
    const faviconUrl = await getFaviconUrl(domain);
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'domainHistoryModal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title-row">
            <img src="${faviconUrl}" alt="icon" class="modal-domain-icon" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>'">
            <h3>${escapeHtml(domain)}</h3>
          </div>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body" style="max-height: 500px; overflow-y: auto;">
          <div class="modal-stats">
            <div class="modal-stat">
              <span class="modal-stat-label">总访问次数</span>
              <span class="modal-stat-value">${totalVisits}</span>
            </div>
            <div class="modal-stat">
              <span class="modal-stat-label">页面数量</span>
              <span class="modal-stat-value">${domainItems.length}</span>
            </div>
          </div>
          <div class="modal-url-list">
            ${domainItems.map((item, index) => {
              const lastVisited = new Date(item.lastVisitTime).toLocaleString('zh-CN');
              const urlObj = new URL(item.url);
              return `
                <div class="modal-url-item" data-index="${index}" data-url="${escapeHtml(item.url)}">
                  <div class="modal-url-info">
                    <div class="modal-url-title">${escapeHtml(item.title)}</div>
                    <div class="modal-url-path">${escapeHtml(urlObj.pathname)}</div>
                    <div class="modal-url-meta">
                      <span class="modal-url-count">访问 ${item.visitCount || 1} 次</span>
                      <span class="modal-url-time">最后访问: ${lastVisited}</span>
                    </div>
                  </div>
                  <button class="modal-url-activate" data-url="${escapeHtml(item.url)}">打开</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.modal-close').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.querySelectorAll('.modal-url-activate').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        chrome.tabs.create({ url });
        modal.remove();
      });
    });
    
    modal.querySelectorAll('.modal-url-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('modal-url-activate')) {
          const url = item.dataset.url;
          chrome.tabs.create({ url });
          modal.remove();
        }
      });
    });
  } catch (error) {
    console.error('加载域名历史失败:', error);
    alert('加载历史记录失败');
  }
}

function showCreateGroupModal(categoryId) {
  chrome.action.openPopup();
}

async function activateTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });
  } catch (error) {
    console.error('激活标签页失败:', error);
  }
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    await loadTabs();
  } catch (error) {
    console.error('关闭标签页失败:', error);
  }
}

async function activateGroup(groupId) {
  try {
    const group = allGroups.find(g => g.id === groupId);
    if (group) {
      await chrome.tabGroups.update(groupId, { collapsed: false });
      const tabs = allTabs.filter(t => t.groupId === groupId);
      if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { active: true });
        await chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    }
  } catch (error) {
    console.error('激活分组失败:', error);
  }
}

async function ungroup(groupId) {
  if (!confirm('确定要取消这个分组吗？')) return;
  
  try {
    await chrome.tabs.ungroup(allTabs.filter(t => t.groupId === groupId).map(t => t.id));
    await loadTabs();
  } catch (error) {
    console.error('取消分组失败:', error);
  }
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  
  const sidebar = document.getElementById('tabsSidebar');
  const mainContent = document.querySelector('.main-content');
  const footer = document.querySelector('.footer');
  const toggleBtn = document.getElementById('toggleSidebar');
  
  if (sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    mainContent.classList.add('collapsed');
    footer.classList.add('collapsed');
    toggleBtn.textContent = '▶';
  } else {
    sidebar.classList.remove('collapsed');
    mainContent.classList.remove('collapsed');
    footer.classList.remove('collapsed');
    toggleBtn.textContent = '◀';
  }
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch(searchInput.value);
    }
  });
  
  document.getElementById('searchBtn').addEventListener('click', () => {
    performSearch(searchInput.value);
  });
  
  document.getElementById('toggleSidebar').addEventListener('click', toggleSidebar);
  
  document.getElementById('openManager').addEventListener('click', () => {
    chrome.action.openPopup();
  });
  
  document.getElementById('closeAllTabs').addEventListener('click', async () => {
    if (confirm('确定要关闭所有标签页吗？')) {
      const tabs = await chrome.tabs.query({});
      await chrome.tabs.remove(tabs.map(t => t.id));
    }
  });
  
  document.getElementById('openSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  document.getElementById('createCategory').addEventListener('click', () => {
    const name = prompt('请输入分类名称:');
    if (name && name.trim()) {
      createCategory(name.trim());
    }
  });
  
  setupDragEvents();
}

async function createCategory(name) {
  const result = await chrome.storage.local.get('categories');
  const categories = result.categories || [];
  
  categories.push({
    id: Date.now(),
    name: name
  });
  
  await chrome.storage.local.set({ categories });
  await loadTabs();
}

async function editCategory(categoryId) {
  const result = await chrome.storage.local.get('categories');
  const categories = result.categories || [];
  const category = categories.find(c => c.id === categoryId);
  
  if (!category) return;
  
  const newName = prompt('编辑分类名称:', category.name);
  if (newName && newName.trim() && newName !== category.name) {
    category.name = newName.trim();
    await chrome.storage.local.set({ categories });
    await loadTabs();
  }
}

function performSearch(query) {
  if (!query.trim()) return;
  
  if (query.includes('.') && !query.includes(' ')) {
    window.location.href = query.startsWith('http') ? query : `https://${query}`;
  } else {
    window.location.href = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  }
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

async function getFaviconUrl(domain) {
  if (faviconCache[domain]) {
    return faviconCache[domain];
  }
  
  try {
    const { faviconData = {} } = await chrome.storage.local.get('faviconData');
    if (faviconData[domain]) {
      faviconCache[domain] = faviconData[domain];
      return faviconData[domain];
    }
    
    const response = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const blob = await response.blob();
    const reader = new FileReader();
    
    const base64 = await new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    faviconCache[domain] = base64;
    faviconData[domain] = base64;
    
    try {
      await chrome.storage.local.set({ faviconData });
    } catch (storageError) {
      console.warn('保存favicon缓存失败:', storageError);
    }
    
    return base64;
  } catch (error) {
    console.warn('获取favicon失败:', domain, error.message);
    const defaultIcon = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>';
    faviconCache[domain] = defaultIcon;
    return defaultIcon;
  }
}

async function loadFaviconCache() {
  try {
    const { faviconData } = await chrome.storage.local.get('faviconData');
    if (faviconData) {
      faviconCache = { ...faviconData };
    }
  } catch (error) {
    console.error('加载favicon缓存失败:', error);
  }
}

let draggedTabId = null;
let dragEventsSetup = false;

function setupDragEvents() {
  if (dragEventsSetup) return;
  
  const tabsList = document.getElementById('tabsList');
  const categoriesList = document.getElementById('categoriesList');
  
  console.log('设置拖拽事件...');
  
  if (tabsList) {
    tabsList.addEventListener('dragstart', handleDragStart);
    tabsList.addEventListener('dragend', handleDragEnd);
    console.log('已绑定tabsList的拖拽事件');
  } else {
    console.warn('未找到tabsList元素');
  }
  
  if (categoriesList) {
    categoriesList.addEventListener('dragover', handleDragOver);
    categoriesList.addEventListener('drop', handleDrop);
    console.log('已绑定categoriesList的拖拽事件');
  } else {
    console.warn('未找到categoriesList元素');
  }
  
  dragEventsSetup = true;
}

function handleDragStart(e) {
  const tabItem = e.target.closest('.tab-item');
  if (!tabItem) {
    console.warn('未找到tab-item元素');
    return;
  }
  
  draggedTabId = parseInt(tabItem.dataset.tabId);
  tabItem.classList.add('dragging');
  
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(draggedTabId));
  
  console.log('开始拖拽标签页:', draggedTabId);
}

function handleDragEnd(e) {
  const tabItem = e.target.closest('.tab-item');
  if (tabItem) {
    tabItem.classList.remove('dragging');
  }
  
  console.log('拖拽结束，清除样式');
  
  draggedTabId = null;
  
  document.querySelectorAll('.group-card').forEach(group => {
    group.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  const groupCard = e.target.closest('.group-card');
  if (groupCard && draggedTabId) {
    document.querySelectorAll('.group-card').forEach(g => g.classList.remove('drag-over'));
    groupCard.classList.add('drag-over');
  }
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const groupCard = e.target.closest('.group-card');
  if (!groupCard) {
    console.warn('未找到group-card元素');
    return;
  }
  
  if (!draggedTabId) {
    console.warn('没有正在拖拽的标签页');
    groupCard.classList.remove('drag-over');
    return;
  }
  
  const groupId = parseInt(groupCard.dataset.groupId);
  const isVirtual = groupCard.dataset.isVirtual === 'true';
  
  console.log('拖拽到分组:', groupId, '标签页:', draggedTabId, '是否虚拟:', isVirtual);
  
  try {
    const tab = allTabs.find(t => t.id === draggedTabId);
    if (!tab) {
      console.error('未找到标签页:', draggedTabId);
      groupCard.classList.remove('drag-over');
      return;
    }
    
    if (isVirtual) {
      const virtualGroup = virtualGroups.find(g => g.id === groupId);
      if (!virtualGroup) {
        console.error('未找到虚拟分组:', groupId);
        groupCard.classList.remove('drag-over');
        return;
      }
      
      tabGroupMapping[draggedTabId] = groupId;
      const tabIdStr = String(draggedTabId);
      storedTabs[tabIdStr] = {
        title: tab.title,
        url: tab.url,
        favicon: tab.favIconUrl
      };
      
      await chrome.storage.local.set({ tabGroupMapping, storedTabs });
      
      console.log('关闭浏览器标签页:', draggedTabId);
      await chrome.tabs.remove(draggedTabId);
      console.log('浏览器标签页已关闭');
      
      showNotification(`已将"${escapeHtml(tab.title)}"添加到"${escapeHtml(virtualGroup.title)}"`);
    } else {
      console.log('准备将标签页添加到分组...');
      await chrome.tabs.group({ tabIds: [draggedTabId], groupId });
      console.log('标签页已添加到分组');
      showNotification(`已将"${escapeHtml(tab.title)}"添加到分组`);
    }
    
    groupCard.classList.remove('drag-over');
    
    console.log('重新加载标签页...');
    await loadTabs();
  } catch (error) {
    console.error('拖拽添加到分组失败:', error);
    groupCard.classList.remove('drag-over');
    showNotification('添加到分组失败');
  }
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 1000;
    animation: fadeInUp 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'fadeOutDown 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

chrome.tabs.onCreated.addListener(loadTabs);
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabIdStr = String(tabId);
  
  if (tabGroupMapping[tabIdStr]) {
    const tab = allTabs.find(t => t.id === tabId);
    
    if (tab) {
      storedTabs[tabIdStr] = {
        title: tab.title,
        url: tab.url,
        favicon: tab.favIconUrl
      };
    } else {
      if (storedTabs[tabIdStr]) {
        delete storedTabs[tabIdStr];
      }
    }
    
    await chrome.storage.local.set({ tabGroupMapping, storedTabs });
  }
  
  loadTabs();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    loadTabs();
  }
});
chrome.tabGroups.onCreated.addListener(loadTabs);
chrome.tabGroups.onRemoved.addListener(loadTabs);
chrome.tabGroups.onUpdated.addListener(loadTabs);
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('Storage changed:', changes, 'Area:', areaName);
  if (changes.categories || changes.backgroundSettings || changes.virtualGroups || changes.groupData || changes.tabGroupMapping || changes.storedTabs) {
    console.log('Reloading tabs due to storage changes');
    loadTabs();
    if (changes.backgroundSettings) {
      loadBackgroundSettings();
      applyBackground();
    }
  }
});
