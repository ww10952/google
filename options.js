document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadDataInfo();
  setupEventListeners();
});

async function loadSettings() {
  try {
    const settings = await getSettings();
    const bgSettings = await getBackgroundSettings();
    
    document.getElementById('useCustomNewTab').checked = settings.useCustomNewTab !== false;
    document.getElementById('autoActivate').checked = settings.autoActivate || false;
    document.getElementById('showBadge').checked = settings.showBadge !== false;
    document.getElementById('maxTabs').value = settings.maxTabs || 50;
    document.getElementById('autoGroup').checked = settings.autoGroup || false;
    document.getElementById('defaultGroupColor').value = settings.defaultGroupColor || 'blue';
    
    document.getElementById('backgroundType').value = bgSettings.type || 'seasonal';
    document.getElementById('seasonalSelect').value = bgSettings.season || 'auto';
    document.getElementById('customBgUrl').value = bgSettings.customUrl || '';
    
    updateBackgroundUI();
  } catch (error) {
    console.error('加载设置失败:', error);
    alert('加载设置失败，请刷新页面重试');
  }
}

async function saveCurrentSettings() {
  const maxTabsInput = document.getElementById('maxTabs').value;
  const maxTabs = parseInt(maxTabsInput);
  
  if (isNaN(maxTabs) || maxTabs < 10 || maxTabs > 100) {
    alert('最大标签页数必须是 10-100 之间的数字');
    return;
  }
  
  const settings = {
    useCustomNewTab: document.getElementById('useCustomNewTab').checked,
    autoActivate: document.getElementById('autoActivate').checked,
    showBadge: document.getElementById('showBadge').checked,
    maxTabs: maxTabs,
    autoGroup: document.getElementById('autoGroup').checked,
    defaultGroupColor: document.getElementById('defaultGroupColor').value
  };
  
  const backgroundSettings = {
    type: document.getElementById('backgroundType').value,
    season: document.getElementById('seasonalSelect').value,
    customUrl: document.getElementById('customBgUrl').value
  };
  
  try {
    await chrome.storage.local.set({ settings, backgroundSettings });
    alert('设置已保存');
    
    if (settings.useCustomNewTab) {
      alert('请重新加载扩展以使新标签页设置生效');
    }
    
    chrome.tabs.update({
      url: 'chrome://newtab/'
    });
  } catch (error) {
    console.error('保存设置失败:', error);
    alert('保存设置失败: ' + error.message);
  }
}

async function getBackgroundSettings() {
  const result = await chrome.storage.local.get('backgroundSettings');
  return result.backgroundSettings || {
    type: 'seasonal',
    season: 'auto',
    customUrl: ''
  };
}

function updateBackgroundUI() {
  try {
    const type = document.getElementById('backgroundType').value;
    const seasonalSetting = document.getElementById('seasonalSetting');
    const customBgSetting = document.getElementById('customBgSetting');
    
    if (type === 'seasonal') {
      seasonalSetting.style.display = 'flex';
      customBgSetting.style.display = 'none';
    } else {
      seasonalSetting.style.display = 'none';
      customBgSetting.style.display = 'flex';
    }
  } catch (error) {
    console.error('更新背景UI失败:', error);
  }
}

function previewBackground() {
  const type = document.getElementById('backgroundType').value;
  const body = document.body;
  const container = document.querySelector('.container');
  
  body.classList.remove('spring', 'summer', 'autumn', 'winter');
  body.style.backgroundImage = '';
  container.style.background = '';
  container.style.boxShadow = 'none';
  
  if (type === 'seasonal') {
    const season = document.getElementById('seasonalSelect').value;
    const currentSeason = season === 'auto' ? getCurrentSeason() : season;
    body.classList.add(currentSeason);
    container.style.background = 'rgba(255, 255, 255, 0.9)';
    container.style.backdropFilter = 'blur(10px)';
    alert(`预览${season === 'auto' ? '当前季节' : season}背景`);
  } else {
    const url = document.getElementById('customBgUrl').value;
    if (url) {
      body.style.backgroundImage = `url(${url})`;
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      container.style.background = 'rgba(255, 255, 255, 0.9)';
      container.style.backdropFilter = 'blur(10px)';
      alert('预览自定义背景');
    } else {
      alert('请先输入背景图片URL');
      return;
    }
  }
  
  setTimeout(() => {
    body.classList.remove('spring', 'summer', 'autumn', 'winter');
    body.style.backgroundImage = '';
    container.style.background = 'white';
    container.style.backdropFilter = '';
    container.style.boxShadow = '';
  }, 3000);
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function handleFileUpload(file) {
  if (!file) return;
  
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    alert('图片大小不能超过 5MB');
    return;
  }
  
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      document.getElementById('customBgUrl').value = e.target.result;
      alert('背景图片已加载');
    } catch (error) {
      console.error('加载图片失败:', error);
      alert('加载图片失败: ' + error.message);
    }
  };
  reader.onerror = () => {
    alert('读取图片文件失败');
  };
  reader.readAsDataURL(file);
}

