let allTabs = [];
let allGroups = [];
let allCategories = [];
let currentFilter = 'all';
let currentCategoryFilter = 'all';
let selectedCategoryId = null;
let selectedGroupId = null;
let selectedTabIds = new Set();
let selectedColor = 'blue';
let expandedCategories = new Set();
let idCounter = 0;
let virtualGroups = [];
let tabGroupMapping = {};

document.addEventListener('DOMContentLoaded', () => {
  loadTabs();
  loadCategories();
  setupEventListeners();
});

async function loadTabs() {
  try {
    const [tabs, groups, categoriesResult, groupDataResult, virtualGroupsResult, tabGroupMappingResult] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabGroups.query({}),
      chrome.storage.local.get('categories'),
      chrome.storage.local.get('groupData'),
      chrome.storage.local.get('virtualGroups'),
      chrome.storage.local.get('tabGroupMapping')
    ]);
    
    allTabs = tabs;
    allGroups = groups;
    const groupData = groupDataResult.groupData || {};
    
    allGroups.forEach(group => {
      if (groupData[group.id]) {
        group.note = groupData[group.id].note;
        group.categoryId = groupData[group.id].categoryId;
      }
    });
    
    virtualGroups = virtualGroupsResult.virtualGroups || [];
    tabGroupMapping = tabGroupMappingResult.tabGroupMapping || {};
    
    updateStats();
    renderCategories();

    renderTabs();
  } catch (error) {
    showError('加载标签页失败', error);
  }
}

async function loadCategories() {
  try {
    const result = await chrome.storage.local.get('categories');
    allCategories = result.categories || [];
    
    if (allCategories.length === 0) {
      allCategories = [
        { id: generateId(), name: '工作' },
        { id: generateId(), name: '学习' },
        { id: generateId(), name: '娱乐' }
      ];
      await chrome.storage.local.set({ categories: allCategories });
    }
    
    renderCategories();
  } catch (error) {
    showError('加载分类失败', error);
  }
}

function updateStats() {
  document.getElementById('totalTabs').textContent = allTabs.length;
  document.getElementById('totalGroups').textContent = allGroups.length;
}

function getFilteredTabs() {
  let filteredTabs = [...allTabs];
  
  switch (currentFilter) {
    case 'active':
      filteredTabs = filteredTabs.filter(tab => tab.active);
      break;
    case 'recent':
      filteredTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      break;
  }
  
  if (currentCategoryFilter === 'group' && selectedGroupId) {
    const virtualGroup = virtualGroups.find(g => g.id === selectedGroupId);
    if (virtualGroup) {
      filteredTabs = filteredTabs.filter(tab => tabGroupMapping[tab.id] === selectedGroupId);
    } else {
      const realGroup = allGroups.find(g => g.id === selectedGroupId);
      if (realGroup) {
        filteredTabs = filteredTabs.filter(tab => tab.groupId === selectedGroupId);
      }
    }
  }
  
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  if (searchTerm) {
    filteredTabs = filteredTabs.filter(tab => 
      tab.title.toLowerCase().includes(searchTerm) || 
      tab.url.toLowerCase().includes(searchTerm)
    );
  }
  
  return filteredTabs;
}

