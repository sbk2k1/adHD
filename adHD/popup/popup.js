document.addEventListener('DOMContentLoaded', function () {
  const openOptionsBtn = document.getElementById('openOptions');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const usageTip = document.getElementById('usageTip');
  const pingBtn = document.getElementById('pingBtn');
  const providerSelect = document.getElementById('providerSelect');
  const popupHeader = document.getElementById('popupHeader');
  const popupContainer = document.querySelector('.popup-container');
  const toggleBtn = document.getElementById('toggleBtn');

  // Dragging functionality
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  // Load settings and update UI
  loadSettingsAndUpdateUI();

  // Setup drag functionality
  popupHeader.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', stopDrag);
  toggleBtn.addEventListener('click', function () {
    toggleExtension();
  });


  async function toggleExtension() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.sync.get(['enabled'], resolve);
      });

      const newEnabledState = !(result.enabled !== false);

      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ enabled: newEnabledState }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      updateToggleButton(newEnabledState);
      console.log('Extension', newEnabledState ? 'enabled' : 'disabled');
    } catch (error) {
      console.error('Failed to toggle extension:', error);
    }
  }

  function updateToggleButton(enabled) {
    const toggleIcon = toggleBtn.querySelector('.toggle-icon');
    if (enabled) {
      toggleBtn.classList.remove('disabled');
      toggleIcon.textContent = '🟢';
      toggleBtn.title = 'Extension Enabled - Click to Disable';
    } else {
      toggleBtn.classList.add('disabled');
      toggleIcon.textContent = '🔴';
      toggleBtn.title = 'Extension Disabled - Click to Enable';
    }
  }


  function startDrag(e) {
    // Don't drag if clicking on interactive elements
    if (e.target.closest('.ping-btn') || e.target.closest('.logo')) {
      return;
    }

    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = popupContainer.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    popupContainer.classList.add('dragging');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  }

  function drag(e) {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    let newLeft = initialLeft + deltaX;
    let newTop = initialTop + deltaY;

    // Keep within viewport bounds
    const maxLeft = window.innerWidth - popupContainer.offsetWidth;
    const maxTop = window.innerHeight - popupContainer.offsetHeight;

    newLeft = Math.max(0, Math.min(maxLeft, newLeft));
    newTop = Math.max(0, Math.min(maxTop, newTop));

    popupContainer.style.position = 'fixed';
    popupContainer.style.left = `${newLeft}px`;
    popupContainer.style.top = `${newTop}px`;
    popupContainer.style.right = 'auto';
    popupContainer.style.bottom = 'auto';
  }

  function stopDrag() {
    if (isDragging) {
      isDragging = false;
      popupContainer.classList.remove('dragging');
      document.body.style.userSelect = '';
    }
  }

  // Provider selection
  providerSelect.addEventListener('change', async function () {
    const selectedProvider = this.value;
    try {
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ provider: selectedProvider }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      console.log('Provider updated to:', selectedProvider);
    } catch (error) {
      console.error('Failed to save provider:', error);
    }
  });

  // Open options page
  openOptionsBtn.addEventListener('click', function () {
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('options/options.html'));
      }
    } catch (error) {
      console.error('Failed to open options page:', error);
    }
  });

  // Ping API button
  pingBtn.addEventListener('click', function () {
    checkAPIStatus(true);
  });

  // Check API connection status
  checkAPIStatus();

  async function checkAPIStatus(isManualPing = false) {
    if (isManualPing) {
      pingBtn.classList.add('pinging');
      setStatus(null, 'Pinging...');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch('http://localhost:3000/api/health', {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setStatus(true, 'Active');

        // Update provider availability if we got provider info
        if (data.providers) {
          updateProviderOptions(data.providers);
        }
      } else {
        setStatus(false, 'API Error');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus(false, 'Timeout');
      } else {
        setStatus(false, 'Offline');
      }
    } finally {
      if (isManualPing) {
        pingBtn.classList.remove('pinging');
      }
    }
  }

  function updateProviderOptions(providers) {
    // Update provider select options based on availability
    const options = providerSelect.querySelectorAll('option');
    options.forEach(option => {
      const providerId = option.value;
      const isAvailable = providers[providerId];

      if (!isAvailable) {
        option.textContent += ' (Unavailable)';
        option.disabled = true;
      }
    });
  }

  function setStatus(isActive, text) {
    if (statusDot && statusText) {
      if (isActive === null) {
        // Pinging state
        statusDot.className = 'status-dot';
        statusDot.style.background = '#ffa500';
        statusDot.style.boxShadow = '0 0 8px rgba(255, 165, 0, 0.5)';
      } else if (isActive) {
        statusDot.className = 'status-dot active';
        statusDot.style.background = '';
        statusDot.style.boxShadow = '';
      } else {
        statusDot.className = 'status-dot';
        statusDot.style.background = '#ff6b6b';
        statusDot.style.boxShadow = '0 0 8px rgba(255, 107, 107, 0.5)';
      }

      statusText.textContent = text;
    }
  }

  async function loadSettingsAndUpdateUI() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.sync.get(['minLength', 'theme', 'provider', 'enabled'], resolve);
      });

      const minLength = result.minLength || 50;
      const theme = result.theme || 'dark';
      const provider = result.provider || 'groq';
      const enabled = result.enabled !== false; // Default to true

      updateToggleButton(enabled);

      // Update usage tip
      if (usageTip) {
        usageTip.textContent = `Select ${minLength}+ characters to summarize`;
      }

      // Apply theme
      document.body.setAttribute('data-theme', theme);

      // Set provider selection
      if (providerSelect) {
        providerSelect.value = provider;
      }

    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }


  // Add interactive feedback
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-2px)';
    });

    openOptionsBtn.addEventListener('mouseleave', function () {
      this.style.transform = 'translateY(0)';
    });

    openOptionsBtn.addEventListener('mousedown', function () {
      this.style.transform = 'translateY(0)';
    });

    openOptionsBtn.addEventListener('mouseup', function () {
      this.style.transform = 'translateY(-2px)';
    });
  }

  // Listen for settings changes to update UI
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {

      if (changes.enabled && toggleBtn) {
        updateToggleButton(changes.enabled.newValue);
      }

      if (changes.minLength && usageTip) {
        usageTip.textContent = `Select ${changes.minLength.newValue}+ characters to summarize`;
      }
      if (changes.theme) {
        document.body.setAttribute('data-theme', changes.theme.newValue);
      }
      if (changes.provider && providerSelect) {
        providerSelect.value = changes.provider.newValue;
      }
    });
  }

  // Auto-ping every 30 seconds
  setInterval(() => {
    checkAPIStatus();
  }, 30000);
});