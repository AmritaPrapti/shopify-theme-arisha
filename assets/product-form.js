if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              window.location = window.routes.cart_url;
              return;
            }

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                cartData: response,
              }).then(() => {
                CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
              });
            this.error = false;
            console.log('Product added to cart', formData.get('id'));
            this.trackKlaviyoAddedToCart(formData.get('id'));
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    CartPerformance.measure("add:paint-updated-sections", () => {
                      this.cart.renderContents(response);
                    });
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);            
            } else {
              CartPerformance.measure("add:paint-updated-sections", () => {
                this.cart.renderContents(response);
              });
            }

             const quickView = this.closest('.quick-view-modal');
              console.log(quickView);
              if (quickView){
                quickView.style.display = 'none';
              };
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');

            CartPerformance.measureFromEvent("add:user-action", evt);
          });
      }

      async trackKlaviyoAddedToCart(addedVariantId = null) {
        try {
          if (!window.klaviyo) return;

          const response = await fetch('/cart.js');
          const cart = await response.json();

          if (!cart.items || !cart.items.length) return;

          const latestItem =
            cart.items.find((item) => String(item.variant_id) === String(addedVariantId)) ||
            cart.items[0];

          const cartItems = cart.items
            .map((item) => `${item.variant_id}:${item.quantity}`)
            .join(',');

          const payload = {
            Source: 'custom_bundle_ajax_cart',
            CartURL: `${window.location.origin}/cart/${cartItems}?storefront=true`,
            DebugCartURL: `${window.location.origin}/cart/${cartItems}?storefront=true`,

            Items: cart.items.map((item) => ({
              ProductName: item.product_title,
              ProductID: item.product_id,
              VariantID: item.variant_id,
              SKU: item.sku,
              Quantity: item.quantity,
              Price: item.final_price / 100,
              ImageURL: item.image,
              URL: `${window.location.origin}${item.url}`,
            })),

            ProductName: latestItem.product_title,
            ProductID: latestItem.product_id,
            VariantID: latestItem.variant_id,
            SKU: latestItem.sku,
            Quantity: latestItem.quantity,
            Price: latestItem.final_price / 100,
            ImageURL: latestItem.image,
            URL: `${window.location.origin}${latestItem.url}`,
            $value: cart.total_price / 100,
          };
          
          console.log('Tracking Klaviyo Added to Cart with payload:', window.klaviyo, payload);
          window.klaviyo.track('Added to Cart', payload);

          console.log('Klaviyo Added to Cart tracked', payload);
        } catch (error) {
          console.error('Klaviyo tracking error:', error);
        }
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}
