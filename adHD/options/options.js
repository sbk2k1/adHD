document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('optionsForm');
  const statusMessage = document.getElementById('statusMessage');
  const minLengthInput = document.getElementById('minLength');
  const themeSelect = document.getElementById('theme');
  const providerSelect = document.getElementById('provider');
  const enabledSelect = document.getElementById('enabled');
  
  // Load saved settings
  loadSettings();
  
  async function loadSettings() {
    try {
      const settings = await new Promise((resolve) => {
        chrome.storage.sync.get(['minLength', 'theme', 'provider', 'enabled'], resolve);
      });
      
      minLengthInput.value = settings.minLength || 50;
      themeSelect.value = settings.theme || 'dark';
      providerSelect.value = settings.provider || 'groq';
      enabledSelect.value = (settings.enabled !== false).toString();
      
      // Apply theme immediately
      applyTheme(settings.theme || 'dark');
      
    } catch (error) {
      console.error('Failed to load settings:', error);
      showMessage('Failed to load settings', 'error');
    }
  }
  
  // Save settings
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
      minLength: parseInt(minLengthInput.value) || 50,
      theme: themeSelect.value,
      provider: providerSelect.value,
      enabled: enabledSelect.value === 'true'
    };
    
    // Validate minimum length
    if (settings.minLength < 10) {
      showMessage('Minimum length must be at least 10 characters', 'error');
      return;
    }
    
    if (settings.minLength > 500) {
      showMessage('Minimum length cannot exceed 500 characters', 'error');
      return;
    }
    
    try {
      // Save to Chrome storage
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set(settings, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      
      showMessage('Settings saved successfully! 🎉', 'success');
      
      // Apply theme immediately
      applyTheme(settings.theme);
      
      // Notify content scripts about settings change
      try {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'SETTINGS_UPDATED',
              settings: settings
            }).catch(() => {
              // Ignore errors if content script isn't loaded
            });
          }
        });
      } catch (error) {
        // Ignore messaging errors
      }
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      showMessage('Failed to save settings', 'error');
    }
  });
  
  function showMessage(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = `status-message ${type}`;
    
    // Hide message after 3 seconds
    setTimeout(() => {
      statusMessage.className = 'status-message';
    }, 3000);
  }
  
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
  }
  
  // Real-time validation for minimum length
  minLengthInput.addEventListener('input', () => {
    const value = parseInt(minLengthInput.value);
    if (isNaN(value) || value < 10 || value > 500) {
      minLengthInput.style.borderColor = '#ff6b6b';
      minLengthInput.style.boxShadow = '0 0 0 3px rgba(255, 107, 107, 0.2)';
    } else {
      minLengthInput.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      minLengthInput.style.boxShadow = 'none';
    }
  });
  
  // Theme preview
  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
  });
  
  // Provider change handler
  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    console.log('Provider changed to:', provider);
  });
  
  // Add visual feedback for form interactions
  const inputs = [minLengthInput, themeSelect, providerSelect, enabledSelect];
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      input.parentElement.style.transform = 'scale(1.02)';
    });
    
    input.addEventListener('blur', () => {
      input.parentElement.style.transform = 'scale(1)';
    });
  });
  
  // Save button animation
  const saveBtn = form.querySelector('.save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveBtn.style.transform = 'scale(0.98)';
      setTimeout(() => {
        saveBtn.style.transform = '';
      }, 100);
    });
  }
});