function renderCategories() {
  const categoriesList = document.getElementById('categoriesList');
  
  if (allCategories.length === 0) {
    categoriesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📁</div>
        <div>暂无分类</div>
      </div>
    `;
    return;
  }
  
  categoriesList.innerHTML = allCategories.map(category => {
    const isExpanded = expandedCategories.has(category.id);
    const categoryGroups = allGroups.filter(g => g.categoryId === category.id);
    const categoryVirtualGroups = virtualGroups.filter(g => g.categoryId === category.id);
    
    return `
      <div class="category-item">
        <div class="category-header" data-category-id="${category.id}">
          <div class="category-info">
            <span class="category-icon">${isExpanded ? '📂' : '📁'}</span>
            <span class="category-name">${escapeHtml(category.name)}</span>
            <span class="category-count">${categoryGroups.length + categoryVirtualGroups.length}</span>
          </div>
          <div class="category-actions-row">
            <button class="category-action-btn expand-collapse" data-id="${category.id}" title="${isExpanded ? '折叠' : '展开'}">
              ${isExpanded ? '🔽' : '▶️'}
            </button>
            <button class="category-action-btn add-group" data-id="${category.id}" title="添加分组">➕</button>
            <button class="category-action-btn edit" data-id="${category.id}" title="编辑">✏️</button>
            <button class="category-action-btn delete" data-id="${category.id}" title="删除">❌</button>
          </div>
        </div>
        
        ${isExpanded ? `
          <div class="groups-sublist">
            ${categoryGroups.length > 0 ? categoryGroups.map(group => {
              const tabCount = allTabs.filter(t => t.groupId === group.id).length;
              return `
                <div class="group-item ${selectedGroupId === group.id ? 'active' : ''}" data-group-id="${group.id}">
                  <div class="group-header">
                    <div class="group-color-indicator" style="background: ${getGroupColorHex(group.color)}"></div>
                    <div class="group-title">${escapeHtml(group.title)}</div>
                    <div class="group-count">${tabCount}</div>
                  </div>
                  ${group.note ? `<div class="group-note">${escapeHtml(group.note)}</div>` : ''}
                  <div class="group-actions-row">
                    <button class="group-action-btn activate" data-id="${group.id}">👁️</button>
                    <button class="group-action-btn edit" data-id="${group.id}">✏️</button>
                    <button class="group-action-btn collapse" data-id="${group.id}" title="${group.collapsed ? '展开' : '折叠'}">${group.collapsed ? '📂' : '📁'}</button>
                    <button class="group-action-btn ungroup" data-id="${group.id}">❌</button>
                  </div>
                </div>
              `;
            }).join('') : ''}
            ${categoryVirtualGroups.length > 0 ? categoryVirtualGroups.map(group => {
              const tabCount = Object.keys(tabGroupMapping).filter(tabId => tabGroupMapping[tabId] === group.id).length;
              return `
                <div class="group-item ${selectedGroupId === group.id ? 'active' : ''}" data-group-id="${group.id}" data-is-virtual="true">
                  <div class="group-header">
                    <div class="group-color-indicator" style="background: ${getGroupColorHex(group.color)}"></div>
                    <div class="group-title">${escapeHtml(group.title)}</div>
                    <div class="group-count">${tabCount}</div>
                  </div>
                  ${group.note ? `<div class="group-note">${escapeHtml(group.note)}</div>` : ''}
                  <div class="group-actions-row">
                    <button class="group-action-btn activate" data-id="${group.id}">👁️</button>
                    <button class="group-action-btn edit" data-id="${group.id}">✏️</button>
                    <button class="group-action-btn add-tabs" data-id="${group.id}" title="添加标签页">➕</button>
                    <button class="group-action-btn ungroup" data-id="${group.id}">❌</button>
                  </div>
                </div>
              `;
            }).join('') : ''}
            ${categoryGroups.length === 0 && categoryVirtualGroups.length === 0 ? '<div class="empty-substate">暂无分组</div>' : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
  
  setupCategoryEventListeners();
  setupGroupEventListeners();
}

function renderTabs() {
  const tabsList = document.getElementById('tabsList');
  const filteredTabs = getFilteredTabs();
  
  if (filteredTabs.length === 0) {
    tabsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📑</div>
        <div>没有找到标签页</div>
      </div>
    `;
    return;
  }
  
  tabsList.innerHTML = filteredTabs.map(tab => {
    const group = allGroups.find(g => g.id === tab.groupId);
    let groupBadge = '';
    
    if (group) {
      groupBadge = `<span class="group-badge" style="background: ${getGroupColorHex(group.color)}40; color: ${getGroupColorHex(group.color)}">${escapeHtml(group.title)}</span>`;
    } else if (tabGroupMapping[tab.id]) {
      const virtualGroup = virtualGroups.find(g => g.id === tabGroupMapping[tab.id]);
      if (virtualGroup) {
        groupBadge = `<span class="group-badge" style="background: ${getGroupColorHex(virtualGroup.color)}40; color: ${getGroupColorHex(virtualGroup.color)}">${escapeHtml(virtualGroup.title)}</span>`;
      }
    }
    
    const isSelected = selectedTabIds.has(tab.id);
    return `
      <div class="tab-item ${tab.active ? 'active' : ''}" data-tab-id="${tab.id}">
        <input type="checkbox" class="tab-checkbox" ${isSelected ? 'checked' : ''}>
        <img src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>'}" 
             alt="icon" 
             class="tab-icon"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>'">
        <div class="tab-info">
          <div class="tab-title">${escapeHtml(tab.title)}</div>
          <div class="tab-url">${escapeHtml(tab.url)}</div>
          ${groupBadge}
        </div>
        <div class="tab-actions">
          <button class="tab-action-btn activate" data-tab-id="${tab.id}">激活</button>
          <button class="tab-action-btn close" data-tab-id="${tab.id}">关闭</button>
        </div>
      </div>
    `;
  }).join('');
  
  setupTabEventListeners();
}

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', renderTabs);
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderTabs();
    });
  });
  
  document.querySelectorAll('.category-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.category-filter').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentCategoryFilter = e.target.dataset.filter;
      selectedCategoryId = null;
      selectedGroupId = null;
      renderCategories();
      renderTabs();
    });
  });
  
  document.getElementById('createCategoryBtn').addEventListener('click', showCreateCategoryModal);
  document.getElementById('expandAllBtn').addEventListener('click', () => {
    allCategories.forEach(c => expandedCategories.add(c.id));
    renderCategories();
  });
  document.getElementById('collapseAllBtn').addEventListener('click', () => {
    expandedCategories.clear();
    renderCategories();
  });
  document.getElementById('closeDuplicates').addEventListener('click', closeDuplicates);
  document.getElementById('saveCollection').addEventListener('click', showSaveCollectionModal);
  document.getElementById('loadCollection').addEventListener('click', showLoadCollectionModal);
  document.getElementById('showStatistics').addEventListener('click', showStatistics);
  document.getElementById('openSettings').addEventListener('click', openSettings);
  
  document.getElementById('saveCategoryBtn').addEventListener('click', saveCategory);
  document.getElementById('cancelCategoryBtn').addEventListener('click', () => {
    document.getElementById('categoryModal').classList.remove('show');
  });
  
  document.getElementById('saveGroupBtn').addEventListener('click', saveGroup);
  document.getElementById('cancelGroupBtn').addEventListener('click', () => {
    document.getElementById('groupModal').classList.remove('show');
  });
  
  document.querySelectorAll('.color-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      selectedColor = e.target.dataset.color;
    });
  });
  
  document.getElementById('saveCollectionConfirm').addEventListener('click', saveCollection);
  document.getElementById('cancelSave').addEventListener('click', () => {
    document.getElementById('collectionModal').classList.remove('show');
  });
  
  document.getElementById('closeLoadModal').addEventListener('click', () => {
    document.getElementById('loadModal').classList.remove('show');
  });
  
  document.getElementById('closeStatsModal').addEventListener('click', () => {
    document.getElementById('statsModal').classList.remove('show');
  });
}

