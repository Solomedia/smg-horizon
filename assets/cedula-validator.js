/**
 * <cedula-validator>
 *
 * Validates a national ID (cédula) field inside the cart before allowing the
 * customer to proceed to checkout. MVP rule: exactly 10 numeric digits.
 *
 * Behaviour:
 * - Sanitises input to digits only (max 10).
 * - Shows an inline error when the value is invalid.
 * - Dims the checkout button while invalid but keeps it clickable: clicking it
 *   reveals the error and focuses the field (better UX than a dead disabled button).
 * - Blocks accelerated checkout buttons (Shop Pay, etc.) while invalid.
 * - Carries the validated value to checkout via a hidden `attributes[Cedula]`
 *   input bound to the cart form, and persists it to the cart via /cart/update.js
 *   so it survives navigation between the cart drawer and the cart page.
 *
 * Known limitation (accepted for the demo): without Shopify Plus a user can reach
 * /checkout directly by URL, bypassing cart-level validation.
 */

const CEDULA_LENGTH = 10;
const CEDULA_PATTERN = /^\d{10}$/;
const PERSIST_DELAY = 400;

class CedulaValidator extends HTMLElement {
  constructor() {
    super();
    this.handleInput = this.handleInput.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleCheckoutClick = this.handleCheckoutClick.bind(this);
    this.persistTimer = null;
  }

  connectedCallback() {
    this.input = this.querySelector('[data-cedula-input]');
    this.hiddenInput = this.querySelector('[data-cedula-attribute]');
    this.errorEl = this.querySelector('[data-cedula-error]');
    this.updateUrl = this.dataset.cartUpdateUrl;

    if (!this.input) return;

    const scope = this.closest('cart-items-component') || document;
    this.checkoutButton = scope.querySelector('button[name="checkout"]');
    this.acceleratedButtons = scope.querySelector('.additional-checkout-buttons');

    this.input.addEventListener('input', this.handleInput);
    this.input.addEventListener('blur', this.handleBlur);
    if (this.checkoutButton) {
      this.checkoutButton.addEventListener('click', this.handleCheckoutClick, true);
    }

    // Set the initial button state from the prefilled value without flashing an error.
    this.syncState({ showError: false });
  }

  disconnectedCallback() {
    if (this.input) {
      this.input.removeEventListener('input', this.handleInput);
      this.input.removeEventListener('blur', this.handleBlur);
    }
    if (this.checkoutButton) {
      this.checkoutButton.removeEventListener('click', this.handleCheckoutClick, true);
    }
    clearTimeout(this.persistTimer);
  }

  get value() {
    return this.input ? this.input.value.trim() : '';
  }

  get isValid() {
    return CEDULA_PATTERN.test(this.value);
  }

  handleInput() {
    // Keep the field numeric and capped at the required length.
    const sanitised = this.input.value.replace(/\D/g, '').slice(0, CEDULA_LENGTH);
    if (sanitised !== this.input.value) this.input.value = sanitised;

    // Clear a visible error as soon as the value becomes valid.
    this.syncState({ showError: this.isValid ? false : this.errorVisible });
    if (this.isValid) this.schedulePersist();
  }

  handleBlur() {
    this.syncState({ showError: !this.isValid && this.value.length > 0 });
    if (this.isValid) this.persist();
  }

  handleCheckoutClick(event) {
    if (this.isValid) return;
    event.preventDefault();
    event.stopPropagation();
    this.syncState({ showError: true });
    this.input.focus();
    this.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  get errorVisible() {
    return this.errorEl ? !this.errorEl.hasAttribute('hidden') : false;
  }

  syncState({ showError }) {
    const valid = this.isValid;

    // Sync the hidden cart attribute input (empty when invalid).
    if (this.hiddenInput) this.hiddenInput.value = valid ? this.value : '';

    // Error message + field a11y state.
    if (this.errorEl) this.errorEl.toggleAttribute('hidden', !showError);
    this.input.setAttribute('aria-invalid', showError ? 'true' : 'false');

    // Dim (but do not disable) the checkout button while invalid.
    if (this.checkoutButton) {
      this.checkoutButton.classList.toggle('cart__checkout-button--pending', !valid);
    }
    if (this.acceleratedButtons) {
      this.acceleratedButtons.classList.toggle('additional-checkout-buttons--blocked', !valid);
    }
  }

  schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), PERSIST_DELAY);
  }

  persist() {
    clearTimeout(this.persistTimer);
    if (!this.updateUrl || !this.isValid) return;

    fetch(`${this.updateUrl}.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: { Cedula: this.value } }),
    }).catch(() => {
      /* Non-blocking: the hidden input still carries the value on submit. */
    });
  }
}

if (!customElements.get('cedula-validator')) {
  customElements.define('cedula-validator', CedulaValidator);
}
