class BundleBuilder {
  constructor() {
    this.selectedProducts = [];
    this.discountTiers = [];
    this.settings = this.getSettings();
    this.init();
  }

  getSettings() {
    const container = document.querySelector(
      ".page-width[data-progress-bar-color]",
    );
    if (!container) {
      return {
        progressBarColor: "#4caf50",
        successColor: "#4caf50",
        emptyHeadingColor: "#333333",
        emptySubtitleColor: "#666666",
        emptyHeadingText: "Your Bundle is Empty",
        emptySubtitleText: "Start adding products to build your custom bundle",
        addToCartBg: "#CC858F",
        addToCartText: "#FFFFFF",
        reviewBoxText: "Review Your Care Box",
        addBundleCartText: "Add Bundle to Cart",
      };
    }

    // Parse discount tiers from JSON
    let tiers = [];
    try {
      tiers = JSON.parse(container.dataset.discountTiers || "[]");
    } catch (e) {
      console.error("Error parsing discount tiers:", e);
    }

    // Sort tiers by minimum quantity
    tiers.sort((a, b) => a.minQuantity - b.minQuantity);

    return {
      progressBarColor: container.dataset.progressBarColor || "#4caf50",
      successColor: container.dataset.successColor || "#4caf50",
      emptyHeadingColor: container.dataset.emptyHeadingColor || "#333333",
      emptySubtitleColor: container.dataset.emptySubtitleColor || "#666666",
      emptyHeadingText:
        container.dataset.emptyHeadingText || "Your Bundle is Empty",
      emptySubtitleText:
        container.dataset.emptySubtitleText ||
        "Start adding products to build your custom bundle",
      addToCartBg: container.dataset.addToCartBg || "#CC858F",
      addToCartText: container.dataset.addToCartText || "#FFFFFF",
      reviewBoxText: container.dataset.reviewBoxText || "Review Your Care Box",
      addBundleCartText:
        container.dataset.addBundleCartText || "Add Bundle to Cart",
      discountTiers: tiers,
    };
  }

  init() {
    this.discountTiers = this.settings.discountTiers;
    this.setupProductListeners();
    this.setupQuickViewListeners(); 
    this.renderSummary();
    this.updateTierSteps(0);
  }

  updateTierSteps(totalItems) {
    const tierSteps = document.querySelectorAll(".tier-step");
    const connectors = document.querySelectorAll(".tier-step-connector");

    if (tierSteps.length === 0) return;

    // Reset all steps
    tierSteps.forEach((step) => {
      step.classList.remove("active", "completed", "in-progress");
    });

    connectors.forEach((connector) => {
      connector.classList.remove("active");
      connector.style.setProperty("--fill-width", "0%");
    });

    // Find current tier
    const currentTier = this.getCurrentTier(totalItems);

    // Mark steps and connectors based on progress
    tierSteps.forEach((step, index) => {
      const minQuantity = parseInt(step.dataset.minQuantity) || 0;

      // Step 0 (Start) - always completed if we have any products
      if (minQuantity === 0) {
        if (totalItems > 0) {
          step.classList.add("completed");
        } else {
          step.classList.add("active");
        }
      }
      // Steps that are completed (tier reached)
      else if (totalItems >= minQuantity) {
        step.classList.add("completed");
        // Mark the highest completed tier as active
        if (currentTier && minQuantity === currentTier.minQuantity) {
          step.classList.add("active");
        }
      }
      // Steps in progress (between current and next tier)
      else if (totalItems > 0) {
        // Check if this is the next tier to reach
        const prevStepMinQuantity =
          index > 0
            ? parseInt(tierSteps[index - 1].dataset.minQuantity) || 0
            : 0;
        if (totalItems > prevStepMinQuantity && totalItems < minQuantity) {
          step.classList.add("in-progress");
        }
      }

      // Activate and set width for connectors with progressive fill
      if (index > 0 && connectors[index - 1]) {
        const currentStepMin = minQuantity;
        const prevStepMin =
          index > 0
            ? parseInt(tierSteps[index - 1].dataset.minQuantity) || 0
            : 0;

        // Connector is fully active if we've reached or passed this step
        if (totalItems >= currentStepMin && currentStepMin > 0) {
          connectors[index - 1].classList.add("active");
          connectors[index - 1].style.setProperty("--fill-width", "100%");
        }
        // Partial fill for connectors between steps
        else if (totalItems > prevStepMin) {
          const range = currentStepMin - prevStepMin;
          const progress = totalItems - prevStepMin;
          const percentage = Math.min((progress / range) * 100, 100);
          connectors[index - 1].style.setProperty(
            "--fill-width",
            `${percentage}%`,
          );
        }
      }
    });
  }