function setupCategoryEventListeners() {
  document.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (!e.target.classList.contains('category-action-btn')) {
        const categoryId = parseInt(header.dataset.categoryId);
        if (expandedCategories.has(categoryId)) {
          expandedCategories.delete(categoryId);
        } else {
          expandedCategories.add(categoryId);
        }
        renderCategories();
      }
    });
  });
  
  document.querySelectorAll('.category-action-btn.expand-collapse').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const categoryId = parseInt(btn.dataset.id);
      if (expandedCategories.has(categoryId)) {
        expandedCategories.delete(categoryId);
      } else {
        expandedCategories.add(categoryId);
      }
      renderCategories();
    });
  });
  
  document.querySelectorAll('.category-action-btn.add-group').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const categoryId = parseInt(btn.dataset.id);
      showCreateGroupModal(categoryId);
    });
  });
  
  document.querySelectorAll('.category-action-btn.edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const categoryId = parseInt(btn.dataset.id);
      showEditCategoryModal(categoryId);
    });
  });
  
  document.querySelectorAll('.category-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const categoryId = parseInt(btn.dataset.id);
      if (!confirm('确定要删除这个分类吗？')) return;
      
      allCategories = allCategories.filter(c => c.id !== categoryId);
      await chrome.storage.local.set({ categories: allCategories });
      await loadTabs();
    });
  });
}