async function resetSettings() {
  if (!confirm('确定要重置所有设置吗？')) return;
  
  try {
    await chrome.storage.local.remove('settings');
    await loadSettings();
    alert('设置已重置');
  } catch (error) {
    console.error('重置设置失败:', error);
    alert('重置设置失败: ' + error.message);
  }
}

async function getSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    return result.settings || {};
  } catch (error) {
    console.error('获取设置失败:', error);
    return {};
  }
}

async function loadDataInfo() {
  try {
    const result = await chrome.storage.local.get([
      'categories',
      'virtualGroups',
      'groupData',
      'tabGroupMapping',
      'storedTabs',
      'settings',
      'backgroundSettings'
    ]);
    
    const categories = result.categories || [];
    const virtualGroups = result.virtualGroups || [];
    const groupData = result.groupData || {};
    const tabGroupMapping = result.tabGroupMapping || {};
    const storedTabs = result.storedTabs || {};
    const settings = result.settings || {};
    const backgroundSettings = result.backgroundSettings || {};
    
    const categoryCount = categories.length;
    const virtualGroupCount = virtualGroups.length;
    const realGroupCount = Object.keys(groupData).length;
    const mappedTabCount = Object.keys(tabGroupMapping).length;
    const storedTabCount = Object.keys(storedTabs).length;
    const totalGroupCount = virtualGroupCount + realGroupCount;
    
    const allData = {
      categories,
      virtualGroups,
      groupData,
      tabGroupMapping,
      storedTabs,
      settings,
      backgroundSettings
    };
    const dataSize = JSON.stringify(allData).length;
    
    document.getElementById('dataInfo').innerHTML = `
      <div style="margin-bottom: 8px;">
        <strong>分类数量:</strong> ${categoryCount} 个
      </div>
      <div style="margin-bottom: 8px;">
        <strong>虚拟分组:</strong> ${virtualGroupCount} 个
      </div>
      <div style="margin-bottom: 8px;">
        <strong>真实分组:</strong> ${realGroupCount} 个
      </div>
      <div style="margin-bottom: 8px;">
        <strong>分组总数:</strong> ${totalGroupCount} 个
      </div>
      <div style="margin-bottom: 8px;">
        <strong>已保存标签页:</strong> ${mappedTabCount} 个
      </div>
      <div style="margin-bottom: 8px;">
        <strong>已关闭标签页:</strong> ${storedTabCount} 个
      </div>
      <div style="margin-bottom: 8px; color: #666; font-size: 12px;">
        数据大小:${(dataSize / 1024).toFixed(2)} KB (${dataSize.toLocaleString()} 字节)
      </div>
    `;
  } catch (error) {
    console.error('加载数据信息失败:', error);
    document.getElementById('dataInfo').innerHTML = '<div style="color: #c62828;">加载数据信息失败:' + error.message + '</div>';
  }
}

async function exportData() {
  try {
    const data = await chrome.storage.local.get();
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('导出数据失败:', error);
    alert('导出数据失败: ' + error.message);
  }
}

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data || typeof data !== 'object') {
        throw new Error('无效的数据格式');
      }
      
      if (!confirm('导入将覆盖现有数据，确定要继续吗？')) return;
      
      await chrome.storage.local.clear();
      await chrome.storage.local.set(data);
      
      alert('数据导入成功');
      await loadDataInfo();
      await loadSettings();
    } catch (error) {
      console.error('导入数据失败:', error);
      alert('导入数据失败: ' + error.message);
    }
  };
  
  input.click();
}

async function clearData() {
  if (!confirm('确定要清除所有数据吗？此操作不可恢复！')) return;
  
  if (!confirm('请再次确认:这将删除所有保存的集合和设置！')) return;
  
  try {
    await chrome.storage.local.clear();
    alert('数据已清除');
    await loadDataInfo();
    await loadSettings();
  } catch (error) {
    console.error('清除数据失败:', error);
    alert('清除数据失败: ' + error.message);
  }
}

function setupEventListeners() {
  try {
    document.getElementById('saveSettings').addEventListener('click', saveCurrentSettings);
    document.getElementById('resetSettings').addEventListener('click', resetSettings);
    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('importData').addEventListener('click', importData);
    document.getElementById('clearData').addEventListener('click', clearData);
    
    document.getElementById('backgroundType').addEventListener('change', updateBackgroundUI);
    document.getElementById('previewBackground').addEventListener('click', previewBackground);
    document.getElementById('selectBgFile').addEventListener('click', () => {
      document.getElementById('customBgFile').click();
    });
    document.getElementById('customBgFile').addEventListener('change', (e) => {
      handleFileUpload(e.target.files[0]);
    });
  } catch (error) {
    console.error('设置事件监听器失败:', error);
    alert('页面加载失败，请刷新页面重试');
  }
}