  setupProductListeners() {
    const productCards = document.querySelectorAll(".card-wrapper");

    productCards.forEach((card) => {
      const addButton = card.querySelector(".add-bundle");
      const quantitySelector = card.querySelector(".custom-quantity-selector");
      const quantityInput = card.querySelector(
        ".custom-quantity-selector input",
      );
      const minusBtn = card.querySelector(
        ".custom-quantity-selector button:first-child",
      );
      const plusBtn = card.querySelector(
        ".custom-quantity-selector button:last-child",
      );

      if (addButton) {
        addButton.addEventListener("click", (e) => {
          e.preventDefault();

          this.addProductToBundle(card, quantityInput.value);
          // Toggle visibility using classes
          addButton.classList.add("hidden");
          if (quantitySelector) {
            quantitySelector.classList.remove("hidden");
          }
        });
      }

      if (minusBtn) {
        minusBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const currentValue = parseInt(quantityInput.value) || 1;
          if (currentValue > 1) {
            quantityInput.value = currentValue - 1;
            this.updateProductQuantityFromCard(card, currentValue - 1);
          } else {
            // Remove from bundle and show add button again
            this.removeProductFromCard(card);
            addButton.classList.remove("hidden");
            quantitySelector.classList.add("hidden");
            quantityInput.value = 1;
          }
        });
      }

      if (plusBtn) {
        plusBtn.addEventListener("click", (e) => {
          e.preventDefault();
          const currentValue = parseInt(quantityInput.value) || 1;

          quantityInput.value = currentValue + 1;
          this.updateProductQuantityFromCard(card, currentValue + 1);
        });
      }

      // Handle manual input changes
      if (quantityInput) {
        quantityInput.addEventListener("change", (e) => {
          let newValue = parseInt(e.target.value) || 1;

          // Ensure minimum value is 1
          if (newValue < 1) {
            newValue = 1;
            e.target.value = 1;
          }

          // Check if product is already in bundle
          const variantId =
            card.querySelector(".add-bundle")?.dataset.variantId ||
            card.querySelector(".custom-quantity-selector")?.dataset.variantId;
          const existingProductIndex = this.selectedProducts.findIndex(
            (p) => p.variantId === variantId,
          );

          if (existingProductIndex >= 0) {
            // Update existing product quantity
            this.updateProductQuantityFromCard(card, newValue);
          }
        });

        // Prevent typing non-numeric characters
        quantityInput.addEventListener("keypress", (e) => {
          if (!/[0-9]/.test(e.key) && e.key !== "Enter") {
            e.preventDefault();
          }
        });
      }
    });
  }

  addProductToBundle(card, quantity) {
    const productTitle = card
      .querySelector(".card__heading a")
      ?.textContent.trim();
    const productLink = card.querySelector(".card__heading a")?.href;
    const productImage = card.querySelector(".card__media img")?.src;
    const productPrice = card
      .querySelector(".price-item--regular")
      ?.textContent.trim();
    const variantId =
      card.querySelector(".add-bundle")?.dataset.variantId ||
      card.querySelector(".custom-quantity-selector")?.dataset.variantId;

    const existingProductIndex = this.selectedProducts.findIndex(
      (p) => p.variantId === variantId,
    );

    if (existingProductIndex >= 0) {
      // Update quantity if product already exists
      this.selectedProducts[existingProductIndex].quantity +=
        parseInt(quantity);
    } else {
      // Add new product
      this.selectedProducts.push({
        title: productTitle,
        link: productLink,
        image: productImage,
        price: productPrice,
        variantId: variantId,
        quantity: parseInt(quantity),
        card: card,
      });
    }

    this.renderSummary();
    this.showAddedFeedback(card);

    // Update tier steps immediately
    const totalItems = this.selectedProducts.reduce(
      (sum, p) => sum + p.quantity,
      0,
    );
    this.updateTierSteps(totalItems);
  }

  updateProductQuantityFromCard(card, newQuantity) {
    const variantId =
      card.querySelector(".add-bundle")?.dataset.variantId ||
      card.querySelector(".custom-quantity-selector")?.dataset.variantId;
    const existingProductIndex = this.selectedProducts.findIndex(
      (p) => p.variantId === variantId,
    );

    if (existingProductIndex >= 0) {
      this.selectedProducts[existingProductIndex].quantity = newQuantity;
      this.renderSummary();

      // Update tier steps immediately
      const totalItems = this.selectedProducts.reduce(
        (sum, p) => sum + p.quantity,
        0,
      );
      this.updateTierSteps(totalItems);
    }
  }

  removeProductFromCard(card) {
    const variantId =
      card.querySelector(".add-bundle")?.dataset.variantId ||
      card.querySelector(".custom-quantity-selector")?.dataset.variantId;
    const existingProductIndex = this.selectedProducts.findIndex(
      (p) => p.variantId === variantId,
    );

    if (existingProductIndex >= 0) {
      this.selectedProducts.splice(existingProductIndex, 1);
      this.renderSummary();

      // Update tier steps immediately
      const totalItems = this.selectedProducts.reduce(
        (sum, p) => sum + p.quantity,
        0,
      );
      this.updateTierSteps(totalItems);
    }
  }

  removeProductFromBundle(index) {
    const product = this.selectedProducts[index];
    if (product && product.card) {
      // Reset card state
      const addButton = product.card.querySelector(".add-bundle");
      const quantitySelector = product.card.querySelector(
        ".custom-quantity-selector",
      );
      const quantityInput = product.card.querySelector(
        ".custom-quantity-selector input",
      );

      if (addButton) addButton.classList.remove("hidden");
      if (quantitySelector) quantitySelector.classList.add("hidden");
      if (quantityInput) quantityInput.value = 1;
    }

    this.selectedProducts.splice(index, 1);
    this.renderSummary();

    // Update tier steps immediately
    const totalItems = this.selectedProducts.reduce(
      (sum, p) => sum + p.quantity,
      0,
    );
    this.updateTierSteps(totalItems);
  }

  removeAllProducts() {
    // Reset all product cards
    this.selectedProducts.forEach((product) => {
      if (product && product.card) {
        const addButton = product.card.querySelector(".add-bundle");
        const quantitySelector = product.card.querySelector(
          ".custom-quantity-selector",
        );
        const quantityInput = product.card.querySelector(
          ".custom-quantity-selector input",
        );

        if (addButton) addButton.classList.remove("hidden");
        if (quantitySelector) quantitySelector.classList.add("hidden");
        if (quantityInput) quantityInput.value = 1;
      }
    });

    // Clear all products
    this.selectedProducts = [];
    this.renderSummary();
    this.updateTierSteps(0);
  }

  updateProductQuantity(index, quantity) {
    if (quantity <= 0) {
      this.removeProductFromBundle(index);
    } else {
      this.selectedProducts[index].quantity = quantity;

      // Update card quantity input if card reference exists
      const product = this.selectedProducts[index];
      if (product && product.card) {
        const quantityInput = product.card.querySelector(
          ".custom-quantity-selector input",
        );
        if (quantityInput) {
          quantityInput.value = quantity;
        }
      }

      this.renderSummary();

      // Update tier steps immediately
      const totalItems = this.selectedProducts.reduce(
        (sum, p) => sum + p.quantity,
        0,
      );
      this.updateTierSteps(totalItems);
    }
  }

  generateTierProgressBars(totalItems) {
    if (this.discountTiers.length === 0) {
      return "";
    }

    // Create array with starting tier (0 items, no discount)
    const allTiers = [
      { minQuantity: 0, discountText: "No discount" },
      ...this.discountTiers,
    ];

    // Find current tier
    const currentTier = this.getCurrentTier(totalItems);

    // Get current discount text
    const currentDiscountText = currentTier
      ? currentTier.discountText
      : "No discount";

    // Find next tier
    console.log("totalItems:", allTiers);

    let hideMesage = true;
    // if we are at first tier and remaining item less than 5 then hide message
    let remainQuantity = allTiers[1].minQuantity - totalItems;

    if (remainQuantity <= 5) {
      hideMesage = false;
    }

    console.log("hideMesage:", hideMesage);
    
    const nextTier = this.getNextTier(totalItems);
    let addMoreText = '';
    
    if (!hideMesage) {
      addMoreText = this.getProgressMessage(totalItems);
    }

    // Generate progress bars for display (limit to 3 tiers max for UI)
    const progressBarsHTML = allTiers
      .slice(0, Math.min(3, allTiers.length))
      .map((tier, index) => {
        // Determine the end range
        let endRange;
        let displayRange;
        if (index === 2 || index === allTiers.length - 1) {
          // Last displayed tier shows "+"
          endRange = "+";
          displayRange = `${tier.minQuantity}+`;
        } else if (allTiers[index + 1]) {
          // Show one less than next tier's min
          endRange = allTiers[index + 1].minQuantity - 1;
          displayRange = `${tier.minQuantity} - ${endRange}`;
        } else {
          endRange = "+";
          displayRange = `${tier.minQuantity}+`;
        }

        const isCurrentTier =
          totalItems >= tier.minQuantity &&
          (index === allTiers.length - 1 ||
            totalItems < allTiers[index + 1]?.minQuantity);
        const isCompleted =
          index < allTiers.length - 1 &&
          totalItems >= allTiers[index + 1]?.minQuantity;

        // Calculate progress percentage
        let progressPercentage = 0;
        if (isCompleted) {
          progressPercentage = 100;
        } else if (isCurrentTier) {
          if (allTiers[index + 1]) {
            // There's a next tier - calculate progress towards it
            const range = allTiers[index + 1].minQuantity - tier.minQuantity;
            const progress = totalItems - tier.minQuantity;
            progressPercentage = Math.min((progress / range) * 100, 100);
          } else {
            // This is the highest tier and we're in it - 100%
            progressPercentage = 100;
          }
        }

        return `
        <div class="tier-bar-item ${isCurrentTier ? "active" : ""} ${isCompleted ? "completed" : ""}">
          <div class="tier-bar-header">
            <span class="tier-bar-range">${displayRange}</span>
          </div>
          <div class="tier-bar-wrapper">
            <div class="tier-bar-fill" style="width: ${progressPercentage}%; background-color: ${this.settings.progressBarColor}"></div>
          </div>
          <div class="tier-bar-footer">
            <span class="tier-bar-discount">${tier.discountText}</span>
          </div>
        </div>
      `;
      })
      .join("");

    return `
      <div class="compact-tier-progress">
        
        <div class="tier-bars-row">
          ${progressBarsHTML}
        </div>
        <div class="next-tier-status ${hideMesage ? "hidden" : "visible"}">
            ${addMoreText}
          </div>
      </div>
    `;
  }

  generateMobileTierBars(totalItems) {
    if (this.discountTiers.length === 0) {
      return "";
    }

    const allTiers = [
      { minQuantity: 0, discountText: "No discount" },
      ...this.discountTiers,
    ];

    const progressBarsHTML = allTiers
      .slice(0, Math.min(3, allTiers.length))
      .map((tier, index) => {
        let endRange;
        let displayRange;
        if (index === 2 || index === allTiers.length - 1) {
          endRange = "+";
          displayRange = `${tier.minQuantity}+`;
        } else if (allTiers[index + 1]) {
          endRange = allTiers[index + 1].minQuantity - 1;
          displayRange = `${tier.minQuantity}-${endRange}`;
        } else {
          endRange = "+";
          displayRange = `${tier.minQuantity}+`;
        }

        const isCurrentTier =
          totalItems >= tier.minQuantity &&
          (index === allTiers.length - 1 ||
            totalItems < allTiers[index + 1]?.minQuantity);
        const isCompleted =
          index < allTiers.length - 1 &&
          totalItems >= allTiers[index + 1]?.minQuantity;

        let progressPercentage = 0;
        if (isCompleted) {
          progressPercentage = 100;
        } else if (isCurrentTier) {
          if (allTiers[index + 1]) {
            // There's a next tier - calculate progress towards it
            const range = allTiers[index + 1].minQuantity - tier.minQuantity;
            const progress = totalItems - tier.minQuantity;
            progressPercentage = Math.min((progress / range) * 100, 100);
          } else {
            // This is the highest tier and we're in it - 100%
            progressPercentage = 100;
          }
        }

        return `
        <div class="mobile-tier-bar ${isCurrentTier ? "active" : ""} ${isCompleted ? "completed" : ""}">
          <span class="mobile-tier-range">${displayRange}</span>
          <div class="mobile-tier-bar-bg">
            <div class="mobile-tier-bar-fill" style="width: ${progressPercentage}%; background-color: ${this.settings.progressBarColor}"></div>
          </div>
          <span class="mobile-tier-discount">${tier.discountText}</span>
        </div>
      `;
      })
      .join("");

    return `<div class="mobile-tier-bars-row">${progressBarsHTML}</div>`;
  }

  renderSummary() {
    const summaryContainer = document.querySelector(
      ".selected-product-summary",
    );
    const summaryWrapper = document.querySelector(
      ".selected-product-summary-wrapper",
    );
    if (!summaryContainer) return;

    const totalItems = this.selectedProducts.reduce(
      (sum, p) => sum + p.quantity,
      0,
    );
    const currentTier = this.getCurrentTier(totalItems);
    const nextTier = this.getNextTier(totalItems); // ADD THIS LINE - was missing!

    if (this.selectedProducts.length === 0) {
      if (summaryWrapper) {
        summaryWrapper.classList.add("summary-empty-state");
      }

      summaryContainer.innerHTML = `
        <div class="summary-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <h3 style="color: ${this.settings.emptyHeadingColor}">${this.settings.emptyHeadingText}</h3>
          <p style="color: ${this.settings.emptySubtitleColor}">${this.settings.emptySubtitleText}</p>
        </div>
      `;
      this.updateTierSteps(0);
      return;
    }

    if (summaryWrapper) {
      summaryWrapper.classList.remove("summary-empty-state");
    }

    // Generate tier progress bars HTML
    const tierProgressBarsHTML = this.generateTierProgressBars(totalItems);

    const productsHTML = this.selectedProducts
      .map(
        (product, index) => `
      <div class="summary-product-item" data-index="${index}">
        <div class="summary-product-image">
          <img src="${product.image}" alt="${product.title}">
        </div>
        <div class="summary-product-details">
          <h4 class="summary-product-title">${product.title}</h4>
          <p class="summary-product-price">${product.price}</p>
          <div class="summary-quantity-controls" data-index="${index}">
            <button class="summary-qty-btn minus" data-index="${index}">−</button>
            <input type="number" class="summary-qty-value" value="${product.quantity}" min="1" data-index="${index}">
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
    `,
      )
      .join("");

    const compactProductsHTML = this.selectedProducts
      .map(
        (product, index) => `
      <div class="summary-compact-product" data-index="${index}">
        <img src="${product.image}" alt="${product.title}">
        <button class="compact-remove-btn" data-index="${index}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        ${product.quantity > 1 ? `<span class="compact-quantity-badge">${product.quantity}</span>` : ""}
      </div>
    `,
      )
      .join("");

    summaryContainer.innerHTML = `
      <!-- Mobile Compact View -->
      <div class="summary-mobile-compact">
        <!-- Mobile Progress Section -->
        <div class="mobile-tier-progress">
          <div class="mobile-tier-status-row">
            <div class="mobile-current-status">
              <span class="mobile-status-label">Current:</span>
              <span class="mobile-status-value">${currentTier ? currentTier.discountText : "No discount"}</span>
            </div>
            <div class="mobile-next-status">
              ${nextTier ? `Add ${nextTier.minQuantity - totalItems} more for ${nextTier.discountText}` : "🎉 Max discount!"}
            </div>
          </div>
          ${this.generateMobileTierBars(totalItems)}
        </div>
        
        <div class="compact-header">
          <div class="compact-info-section">
            <div class="compact-selection-count">
              <span class="compact-count">${totalItems} item${totalItems !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button class="mobile-expand-toggle" aria-label="Expand bundle summary">
            <span class="expand-count">${totalItems}</span>
            <svg class="expand-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
        </div>

        <div class="compact-products-section">
          <div class="compact-products-header">
            <span class="compact-products-label">Selected Items (${totalItems})</span>
            <button class="mobile-remove-all-btn" aria-label="Remove all items">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Remove All
            </button>
          </div>
          <div class="compact-products-row">
            ${compactProductsHTML}
          </div>
        </div>

        <div class="mobile-review-section">
          <button class="mobile-review-btn" style="background-color: ${this.settings.addToCartBg}; color: ${this.settings.addToCartText}">
            ${this.settings.reviewBoxText}
          </button>
        </div>
      </div>
      
      <!-- Full Desktop/Expanded View -->
      <div class="summary-full-content">
        <button class="mobile-close-btn" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        
        <!-- Multi-Tier Progress Bars Section -->
        ${tierProgressBarsHTML}
        
        <!-- Your Bundle Header -->
        <div class="summary-header">
          <h3>Your Bundle</h3>
          <div class="summary-header-actions">
            <span class="summary-item-count">${totalItems} item${totalItems !== 1 ? "s" : ""}</span>
            <button class="remove-all-btn" aria-label="Remove all items">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Remove All
            </button>
          </div>
        </div>
        
        <div class="summary-products-list">
          ${productsHTML}
        </div>
        
        <div class="summary-footer">
          <button class="summary-add-to-cart-btn" style="background-color: ${this.settings.addToCartBg}; color: ${this.settings.addToCartText}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            ${this.settings.addBundleCartText}
          </button>
        </div>
      </div>
    `;

    this.attachSummaryListeners();
    this.setupMobileExpand();
    this.updateTierSteps(totalItems);
  }

  attachSummaryListeners() {
    // Remove buttons
    document.querySelectorAll(".summary-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index);
        this.removeProductFromBundle(index);
      });
    });

    // Compact view remove buttons
    document.querySelectorAll(".compact-remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        this.removeProductFromBundle(index);
      });
    });

    // Remove all buttons
    const removeAllBtns = document.querySelectorAll(
      ".remove-all-btn, .mobile-remove-all-btn",
    );
    removeAllBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (
          confirm("Are you sure you want to remove all items from your bundle?")
        ) {
          this.removeAllProducts();
        }
      });
    });

    // Quantity buttons
    document.querySelectorAll(".summary-qty-btn.minus").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index);
        this.updateProductQuantity(
          index,
          this.selectedProducts[index].quantity - 1,
        );
      });
    });

    document.querySelectorAll(".summary-qty-btn.plus").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index);

        this.updateProductQuantity(
          index,
          this.selectedProducts[index].quantity + 1,
        );
      });
    });

    // Handle manual input changes in summary
    document.querySelectorAll(".summary-qty-value").forEach((input) => {
      // Check if it's actually an input element (not a span)
      if (input.tagName === "INPUT") {
        input.addEventListener("change", (e) => {
          const index = parseInt(
            e.target.closest(".summary-quantity-controls").dataset.index ||
              e.target.dataset.index,
          );
          let newValue = parseInt(e.target.value) || 1;

          // Ensure minimum value is 1
          if (newValue < 1) {
            newValue = 1;
            e.target.value = 1;
          }

          this.updateProductQuantity(index, newValue);
        });

        // Prevent typing non-numeric characters
        input.addEventListener("keypress", (e) => {
          if (!/[0-9]/.test(e.key) && e.key !== "Enter") {
            e.preventDefault();
          }
        });
      }
    });

    // Add to cart button
    const addToCartBtn = document.querySelector(".summary-add-to-cart-btn");
    if (addToCartBtn) {
      addToCartBtn.addEventListener("click", () => {
        this.addBundleToCart();
      });
    }
  }

  setupMobileExpand() {
    const reviewBtn = document.querySelector(".mobile-review-btn");
    const expandToggle = document.querySelector(".mobile-expand-toggle");
    const closeBtn = document.querySelector(".mobile-close-btn");
    const summaryContainer = document.querySelector(
      ".selected-product-summary",
    );

    // Toggle expand/collapse with header button
    if (expandToggle && summaryContainer) {
      expandToggle.addEventListener("click", () => {
        summaryContainer.classList.toggle("expanded");
      });
    }

    // Review button also expands
    if (reviewBtn && summaryContainer) {
      reviewBtn.addEventListener("click", () => {
        summaryContainer.classList.add("expanded");
      });
    }

    // Close button collapses
    if (closeBtn && summaryContainer) {
      closeBtn.addEventListener("click", () => {
        summaryContainer.classList.remove("expanded");
      });
    }
  }

  getCurrentTier(quantity) {
    if (this.discountTiers.length === 0) return null;

    // Find the highest tier the quantity qualifies for
    let currentTier = null;
    for (let tier of this.discountTiers) {
      if (quantity >= tier.minQuantity) {
        currentTier = tier;
      }
    }
    return currentTier;
  }



  getNextTier(quantity) {
    if (this.discountTiers.length === 0) return null;

    // Find the next tier above current quantity
    for (let tier of this.discountTiers) {
      if (quantity < tier.minQuantity) {
        return tier;
      }
    }
    return null; // Already at highest tier
  }

