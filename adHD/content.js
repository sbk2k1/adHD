class TextSumBubble {
  constructor() {
    this.bubble = null;
    this.currentSelection = null;
    this.highlightedElements = [];
    this.isLoading = false;
    this.settings = { minLength: 50, theme: 'dark', provider: 'groq', enabled: true };
    this.isProcessing = false;
    this.selectedRange = null;
    this.selectionSnapshot = null; // Store selection info before it's lost

    this.loadSettings().then(() => {
      this.createUI();
      this.setupListeners();
    });
  }

  async loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get(['minLength', 'theme', 'provider', 'enabled'], (result) => {
          this.settings = {
            minLength: result.minLength || 50,
            theme: result.theme || 'dark',
            provider: result.provider || 'groq',
            enabled: result.enabled !== false
          };
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  createUI() {
    if (this.bubble) {
      this.bubble.remove();
    }

    this.bubble = document.createElement('div');
    this.bubble.className = 'textsum-bubble';
    this.bubble.innerHTML = `
      <div class="textsum-header">
        <div class="textsum-drag-handle">⋮⋮</div>
        <div class="textsum-spinner"></div>
        <span class="textsum-title">Processing...</span>
        <div class="textsum-provider">${this.settings.provider.toUpperCase()}</div>
        <button class="textsum-close">×</button>
      </div>
      <div class="textsum-content">
        <div class="textsum-bullets"></div>
      </div>
    `;

    // Append to body with error handling
    if (document.body) {
      document.body.appendChild(this.bubble);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(this.bubble);
      });
    }

    this.injectStyles();
    this.setupDragAndDrop();
    this.setupBubbleListeners();
  }

  setupBubbleListeners() {
    if (!this.bubble) return;

    // Prevent selection clearing when interacting with popup
    this.bubble.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });

    this.bubble.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Close button handler
    this.bubble.addEventListener('click', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('textsum-close')) {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      }
    });
  }


  setupDragAndDrop() {
    let isDragging = false;
    let startX, startY, initialX, initialY;

    const dragHandle = this.bubble.querySelector('.textsum-drag-handle');

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.bubble.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      this.bubble.style.cursor = 'grabbing';
      this.bubble.classList.add('dragging');
      dragHandle.style.cursor = 'grabbing';

      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newX = initialX + deltaX;
      let newY = initialY + deltaY;

      newX = Math.max(0, Math.min(window.innerWidth - this.bubble.offsetWidth, newX));
      newY = Math.max(0, Math.min(window.innerHeight - this.bubble.offsetHeight, newY));

      this.bubble.style.left = `${newX}px`;
      this.bubble.style.top = `${newY}px`;

      e.preventDefault();
    });

    document.addEventListener('mouseup', (e) => {
      if (isDragging) {
        isDragging = false;
        this.bubble.style.cursor = 'default';
        this.bubble.classList.remove('dragging');
        dragHandle.style.cursor = 'grab';

        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  injectStyles() {
    const existingStyle = document.getElementById('textsum-styles');
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = 'textsum-styles';
    style.textContent = `
      .textsum-bubble {
        position: fixed;
        z-index: 999999;
        width: 320px;
        max-height: 350px;
        background: rgba(20, 20, 20, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        overflow: hidden;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #f5f5f5;
        pointer-events: none;
      }
      
      .textsum-bubble.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      
      .textsum-bubble.dragging {
        transition: none;
        user-select: none;
      }
      
      .textsum-header {
        padding: 16px 20px 12px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        position: relative;
      }
      
      .textsum-drag-handle {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.4);
        cursor: grab;
        user-select: none;
        line-height: 1;
        padding: 2px;
      }
      
      .textsum-drag-handle:hover {
        color: rgba(255, 255, 255, 0.7);
      }
      
      .textsum-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(0, 255, 170, 0.2);
        border-radius: 50%;
        border-top-color: #00ffaa;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      .textsum-title {
        font-size: 15px;
        font-weight: 600;
        color: #f5f5f5;
        letter-spacing: -0.02em;
        flex: 1;
      }
      
      .textsum-provider {
        font-size: 10px;
        font-weight: 600;
        color: rgba(0, 255, 170, 0.8);
        background: rgba(0, 255, 170, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }
      
      .textsum-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        transition: all 0.2s;
        line-height: 1;
      }
      
      .textsum-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }
      
      .textsum-content {
        padding: 16px 20px 20px;
        max-height: 280px;
        overflow-y: auto;
      }
      
      .textsum-bullets {
        font-size: 14px;
        line-height: 1.6;
      }
      
      .textsum-bullet {
        display: flex;
        align-items: flex-start;
        margin-bottom: 12px;
        animation: slideIn 0.3s ease forwards;
        opacity: 0;
        transform: translateX(-10px);
      }
      
      .textsum-bullet:nth-child(1) { animation-delay: 0.1s; }
      .textsum-bullet:nth-child(2) { animation-delay: 0.2s; }
      .textsum-bullet:nth-child(3) { animation-delay: 0.3s; }
      .textsum-bullet:nth-child(4) { animation-delay: 0.4s; }
      .textsum-bullet:nth-child(5) { animation-delay: 0.5s; }
      
      @keyframes slideIn {
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      .textsum-bullet::before {
        content: '';
        width: 6px;
        height: 6px;
        background: #00ffaa;
        border-radius: 50%;
        margin-right: 12px;
        margin-top: 7px;
        flex-shrink: 0;
      }
      
      .textsum-bullet-text {
        color: rgba(255, 255, 255, 0.9);
        font-weight: 400;
      }
      
      .textsum-highlight-original {
        background: linear-gradient(120deg, rgba(0, 255, 170, 0.4) 0%, rgba(0, 255, 170, 0.2) 100%) !important;
        border-radius: 3px !important;
        padding: 1px 2px !important;
        transition: all 0.3s ease !important;
        animation: highlightFade 0.8s ease-in-out !important;
        position: relative !important;
        display: inline !important;
        font-weight: bold !important;
        text-decoration: underline !important;
        text-decoration-color: rgba(0, 255, 170, 0.8) !important;
        text-underline-offset: 2px !important;
        box-shadow: 0 2px 4px rgba(0, 255, 170, 0.2) !important;
      }
      
      @keyframes highlightFade {
        0% { 
          background: rgba(0, 255, 170, 0.6) !important;
          transform: scale(1.02);
          box-shadow: 0 4px 8px rgba(0, 255, 170, 0.4) !important;
        }
        100% { 
          background: linear-gradient(120deg, rgba(0, 255, 170, 0.4) 0%, rgba(0, 255, 170, 0.2) 100%) !important;
          transform: scale(1);
          box-shadow: 0 2px 4px rgba(0, 255, 170, 0.2) !important;
        }
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  setupListeners() {




    // MAIN TRIGGER: Mouse up after selection
    document.addEventListener('mouseup', (e) => {
      // Don't process during our own operations or if clicking on popup
      if (this.isProcessing || (this.bubble && this.bubble.contains(e.target))) return;

      // Small delay to ensure selection is finalized
      setTimeout(() => {
        this.handleMouseUpSelection();
      }, 50);
    });

    // Handle selection changes more carefully
    document.addEventListener('selectionchange', () => {
      // Don't process during our own operations
      if (this.isProcessing) return;

      const selection = window.getSelection();
      const selectedText = selection ? selection.toString().trim() : '';

      // Only hide if selection is truly cleared AND popup is not visible
      if (selectedText.length === 0 &&
        (!this.bubble || !this.bubble.classList.contains('visible'))) {
        this.hide();
      }
    });

    // Hide on click outside popup (but preserve selection handling)
    document.addEventListener('click', (e) => {
      // Skip if clicking on our popup or highlighted text
      if (this.bubble && this.bubble.contains(e.target)) return;
      if (e.target.classList && e.target.classList.contains('textsum-highlight-original')) return;

      // Only hide if popup is visible and we're not in the middle of processing
      if (this.bubble && this.bubble.classList.contains('visible') && !this.isProcessing) {
        setTimeout(() => {
          if (!this.bubble.classList.contains('dragging')) {
            this.hide();
          }
        }, 100);
      }
    }, true);


    // Hide on scroll
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (!this.bubble || !this.bubble.classList.contains('dragging')) {
          this.hide();
        }
      }, 200);
    }, { passive: true });

    // Listen for settings changes
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.minLength) {
          this.settings.minLength = changes.minLength.newValue;
        }
        if (changes.theme) {
          this.settings.theme = changes.theme.newValue;
        }
        if (changes.provider) {
          this.settings.provider = changes.provider.newValue;
          const providerElement = this.bubble?.querySelector('.textsum-provider');
          if (providerElement) {
            providerElement.textContent = this.settings.provider.toUpperCase();
          }
        }
        if (changes.enabled) {
          this.settings.enabled = changes.enabled.newValue;
          // Hide popup if extension is disabled
          if (!this.settings.enabled) {
            this.hide();
          }
        }
      });
    }
  }

  handleMouseUpSelection() {

    if (!this.settings.enabled) {
      return;
    }

    try {
      const selection = window.getSelection();

      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const selectedText = selection.toString().trim();

      if (selectedText.length < this.settings.minLength) {
        return;
      }

      if (this.isLoading || selectedText === this.currentSelection) {
        return;
      }

      console.log('Processing selection:', selectedText.substring(0, 100) + '...');

      // Store selection information BEFORE we start processing
      this.selectedRange = selection.getRangeAt(0).cloneRange();
      this.currentSelection = selectedText;

      // Create a more comprehensive snapshot of the selection
      this.selectionSnapshot = {
        text: selectedText,
        range: this.selectedRange.cloneRange(),
        rect: this.selectedRange.getBoundingClientRect(),
        startContainer: this.selectedRange.startContainer,
        endContainer: this.selectedRange.endContainer,
        startOffset: this.selectedRange.startOffset,
        endOffset: this.selectedRange.endOffset
      };

      // Show loading popup immediately
      this.showLoading();

      // Start API request
      this.fetchSummary(selectedText);

    } catch (error) {
      console.warn('TextSum: Selection handling error:', error);
    }
  }

  async fetchSummary(text) {
    this.isLoading = true;
    this.isProcessing = true;

    try {
      console.log('Fetching summary from API...');
      const response = await fetch('<base-url>/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'some-kind-of-api-key'
        },
        body: JSON.stringify({
          text: text,
          provider: this.settings.provider
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Received API response:', data);
      this.showSummary(data);
    } catch (error) {
      console.error('TextSum API Error:', error);
      // Show mock data for testing when API fails
      this.showSummary({
        keyTakeaways: `• ${this.currentSelection.split(' ').slice(0, 8).join(' ')}\n• Mock highlight test\n• Another test point`,
        highlightedText: this.currentSelection.replace(/\b(virtualized|execution|paths|single-threading|multithreading|Hyper-Threading)\b/gi, '<mark>$1</mark>')
      });
    } finally {
      this.isLoading = false;
      // Keep isProcessing true until highlighting is complete
    }
  }

  positionBubble() {
    if (!this.bubble || !this.selectionSnapshot) return;

    try {
      let rect = this.selectionSnapshot.rect;

      // If rect is invalid, try to get a fresh one from the stored range
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        try {
          rect = this.selectionSnapshot.range.getBoundingClientRect();
        } catch (error) {
          console.warn('Could not get fresh rect, using default position');
          this.bubble.style.left = '50px';
          this.bubble.style.top = '50px';
          return;
        }
      }

      const bubbleWidth = 320;
      const bubbleHeight = 350;
      const margin = 16;

      let left = rect.left + (rect.width / 2) - (bubbleWidth / 2);
      let top = rect.bottom + margin;

      if (left < margin) left = margin;
      if (left + bubbleWidth > window.innerWidth - margin) {
        left = window.innerWidth - bubbleWidth - margin;
      }

      if (top + bubbleHeight > window.innerHeight - margin) {
        top = rect.top - bubbleHeight - margin;
      }

      if (top < margin) top = margin;

      this.bubble.style.left = `${Math.max(0, left)}px`;
      this.bubble.style.top = `${Math.max(0, top)}px`;
    } catch (error) {
      console.warn('TextSum: Positioning error:', error);
      this.bubble.style.left = '50px';
      this.bubble.style.top = '50px';
    }
  }

  showLoading() {
    if (!this.bubble) return;

    this.positionBubble();
    this.bubble.classList.add('visible');

    const title = this.bubble.querySelector('.textsum-title');
    const spinner = this.bubble.querySelector('.textsum-spinner');
    const bullets = this.bubble.querySelector('.textsum-bullets');
    const provider = this.bubble.querySelector('.textsum-provider');

    if (title) title.textContent = 'Analyzing text...';
    if (spinner) spinner.style.display = 'block';
    if (bullets) bullets.innerHTML = '';
    if (provider) provider.textContent = this.settings.provider.toUpperCase();
  }

  showSummary(data) {
    if (!this.bubble || !data) return;

    try {
      console.log('Displaying summary with data:', data);

      // Process bullets
      const rawBullets = data.keyTakeaways || '';
      const bullets = rawBullets
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(point => point.replace(/^[•\-\*]\s*/, '').trim())
        .filter(point => point.length > 0);

      const bulletsContainer = this.bubble.querySelector('.textsum-bullets');
      if (bulletsContainer) {
        bulletsContainer.innerHTML = bullets
          .map(bullet => `
            <div class="textsum-bullet">
              <span class="textsum-bullet-text">${this.escapeHtml(bullet)}</span>
            </div>
          `).join('');
      }

      const title = this.bubble.querySelector('.textsum-title');
      const spinner = this.bubble.querySelector('.textsum-spinner');

      if (title) title.textContent = 'Key Takeaways';
      if (spinner) spinner.style.display = 'none';

      // Make sure the popup is visible
      this.positionBubble();
      this.bubble.classList.add('visible');

      // Apply highlighting with delay to ensure popup is fully rendered
      setTimeout(() => {
        if (data.highlightedText) {
          console.log('Applying highlighting...');
          this.highlightOriginalText(data.highlightedText);
        }
        // Only set isProcessing to false after highlighting is complete
        this.isProcessing = false;
      }, 300);

    } catch (error) {
      console.error('TextSum: Display error:', error);
      this.isProcessing = false;
      this.hide();
    }
  }

  highlightOriginalText(highlightedHtml) {
    try {
      console.log('Starting highlight process...');
      this.clearHighlights();

      if (!this.selectionSnapshot || !this.selectionSnapshot.text) {
        console.warn('No selection snapshot available for highlighting');
        return;
      }

      // Extract phrases from <mark> tags in the API response
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = highlightedHtml;
      const markedElements = tempDiv.querySelectorAll('mark');
      let phrasesToHighlight = Array.from(markedElements).map(el => el.textContent.trim());

      console.log('Phrases to highlight:', phrasesToHighlight);

      if (phrasesToHighlight.length === 0) {
        console.warn('No phrases found for highlighting');
        return;
      }

      // Filter phrases that actually exist in our selected text
      const selectedTextLower = this.selectionSnapshot.text.toLowerCase();
      phrasesToHighlight = phrasesToHighlight.filter(phrase =>
        phrase.length >= 2 && selectedTextLower.includes(phrase.toLowerCase())
      );

      if (phrasesToHighlight.length === 0) {
        console.warn('No valid phrases found after filtering');
        return;
      }

      // Apply highlighting using our improved method
      let highlightCount = 0;
      phrasesToHighlight.forEach(phrase => {
        const count = this.highlightPhraseInDocument(phrase);
        highlightCount += count;
        console.log(`Highlighted "${phrase}": ${count} occurrences`);
      });

      console.log(`Total highlights applied: ${highlightCount}`);

    } catch (error) {
      console.warn('TextSum: Highlighting error:', error);
    }
  }

  highlightPhraseInDocument(phrase) {
    try {
      if (!phrase || phrase.length < 2) return 0;

      console.log(`Highlighting phrase: "${phrase}"`);

      // Find all text nodes in the document that might contain our phrase
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            // Skip nodes that are inside our popup
            if (this.isNodeInBubble(node)) {
              return NodeFilter.FILTER_REJECT;
            }
            // Only consider nodes that contain the phrase
            if (node.textContent && node.textContent.toLowerCase().includes(phrase.toLowerCase())) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
          }
        },
        false
      );

      const textNodes = [];
      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node);
      }

      console.log(`Found ${textNodes.length} candidate text nodes for "${phrase}"`);

      let highlightCount = 0;

      // Process nodes in reverse order to avoid DOM modification issues
      for (let i = textNodes.length - 1; i >= 0; i--) {
        const textNode = textNodes[i];

        if (!textNode || !textNode.parentNode || !textNode.textContent) continue;

        const text = textNode.textContent;
        const lowerText = text.toLowerCase();
        const lowerPhrase = phrase.toLowerCase();

        // Use word boundary regex for better matching
        const regex = new RegExp(`\\b${this.escapeRegex(phrase)}\\b`, 'gi');

        if (regex.test(text)) {
          try {
            // Reset regex
            regex.lastIndex = 0;

            // Replace with highlighted version
            const highlightedText = text.replace(regex, (match) => {
              return `<span class="textsum-highlight-original" data-textsum-highlight="true">${match}</span>`;
            });

            if (highlightedText !== text) {
              // Create a temporary container
              const tempContainer = document.createElement('div');
              tempContainer.innerHTML = highlightedText;

              // Replace the text node with the new elements
              const fragment = document.createDocumentFragment();
              while (tempContainer.firstChild) {
                const child = tempContainer.firstChild;
                fragment.appendChild(child);

                // Track highlight elements
                if (child.nodeType === Node.ELEMENT_NODE &&
                  child.getAttribute('data-textsum-highlight') === 'true') {
                  this.highlightedElements.push(child);
                }
              }

              textNode.parentNode.replaceChild(fragment, textNode);
              highlightCount++;
            }
          } catch (error) {
            console.warn(`Failed to highlight phrase "${phrase}" in node:`, error);
          }
        }
      }

      return highlightCount;

    } catch (error) {
      console.warn(`Error highlighting phrase "${phrase}":`, error);
      return 0;
    }
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  isNodeInBubble(node) {
    let current = node;
    while (current && current !== document.body) {
      if (current === this.bubble ||
        (current.classList && current.classList.contains('textsum-bubble'))) {
        return true;
      }
      current = current.parentNode;
    }
    return false;
  }

  clearHighlights() {
    console.log('Clearing existing highlights');

    // Clear by data attribute first
    const existingHighlights = document.querySelectorAll('[data-textsum-highlight="true"]');
    console.log(`Found ${existingHighlights.length} highlights to clear`);

    existingHighlights.forEach(element => {
      try {
        if (element && element.parentNode) {
          const textNode = document.createTextNode(element.textContent);
          element.parentNode.replaceChild(textNode, element);
          // Normalize the parent to merge adjacent text nodes
          if (element.parentNode && typeof element.parentNode.normalize === 'function') {
            element.parentNode.normalize();
          }
        }
      } catch (error) {
        console.warn('Failed to clear highlight:', error);
      }
    });

    // Clear tracked elements
    this.highlightedElements.forEach(element => {
      try {
        if (element && element.parentNode && element.parentNode.contains(element)) {
          const textNode = document.createTextNode(element.textContent);
          element.parentNode.replaceChild(textNode, element);
          if (element.parentNode && typeof element.parentNode.normalize === 'function') {
            element.parentNode.normalize();
          }
        }
      } catch (error) {
        console.warn('Failed to clear tracked highlight:', error);
      }
    });

    this.highlightedElements = [];
  }

  hide() {
    if (this.bubble) {
      this.bubble.classList.remove('visible');
    }
    this.clearHighlights();
    this.currentSelection = null;
    this.selectedRange = null;
    this.selectionSnapshot = null;
    this.isProcessing = false;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
function initTextSum() {
  try {
    new TextSumBubble();
  } catch (error) {
    console.warn('TextSum: Failed to initialize:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTextSum);
} else {
  setTimeout(initTextSum, 100);
}