function setupGroupEventListeners() {
  document.querySelectorAll('.group-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('group-action-btn')) {
        const groupId = parseInt(item.dataset.groupId);
        selectedGroupId = groupId;
        currentCategoryFilter = 'group';
        document.querySelectorAll('.category-filter').forEach(b => b.classList.remove('active'));
        renderCategories();
        renderTabs();
      }
    });
  });
  
  document.querySelectorAll('.group-action-btn.activate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btn.disabled) return;
      const groupId = parseInt(btn.dataset.id);
      const groupItem = btn.closest('.group-item');
      const isVirtual = groupItem?.dataset.isVirtual === 'true';
      
      if (isVirtual) {
        await activateVirtualGroup(groupId);
      } else {
        activateGroup(groupId);
      }
    });
  });
  
  document.querySelectorAll('.group-action-btn.edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = parseInt(btn.dataset.id);
      showEditGroupModal(groupId);
    });
  });
  
  document.querySelectorAll('.group-action-btn.add-tabs').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = parseInt(btn.dataset.id);
      showAddTabsToGroupModal(groupId);
    });
  });
  
  document.querySelectorAll('.group-action-btn.ungroup').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupId = parseInt(btn.dataset.id);
      const groupItem = btn.closest('.group-item');
      const isVirtual = groupItem?.dataset.isVirtual === 'true';
       
      if (isVirtual) {
        if (confirm('确定要删除这个分组吗？')) {
          Object.keys(tabGroupMapping).forEach(tabId => {
            if (tabGroupMapping[tabId] === groupId) {
              delete tabGroupMapping[tabId];
            }
          });
          virtualGroups = virtualGroups.filter(g => g.id !== groupId);
          await chrome.storage.local.set({ virtualGroups, tabGroupMapping });
          await loadTabs();
        }
      } else {
        if (confirm('确定要取消这个分组吗？')) {
          await chrome.tabs.ungroup(allTabs.filter(t => t.groupId === groupId).map(t => t.id));
          await loadTabs();
        }
      }
    });
  });
}

function setupTabEventListeners() {
  document.querySelectorAll('.tab-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-action-btn') && !e.target.classList.contains('tab-checkbox')) {
        const tabId = parseInt(item.dataset.tabId);
        activateTab(tabId);
      }
    });
  });
  
  document.querySelectorAll('.tab-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = parseInt(e.target.closest('.tab-item').dataset.tabId);
      if (e.target.checked) {
        selectedTabIds.add(tabId);
      } else {
        selectedTabIds.delete(tabId);
      }
    });
  });
  
  document.querySelectorAll('.tab-action-btn.activate').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.tabId);
      activateTab(tabId);
    });
  });
  
  document.querySelectorAll('.tab-action-btn.close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.tabId);
      closeTab(tabId);
    });
  });
}

function showCreateCategoryModal() {
  document.getElementById('categoryModalTitle').textContent = '创建新分类';
  document.getElementById('categoryName').value = '';
  document.getElementById('categoryModal').classList.add('show');
}

function showEditCategoryModal(categoryId) {
  const category = allCategories.find(c => c.id === categoryId);
  if (!category) return;
  
  document.getElementById('categoryModalTitle').textContent = '编辑分类';
  document.getElementById('categoryName').value = category.name;
  document.getElementById('selectedCategoryId').value = categoryId;
  document.getElementById('categoryModal').classList.add('show');
}