getProgressMessage(quantity) {
    const currentTier = this.getCurrentTier(quantity);
    const nextTier = this.getNextTier(quantity);

    if (currentTier && nextTier) {
      // ✅ MIDDLE TIER — unlocked one, more to go
      const remaining = nextTier.minQuantity - quantity;
      return `
        <span class="tier-message tier-message--middle">
          <span class="tier-message__unlocked">
            🎉 <strong>${currentTier.discountText}</strong> unlocked!
          </span>
          <span class="tier-message__divider">·</span>
          <span class="tier-message__nudge">
            🔥 Add <strong>${remaining}</strong> more for <strong>${nextTier.discountText}</strong>
          </span>
        </span>`;

    } else if (nextTier) {
      // First tier — not unlocked yet
      const remaining = nextTier.minQuantity - quantity;
      return `<span class="next-tier-status first"> 🔥 Add ${remaining} more for ${nextTier.discountText}</span>`;

    } else if (currentTier) {
      // ✅ HIGHEST TIER — max discount achieved
      return `
        <span class="tier-message tier-message--max">
          <span class="tier-message__crown">👑</span>
          <span class="tier-message__max-text">
            Max discount! You're getting <strong>${currentTier.discountText}</strong>
          </span>
        </span>`;

    } else {
      if (this.discountTiers.length > 0) {
        const firstTier = this.discountTiers[0];
        const remaining = firstTier.minQuantity - quantity;
        return `<span class="next-tier-status first"> 🔥 Add ${remaining} more for ${firstTier.discountText}</span>`;
      }
      return "<span>Build your bundle</span>";
    }
  }

  showAddedFeedback(card) {
    const button = card.querySelector(".add-bundle");
    const originalText = button.textContent;

    button.textContent = "✓ Added";
    button.style.backgroundColor = this.settings.successColor;

    setTimeout(() => {
      button.textContent = originalText;
      button.style.backgroundColor = "";
    }, 1500);
  }

  async addBundleToCart() {
    const addToCartBtn = document.querySelector(".summary-add-to-cart-btn");
    if (!addToCartBtn) return;

    if (this.selectedProducts.length === 0) {
      alert("Please add products to your bundle first");
      return;
    }

    const originalContent = addToCartBtn.innerHTML;
    addToCartBtn.innerHTML = `
      <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
      </svg>
      Adding...
    `;
    addToCartBtn.disabled = true;

    // Disable all add buttons and quantity controls
    this.disableAllControls();

    try {
      // Prepare cart items for Shopify Cart API
      const items = this.selectedProducts.map((product) => ({
        id: product.variantId,
        quantity: product.quantity,
      }));

      // Add items to cart using Shopify Cart API
      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        throw new Error("Failed to add items to cart");
      }

      const result = await response.json();
      console.log("Bundle added to cart:", result);

      addToCartBtn.innerHTML = "✓ Added to Cart!";
      addToCartBtn.style.backgroundColor = this.settings.successColor;

      // Redirect to cart page after a short delay
      setTimeout(() => {
        window.location.href = "/cart";
      }, 800);
    } catch (error) {
      console.error("Error adding bundle to cart:", error);
      addToCartBtn.innerHTML = "✗ Error - Try Again";
      addToCartBtn.style.backgroundColor = "#f44336";

      // Re-enable controls on error
      this.enableAllControls();

      setTimeout(() => {
        addToCartBtn.innerHTML = originalContent;
        addToCartBtn.style.backgroundColor = "";
        addToCartBtn.disabled = false;
      }, 2000);
    }
  }

  disableAllControls() {
    // Disable all add buttons
    document.querySelectorAll(".add-bundle").forEach((btn) => {
      btn.disabled = true;
      btn.classList.add("disabled");
    });

    // Disable all quantity selector buttons
    document
      .querySelectorAll(".custom-quantity-selector button")
      .forEach((btn) => {
        btn.disabled = true;
        btn.classList.add("disabled");
      });

    // Disable all summary quantity buttons
    document.querySelectorAll(".summary-qty-btn").forEach((btn) => {
      btn.disabled = true;
      btn.classList.add("disabled");
    });

    // Disable all remove buttons
    document
      .querySelectorAll(".summary-remove-btn, .compact-remove-btn")
      .forEach((btn) => {
        btn.disabled = true;
        btn.classList.add("disabled");
      });
  }

  enableAllControls() {
    // Enable all add buttons
    document.querySelectorAll(".add-bundle").forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove("disabled");
    });

    // Enable all quantity selector buttons
    document
      .querySelectorAll(".custom-quantity-selector button")
      .forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove("disabled");
      });

    // Enable all summary quantity buttons
    document.querySelectorAll(".summary-qty-btn").forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove("disabled");
    });

    // Enable all remove buttons
    document
      .querySelectorAll(".summary-remove-btn, .compact-remove-btn")
      .forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove("disabled");
      });
  }

  setupQuickViewListeners() {
    document.querySelectorAll(".quick-view-modal").forEach((modal) => {
      const addBtn = modal.querySelector(".quick-view-add-bundle");
      const qtySelector = modal.querySelector(".quick-view-quantity-selector");
      const qtyInput = modal.querySelector(".quick-view-quantity-selector input");
      const minusBtn = modal.querySelector(".quick-view-quantity-selector button:first-child");
      const plusBtn = modal.querySelector(".quick-view-quantity-selector button:last-child");

      if (!addBtn) return;

      const variantId = addBtn.dataset.variantId;

      // Find the corresponding card in the product grid
      const card = document.querySelector(
        `.card-wrapper [data-variant-id="${variantId}"].add-bundle`
      )?.closest(".card-wrapper");

      addBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!card) return;

        this.addProductToBundle(card, qtyInput?.value || 1);
        addBtn.classList.add("hidden");
        qtySelector?.classList.remove("hidden");

        // Sync the card
        const cardAddBtn = card.querySelector(".add-bundle");
        const cardQtySelector = card.querySelector(".custom-quantity-selector");
        const cardQtyInput = card.querySelector(".custom-quantity-selector input");
        cardAddBtn?.classList.add("hidden");
        cardQtySelector?.classList.remove("hidden");
        if (cardQtyInput && qtyInput) cardQtyInput.value = qtyInput.value;
      });

      minusBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        const current = parseInt(qtyInput?.value) || 1;
        if (current > 1) {
          if (qtyInput) qtyInput.value = current - 1;
          if (card) this.updateProductQuantityFromCard(card, current - 1);
          // Sync card input
          const cardQtyInput = card?.querySelector(".custom-quantity-selector input");
          if (cardQtyInput) cardQtyInput.value = current - 1;
        } else {
          // Remove from bundle
          if (card) this.removeProductFromCard(card);
          addBtn.classList.remove("hidden");
          qtySelector?.classList.add("hidden");
          if (qtyInput) qtyInput.value = 1;
          // Sync card
          const cardAddBtn = card?.querySelector(".add-bundle");
          const cardQtySelector = card?.querySelector(".custom-quantity-selector");
          const cardQtyInput = card?.querySelector(".custom-quantity-selector input");
          cardAddBtn?.classList.remove("hidden");
          cardQtySelector?.classList.add("hidden");
          if (cardQtyInput) cardQtyInput.value = 1;
        }
      });

      plusBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        const current = parseInt(qtyInput?.value) || 1;
        if (qtyInput) qtyInput.value = current + 1;
        if (card) this.updateProductQuantityFromCard(card, current + 1);
        // Sync card input
        const cardQtyInput = card?.querySelector(".custom-quantity-selector input");
        if (cardQtyInput) cardQtyInput.value = current + 1;
      });

      qtyInput?.addEventListener("change", (e) => {
        let val = parseInt(e.target.value) || 1;
        if (val < 1) { val = 1; e.target.value = 1; }
        if (card) this.updateProductQuantityFromCard(card, val);
        const cardQtyInput = card?.querySelector(".custom-quantity-selector input");
        if (cardQtyInput) cardQtyInput.value = val;
      });
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window._bundleBuilder = new BundleBuilder(); // ← store globally
    initQuickViewModals();
  });
} else {
  window._bundleBuilder = new BundleBuilder(); // ← store globally
  initQuickViewModals();
}

