if (!customElements.get('product-info')) {
  customElements.define(
    'product-info',
    class ProductInfo extends HTMLElement {
      quantityInput = undefined;
      quantityForm = undefined;
      onVariantChangeUnsubscriber = undefined;
      cartUpdateUnsubscriber = undefined;
      abortController = undefined;
      pendingRequestUrl = null;
      preProcessHtmlCallbacks = [];
      postProcessHtmlCallbacks = [];

      constructor() {
        super();

        this.quantityInput = this.querySelector('.quantity__input');
        this._bundleInitialized = false;
        this._bundleObserver = null;
      }

      connectedCallback() {
        this.initializeProductSwapUtility();

        this.onVariantChangeUnsubscriber = subscribe(
          PUB_SUB_EVENTS.optionValueSelectionChange,
          this.handleOptionValueChange.bind(this)
        );

        this.initQuantityHandlers();
        this.initializeBundleIntegration();
        this.dispatchEvent(new CustomEvent('product-info:loaded', { bubbles: true }));
      }

      addPreProcessCallback(callback) {
        this.preProcessHtmlCallbacks.push(callback);
      }

      initQuantityHandlers() {
        if (!this.quantityInput) return;

        this.quantityForm = this.querySelector('.product-form__quantity');
        if (!this.quantityForm) return;

        this.setQuantityBoundries();
        if (!this.dataset.originalSection) {
          this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, this.fetchQuantityRules.bind(this));
        }
      }

      disconnectedCallback() {
        this.onVariantChangeUnsubscriber();
        this.cartUpdateUnsubscriber?.();
        this._bundleObserver?.disconnect();
      }

      initializeProductSwapUtility() {
        this.preProcessHtmlCallbacks.push((html) =>
          html.querySelectorAll('.scroll-trigger').forEach((element) => element.classList.add('scroll-trigger--cancel'))
        );
        this.postProcessHtmlCallbacks.push((newNode) => {
          window?.Shopify?.PaymentButton?.init();
          window?.ProductModel?.loadShopifyXR();
        });
      }

      handleOptionValueChange({ data: { event, target, selectedOptionValues } }) {
        if (!this.contains(event.target)) return;

        // if a variant option was chosen, ensure any bundle selection is cleared
        const globalBundle = this.getBundleSelects(this.sectionId);
        if (globalBundle) {
          this.deselectAllBundles(globalBundle);
          if (this._defaultProductDescription) this.updateProductDescription(this._defaultProductDescription);
        }

        // clear Gift Type property when regular variant is selected
        this.clearGiftTypeProperty(this.sectionId);

        this.resetProductFormState();

        const productUrl = target.dataset.productUrl || this.pendingRequestUrl || this.dataset.url;
        this.pendingRequestUrl = productUrl;
        const shouldSwapProduct = this.dataset.url !== productUrl;
        const shouldFetchFullPage = this.dataset.updateUrl === 'true' && shouldSwapProduct;

        this.renderProductInfo({
          requestUrl: this.buildRequestUrlWithParams(productUrl, selectedOptionValues, shouldFetchFullPage),
          targetId: target.id,
          callback: shouldSwapProduct
            ? this.handleSwapProduct(productUrl, shouldFetchFullPage)
            : this.handleUpdateProductInfo(productUrl),
        });
      }

      getBundleSelects(sectionId) {
        return (
          this.querySelector('bundle-selects') ||
          document.querySelector(`bundle-selects#bundle-selects-${sectionId}`) ||
          document.querySelector(`bundle-selects[data-section="${sectionId}"]`) ||
          document.querySelector('bundle-selects') ||
          null
        );
      }

      resetProductFormState() {
        const productForm = this.productForm;
        productForm?.toggleSubmitButton(true);
        productForm?.handleErrorMessage();
      }

      handleSwapProduct(productUrl, updateFullPage) {
        return (html) => {
          this.productModal?.remove();

          const selector = updateFullPage ? "product-info[id^='MainProduct']" : 'product-info';
          const variant = this.getSelectedVariant(html.querySelector(selector));
          this.updateURL(productUrl, variant?.id);

          if (updateFullPage) {
            document.querySelector('head title').innerHTML = html.querySelector('head title').innerHTML;

            HTMLUpdateUtility.viewTransition(
              document.querySelector('main'),
              html.querySelector('main'),
              this.preProcessHtmlCallbacks,
              this.postProcessHtmlCallbacks
            );
          } else {
            HTMLUpdateUtility.viewTransition(
              this,
              html.querySelector('product-info'),
              this.preProcessHtmlCallbacks,
              this.postProcessHtmlCallbacks
            );
          }
        };
      }

      renderProductInfo({ requestUrl, targetId, callback }) {
        this.abortController?.abort();
        this.abortController = new AbortController();

        fetch(requestUrl, { signal: this.abortController.signal })
          .then((response) => response.text())
          .then((responseText) => {
            this.pendingRequestUrl = null;
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            callback(html);
          })
          .then(() => {
            // set focus to last clicked option value
            document.querySelector(`#${targetId}`)?.focus();
          })
          .catch((error) => {
            if (error.name === 'AbortError') {
              console.log('Fetch aborted by user');
            } else {
              console.error(error);
            }
          });
      }

      getSelectedVariant(productInfoNode) {
        const selectedVariant = productInfoNode.querySelector('variant-selects [data-selected-variant]')?.innerHTML;
        return !!selectedVariant ? JSON.parse(selectedVariant) : null;
      }

      buildRequestUrlWithParams(url, optionValues, shouldFetchFullPage = false) {
        const params = [];

        !shouldFetchFullPage && params.push(`section_id=${this.sectionId}`);

        if (optionValues.length) {
          params.push(`option_values=${optionValues.join(',')}`);
        }

        return `${url}?${params.join('&')}`;
      }

      updateOptionValues(html) {
        const variantSelects = html.querySelector('variant-selects');
        if (variantSelects) {
          HTMLUpdateUtility.viewTransition(this.variantSelectors, variantSelects, this.preProcessHtmlCallbacks);
        }
      }

      handleUpdateProductInfo(productUrl) {
        return (html) => {
          const variant = this.getSelectedVariant(html);

          this.pickupAvailability?.update(variant);
          this.updateOptionValues(html);
          this.updateURL(productUrl, variant?.id);
          this.updateVariantInputs(variant?.id);

          if (!variant) {
            this.setUnavailable();
            return;
          }

          this.updateMedia(html, variant?.featured_media?.id);
          // Update product description from fetched HTML (bundle descriptions are rendered server-side)
          const sourceDescription = html.querySelector('[data-product-description]');
          const destinationDescription = this.querySelector('[data-product-description]');
          if (sourceDescription && destinationDescription) {
            destinationDescription.innerHTML = sourceDescription.innerHTML;
          }

          const updateSourceFromDestination = (id, shouldHide = (source) => false) => {
            const source = html.getElementById(`${id}-${this.sectionId}`);
            const destination = this.querySelector(`#${id}-${this.dataset.section}`);
            if (source && destination) {
              destination.innerHTML = source.innerHTML;
              destination.classList.toggle('hidden', shouldHide(source));
            }
          };

          updateSourceFromDestination('price');
          updateSourceFromDestination('Sku', ({ classList }) => classList.contains('hidden'));
          updateSourceFromDestination('Inventory', ({ innerText }) => innerText === '');
          updateSourceFromDestination('Volume');
          updateSourceFromDestination('Price-Per-Item', ({ classList }) => classList.contains('hidden'));

          this.updateQuantityRules(this.sectionId, html);
          this.querySelector(`#Quantity-Rules-${this.dataset.section}`)?.classList.remove('hidden');
          this.querySelector(`#Volume-Note-${this.dataset.section}`)?.classList.remove('hidden');

          this.productForm?.toggleSubmitButton(
            html.getElementById(`ProductSubmitButton-${this.sectionId}`)?.hasAttribute('disabled') ?? true,
            window.variantStrings.soldOut
          );

          publish(PUB_SUB_EVENTS.variantChange, {
            data: {
              sectionId: this.sectionId,
              html,
              variant,
            },
          });
        };
      }

      updateVariantInputs(variantId) {
        this.querySelectorAll(
          `#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}`
        ).forEach((productForm) => {
          const input = productForm.querySelector('input[name="id"]');
          input.value = variantId ?? '';
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      updateURL(url, variantId) {
        this.querySelector('share-button')?.updateUrl(
          `${window.shopUrl}${url}${variantId ? `?variant=${variantId}` : ''}`
        );

        if (this.dataset.updateUrl === 'false') return;
        window.history.replaceState({}, '', `${url}${variantId ? `?variant=${variantId}` : ''}`);
      }

      setUnavailable() {
        this.productForm?.toggleSubmitButton(true, window.variantStrings.unavailable);

        const selectors = ['price', 'Inventory', 'Sku', 'Price-Per-Item', 'Volume-Note', 'Volume', 'Quantity-Rules']
          .map((id) => `#${id}-${this.dataset.section}`)
          .join(', ');
        document.querySelectorAll(selectors).forEach(({ classList }) => classList.add('hidden'));
      }

      updateMedia(html, variantFeaturedMediaId) {
        if (!variantFeaturedMediaId) return;

        const mediaGallerySource = this.querySelector('media-gallery ul');
        const mediaGalleryDestination = html.querySelector(`media-gallery ul`);

        const refreshSourceData = () => {
          if (this.hasAttribute('data-zoom-on-hover')) enableZoomOnHover(2);
          const mediaGallerySourceItems = Array.from(mediaGallerySource.querySelectorAll('li[data-media-id]'));
          const sourceSet = new Set(mediaGallerySourceItems.map((item) => item.dataset.mediaId));
          const sourceMap = new Map(
            mediaGallerySourceItems.map((item, index) => [item.dataset.mediaId, { item, index }])
          );
          return [mediaGallerySourceItems, sourceSet, sourceMap];
        };

        if (mediaGallerySource && mediaGalleryDestination) {
          let [mediaGallerySourceItems, sourceSet, sourceMap] = refreshSourceData();
          const mediaGalleryDestinationItems = Array.from(
            mediaGalleryDestination.querySelectorAll('li[data-media-id]')
          );
          const destinationSet = new Set(mediaGalleryDestinationItems.map(({ dataset }) => dataset.mediaId));
          let shouldRefresh = false;

          // add items from new data not present in DOM
          for (let i = mediaGalleryDestinationItems.length - 1; i >= 0; i--) {
            if (!sourceSet.has(mediaGalleryDestinationItems[i].dataset.mediaId)) {
              mediaGallerySource.prepend(mediaGalleryDestinationItems[i]);
              shouldRefresh = true;
            }
          }

          // remove items from DOM not present in new data
          for (let i = 0; i < mediaGallerySourceItems.length; i++) {
            if (!destinationSet.has(mediaGallerySourceItems[i].dataset.mediaId)) {
              mediaGallerySourceItems[i].remove();
              shouldRefresh = true;
            }
          }

          // refresh
          if (shouldRefresh) [mediaGallerySourceItems, sourceSet, sourceMap] = refreshSourceData();

          // if media galleries don't match, sort to match new data order
          mediaGalleryDestinationItems.forEach((destinationItem, destinationIndex) => {
            const sourceData = sourceMap.get(destinationItem.dataset.mediaId);

            if (sourceData && sourceData.index !== destinationIndex) {
              mediaGallerySource.insertBefore(
                sourceData.item,
                mediaGallerySource.querySelector(`li:nth-of-type(${destinationIndex + 1})`)
              );

              // refresh source now that it has been modified
              [mediaGallerySourceItems, sourceSet, sourceMap] = refreshSourceData();
            }
          });
        }

        // set featured media as active in the media gallery
        this.querySelector(`media-gallery`)?.setActiveMedia?.(
          `${this.dataset.section}-${variantFeaturedMediaId}`,
          true
        );

        // update media modal
        const modalContent = this.productModal?.querySelector(`.product-media-modal__content`);
        const newModalContent = html.querySelector(`product-modal .product-media-modal__content`);
        if (modalContent && newModalContent) modalContent.innerHTML = newModalContent.innerHTML;
      }

      setQuantityBoundries() {
        const data = {
          cartQuantity: this.quantityInput.dataset.cartQuantity ? parseInt(this.quantityInput.dataset.cartQuantity) : 0,
          min: this.quantityInput.dataset.min ? parseInt(this.quantityInput.dataset.min) : 1,
          max: this.quantityInput.dataset.max ? parseInt(this.quantityInput.dataset.max) : null,
          step: this.quantityInput.step ? parseInt(this.quantityInput.step) : 1,
        };

        let min = data.min;
        const max = data.max === null ? data.max : data.max - data.cartQuantity;
        if (max !== null) min = Math.min(min, max);
        if (data.cartQuantity >= data.min) min = Math.min(min, data.step);

        this.quantityInput.min = min;

        if (max) {
          this.quantityInput.max = max;
        } else {
          this.quantityInput.removeAttribute('max');
        }
        this.quantityInput.value = min;

        publish(PUB_SUB_EVENTS.quantityUpdate, undefined);
      }

      fetchQuantityRules() {
        const currentVariantId = this.productForm?.variantIdInput?.value;
        if (!currentVariantId) return;

        this.querySelector('.quantity__rules-cart .loading__spinner').classList.remove('hidden');
        return fetch(`${this.dataset.url}?variant=${currentVariantId}&section_id=${this.dataset.section}`)
          .then((response) => response.text())
          .then((responseText) => {
            const html = new DOMParser().parseFromString(responseText, 'text/html');
            this.updateQuantityRules(this.dataset.section, html);
          })
          .catch((e) => console.error(e))
          .finally(() => this.querySelector('.quantity__rules-cart .loading__spinner').classList.add('hidden'));
      }

      updateQuantityRules(sectionId, html) {
        if (!this.quantityInput) return;
        this.setQuantityBoundries();

        const quantityFormUpdated = html.getElementById(`Quantity-Form-${sectionId}`);
        const selectors = ['.quantity__input', '.quantity__rules', '.quantity__label'];
        for (let selector of selectors) {
          const current = this.quantityForm.querySelector(selector);
          const updated = quantityFormUpdated.querySelector(selector);
          if (!current || !updated) continue;
          if (selector === '.quantity__input') {
            const attributes = ['data-cart-quantity', 'data-min', 'data-max', 'step'];
            for (let attribute of attributes) {
              const valueUpdated = updated.getAttribute(attribute);
              if (valueUpdated !== null) {
                current.setAttribute(attribute, valueUpdated);
              } else {
                current.removeAttribute(attribute);
              }
            }
          } else {
            current.innerHTML = updated.innerHTML;
            if (selector === '.quantity__label') {
              const updatedAriaLabelledBy = updated.getAttribute('aria-labelledby');
              if (updatedAriaLabelledBy) {
                current.setAttribute('aria-labelledby', updatedAriaLabelledBy);
                // Update the referenced visually hidden element
                const labelId = updatedAriaLabelledBy;
                const currentHiddenLabel = document.getElementById(labelId);
                const updatedHiddenLabel = html.getElementById(labelId);
                if (currentHiddenLabel && updatedHiddenLabel) {
                  currentHiddenLabel.textContent = updatedHiddenLabel.textContent;
                }
              }
            }
          }
        }
      }

      initializeBundleIntegration() {
        // ensure this runs only once
        if (this._bundleInitialized) return;

        // try finding bundle-selects inside this component first, then globally by section id or data-section
        let bundleSelects = this.querySelector('bundle-selects');
        if (!bundleSelects) {
          bundleSelects = document.querySelector(`bundle-selects#bundle-selects-${this.sectionId}`) ||
            document.querySelector(`bundle-selects[data-section="${this.sectionId}"]`) ||
            document.querySelector('bundle-selects');
        }

        // If bundle markup isn't yet in DOM, observe the document and retry
        if (!bundleSelects) {
          if (!this._bundleObserver) {
            this._bundleObserver = new MutationObserver((mutations, obs) => {
              const found = document.querySelector(`bundle-selects#bundle-selects-${this.sectionId}`) ||
                document.querySelector(`bundle-selects[data-section="${this.sectionId}"]`) ||
                document.querySelector('bundle-selects');
              if (found) {
                obs.disconnect();
                this._bundleObserver = null;
                this.initializeBundleIntegration();
              }
            });
            this._bundleObserver.observe(document.body, { childList: true, subtree: true });
          }
          return;
        }

        // mark initialized to avoid double-binding
        if (bundleSelects.dataset.bundleInitialized === 'true') return;

        // store default description if provided by bundle markup
        const defaultDescScript = bundleSelects.querySelector('script[data-default-product-description]');
        if (defaultDescScript) {
          try {
            this._defaultProductDescription = JSON.parse(defaultDescScript.textContent);
          } catch (e) {
            console.error('Failed to parse default description:', e);
          }
        }

        const bundleVariantIds = this.getBundleVariantIds(bundleSelects);

        if (this.variantSelectors && bundleVariantIds.length > 0) {
          this.hideBundleVariantsFromPicker(bundleVariantIds);
        }

        this._bundleVariantsData = this.getBundleVariantsData(bundleSelects);
        this.setupBundleSelection(bundleSelects);
        // also listen to interactions on the variant picker so that selecting variants deselects bundles
        if (this.variantSelectors) this.setupVariantSelection(this.variantSelectors, bundleSelects);

        bundleSelects.dataset.bundleInitialized = 'true';
        this._bundleInitialized = true;
      }

      getBundleVariantIds(bundleSelects) {
        const inputs = bundleSelects.querySelectorAll('input[data-bundle-variant-id]');
        return Array.from(inputs).map((input) => input.dataset.bundleVariantId);
      }

      hideBundleVariantsFromPicker(bundleVariantIds) {
        const variantSelects = this.variantSelectors;
        bundleVariantIds.forEach((variantId) => {
          const input = variantSelects.querySelector(`input[data-option-value-id="${variantId}"]`);
          if (input) {
            const label = variantSelects.querySelector(`label[for="${input.id}"]`);
            input.style.display = 'none';
            if (label) label.style.display = 'none';
          }

          const option = variantSelects.querySelector(`option[data-option-value-id="${variantId}"]`);
          if (option) {
            option.style.display = 'none';
            option.disabled = true;
          }
        });

        variantSelects.querySelectorAll('fieldset').forEach((fieldset) => {
          const visibleInputs = Array.from(fieldset.querySelectorAll('input')).filter(
            (inp) => inp.style.display !== 'none'
          );
          if (visibleInputs.length === 0) {
            fieldset.style.display = 'none';
          }
        });
      }

      getBundleVariantsData(bundleSelects) {
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

      setupBundleSelection(bundleSelects) {
        const inputs = bundleSelects.querySelectorAll('input[type="radio"]');
        const sectionId = bundleSelects.dataset.section || this.dataset.section;
        const bundleVariantsData = this._bundleVariantsData || [];

        inputs.forEach((input) => {
          input.addEventListener(
            'change',
            (event) => {
              event.stopPropagation();
              if (!event.target.checked) return;

              const variantId = event.target.dataset.bundleVariantId;
              const variantData = bundleVariantsData.find((v) => String(v.id) === String(variantId));

              if (!variantData) {
                console.error('Bundle variant not found:', variantId);
                return;
              }
              // Deselect variant picker and update variant inputs locally first
              if (this.variantSelectors) this.deselectAllVariants(this.variantSelectors);
              this.updateVariantInputs(variantId);

              // set gift type property on product form so cart receives bundle title
              const bundleTitle = event.target.dataset.bundleTitle || variantData.title || '';
              this.setGiftTypeProperty(sectionId, bundleTitle);

              // Fetch full product HTML and run the same update flow as variant selects
              // This ensures media, option values, quantity rules, and other UI are updated consistently
              this.renderProductInfo({
                requestUrl: `${this.dataset.url}?variant=${variantId}&section_id=${this.sectionId}`,
                targetId: event.target.id,
                callback: this.handleUpdateProductInfo(this.dataset.url),
              });

              // mark bundle UI active (will also be reconciled by the full update)
              bundleSelects.classList.add('is-active');
              bundleSelects.classList.remove('is-deselected');

              // publish variantChange for any subscribers
              if (typeof publish !== 'undefined' && typeof PUB_SUB_EVENTS !== 'undefined') {
                publish(PUB_SUB_EVENTS.variantChange, {
                  data: {
                    sectionId: sectionId,
                    variant: variantData,
                  },
                });
              }
            },
            true
          );
        });
      }

      setGiftTypeProperty(sectionId, title) {
        if (!sectionId) sectionId = this.sectionId;
        this.querySelectorAll(`#product-form-${sectionId}, #product-form-installment-${sectionId}`).forEach((productForm) => {
          const formNode = productForm.querySelector('form') || productForm;
          if (!formNode) return;
          let input = formNode.querySelector('input[name="properties[Gift Type]"]');
          if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'properties[Gift Type]';
            formNode.appendChild(input);
          }
          input.value = title ?? '';
        });
      }

      clearGiftTypeProperty(sectionId) {
        if (!sectionId) sectionId = this.sectionId;
        this.querySelectorAll(`#product-form-${sectionId}, #product-form-installment-${sectionId}`).forEach((productForm) => {
          const formNode = productForm.querySelector('form') || productForm;
          if (!formNode) return;
          const input = formNode.querySelector('input[name="properties[Gift Type]"]');
          if (input) {
            // remove the input entirely so the property is not sent to cart
            input.remove();
          }
        });
      }

      setupVariantSelection(variantSelects, bundleSelects) {
        const inputs = variantSelects.querySelectorAll('input[type="radio"]');
        const dropdowns = variantSelects.querySelectorAll('select');

        inputs.forEach((input) => {
          input.addEventListener('change', () => {
            if (input.checked) {
              this.deselectAllBundles(bundleSelects);
              // restore default product description if available
              if (this._defaultProductDescription) this.updateProductDescription(this._defaultProductDescription);

              variantSelects.classList.remove('is-deselected');
              variantSelects.classList.add('is-active');
            }
          });
        });

        dropdowns.forEach((select) => {
          select.addEventListener('change', () => {
            this.deselectAllBundles(bundleSelects);
            if (this._defaultProductDescription) this.updateProductDescription(this._defaultProductDescription);

            variantSelects.classList.remove('is-deselected');
            variantSelects.classList.add('is-active');
          });
        });
      }

      deselectAllBundles(bundleSelects) {
        const inputs = bundleSelects.querySelectorAll('input[type="radio"]');
        inputs.forEach((input) => {
          input.checked = false;
          const label = bundleSelects.querySelector(`label[for="${input.id}"]`);
          if (label) label.classList.remove('active', 'selected');
        });
        // also remove any checked attributes on options/buttons
        bundleSelects.querySelectorAll('input[checked]').forEach((el) => el.removeAttribute('checked'));
        bundleSelects.classList.add('is-deselected');
        bundleSelects.classList.remove('is-active');
      }

      deselectAllVariants(variantSelects) {
        if (!variantSelects) return;
        const allInputs = variantSelects.querySelectorAll('input[type="radio"]');
        allInputs.forEach((input) => {
          input.checked = false;
          const label = variantSelects.querySelector(`label[for="${input.id}"]`);
          if (label) label.classList.remove('active', 'selected');
        });

        const dropdowns = variantSelects.querySelectorAll('select');
        dropdowns.forEach((select) => {
          select.querySelectorAll('option').forEach((option) => {
            option.removeAttribute('selected');
          });
        });

        variantSelects.classList.add('is-deselected');
        variantSelects.classList.remove('is-active');
      }

      updatePriceDisplay(sectionId, variantData) {
        const priceContainer = document.querySelector(`#price-${sectionId}`);
        if (priceContainer && variantData?.price) {
          const formattedPrice =
            typeof Shopify !== 'undefined' && Shopify.formatMoney
              ? Shopify.formatMoney(variantData.price)
              : '$' + (variantData.price / 100).toFixed(2);
          const priceElement = priceContainer.querySelector('.price-item--regular');
          if (priceElement) priceElement.textContent = formattedPrice;
        }
      }

      updateAddToCartButton(sectionId, variantData) {
        const productForm = document.querySelector(`product-form[data-section="${sectionId}"]`);
        if (!productForm) return;

        const submitButton = productForm.querySelector('[type="submit"]');
        if (!submitButton) return;

        const buttonText = submitButton.querySelector('span');
        if (variantData.available) {
          submitButton.disabled = false;
          if (buttonText) buttonText.textContent = window.variantStrings?.addToCart || 'Add to cart';
        } else {
          submitButton.disabled = true;
          if (buttonText) buttonText.textContent = window.variantStrings?.soldOut || 'Sold out';
        }
      }

      updateProductDescription(description) {
        const descriptionEl = document.querySelector('[data-product-description]');
        if (!descriptionEl) return;

        let descriptionHTML = '';
        if (typeof description === 'string') descriptionHTML = description;
        else if (description && typeof description === 'object') {
          if (description.value) descriptionHTML = description.value;
          else if (description.html) descriptionHTML = description.html;
          else descriptionHTML = JSON.stringify(description);
        }

        descriptionEl.innerHTML = descriptionHTML || descriptionEl.innerHTML;
      }

      updateDefaultVariantPickerSelection() {
        const variantSelects = this.variantSelectors;
        if (!variantSelects) return;
        const allInputs = Array.from(variantSelects.querySelectorAll('input[type="radio"]'));
        allInputs.forEach((input) => {
          input.checked = false;
          const label = variantSelects.querySelector(`label[for="${input.id}"]`);
          if (label) label.classList.remove('active', 'selected');
        });
        variantSelects.classList.add('is-deselected');
        variantSelects.classList.remove('is-active');
      }

      get productForm() {
        return this.querySelector(`product-form`);
      }

      get productModal() {
        return document.querySelector(`#ProductModal-${this.dataset.section}`);
      }

      get pickupAvailability() {
        return this.querySelector(`pickup-availability`);
      }

      get variantSelectors() {
        return this.querySelector('variant-selects');
      }

      get relatedProducts() {
        const relatedProductsSectionId = SectionId.getIdForSection(
          SectionId.parseId(this.sectionId),
          'related-products'
        );
        return document.querySelector(`product-recommendations[data-section-id^="${relatedProductsSectionId}"]`);
      }

      get quickOrderList() {
        const quickOrderListSectionId = SectionId.getIdForSection(
          SectionId.parseId(this.sectionId),
          'quick_order_list'
        );
        return document.querySelector(`quick-order-list[data-id^="${quickOrderListSectionId}"]`);
      }

      get sectionId() {
        return this.dataset.originalSection || this.dataset.section;
      }
    }
  );
}