async function saveCategory() {
  const name = document.getElementById('categoryName').value.trim();
  const categoryId = document.getElementById('selectedCategoryId').value;
  
  if (!name) {
    alert('请输入分类名称');
    return;
  }
  
  if (categoryId) {
    const category = allCategories.find(c => c.id === parseInt(categoryId));
    if (category) {
      category.name = name;
    }
  } else {
    allCategories.push({
      id: generateId(),
      name: name
    });
  }
  
  await chrome.storage.local.set({ categories: allCategories });
  
  document.getElementById('categoryModal').classList.remove('show');
  document.getElementById('selectedCategoryId').value = '';
  
  await loadCategories();
}

function showCreateGroupModal(categoryId) {
  document.getElementById('groupModalTitle').textContent = '创建新分组';
  document.getElementById('groupName').value = '';
  document.getElementById('groupNote').value = '';
  document.getElementById('selectedGroupId').value = '';
  document.getElementById('selectedCategoryId').value = categoryId;
  document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
  document.querySelector('.color-option[data-color="blue"]').classList.add('selected');
  selectedColor = 'blue';
  document.getElementById('groupModal').classList.add('show');
}

function showEditGroupModal(groupId) {
  let group = allGroups.find(g => g.id === groupId);
  const isVirtual = !group;
  
  if (isVirtual) {
    group = virtualGroups.find(g => g.id === groupId);
  }
  
  if (!group) return;
  
  document.getElementById('groupModalTitle').textContent = '编辑分组';
  document.getElementById('groupName').value = group.title;
  document.getElementById('groupNote').value = group.note || '';
  document.getElementById('selectedGroupId').value = groupId;
  document.getElementById('selectedCategoryId').value = group.categoryId || '';
  document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
  document.querySelector(`.color-option[data-color="${group.color}"]`).classList.add('selected');
  selectedColor = group.color;
  document.getElementById('groupModal').classList.add('show');
}

async function activateVirtualGroup(groupId) {
  try {
    const tabIds = Object.keys(tabGroupMapping).filter(tabId => tabGroupMapping[tabId] === groupId).map(id => parseInt(id));
    if (tabIds.length > 0) {
      await chrome.tabs.update(tabIds[0], { active: true });
      const tab = allTabs.find(t => t.id === tabIds[0]);
      if (tab) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } else {
      alert('此分组中没有标签页');
    }
  } catch (error) {
    console.error('激活虚拟分组失败:', error);
  }
}

function showAddTabsToGroupModal(groupId) {
  const virtualGroup = virtualGroups.find(g => g.id === groupId);
  if (!virtualGroup) return;
  
  const currentTabIds = Object.keys(tabGroupMapping).filter(tabId => tabGroupMapping[tabId] === groupId);
  
  let availableTabsHtml = allTabs.filter(t => !currentTabIds.includes(String(t.id))).map(tab => `
    <div class="tab-option" data-tab-id="${tab.id}">
      <input type="checkbox" class="tab-option-checkbox" value="${tab.id}">
      <img src="${tab.favIconUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23ddd%22/></svg>'}" alt="icon" class="tab-icon-small">
      <div class="tab-info-small">
        <div class="tab-title-small">${escapeHtml(tab.title)}</div>
        <div class="tab-url-small">${escapeHtml(tab.url)}</div>
      </div>
    </div>
  `).join('');
  
  if (availableTabsHtml === '') {
    availableTabsHtml = '<div style="padding: 20px; text-align: center; color: #666;">没有可用的标签页</div>';
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'addTabsModal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加标签页到"${escapeHtml(virtualGroup.title)}"</h3>
        <button class="modal-close" onclick="document.getElementById('addTabsModal').remove()">✕</button>
      </div>
      <div class="modal-body" style="max-height: 400px; overflow-y: auto;">
        ${availableTabsHtml}
      </div>
      <div class="modal-footer">
        <button id="confirmAddTabs">确定</button>
        <button onclick="document.getElementById('addTabsModal').remove()">取消</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#confirmAddTabs').addEventListener('click', async () => {
    const checkedTabIds = Array.from(modal.querySelectorAll('.tab-option-checkbox:checked')).map(cb => parseInt(cb.value));
    
    if (checkedTabIds.length === 0) {
      alert('请选择至少一个标签页');
      return;
    }
    
    checkedTabIds.forEach(tabId => {
      tabGroupMapping[tabId] = groupId;
    });
    
    await chrome.storage.local.set({ tabGroupMapping });
    modal.remove();
    await loadTabs();
  });
  
  modal.querySelectorAll('.tab-option').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const checkbox = item.querySelector('.tab-option-checkbox');
        checkbox.checked = !checkbox.checked;
      }
    });
  });
}