// Quick View Modal Functionality
function initQuickViewModals() {
  // Handle quick view overlay clicks
  document.querySelectorAll(".quick-view-overlay").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const modalId = btn.dataset.modal;
      const modal = document.querySelector(modalId);
      if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
        syncModalWithCard(modal);
      }
    });
  });

  // Handle modal close buttons
  document.querySelectorAll(".quick-view-modal__close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".quick-view-modal");
      if (modal) {
        modal.style.display = "none";
        document.body.style.overflow = "";
      }
    });
  });

  // Handle modal overlay clicks
  document.querySelectorAll(".quick-view-modal__overlay").forEach((overlay) => {
    overlay.addEventListener("click", () => {
      const modal = overlay.closest(".quick-view-modal");
      if (modal) {
        modal.style.display = "none";
        document.body.style.overflow = "";
      }
    });
  });

  // Handle ESC key to close modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const openModal = document.querySelector(
        '.quick-view-modal[style*="display: flex"]',
      );
      if (openModal) {
        openModal.style.display = "none";
        document.body.style.overflow = "";
      }
    }
  });
}


function syncModalWithCard(modal) {
  const variantId = modal.querySelector(".quick-view-add-bundle")?.dataset.variantId;
  if (!variantId || !window._bundleBuilder) return;

  const builder = window._bundleBuilder;
  const product = builder.selectedProducts.find(p => p.variantId === variantId);

  const addBtn = modal.querySelector(".quick-view-add-bundle");
  const qtySelector = modal.querySelector(".quick-view-quantity-selector");
  const qtyInput = modal.querySelector(".quick-view-quantity-selector input");

  if (product) {
    addBtn?.classList.add("hidden");
    qtySelector?.classList.remove("hidden");
    if (qtyInput) qtyInput.value = product.quantity;
  } else {
    addBtn?.classList.remove("hidden");
    qtySelector?.classList.add("hidden");
    if (qtyInput) qtyInput.value = 1;
  }
}


