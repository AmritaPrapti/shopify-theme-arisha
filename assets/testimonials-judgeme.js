/* Testimonials (Judge.me)
   ------------------------
   Two jobs, in one custom element:

   1. Reviews. Judge.me's `/api/v1/reviews` list endpoint rejects public tokens
      (it is private-token-only, i.e. server-side), but the widgets endpoint
      `/api/v1/widgets/all_reviews_page.json` accepts the shop's *public* token
      and sends CORS headers, so the storefront can call it directly. It answers
      with the widget's own markup, which carries every field we need on data
      attributes and `jdgm-rev__*` classes. We parse that, then re-render the
      reviews into the theme's markup so the section keeps its own design.

   2. Slides. A scroll-snap track — no carousel library. Native scrolling gives
      touch swiping, trackpad gestures and iOS momentum for free, and the whole
      thing still works if this file never loads.

   Review text is inserted as text nodes, never as HTML, so nothing typed into a
   review can inject markup into the page. */

const JM_ENDPOINT = 'https://judge.me/api/v1/widgets/all_reviews_page.json';
const JM_CACHE_PREFIX = 'jm-testimonials:';

/** Reads one field out of a parsed `.jdgm-rev` node. */
function jmText(root, selector) {
  const node = root.querySelector(selector);
  return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
}