async function saveGroup() {
  const name = document.getElementById('groupName').value.trim();
  const note = document.getElementById('groupNote').value.trim();
  const groupId = document.getElementById('selectedGroupId').value;
  const categoryId = document.getElementById('selectedCategoryId').value;
  
  if (!name) {
    alert('请输入分组名称');
    return;
  }
  
  try {
    if (groupId) {
      const virtualGroupIndex = virtualGroups.findIndex(g => g.id === parseInt(groupId));
      if (virtualGroupIndex !== -1) {
        virtualGroups[virtualGroupIndex] = {
          ...virtualGroups[virtualGroupIndex],
          title: name,
          color: selectedColor,
          note: note,
          categoryId: categoryId ? parseInt(categoryId) : null
        };
        await chrome.storage.local.set({ virtualGroups });
      }
      alert('分组已更新');
    } else {
      if (!categoryId) {
        alert('请先选择一个分类');
        return;
      }
      
      const newGroupId = generateId();
      const newVirtualGroup = {
        id: newGroupId,
        title: name,
        color: selectedColor,
        note: note,
        categoryId: parseInt(categoryId),
        isVirtual: true
      };
      
      virtualGroups.push(newVirtualGroup);
      await chrome.storage.local.set({ virtualGroups });
      
      alert('分组已创建');
    }
    
    document.getElementById('groupModal').classList.remove('show');
    document.getElementById('groupName').value = '';
    document.getElementById('groupNote').value = '';
    document.getElementById('selectedGroupId').value = '';
    document.getElementById('selectedCategoryId').value = '';
    await loadTabs();
  } catch (error) {
    console.error('保存分组失败:', error);
    alert('保存分组失败: ' + error.message);
  }
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
    selectedTabIds.delete(tabId);
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

async function closeDuplicates() {
  const urlCount = {};
  const duplicates = [];
  let invalidUrlCount = 0;
  
  allTabs.forEach(tab => {
    try {
      const url = new URL(tab.url);
      const key = url.origin + url.pathname;
      
      if (urlCount[key]) {
        duplicates.push(tab.id);
      } else {
        urlCount[key] = true;
      }
    } catch (e) {
      invalidUrlCount++;
      console.warn('Invalid URL:', tab.url);
    }
  });
  
  if (invalidUrlCount > 0) {
    console.log(`Skipped ${invalidUrlCount} tabs with invalid URLs`);
  }
  
  if (duplicates.length === 0) {
    alert('没有发现重复的标签页');
    return;
  }
  
  if (confirm(`发现 ${duplicates.length} 个重复的标签页，是否关闭？`)) {
    try {
      await chrome.tabs.remove(duplicates);
      await loadTabs();
    } catch (error) {
      showError('关闭重复标签页失败', error);
    }
  }
}

function showSaveCollectionModal() {
  document.getElementById('collectionName').value = '';
  document.getElementById('collectionModal').classList.add('show');
}

async function saveCollection() {
  const name = document.getElementById('collectionName').value.trim();
  
  if (!name) {
    alert('请输入集合名称');
    return;
  }
  
  const collection = {
    id: generateId(),
    name: name,
    tabs: allTabs.map(tab => ({
      title: tab.title,
      url: tab.url,
      favicon: tab.favIconUrl
    })),
    createdAt: new Date().toISOString()
  };
  
  try {
    const collections = await getCollections();
    collections.push(collection);
    await chrome.storage.local.set({ collections });
    
    document.getElementById('collectionModal').classList.remove('show');
    alert('集合保存成功');
  } catch (error) {
    showError('保存集合失败', error);
  }
}

function showLoadCollectionModal() {
  renderCollections();
  document.getElementById('loadModal').classList.add('show');
}

async function renderCollections() {
  const collections = await getCollections();
  const collectionList = document.getElementById('collectionList');
  
  if (collections.length === 0) {
    collectionList.innerHTML = '<div class="empty-state">没有保存的集合</div>';
    return;
  }
  
  collectionList.innerHTML = collections.map(collection => `
    <div class="collection-item" data-collection-id="${collection.id}">
      <div class="collection-name">${escapeHtml(collection.name)}</div>
      <div class="collection-info">${collection.tabs.length} 个标签页</div>
      <div class="collection-actions">
        <button class="collection-load" data-id="${collection.id}">打开</button>
        <button class="collection-delete" data-id="${collection.id}">删除</button>
      </div>
    </div>
  `).join('');
  
  setupCollectionEventListeners();
}

function setupCollectionEventListeners() {
  document.querySelectorAll('.collection-load').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const collectionId = parseInt(btn.dataset.id);
      await loadCollection(collectionId);
    });
  });
  
  document.querySelectorAll('.collection-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const collectionId = parseInt(btn.dataset.id);
      await deleteCollection(collectionId);
      await renderCollections();
    });
  });
}

