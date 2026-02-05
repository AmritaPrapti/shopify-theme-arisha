class BundleBuilder {
  constructor() {
    this.selectedProducts = [];
    this.currentTab = 0;
    this.productLimit = 14;
    this.discountText = '10% off';
    this.init();
  }

  init() {
    this.setupTabListeners();
    this.setupProductListeners();
    this.renderSummary();
  }

  setupTabListeners() {
    const tabs = document.querySelectorAll('.bundle-tab');
    const productContainers = document.querySelectorAll('.bundle-products');

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        // Remove active class from all tabs and product containers
        tabs.forEach(t => t.classList.remove('active'));
        productContainers.forEach(p => p.classList.remove('active'));

        // Add active class to clicked tab and corresponding products
        tab.classList.add('active');
        if (productContainers[index]) {
          productContainers[index].classList.add('active');
        }

        this.currentTab = index;
        this.productLimit = parseInt(tab.dataset.productLimit) || 14;
        this.discountText = tab.dataset.discountText || '10% off';
        this.renderSummary();
      });
    });
  }

  setupProductListeners() {
    const productCards = document.querySelectorAll('.card-wrapper');

    productCards.forEach(card => {
      const addButton = card.querySelector('.add-bundle');
      const quantitySelector = card.querySelector('.custom-quantity-selector');
      const quantityInput = card.querySelector('.custom-quantity-selector input');
      const minusBtn = card.querySelector('.custom-quantity-selector button:first-child');
      const plusBtn = card.querySelector('.custom-quantity-selector button:last-child');

      if (addButton) {
        addButton.addEventListener('click', (e) => {
          e.preventDefault();
          
          // Check if bundle limit is reached
          const currentTotal = this.selectedProducts.reduce((sum, p) => sum + p.quantity, 0);
          const quantityToAdd = parseInt(quantityInput.value) || 1;
          
          if (currentTotal + quantityToAdd > this.productLimit) {
            this.showLimitReachedMessage();
            return;
          }
          
          this.addProductToBundle(card, quantityInput.value);
          // Toggle visibility using classes
          addButton.classList.add('hidden');
          if (quantitySelector) {
            quantitySelector.classList.remove('hidden');
          }
          
          // Check if limit reached after adding
          this.updateAddButtonStates();
        });
      }

      if (minusBtn) {
        minusBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const currentValue = parseInt(quantityInput.value) || 1;
          if (currentValue > 1) {
            quantityInput.value = currentValue - 1;
            this.updateProductQuantityFromCard(card, currentValue - 1);
            this.updateAddButtonStates();
          } else {
            // Remove from bundle and show add button again
            this.removeProductFromCard(card);
            addButton.classList.remove('hidden');
            quantitySelector.classList.add('hidden');
            quantityInput.value = 1;
            this.updateAddButtonStates();
          }
        });
      }

      if (plusBtn) {
        plusBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const currentValue = parseInt(quantityInput.value) || 1;
          const currentTotal = this.selectedProducts.reduce((sum, p) => sum + p.quantity, 0);
          
          if (currentTotal >= this.productLimit) {
            this.showLimitReachedMessage();
            return;
          }
          
          quantityInput.value = currentValue + 1;
          this.updateProductQuantityFromCard(card, currentValue + 1);
          this.updateAddButtonStates();
        });
      }
    });
  }

  addProductToBundle(card, quantity) {
    const productTitle = card.querySelector('.card__heading a')?.textContent.trim();
    const productLink = card.querySelector('.card__heading a')?.href;
    const productImage = card.querySelector('.card__media img')?.src;
    const productPrice = card.querySelector('.price-item--regular')?.textContent.trim();

    const existingProductIndex = this.selectedProducts.findIndex(
      p => p.title === productTitle
    );

    if (existingProductIndex >= 0) {
      // Update quantity if product already exists
      this.selectedProducts[existingProductIndex].quantity += parseInt(quantity);
    } else {
      // Add new product
      this.selectedProducts.push({
        title: productTitle,
        link: productLink,
        image: productImage,
        price: productPrice,
        quantity: parseInt(quantity),
        card: card
      });
    }

    this.renderSummary();
    this.showAddedFeedback(card);
  }

  updateProductQuantityFromCard(card, newQuantity) {
    const productTitle = card.querySelector('.card__heading a')?.textContent.trim();
    const existingProductIndex = this.selectedProducts.findIndex(
      p => p.title === productTitle
    );

    if (existingProductIndex >= 0) {
      this.selectedProducts[existingProductIndex].quantity = newQuantity;
      this.renderSummary();
    }
  }

  removeProductFromCard(card) {
    const productTitle = card.querySelector('.card__heading a')?.textContent.trim();
    const existingProductIndex = this.selectedProducts.findIndex(
      p => p.title === productTitle
    );

    if (existingProductIndex >= 0) {
      this.selectedProducts.splice(existingProductIndex, 1);
      this.renderSummary();
    }
  }

  removeProductFromBundle(index) {
    const product = this.selectedProducts[index];
    if (product && product.card) {
      // Reset card state
      const addButton = product.card.querySelector('.add-bundle');
      const quantitySelector = product.card.querySelector('.custom-quantity-selector');
      const quantityInput = product.card.querySelector('.custom-quantity-selector input');
      
      if (addButton) addButton.classList.remove('hidden');
      if (quantitySelector) quantitySelector.classList.add('hidden');
      if (quantityInput) quantityInput.value = 1;
    }
    
    this.selectedProducts.splice(index, 1);
    this.renderSummary();
    this.updateAddButtonStates();
  }

  updateProductQuantity(index, quantity) {
    if (quantity <= 0) {
      this.removeProductFromBundle(index);
    } else {
      this.selectedProducts[index].quantity = quantity;
      
      // Update card quantity input if card reference exists
      const product = this.selectedProducts[index];
      if (product && product.card) {
        const quantityInput = product.card.querySelector('.custom-quantity-selector input');
        if (quantityInput) {
          quantityInput.value = quantity;
        }
      }
      
      this.renderSummary();
    }
  }

  renderSummary() {
    const summaryContainer = document.querySelector('.selected-product-summary');
    const summaryWrapper = document.querySelector('.selected-product-summary-wrapper');
    if (!summaryContainer) return;

    // Get current tab's product limit
    const activeTab = document.querySelector('.bundle-tab.active');
    if (activeTab) {
      this.productLimit = parseInt(activeTab.dataset.productLimit) || 14;
      this.discountText = activeTab.dataset.discountText || '10% off';
    }

    const totalItems = this.selectedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const progressPercentage = Math.min((totalItems / this.productLimit) * 100, 100);
    const itemsRemaining = Math.max(this.productLimit - totalItems, 0);
    const isComplete = totalItems >= this.productLimit;

    if (this.selectedProducts.length === 0) {
      // Add empty class to wrapper for mobile hiding
      if (summaryWrapper) {
        summaryWrapper.classList.add('summary-empty-state');
      }
      
      summaryContainer.innerHTML = `
        <div class="summary-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <h3>Your Bundle is Empty</h3>
          <p>Start adding products to build your custom bundle</p>
          <div class="bundle-progress-info">
            <p>Add ${this.productLimit} products to get ${this.discountText}</p>
          </div>
        </div>
      `;
      return;
    }
    
    // Remove empty class when products are added
    if (summaryWrapper) {
      summaryWrapper.classList.remove('summary-empty-state');
    }
    
    const productsHTML = this.selectedProducts.map((product, index) => `
      <div class="summary-product-item" data-index="${index}">
        <div class="summary-product-image">
          <img src="${product.image}" alt="${product.title}">
        </div>
        <div class="summary-product-details">
          <h4 class="summary-product-title">${product.title}</h4>
          <p class="summary-product-price">${product.price}</p>
          <div class="summary-quantity-controls">
            <button class="summary-qty-btn minus" data-index="${index}">−</button>
            <span class="summary-qty-value">${product.quantity}</span>
            <button class="summary-qty-btn plus" data-index="${index}">+</button>
          </div>
        </div>
        <button class="summary-remove-btn" data-index="${index}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `).join('');

    // Compact mobile view with just images
    const compactProductsHTML = this.selectedProducts.map((product, index) => `
      <div class="summary-compact-product" data-index="${index}">
        <img src="${product.image}" alt="${product.title}">
        <button class="compact-remove-btn" data-index="${index}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        ${product.quantity > 1 ? `<span class="compact-quantity-badge">${product.quantity}</span>` : ''}
      </div>
    `).join('');

    summaryContainer.innerHTML = `
      <!-- Mobile Compact View -->
      <div class="summary-mobile-compact">
        <div class="compact-header">
          <div class="compact-products-row">
            ${compactProductsHTML}
          </div>
          <button class="mobile-expand-btn" aria-label="Expand bundle summary">
            <span class="expand-count">${totalItems}</span>
            <svg class="expand-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Full Desktop/Expanded View -->
      <div class="summary-full-content">
        <div class="summary-header">
          <h3>Your Bundle</h3>
          <span class="summary-item-count">${totalItems} item${totalItems !== 1 ? 's' : ''}</span>
        </div>
        <div class="bundle-progress-container">
          <div class="progress-text">
            <span class="progress-label">${isComplete ? '🎉 Bundle Complete!' : `${itemsRemaining} more to get ${this.discountText}`}</span>
            <span class="progress-count">${totalItems} / ${this.productLimit}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill ${isComplete ? 'complete' : ''}" style="width: ${progressPercentage}%"></div>
          </div>
        </div>
        <div class="summary-products-list">
          ${productsHTML}
        </div>
        <div class="summary-footer">
          <button class="summary-add-to-cart-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            Add Bundle to Cart
          </button>
        </div>
      </div>
    `;

    this.attachSummaryListeners();
    this.setupMobileExpand();
  }

  attachSummaryListeners() {
    // Remove buttons
    document.querySelectorAll('.summary-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        this.removeProductFromBundle(index);
      });
    });

    // Compact view remove buttons
    document.querySelectorAll('.compact-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        this.removeProductFromBundle(index);
      });
    });

    // Quantity buttons
    document.querySelectorAll('.summary-qty-btn.minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        this.updateProductQuantity(index, this.selectedProducts[index].quantity - 1);
        this.updateAddButtonStates();
      });
    });

    document.querySelectorAll('.summary-qty-btn.plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const currentTotal = this.selectedProducts.reduce((sum, p) => sum + p.quantity, 0);
        
        if (currentTotal >= this.productLimit) {
          this.showLimitReachedMessage();
          return;
        }
        
        this.updateProductQuantity(index, this.selectedProducts[index].quantity + 1);
        this.updateAddButtonStates();
      });
    });

    // Add to cart button
    const addToCartBtn = document.querySelector('.summary-add-to-cart-btn');
    if (addToCartBtn) {
      addToCartBtn.addEventListener('click', () => {
        this.addBundleToCart();
      });
    }
  }

  setupMobileExpand() {
    const expandBtn = document.querySelector('.mobile-expand-btn');
    const summaryContainer = document.querySelector('.selected-product-summary');
    
    if (expandBtn && summaryContainer) {
      expandBtn.addEventListener('click', () => {
        summaryContainer.classList.toggle('expanded');
      });
    }
  }

  showAddedFeedback(card) {
    const button = card.querySelector('.add-bundle');
    const originalText = button.textContent;
    
    button.textContent = '✓ Added';
    button.style.backgroundColor = '#4caf50';
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.backgroundColor = '';
    }, 1500);
  }

  updateAddButtonStates() {
    const currentTotal = this.selectedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const limitReached = currentTotal >= this.productLimit;
    
    // Get all add buttons that are not hidden (not already added)
    const addButtons = document.querySelectorAll('.add-bundle:not(.hidden)');
    
    addButtons.forEach(button => {
      if (limitReached) {
        button.disabled = true;
        button.classList.add('disabled');
        button.title = `Bundle limit of ${this.productLimit} products reached`;
      } else {
        button.disabled = false;
        button.classList.remove('disabled');
        button.title = '';
      }
    });
    
    // Also update quantity plus buttons
    const plusButtons = document.querySelectorAll('.custom-quantity-selector:not(.hidden) button:last-child');
    plusButtons.forEach(button => {
      if (limitReached) {
        button.disabled = true;
        button.classList.add('disabled');
      } else {
        button.disabled = false;
        button.classList.remove('disabled');
      }
    });
  }

  showLimitReachedMessage() {
    const summaryContainer = document.querySelector('.selected-product-summary');
    if (!summaryContainer) return;
    
    // Create temporary message
    const existingMessage = document.querySelector('.limit-reached-message');
    if (existingMessage) existingMessage.remove();
    
    const message = document.createElement('div');
    message.className = 'limit-reached-message';
    message.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>Bundle limit of ${this.productLimit} products reached!</span>
    `;
    
    const progressContainer = summaryContainer.querySelector('.bundle-progress-container');
    if (progressContainer) {
      progressContainer.insertAdjacentElement('afterend', message);
      
      setTimeout(() => {
        message.style.opacity = '0';
        setTimeout(() => message.remove(), 300);
      }, 3000);
    }
  }

  async addBundleToCart() {
    const addToCartBtn = document.querySelector('.summary-add-to-cart-btn');
    if (!addToCartBtn) return;

    const originalContent = addToCartBtn.innerHTML;
    addToCartBtn.innerHTML = `
      <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      Adding...
    `;
    addToCartBtn.disabled = true;

    try {
      // Here you would implement the actual cart addition logic
      // This is a placeholder for Shopify cart API integration
      console.log('Adding bundle to cart:', this.selectedProducts);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      addToCartBtn.innerHTML = '✓ Added to Cart!';
      addToCartBtn.style.backgroundColor = '#4caf50';
      
      setTimeout(() => {
        addToCartBtn.innerHTML = originalContent;
        addToCartBtn.style.backgroundColor = '';
        addToCartBtn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error('Error adding bundle to cart:', error);
      addToCartBtn.innerHTML = originalContent;
      addToCartBtn.disabled = false;
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new BundleBuilder();
  });
} else {
  new BundleBuilder();
}