/** The product handle out of a Judge.me review's product link. */
function jmHandleOf(url) {
  const match = /\/products\/([^/?#]+)/.exec(url || '');
  return match ? match[1] : '';
}

/** Turns Judge.me's widget markup into plain review objects. */
function jmParseReviews(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  return Array.from(doc.querySelectorAll('.jdgm-rev')).map((node) => {
    const ratingEl = node.querySelector('.jdgm-rev__rating');
    const productEl = node.querySelector('.jdgm-rev__prod-link');
    const stampEl = node.querySelector('.jdgm-rev__timestamp');

    return {
      id: node.getAttribute('data-review-id') || '',
      verified: node.getAttribute('data-verified-buyer') === 'true',
      rating: ratingEl ? parseInt(ratingEl.getAttribute('data-score'), 10) || 0 : 0,
      date: stampEl ? stampEl.getAttribute('data-content') || '' : '',
      author: jmText(node, '.jdgm-rev__author'),
      location: jmText(node, '.jdgm-rev__location'),
      title: jmText(node, '.jdgm-rev__title'),
      body: jmText(node, '.jdgm-rev__body'),
      productTitle: productEl ? productEl.textContent.trim() : '',
      productUrl: productEl ? productEl.getAttribute('href') || '' : '',
    };
  });
}

/** Pulls the shop-wide totals off the widget header. */
function jmParseSummary(html) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const header = doc.querySelector('.jdgm-all-reviews__header');
  if (!header) return null;

  const average = parseFloat(header.getAttribute('data-average-rating'));
  const count = parseInt(header.getAttribute('data-number-of-reviews'), 10);

  return {
    average: Number.isFinite(average) ? average : null,
    count: Number.isFinite(count) ? count : null,
  };
}

class JudgemeTestimonials extends HTMLElement {
  connectedCallback() {
    const configEl = this.querySelector('[data-jm-config]');
    this.config = configEl ? JSON.parse(configEl.textContent) : {};

    this.slider = this.querySelector('[data-jm-slider]');
    this.track = this.querySelector('[data-jm-track]');
    this.prevButton = this.querySelector('[data-jm-prev]');
    this.nextButton = this.querySelector('[data-jm-next]');
    this.counter = this.querySelector('[data-jm-counter]');
    this.dots = this.querySelector('[data-jm-dots]');
    this.template = this.querySelector('[data-jm-slide-template]');

    this.index = 0;
    this.fade = this.config.transition === 'fade';

    this.onScroll = this.onScroll.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);

    this.bindControls();
    this.refresh();

    if (this.config.source !== 'manual') this.loadReviews();
  }

  disconnectedCallback() {
    this.stopAutoplay();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  /* ------------------------------------------------------------ reviews */

  get cacheKey() {
    const { shopDomain, maxReviews, minRating, verifiedOnly, minChars, maxChars, productHandle, sort } =
      this.config;
    return `${JM_CACHE_PREFIX}${[
      shopDomain,
      maxReviews,
      minRating,
      verifiedOnly,
      minChars,
      maxChars,
      productHandle,
      sort,
    ].join('|')}`;
  }

  readCache() {
    if (!this.config.cacheMinutes) return null;
    try {
      const raw = sessionStorage.getItem(this.cacheKey);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.at > this.config.cacheMinutes * 60000) return null;
      return cached.payload;
    } catch (error) {
      return null;
    }
  }

  writeCache(payload) {
    if (!this.config.cacheMinutes) return;
    try {
      sessionStorage.setItem(this.cacheKey, JSON.stringify({ at: Date.now(), payload }));
    } catch (error) {
      /* Private browsing, or the quota is full. The section still works. */
    }
  }

  async loadReviews() {
    const { shopDomain, apiToken } = this.config;
    if (!shopDomain || !apiToken) return;

    const cached = this.readCache();
    if (cached) {
      this.applyReviews(cached.reviews, cached.summary);
      return;
    }

    // One request, deliberately over-fetched: filtering happens locally, so we
    // need a pool big enough to survive the minimum-rating and length filters.
    const perPage = Math.min(100, Math.max((this.config.maxReviews || 6) * 4, 25));
    const url = new URL(JM_ENDPOINT);
    url.searchParams.set('shop_domain', shopDomain);
    url.searchParams.set('api_token', apiToken);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', '1');

    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Judge.me responded ${response.status}`);

      const data = await response.json();
      const reviews = this.filterReviews(jmParseReviews(data.all_reviews || ''));
      const summary = jmParseSummary(data.all_reviews_header);

      if (!reviews.length) {
        this.showFallback();
        return;
      }

      this.writeCache({ reviews, summary });
      this.applyReviews(reviews, summary);
    } catch (error) {
      // Judge.me is down, blocked, or the token is wrong. Leave whatever the
      // server rendered in place rather than emptying the section.
      console.warn('[testimonials-judgeme]', error);
      this.showFallback();
    }
  }

  filterReviews(reviews) {
    const { minRating, verifiedOnly, minChars, maxChars, productHandle, maxReviews, sort } = this.config;

    let list = reviews.filter((review) => {
      if (!review.body) return false;
      if (minRating && review.rating < minRating) return false;
      if (verifiedOnly && !review.verified) return false;
      if (minChars && review.body.length < minChars) return false;
      if (maxChars && review.body.length > maxChars) return false;
      // Compared as a whole path segment: a substring test would let the
      // handle "discovery" match /products/discovery-set as well.
      if (productHandle && jmHandleOf(review.productUrl) !== productHandle) return false;
      return true;
    });

    if (sort === 'rating') {
      list.sort((a, b) => b.rating - a.rating);
    } else if (sort === 'longest') {
      list.sort((a, b) => b.body.length - a.body.length);
    } else if (sort === 'shortest') {
      list.sort((a, b) => a.body.length - b.body.length);
    } else if (sort === 'random') {
      list = list
        .map((review) => ({ review, key: Math.random() }))
        .sort((a, b) => a.key - b.key)
        .map((entry) => entry.review);
    }

    return list.slice(0, maxReviews || 6);
  }

  applyReviews(reviews, summary) {
    const slides = reviews.map((review, position) => this.buildSlide(review, position));

    if (this.config.source === 'both') {
      // Hand-written slides stay and lead; the live reviews follow them.
      this.removeSkeletons();
      this.track.append(...slides);
    } else {
      this.track.replaceChildren(...slides);
    }

    this.removeStatus();
    if (summary) this.applySummary(summary);
    this.refresh();
  }

  /** Builds one slide from the template the section rendered for us. */
  buildSlide(review, position) {
    const slide = this.template.content.firstElementChild.cloneNode(true);
    const set = (selector, value, options = {}) => {
      const node = slide.querySelector(selector);
      if (!node) return;
      if (!value) {
        if (options.keep) return;
        node.remove();
        return;
      }
      node.textContent = value;
    };

    slide.setAttribute('aria-label', `${position + 1}`);

    set('[data-jm-title]', this.config.showTitle ? review.title : '');
    set('[data-jm-body]', review.body);
    const named = review.author && review.author.toLowerCase() !== 'anonymous';
    set('[data-jm-author]', named ? review.author : this.config.anonymousLabel);

    const starsEl = slide.querySelector('[data-jm-card-stars]');
    if (starsEl) {
      if (this.config.showCardStars && review.rating) {
        starsEl.style.setProperty('--jm-star-rating', String(review.rating));
        starsEl.setAttribute('aria-label', `${review.rating} ${this.config.outOfFiveLabel}`);
      } else {
        starsEl.remove();
      }
    }

    const verifiedEl = slide.querySelector('[data-jm-verified]');
    if (verifiedEl && !(this.config.showVerified && review.verified)) verifiedEl.remove();

    const dateEl = slide.querySelector('[data-jm-date]');
    if (dateEl) {
      const formatted = this.config.showDate ? this.formatDate(review.date) : '';
      if (formatted) {
        dateEl.textContent = formatted;
        dateEl.setAttribute('datetime', review.date);
      } else {
        dateEl.remove();
      }
    }

    const productEl = slide.querySelector('[data-jm-product]');
    if (productEl) {
      if (this.config.showProduct && review.productTitle) {
        productEl.textContent = review.productTitle;
        if (review.productUrl) productEl.setAttribute('href', review.productUrl);
      } else {
        productEl.remove();
      }
    }

    const locationEl = slide.querySelector('[data-jm-location]');
    if (locationEl) {
      if (review.location) locationEl.textContent = review.location;
      else locationEl.remove();
    }

    // A sub-line with nothing left in it would still draw its gap.
    const sub = slide.querySelector('[data-jm-sub]');
    if (sub && !sub.children.length) sub.remove();

    return slide;
  }

  formatDate(value) {
    if (!value) return '';
    // Judge.me sends "2026-08-23 03:26:16 UTC", which Safari will not parse.
    const parsed = new Date(value.replace(' UTC', 'Z').replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(this.config.locale || undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(parsed);
    } catch (error) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  /** Pushes the live average and review count into the aside. */
  applySummary({ average, count }) {
    if (!this.config.syncSummary) return;

    if (average != null) {
      this.querySelectorAll('[data-jm-summary-stars]').forEach((node) => {
        node.style.setProperty('--jm-star-rating', String(average));
        node.setAttribute('aria-label', `${average} ${this.config.outOfFiveLabel}`);
      });
      this.querySelectorAll('[data-jm-summary-average]').forEach((node) => {
        // Truncated, not rounded: 4.96 becomes "4.9". Rounding it to "5.0"
        // would overstate the rating next to a star row that is not full.
        node.textContent = (Math.floor(average * 10) / 10).toFixed(1);
      });
    }

    if (count != null) {
      this.querySelectorAll('[data-jm-summary-count]').forEach((node) => {
        node.textContent = String(count);
      });
    }
  }

  removeStatus() {
    this.querySelectorAll('[data-jm-status]').forEach((node) => node.remove());
  }

  removeSkeletons() {
    this.track.querySelectorAll('[data-jm-skeleton]').forEach((node) => node.remove());
  }

  /** Judge.me gave us nothing usable. Clear the skeletons and leave whatever
      the merchant wrote in place; if that is nothing, hide the empty track
      rather than showing a bare box. */
  showFallback() {
    this.removeStatus();
    this.removeSkeletons();
    if (!this.track.children.length && this.slider) this.slider.hidden = true;
    this.refresh();
  }

  /* ------------------------------------------------------------- slider */

  bindControls() {
    if (this.prevButton) this.prevButton.addEventListener('click', () => this.step(-1));
    if (this.nextButton) this.nextButton.addEventListener('click', () => this.step(1));

    if (!this.fade) {
      this.track.addEventListener('scroll', this.onScroll, { passive: true });
    }

    if (this.dots) {
      this.dots.addEventListener('click', (event) => {
        const dot = event.target.closest('[data-jm-dot]');
        if (dot) this.goTo(Number(dot.dataset.jmDot));
      });
    }

    // Autoplay is a convenience, never a trap: any sign of intent stops it.
    if (this.config.autoplay) {
      ['pointerenter', 'focusin'].forEach((type) =>
        this.addEventListener(type, () => this.stopAutoplay())
      );
      this.track.addEventListener('touchstart', () => this.stopAutoplay(), { passive: true });
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this);
    } else {
      window.addEventListener('resize', this.onResize);
    }

    // Theme editor: selecting a block should bring its slide into view.
    this.addEventListener('shopify:block:select', (event) => {
      const slide = event.target.closest('.jm-slider__slide');
      if (slide) this.goTo(this.slides.indexOf(slide));
    });
  }

  get slides() {
    return Array.from(this.track.children);
  }

  /** How far one slide advances the track, gap included. */
  get slideStep() {
    const [first, second] = this.slides;
    if (!first) return 0;
    if (second) return Math.abs(second.offsetLeft - first.offsetLeft);
    return first.offsetWidth;
  }

  /** Derived from measurement rather than settings, so the CSS breakpoints
      remain the single source of truth for how many slides fit. */
  get perView() {
    const step = this.slideStep;
    if (!step) return 1;
    return Math.max(1, Math.round(this.track.clientWidth / step));
  }

  get lastIndex() {
    return Math.max(0, this.slides.length - (this.fade ? 1 : this.perView));
  }

  step(direction) {
    const next = this.index + direction;
    if (next < 0) return this.goTo(this.config.loop ? this.lastIndex : 0);
    if (next > this.lastIndex) return this.goTo(this.config.loop ? 0 : this.lastIndex);
    return this.goTo(next);
  }

  goTo(index) {
    const target = Math.min(Math.max(index, 0), this.lastIndex);
    this.index = target;

    if (this.fade) {
      this.slides.forEach((slide, position) => {
        const active = position === target;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      this.updateControls();
    } else {
      this.track.scrollTo({
        left: target * this.slideStep,
        behavior: this.prefersReducedMotion ? 'auto' : 'smooth',
      });
      // The scroll handler will land on the same index, but updating now keeps
      // the counter honest during the animation.
      this.updateControls();
    }
  }

  get prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  onScroll() {
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => {
      const step = this.slideStep;
      if (!step) return;
      const index = Math.round(Math.abs(this.track.scrollLeft) / step);
      if (index !== this.index) {
        this.index = Math.min(index, this.lastIndex);
        this.updateControls();
      }
    });
  }

  onResize() {
    this.updateControls();
  }

  onVisibilityChange() {
    if (document.hidden) this.stopAutoplay();
  }

  /** Rebuilds everything that depends on the slide count. */
  refresh() {
    const total = this.slides.length;

    this.slides.forEach((slide, position) => {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', this.config.slideLabel || 'slide');
      slide.setAttribute('aria-label', `${position + 1} / ${total}`);
    });

    this.buildDots();

    // One slide (or fewer) per view means there is nothing to page through.
    const idle = total <= this.perView;
    if (this.slider) this.slider.classList.toggle('jm-slider--static', idle);
    this.querySelectorAll('[data-jm-controls]').forEach((node) => {
      node.hidden = idle;
    });

    if (this.fade) this.goTo(Math.min(this.index, this.lastIndex));
    else this.updateControls();

    if (this.config.autoplay && !idle && !this.prefersReducedMotion) this.startAutoplay();
    else this.stopAutoplay();
  }

  buildDots() {
    if (!this.dots) return;
    const count = this.lastIndex + 1;
    if (this.dots.children.length === count) return;

    this.dots.replaceChildren(
      ...Array.from({ length: count }, (unused, position) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'jm-slider__dot';
        dot.dataset.jmDot = String(position);
        dot.setAttribute('aria-label', `${this.config.goToLabel || 'Go to slide'} ${position + 1}`);
        return dot;
      })
    );
  }

  updateControls() {
    const total = this.lastIndex + 1;

    if (this.counter) {
      this.counter.textContent = (this.config.counterFormat || '[current] / [total]')
        .replace('[current]', String(this.index + 1))
        .replace('[total]', String(total));
    }

    if (this.dots) {
      Array.from(this.dots.children).forEach((dot, position) => {
        dot.setAttribute('aria-current', position === this.index ? 'true' : 'false');
      });
    }

    if (!this.config.loop) {
      if (this.prevButton) this.prevButton.disabled = this.index === 0;
      if (this.nextButton) this.nextButton.disabled = this.index >= this.lastIndex;
    }
  }

  /** Autoplay always wraps, even when `loop` leaves the buttons bounded —
      otherwise it would park on the last slide and look broken. */
  advance() {
    this.goTo(this.index >= this.lastIndex ? 0 : this.index + 1);
  }

  startAutoplay() {
    this.stopAutoplay();
    this.autoplayTimer = setInterval(() => this.advance(), (this.config.autoplaySpeed || 5) * 1000);
  }

  stopAutoplay() {
    if (this.autoplayTimer) {
      clearInterval(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }
}

if (!customElements.get('judgeme-testimonials')) {
  customElements.define('judgeme-testimonials', JudgemeTestimonials);
}