async function loadCollection(collectionId) {
  try {
    const collections = await getCollections();
    const collection = collections.find(c => c.id === collectionId);
    
    if (!collection) {
      alert('集合不存在');
      return;
    }
    
    for (const tab of collection.tabs) {
      await chrome.tabs.create({ url: tab.url });
    }
    
    document.getElementById('loadModal').classList.remove('show');
    await loadTabs();
  } catch (error) {
    showError('加载集合失败', error);
  }
}

async function deleteCollection(collectionId) {
  if (!confirm('确定要删除这个集合吗？')) return;
  
  try {
    const collections = await getCollections();
    const filtered = collections.filter(c => c.id !== collectionId);
    await chrome.storage.local.set({ collections: filtered });
  } catch (error) {
    showError('删除集合失败', error);
  }
}

async function getCollections() {
  const result = await chrome.storage.local.get('collections');
  return result.collections || [];
}

async function showStatistics() {
  const statsContent = document.getElementById('statsContent');
  
  const domainStats = {};
  let invalidUrlCount = 0;
  
  allTabs.forEach(tab => {
    try {
      const domain = new URL(tab.url).hostname;
      domainStats[domain] = (domainStats[domain] || 0) + 1;
    } catch (e) {
      invalidUrlCount++;
    }
  });
  
  const sortedDomains = Object.entries(domainStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const ungroupedTabs = allTabs.filter(tab => tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE).length;
  
  // Use DocumentFragment for better performance
  const fragment = document.createDocumentFragment();
  
  // Create stat items
  const statItems = [
    { title: '总标签页数', value: allTabs.length },
    { title: '分组数', value: allGroups.length },
    { title: '分类数', value: allCategories.length },
    { title: '未分组标签页', value: ungroupedTabs }
  ];
  
  statItems.forEach(({ title, value }) => {
    const div = document.createElement('div');
    div.className = 'stat-item';
    div.innerHTML = `
      <div class="stat-title">${title}</div>
      <div class="stat-value">${value}</div>
    `;
    fragment.appendChild(div);
  });
  
  // Add domain stats
  if (sortedDomains.length > 0) {
    const domainDiv = document.createElement('div');
    domainDiv.className = 'stat-item';
    const domainTitle = document.createElement('div');
    domainTitle.className = 'stat-title';
    domainTitle.textContent = '最常访问的域名';
    domainDiv.appendChild(domainTitle);
    
    sortedDomains.forEach(([domain, count]) => {
      const statValue = document.createElement('div');
      statValue.className = 'stat-value';
      statValue.textContent = `${domain}: ${count} 个标签页`;
      domainDiv.appendChild(statValue);
    });
    
    fragment.appendChild(domainDiv);
  }
  
  // Clear and append
  statsContent.innerHTML = '';
  statsContent.appendChild(fragment);
  
  document.getElementById('statsModal').classList.add('show');
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}
