// Bundle-Variant Integration Script
(function() {
  'use strict';

  let defaultProductDescription = '';

  function init() {
    const bundleSelects = document.querySelector('bundle-selects');
    const variantSelects = document.querySelector('variant-selects');
    
    if (!bundleSelects) return;

    // Store the default product description
    const defaultDescScript = bundleSelects.querySelector('script[data-default-product-description]');
    if (defaultDescScript) {
      try {
        defaultProductDescription = JSON.parse(defaultDescScript.textContent);
      } catch (e) {
        console.error('Failed to parse default description:', e);
      }
    }

    // Get bundle variant IDs to hide
    const bundleVariantIds = getBundleVariantIds(bundleSelects);
    
    // Hide bundle variants from the default picker
    if (variantSelects && bundleVariantIds.length > 0) {
      hideBundleVariantsFromPicker(variantSelects, bundleVariantIds);
      setupVariantSelection(variantSelects, bundleSelects);
    }

    // Setup bundle selection
    setupBundleSelection(bundleSelects, variantSelects);
  }

  function getBundleVariantIds(bundleSelects) {
    const inputs = bundleSelects.querySelectorAll('input[data-bundle-variant-id]');
    return Array.from(inputs).map(input => input.dataset.bundleVariantId);
  }

  function hideBundleVariantsFromPicker(variantSelects, bundleVariantIds) {
    bundleVariantIds.forEach(variantId => {
      const input = variantSelects.querySelector(`input[data-option-value-id="${variantId}"]`);
      if (input) {
        const label = variantSelects.querySelector(`label[for="${input.id}"]`);
        if (input) input.style.display = 'none';
        if (label) label.style.display = 'none';
      }

      const option = variantSelects.querySelector(`option[data-option-value-id="${variantId}"]`);
      if (option) {
        option.style.display = 'none';
        option.disabled = true;
      }
    });

    variantSelects.querySelectorAll('fieldset').forEach(fieldset => {
      const visibleInputs = Array.from(fieldset.querySelectorAll('input')).filter(
        inp => inp.style.display !== 'none'
      );
      if (visibleInputs.length === 0) {
        fieldset.style.display = 'none';
      }
    });
  }

  function setupVariantSelection(variantSelects, bundleSelects) {
    const inputs = variantSelects.querySelectorAll('input[type="radio"]');
    const dropdowns = variantSelects.querySelectorAll('select');

    inputs.forEach(input => {
      input.addEventListener('change', () => {
        if (input.checked) {
          deselectAllBundles(bundleSelects);
          updateProductDescription(defaultProductDescription);
          
          // Make variant selects active
          variantSelects.classList.remove('is-deselected');
          variantSelects.classList.add('is-active');
        }
      });
    });

    dropdowns.forEach(select => {
      select.addEventListener('change', () => {
        deselectAllBundles(bundleSelects);
        updateProductDescription(defaultProductDescription);
        
        variantSelects.classList.remove('is-deselected');
        variantSelects.classList.add('is-active');
      });
    });
  }

  function deselectAllBundles(bundleSelects) {
    const inputs = bundleSelects.querySelectorAll('input[type="radio"]');
    inputs.forEach(input => {
      input.checked = false;
    });
    bundleSelects.classList.add('is-deselected');
    bundleSelects.classList.remove('is-active');
  }

  function deselectAllVariants(variantSelects) {
    if (!variantSelects) return;
    
    // Get all radio inputs and uncheck them
    const allInputs = variantSelects.querySelectorAll('input[type="radio"]');
    allInputs.forEach(input => {
      input.checked = false;
      
      // Also remove any active/selected classes from labels
      const label = variantSelects.querySelector(`label[for="${input.id}"]`);
      if (label) {
        label.classList.remove('active', 'selected');
      }
    });

    // Reset dropdowns
    const dropdowns = variantSelects.querySelectorAll('select');
    dropdowns.forEach(select => {
      select.querySelectorAll('option').forEach(option => {
        option.removeAttribute('selected');
      });
    });

    // Add deselected class for CSS styling override
    variantSelects.classList.add('is-deselected');
    variantSelects.classList.remove('is-active');
  }

  function setupBundleSelection(bundleSelects, variantSelects) {
    const inputs = bundleSelects.querySelectorAll('input[type="radio"]');
    const sectionId = bundleSelects.dataset.section;
    const bundleVariantsData = getBundleVariantsData(bundleSelects);
    
    inputs.forEach(input => {
      input.addEventListener('change', (event) => {
        event.stopPropagation();
        
        if (!event.target.checked) return;

        const variantId = event.target.dataset.bundleVariantId;
        const variantData = bundleVariantsData.find(v => String(v.id) === String(variantId));

        if (!variantData) {
          console.error('Bundle variant not found:', variantId);
          return;
        }

        // 1. Deselect variant picker options FIRST
        if (variantSelects) {
          deselectAllVariants(variantSelects);
        }

        // 2. Update the product form's variant input
        updateProductFormVariant(sectionId, variantId);

        // 3. Update the URL
        updateURL(variantId);

        // 4. Update price display
        updatePriceDisplay(sectionId, variantData);

        // 5. Update add to cart button
        updateAddToCartButton(sectionId, variantData);

        // 6. Update product description with bundle description
        const bundleDescription = event.target.dataset.bundleDescription;
        if (bundleDescription) {
          updateProductDescription(bundleDescription);
        }

        updateDefaultVariantPickerSelection();

        // 7. Update UI states
        bundleSelects.classList.add('is-active');
        bundleSelects.classList.remove('is-deselected');

        // 8. Publish variantChange event
        if (typeof publish !== 'undefined' && typeof PUB_SUB_EVENTS !== 'undefined') {
          publish(PUB_SUB_EVENTS.variantChange, {
            data: {
              sectionId: sectionId,
              variant: variantData,
            }
          });
        }

      }, true);
    });
  }

  function getBundleVariantsData(bundleSelects) {
    const dataScript = bundleSelects.querySelector('script[data-bundle-variants]');
    if (dataScript) {
      try {
        return JSON.parse(dataScript.textContent);
      } catch (e) {
        console.error('Failed to parse bundle variants:', e);
      }
    }
    return [];
  }

  function updateProductFormVariant(sectionId, variantId) {
    const productForms = document.querySelectorAll(
      `#product-form-${sectionId}, #product-form-installment-${sectionId}`
    );

    productForms.forEach(form => {
      const input = form.querySelector('input[name="id"]');
      if (input) {
        input.value = variantId;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  function updateURL(variantId) {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variantId);
    window.history.replaceState({}, '', url.toString());
  }

  function updatePriceDisplay(sectionId, variantData) {
    const priceContainer = document.querySelector(`#price-${sectionId}`);
    if (priceContainer && variantData.price) {
      const formattedPrice = formatMoney(variantData.price);
      const priceElement = priceContainer.querySelector('.price-item--regular');
      if (priceElement) {
        priceElement.textContent = formattedPrice;
      }
    }
  }

  function updateAddToCartButton(sectionId, variantData) {
    const productForm = document.querySelector(`product-form[data-section="${sectionId}"]`);
    if (!productForm) return;

    const submitButton = productForm.querySelector('[type="submit"]');
    if (!submitButton) return;

    const buttonText = submitButton.querySelector('span');
    
    if (variantData.available) {
      submitButton.disabled = false;
      if (buttonText) {
        buttonText.textContent = window.variantStrings?.addToCart || 'Add to cart';
      }
    } else {
      submitButton.disabled = true;
      if (buttonText) {
        buttonText.textContent = window.variantStrings?.soldOut || 'Sold out';
      }
    }
  }

  function updateProductDescription(description) {
    const descriptionEl = document.querySelector('[data-product-description]');
    
    if (!descriptionEl) return;

    let descriptionHTML = '';
    
    if (typeof description === 'string') {
      descriptionHTML = description;
    } else if (description && typeof description === 'object') {
      if (description.value) {
        descriptionHTML = description.value;
      } else if (description.html) {
        descriptionHTML = description.html;
      } else {
        descriptionHTML = JSON.stringify(description);
        console.warn('Description is an object, attempting to display:', description);
      }
    }

    if (descriptionHTML) {
      descriptionEl.innerHTML = descriptionHTML;
    } else {
      descriptionEl.innerHTML = defaultProductDescription;
    }
  }

  function updateDefaultVariantPickerSelection() {
    const variantSelects = document.querySelector('variant-selects');

    // Uncheck all radio inputs from variant selects
    if (!variantSelects) return;

    const allInputs = Array.from(variantSelects.querySelectorAll('input[type="radio"]'));

    allInputs.forEach(input => {
      input.checked = false;
      
      // Also remove any active/selected classes from labels
      const label = variantSelects.querySelector(`label[for="${input.id}"]`);
      if (label) {
        label.classList.remove('active', 'selected');
      }
    });

    // Add deselected class for CSS styling override
    variantSelects.classList.add('is-deselected');
    variantSelects.classList.remove('is-active');
  }

  function formatMoney(cents) {
    if (typeof Shopify !== 'undefined' && Shopify.formatMoney) {
      return Shopify.formatMoney(cents);
    }
    return '$' + (cents / 100).toFixed(2);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();