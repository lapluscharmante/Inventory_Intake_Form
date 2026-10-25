/*
 * Wishlist for Shopify themes (built for Dawn, works with most themes).
 *
 * - Adds a heart to every product card and to the product page.
 * - Customers can keep several named wishlists, saved in their browser.
 * - Lists are shared as a link, by email, by text message, or with the
 *   phone's share sheet. The link carries the list, so no server is needed.
 * - "Buy now" adds an item (or the whole list) to the cart and goes straight
 *   to checkout.
 *
 * Settings come from window.WishlistConfig, written by snippets/wishlist.liquid.
 */
(function () {
  'use strict';

  if (window.__wishlistLoaded) return;
  window.__wishlistLoaded = true;

  var config = window.WishlistConfig || {};
  var ROOT = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  var PAGE_PATH = ROOT + 'pages/' + (config.pageHandle || 'wishlist');
  var STORAGE_KEY = 'wishlist:v1';
  var MAX_LISTS = 20;
  var MAX_ITEMS = 100;
  var NAME_MAX = 60;

  var TEXT = Object.assign({
    defaultListName: 'My Wishlist',
    heading: 'Wishlist',
    save: 'Save {title} to wishlist',
    saved: 'Saved to {list}',
    removed: 'Removed from {list}',
    view: 'View',
    change: 'Change',
    pickerTitle: 'Save to wishlist',
    newList: 'New wishlist',
    newListPlaceholder: 'e.g. Birthday ideas',
    create: 'Create',
    rename: 'Rename',
    delete: 'Delete',
    share: 'Share',
    cancel: 'Cancel',
    done: 'Done',
    buyNow: 'Buy now',
    buyAll: 'Buy all ({count})',
    soldOut: 'Sold out',
    unavailable: 'No longer available',
    remove: 'Remove {title}',
    moveTo: 'Move to\u2026',
    items: '{count} items',
    item: '1 item',
    emptyTitle: 'This wishlist is empty',
    emptyBody: 'Tap the heart on any piece to save it here.',
    continueShopping: 'Continue shopping',
    shareTitle: 'Share \u201C{list}\u201D',
    shareMessage: 'Take a look at my wishlist \u201C{list}\u201D from {shop}:',
    emailSubject: 'My wishlist \u201C{list}\u201D from {shop}',
    shareEmptyNote: 'Add something to this wishlist before sharing it.',
    email: 'Email',
    text: 'Text message',
    copyLink: 'Copy link',
    copied: 'Link copied',
    more: 'More options',
    deleteConfirm: 'Delete \u201C{list}\u201D and everything in it?',
    sharedEyebrow: 'A wishlist shared with you',
    saveCopy: 'Save to my wishlists',
    savedCopy: 'Saved to your wishlists',
    badLink: 'This wishlist link is incomplete or broken. Ask for it to be sent again.',
    cartError: 'This couldn\u2019t be added to your cart. Please try again.',
    someUnavailable: '{count} sold-out item(s) were left out.',
    variant: 'Option',
    listLimit: 'You can keep up to {max} wishlists.',
    itemLimit: 'A wishlist can hold up to {max} items.',
  }, config.strings || {});

  function t(key, vars) {
    return String(TEXT[key] || key).replace(/\{(\w+)\}/g, function (_, name) {
      return vars && vars[name] != null ? vars[name] : '';
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function cleanName(name, fallback) {
    var trimmed = String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    return trimmed || fallback || TEXT.defaultListName;
  }

  // Shopify handles are URL slugs; anything with a slash or quote isn't one.
  function validHandle(handle) {
    return typeof handle === 'string' && handle.length > 0 && handle.length <= 255 && !/[\/?#"'<>\s]/.test(handle);
  }

  function validVariant(id) {
    return /^\d{1,20}$/.test(String(id || ''));
  }

  // ---------------------------------------------------------------------------
  // Storage: { lists: [{ id, name, items: [{ h: handle, v: variantId, t }] }], active }
  // ---------------------------------------------------------------------------

  var memoryFallback = null;

  var store = {
    data: null,

    load: function () {
      var raw = null;
      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch (e) {
        raw = memoryFallback;
      }
      var parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (e) {
        parsed = null;
      }
      this.data = normalize(parsed);
    },

    save: function (options) {
      var raw = JSON.stringify(this.data);
      try {
        window.localStorage.setItem(STORAGE_KEY, raw);
      } catch (e) {
        memoryFallback = raw;
      }
      if (!options || !options.silent) emitChange();
    },

    lists: function () {
      return this.data.lists;
    },

    get: function (id) {
      return this.data.lists.find(function (list) { return list.id === id; }) || null;
    },

    active: function () {
      return this.get(this.data.active) || this.data.lists[0];
    },

    setActive: function (id) {
      if (this.get(id)) {
        this.data.active = id;
        this.save({ silent: true });
      }
    },

    create: function (name) {
      if (this.data.lists.length >= MAX_LISTS) {
        toast(t('listLimit', { max: MAX_LISTS }));
        return null;
      }
      var list = { id: uid(), name: uniqueName(cleanName(name)), items: [] };
      this.data.lists.push(list);
      this.data.active = list.id;
      this.save();
      return list;
    },

    rename: function (id, name) {
      var list = this.get(id);
      if (!list) return;
      var cleaned = cleanName(name, list.name);
      if (cleaned !== list.name) list.name = uniqueName(cleaned, id);
      this.save();
    },

    remove: function (id) {
      this.data.lists = this.data.lists.filter(function (list) { return list.id !== id; });
      if (!this.data.lists.length) this.data.lists.push(newDefaultList());
      if (!this.get(this.data.active)) this.data.active = this.data.lists[0].id;
      this.save();
    },

    has: function (listId, handle) {
      var list = this.get(listId);
      return !!list && list.items.some(function (item) { return item.h === handle; });
    },

    listsWith: function (handle) {
      return this.data.lists.filter(function (list) {
        return list.items.some(function (item) { return item.h === handle; });
      });
    },

    add: function (listId, handle, variantId) {
      var list = this.get(listId);
      if (!list || !validHandle(handle)) return false;
      var existing = list.items.find(function (item) { return item.h === handle; });
      if (existing) {
        if (validVariant(variantId)) existing.v = String(variantId);
      } else {
        if (list.items.length >= MAX_ITEMS) {
          toast(t('itemLimit', { max: MAX_ITEMS }));
          return false;
        }
        list.items.unshift({ h: handle, v: validVariant(variantId) ? String(variantId) : null, t: Date.now() });
      }
      this.save();
      return true;
    },

    removeItem: function (listId, handle) {
      var list = this.get(listId);
      if (!list) return;
      list.items = list.items.filter(function (item) { return item.h !== handle; });
      this.save();
    },

    setVariant: function (listId, handle, variantId) {
      var list = this.get(listId);
      var item = list && list.items.find(function (entry) { return entry.h === handle; });
      if (item && validVariant(variantId)) {
        item.v = String(variantId);
        this.save({ silent: true });
      }
    },

    move: function (fromId, toId, handle) {
      var from = this.get(fromId);
      var item = from && from.items.find(function (entry) { return entry.h === handle; });
      if (!item || !this.get(toId)) return;
      from.items = from.items.filter(function (entry) { return entry.h !== handle; });
      var to = this.get(toId);
      if (!to.items.some(function (entry) { return entry.h === handle; })) to.items.unshift(item);
      this.save();
    },

    totalCount: function () {
      var handles = {};
      this.data.lists.forEach(function (list) {
        list.items.forEach(function (item) { handles[item.h] = true; });
      });
      return Object.keys(handles).length;
    },
  };

  function newDefaultList() {
    return { id: uid(), name: TEXT.defaultListName, items: [] };
  }

  function normalize(data) {
    var lists = data && Array.isArray(data.lists) ? data.lists : [];
    lists = lists.filter(function (list) { return list && typeof list.id === 'string'; }).slice(0, MAX_LISTS).map(function (list) {
      var items = Array.isArray(list.items) ? list.items : [];
      return {
        id: list.id,
        name: cleanName(list.name),
        items: items.filter(function (item) { return item && validHandle(item.h); }).slice(0, MAX_ITEMS).map(function (item) {
          return { h: item.h, v: validVariant(item.v) ? String(item.v) : null, t: Number(item.t) || 0 };
        }),
      };
    });
    if (!lists.length) lists.push(newDefaultList());
    var active = data && lists.some(function (list) { return list.id === data.active; }) ? data.active : lists[0].id;
    return { lists: lists, active: active };
  }

  function uniqueName(name, ignoreId) {
    var taken = store.data.lists.filter(function (list) { return list.id !== ignoreId; }).map(function (list) { return list.name.toLowerCase(); });
    if (taken.indexOf(name.toLowerCase()) === -1) return name;
    for (var n = 2; n < 100; n++) {
      var candidate = name + ' (' + n + ')';
      if (taken.indexOf(candidate.toLowerCase()) === -1) return candidate;
    }
    return name;
  }

  function emitChange() {
    document.dispatchEvent(new CustomEvent('wishlist:change', { detail: { count: store.totalCount() } }));
  }

  // ---------------------------------------------------------------------------
  // Products, prices and the cart
  // ---------------------------------------------------------------------------

  var productRequests = {};
  var products = {};

  // Resolves to the product's JSON, or null if it was deleted or unpublished.
  function fetchProduct(handle) {
    if (!productRequests[handle]) {
      productRequests[handle] = fetch(ROOT + 'products/' + encodeURIComponent(handle) + '.js', { headers: { Accept: 'application/json' } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .catch(function () { return undefined; })
        .then(function (product) {
          // A network failure (undefined) isn't cached, so the next render retries
          if (product === undefined) delete productRequests[handle];
          else products[handle] = product;
          return product || null;
        });
    }
    return productRequests[handle];
  }

  var moneyFormatter = null;
  function formatMoney(cents) {
    if (!moneyFormatter) {
      var currency = (window.Shopify && Shopify.currency && Shopify.currency.active) || config.currency || 'USD';
      var locale = (window.Shopify && Shopify.locale) || document.documentElement.lang || undefined;
      try {
        moneyFormatter = new Intl.NumberFormat(locale, { style: 'currency', currency: currency });
      } catch (e) {
        moneyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
      }
    }
    return moneyFormatter.format((Number(cents) || 0) / 100);
  }

  function sizedImage(src, width) {
    if (!src) return '';
    var url = typeof src === 'string' ? src : src.src || '';
    if (!url) return '';
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'width=' + width;
  }

  function pickVariant(product, preferredId) {
    var variants = product.variants || [];
    return variants.find(function (variant) { return String(variant.id) === String(preferredId); })
      || variants.find(function (variant) { return variant.available; })
      || variants[0]
      || null;
  }

  function hasOnlyDefaultVariant(product) {
    return !product.variants || product.variants.length <= 1;
  }

  // Adds the variants to the cart, then sends the customer to checkout.
  function buyNow(lines, button) {
    if (!lines.length) return Promise.resolve();
    setBusy(button, true);
    return fetch(ROOT + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: lines.map(function (id) { return { id: Number(id), quantity: 1 }; }) }),
    }).then(function (response) {
      if (response.ok) {
        window.location.href = ROOT + 'checkout';
        return;
      }
      return response.json().catch(function () { return {}; }).then(function (error) {
        throw new Error(error.description || error.message || TEXT.cartError);
      });
    }).catch(function (error) {
      setBusy(button, false);
      toast(error && error.message && error.message !== 'Failed to fetch' ? error.message : TEXT.cartError);
    });
  }

  function setBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle('wl-is-busy', busy);
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  // ---------------------------------------------------------------------------
  // Icons, toast and dialogs
  // ---------------------------------------------------------------------------

  var HEART_SVG = '<svg class="wl-heart__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M12 20.5C12 20.5 4.5 15.9 2.4 11.3C1 8 2.8 4.5 6.3 4.5C8.4 4.5 10.1 5.7 11 7.2L12 8.4L13 7.2C13.9 5.7 15.6 4.5 17.7 4.5C21.2 4.5 23 8 21.6 11.3C19.5 15.9 12 20.5 12 20.5Z"/></svg>';
  var CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var SHARE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15V3M7 8l5-5 5 5M5 12v8h14v-8"/></svg>';
  var MAIL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18v14H3zM3 6l9 7 9-7"/></svg>';
  var SMS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16v12H8l-4 4z"/></svg>';
  var LINK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';

  var toastTimer = null;
  function toast(message, action) {
    var el = document.querySelector('.wl-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'wl-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.innerHTML = '<span class="wl-toast__message">' + escapeHtml(message) + '</span>';
    if (action) {
      var link = document.createElement(action.href ? 'a' : 'button');
      link.className = 'wl-toast__action';
      link.textContent = action.label;
      if (action.href) link.href = action.href;
      else {
        link.type = 'button';
        link.addEventListener('click', function () { hideToast(); action.onClick(); });
      }
      el.appendChild(link);
    }
    // Restart the slide-in when a second toast replaces the first
    el.classList.remove('wl-is-visible');
    void el.offsetWidth;
    el.classList.add('wl-is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 5000 : 3000);
  }

  function hideToast() {
    var el = document.querySelector('.wl-toast');
    if (el) el.classList.remove('wl-is-visible');
  }

  // Opens a modal <dialog> (a bottom sheet on phones). `build` fills the body
  // and gets a close() function.
  function openDialog(title, build) {
    var dialog = document.createElement('dialog');
    dialog.className = 'wl-dialog';
    dialog.setAttribute('aria-labelledby', 'wl-dialog-title');
    dialog.innerHTML = '<div class="wl-dialog__panel">'
      + '<div class="wl-dialog__header"><h2 class="wl-dialog__title" id="wl-dialog-title">' + escapeHtml(title) + '</h2>'
      + '<button type="button" class="wl-icon-button wl-dialog__close" aria-label="' + escapeHtml(TEXT.cancel) + '">' + CLOSE_SVG + '</button></div>'
      + '<div class="wl-dialog__body"></div></div>';
    var opener = document.activeElement;

    function close() {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      dialog.remove();
      document.documentElement.classList.remove('wl-dialog-open');
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    }

    dialog.querySelector('.wl-dialog__close').addEventListener('click', close);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) close();
    });
    build(dialog.querySelector('.wl-dialog__body'), close);
    document.body.appendChild(dialog);
    document.documentElement.classList.add('wl-dialog-open');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    var focusTarget = dialog.querySelector('[autofocus]') || dialog.querySelector('.wl-dialog__body button, .wl-dialog__body input');
    if (focusTarget) focusTarget.focus();
    return close;
  }

  function buttonClass(kind) {
    var themeClass = kind === 'primary' ? config.buttonClass : config.secondaryButtonClass;
    return 'wl-btn wl-btn--' + kind + (themeClass ? ' ' + themeClass : '');
  }

  function askForName(title, initial, onSubmit) {
    openDialog(title, function (body, close) {
      body.innerHTML = '<form class="wl-form">'
        + '<input class="wl-input" type="text" name="name" maxlength="' + NAME_MAX + '" required autocomplete="off" autofocus'
        + ' aria-label="' + escapeHtml(TEXT.newList) + '" placeholder="' + escapeHtml(TEXT.newListPlaceholder) + '" value="' + escapeHtml(initial || '') + '">'
        + '<div class="wl-dialog__actions">'
        + '<button type="button" class="' + buttonClass('secondary') + '" data-cancel>' + escapeHtml(TEXT.cancel) + '</button>'
        + '<button type="submit" class="' + buttonClass('primary') + '">' + escapeHtml(initial ? TEXT.rename : TEXT.create) + '</button>'
        + '</div></form>';
      var form = body.querySelector('form');
      body.querySelector('[data-cancel]').addEventListener('click', close);
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var value = form.elements.name.value.trim();
        if (!value) return;
        close();
        onSubmit(value);
      });
    });
  }

  function confirmDialog(message, confirmLabel, onConfirm) {
    openDialog(message, function (body, close) {
      body.innerHTML = '<div class="wl-dialog__actions">'
        + '<button type="button" class="' + buttonClass('secondary') + '" data-cancel>' + escapeHtml(TEXT.cancel) + '</button>'
        + '<button type="button" class="' + buttonClass('primary') + '" data-confirm>' + escapeHtml(confirmLabel) + '</button></div>';
      body.querySelector('[data-cancel]').addEventListener('click', close);
      body.querySelector('[data-confirm]').addEventListener('click', function () { close(); onConfirm(); });
    });
  }

  // ---------------------------------------------------------------------------
  // Hearts
  // ---------------------------------------------------------------------------

  function createHeart(handle, title, modifier) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'wl-heart' + (modifier ? ' wl-heart--' + modifier : '');
    button.dataset.wlHandle = handle;
    if (title) button.dataset.wlTitle = title;
    button.innerHTML = HEART_SVG;
    updateHeart(button);
    return button;
  }

  function updateHeart(button) {
    var handle = button.dataset.wlHandle;
    if (!button.querySelector('.wl-heart__icon')) button.insertAdjacentHTML('afterbegin', HEART_SVG);
    var saved = store.listsWith(handle).length > 0;
    button.classList.toggle('wl-is-active', saved);
    button.setAttribute('aria-pressed', saved ? 'true' : 'false');
    var label = t('save', { title: button.dataset.wlTitle || '' }).replace(/\s+/g, ' ');
    button.setAttribute('aria-label', label);
    if (!button.classList.contains('wl-heart--labelled')) button.title = label;
  }

  function updateAllHearts() {
    document.querySelectorAll('.wl-heart').forEach(updateHeart);
  }

  // The variant shown in the product form when the heart is on the product page.
  function currentVariantId(button) {
    if (button.dataset.wlVariant) return button.dataset.wlVariant;
    if (!button.hasAttribute('data-wl-product-form')) return null;
    var form = document.querySelector(config.productFormSelector || 'product-form form[action*="/cart/add"], form[action*="/cart/add"][id^="product-form"], form[action*="/cart/add"]');
    var input = form && form.querySelector('[name="id"]');
    return input ? input.value : null;
  }

  function onHeartClick(button) {
    var handle = button.dataset.wlHandle;
    if (!validHandle(handle)) return;
    var variantId = currentVariantId(button);
    var lists = store.lists();

    if (lists.length > 1) {
      openPicker(handle, variantId, button.dataset.wlTitle);
      return;
    }

    var list = lists[0];
    if (store.has(list.id, handle)) {
      store.removeItem(list.id, handle);
      toast(t('removed', { list: list.name }));
    } else if (store.add(list.id, handle, variantId)) {
      pop(button);
      toast(t('saved', { list: list.name }), {
        label: TEXT.change,
        onClick: function () { openPicker(handle, variantId, button.dataset.wlTitle); },
      });
    }
  }

  function pop(button) {
    button.classList.remove('wl-is-popping');
    void button.offsetWidth;
    button.classList.add('wl-is-popping');
  }

  // Lets the customer tick which lists a product belongs to, or start a new one.
  function openPicker(handle, variantId, title) {
    openDialog(TEXT.pickerTitle, function (body, close) {
      function render() {
        body.innerHTML = (title ? '<p class="wl-dialog__subtitle">' + escapeHtml(title) + '</p>' : '')
          + '<ul class="wl-picker">' + store.lists().map(function (list) {
            var checked = store.has(list.id, handle);
            return '<li><label class="wl-picker__row">'
              + '<input type="checkbox" class="wl-checkbox" value="' + escapeHtml(list.id) + '"' + (checked ? ' checked' : '') + '>'
              + '<span class="wl-picker__name">' + escapeHtml(list.name) + '</span>'
              + '<span class="wl-picker__count">' + list.items.length + '</span></label></li>';
          }).join('') + '</ul>'
          + '<form class="wl-picker__new">'
          + '<input class="wl-input" name="name" maxlength="' + NAME_MAX + '" autocomplete="off" aria-label="' + escapeHtml(TEXT.newList) + '" placeholder="' + escapeHtml(TEXT.newList) + '">'
          + '<button type="submit" class="' + buttonClass('secondary') + '">' + escapeHtml(TEXT.create) + '</button></form>'
          + '<div class="wl-dialog__actions">'
          + '<a class="' + buttonClass('secondary') + '" href="' + escapeHtml(PAGE_PATH) + '">' + escapeHtml(TEXT.view) + '</a>'
          + '<button type="button" class="' + buttonClass('primary') + '" data-done>' + escapeHtml(TEXT.done) + '</button></div>';

        body.querySelectorAll('.wl-checkbox').forEach(function (box) {
          box.addEventListener('change', function () {
            if (box.checked) {
              if (!store.add(box.value, handle, variantId)) box.checked = false;
            } else {
              store.removeItem(box.value, handle);
            }
            var count = box.closest('label').querySelector('.wl-picker__count');
            count.textContent = store.get(box.value).items.length;
          });
        });
        body.querySelector('.wl-picker__new').addEventListener('submit', function (event) {
          event.preventDefault();
          var name = event.target.elements.name.value.trim();
          if (!name) return;
          var list = store.create(name);
          if (list) store.add(list.id, handle, variantId);
          render();
        });
        body.querySelector('[data-done]').addEventListener('click', close);
      }
      render();
    });
  }

  // Delegated, in the capture phase, so a heart inside a product link never
  // follows the link and the theme's own click handlers don't see the tap.
  document.addEventListener('click', function (event) {
    var heart = event.target.closest && event.target.closest('.wl-heart');
    if (!heart) return;
    event.preventDefault();
    event.stopPropagation();
    onHeartClick(heart);
  }, true);

  // ---------------------------------------------------------------------------
  // Finding product cards, the product page and the header
  // ---------------------------------------------------------------------------

  var CARD_SELECTOR = config.cardSelector
    || '.card-wrapper, .product-card, .product-item, .grid-product, .product-grid-item, .grid-view-item, [data-product-card]';
  var CARD_MEDIA_SELECTOR = config.cardMediaSelector
    || '.card__inner, .card__media, .product-card__image, .product-card__media, .product-item__image, .grid-product__image, .grid-view-item__image-wrapper';
  var IGNORE_SELECTOR = 'cart-drawer, cart-notification, #CartDrawer, .cart-drawer, predictive-search, .predictive-search, .wl-root, .wl-dialog, [data-wishlist-ignore]';

  function handleFromUrl(href) {
    var match = /\/products\/([^\/?#]+)/.exec(href || '');
    if (!match) return null;
    try {
      var handle = decodeURIComponent(match[1]);
      return validHandle(handle) ? handle : null;
    } catch (e) {
      return null;
    }
  }

  function decorateCards(root) {
    root.querySelectorAll(CARD_SELECTOR).forEach(function (card) {
      if (card.hasAttribute('data-wl-done')) return;
      card.setAttribute('data-wl-done', '');
      if (card.closest(IGNORE_SELECTOR)) return;
      // An explicit heart from snippets/wishlist-heart.liquid wins
      if (card.querySelector('.wl-heart')) return;
      // Themes that nest one card selector inside another get one heart, on the inner card
      if (card.querySelector(CARD_SELECTOR)) return;

      var link = card.querySelector('a[href*="/products/"]');
      var handle = link && handleFromUrl(link.getAttribute('href'));
      if (!handle) return;

      var titleEl = card.querySelector('.card__heading, [class*="title"], h2, h3');
      var title = (titleEl || link).textContent.replace(/\s+/g, ' ').trim();

      var image = card.querySelector('img');
      var media = card.querySelector(CARD_MEDIA_SELECTOR) || (image && image.parentElement) || card;
      if (window.getComputedStyle(media).position === 'static') media.classList.add('wl-anchor');
      media.appendChild(createHeart(handle, title, 'card'));
    });
  }

  function decorateProductPage() {
    var product = config.product;
    if (!product || !validHandle(product.handle) || document.querySelector('.wl-heart--product')) return;

    var heart = createHeart(product.handle, product.title, 'product');
    heart.classList.add('wl-heart--labelled');
    if (config.productButtonClass) heart.className += ' ' + config.productButtonClass;
    heart.setAttribute('data-wl-product-form', '');
    heart.insertAdjacentHTML('beforeend', '<span class="wl-heart__label" data-saved="' + escapeHtml(config.savedLabel || 'Saved to wishlist') + '" data-unsaved="' + escapeHtml(config.addLabel || 'Add to wishlist') + '"></span>');

    var placeholder = document.querySelector('[data-wishlist-product-button]');
    if (placeholder) {
      placeholder.appendChild(heart);
      return;
    }
    var buttons = document.querySelector(config.productButtonsSelector || '.product-form__buttons');
    if (buttons) {
      buttons.appendChild(heart);
      return;
    }
    var submit = document.querySelector('form[action*="/cart/add"] [type="submit"]');
    if (submit && submit.parentElement) submit.parentElement.insertBefore(heart, submit.nextSibling);
  }

  function decorateHeader() {
    if (config.headerIcon === false || document.querySelector('.wl-header-link')) return;
    var cart = document.querySelector(config.headerCartSelector || '#cart-icon-bubble, .header__icon--cart, .site-header__cart, a[href$="/cart"][class*="header"]');
    var link = document.createElement('a');
    link.href = PAGE_PATH;
    link.innerHTML = '<span class="svg-wrapper wl-header-link__icon">' + HEART_SVG.replace('wl-heart__icon', 'wl-header-link__svg') + '</span>'
      + '<span class="wl-count" hidden></span><span class="visually-hidden wl-visually-hidden">' + escapeHtml(TEXT.heading) + '</span>';

    if (cart && cart.parentElement) {
      // Borrow the cart icon's classes so the heart lines up with the theme's own header icons
      var classes = cart.className.split(/\s+/).filter(function (name) { return name && !/cart/i.test(name); });
      link.className = 'wl-header-link ' + classes.join(' ');
      cart.parentElement.insertBefore(link, cart);
    } else {
      link.className = 'wl-header-link wl-header-link--floating';
      document.body.appendChild(link);
    }
    updateCount();
  }

  function updateCount() {
    var count = store.totalCount();
    document.querySelectorAll('.wl-count').forEach(function (bubble) {
      bubble.textContent = count > 99 ? '99+' : String(count);
      bubble.hidden = count === 0;
    });
    document.querySelectorAll('.wl-header-link').forEach(function (link) {
      link.setAttribute('aria-label', TEXT.heading + (count ? ' (' + count + ')' : ''));
    });
  }

  // ---------------------------------------------------------------------------
  // Sharing. The link holds the list itself: ?shared=<base64url of JSON>.
  // ---------------------------------------------------------------------------

  function encodeList(list) {
    var json = JSON.stringify({
      n: list.name,
      i: list.items.map(function (item) { return item.v ? [item.h, item.v] : [item.h]; }),
    });
    var bytes = new TextEncoder().encode(json);
    var binary = '';
    bytes.forEach(function (byte) { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeList(value) {
    try {
      var base64 = value.replace(/-/g, '+').replace(/_/g, '/');
      var binary = atob(base64 + '==='.slice((base64.length + 3) % 4));
      var bytes = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
      var data = JSON.parse(new TextDecoder().decode(bytes));
      if (!data || !Array.isArray(data.i)) return null;
      var seen = {};
      var items = data.i.filter(function (entry) {
        if (!Array.isArray(entry) || !validHandle(entry[0]) || seen[entry[0]]) return false;
        seen[entry[0]] = true;
        return true;
      }).slice(0, MAX_ITEMS).map(function (entry) {
        return { h: entry[0], v: validVariant(entry[1]) ? String(entry[1]) : null, t: 0 };
      });
      return { name: cleanName(data.n), items: items };
    } catch (e) {
      return null;
    }
  }

  function shareUrl(list) {
    return window.location.origin + PAGE_PATH + '?shared=' + encodeList(list);
  }

  function isApplePhone() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function openShare(list) {
    if (!list.items.length) {
      toast(TEXT.shareEmptyNote);
      return;
    }
    var url = shareUrl(list);
    var message = t('shareMessage', { list: list.name, shop: config.shopName || document.title });
    var smsBody = encodeURIComponent(message + ' ' + url);
    // iOS reads the body after "&", Android after "?"
    var smsHref = isApplePhone() ? 'sms:&body=' + smsBody : 'sms:?body=' + smsBody;
    var shop = config.shopName || document.title;
    var mailHref = 'mailto:?subject=' + encodeURIComponent(t('emailSubject', { list: list.name, shop: shop }))
      + '&body=' + encodeURIComponent(message + '\n\n' + url);

    openDialog(t('shareTitle', { list: list.name }), function (body) {
      body.innerHTML = '<div class="wl-share">'
        + '<a class="wl-share__option" href="' + escapeHtml(mailHref) + '">' + MAIL_SVG + '<span>' + escapeHtml(TEXT.email) + '</span></a>'
        + '<a class="wl-share__option" href="' + escapeHtml(smsHref) + '">' + SMS_SVG + '<span>' + escapeHtml(TEXT.text) + '</span></a>'
        + '<button type="button" class="wl-share__option" data-copy>' + LINK_SVG + '<span>' + escapeHtml(TEXT.copyLink) + '</span></button>'
        + (navigator.share ? '<button type="button" class="wl-share__option" data-native>' + SHARE_SVG + '<span>' + escapeHtml(TEXT.more) + '</span></button>' : '')
        + '</div>'
        + '<input class="wl-input wl-share__url" type="text" readonly aria-label="' + escapeHtml(TEXT.copyLink) + '" value="' + escapeHtml(url) + '">';

      var input = body.querySelector('.wl-share__url');
      input.addEventListener('focus', function () { input.select(); });
      body.querySelector('[data-copy]').addEventListener('click', function () {
        copyText(url, input).then(function () { toast(TEXT.copied); });
      });
      var native = body.querySelector('[data-native]');
      if (native) {
        native.addEventListener('click', function () {
          navigator.share({ title: list.name, text: message, url: url }).catch(function () {});
        });
      }
    });
  }

  function copyText(text, fallbackInput) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(fallbackInput); });
    }
    return legacyCopy(fallbackInput);
  }

  function legacyCopy(input) {
    input.focus();
    input.select();
    try { document.execCommand('copy'); } catch (e) { /* the link stays selected for a manual copy */ }
    return Promise.resolve();
  }

  // ---------------------------------------------------------------------------
  // The wishlist page
  // ---------------------------------------------------------------------------

  function mountPage() {
    var root = document.querySelector('[data-wishlist-page]');
    var onPage = window.location.pathname.replace(/\/$/, '') === PAGE_PATH.replace(/\/$/, '');
    if (!root && onPage) {
      // The page exists but doesn't use the wishlist template; put the app in its content area
      var main = document.querySelector('#MainContent .page-width, #MainContent, main');
      if (!main) return;
      root = document.createElement('div');
      root.setAttribute('data-wishlist-page', '');
      main.appendChild(root);
    }
    if (!root) return;
    root.classList.add('wl-root');

    var heading = root.getAttribute('data-heading') || TEXT.heading;
    var sharedParam = new URLSearchParams(window.location.search).get('shared');
    if (sharedParam !== null) {
      renderShared(root, heading, decodeList(sharedParam));
    } else {
      renderLists(root, heading);
      document.addEventListener('wishlist:change', function () { renderLists(root, heading); });
    }
  }

  function renderLists(root, heading) {
    var lists = store.lists();
    var active = store.active();
    var count = active.items.length;

    root.innerHTML = '<div class="wl-page">'
      + '<h1 class="wl-page__title">' + escapeHtml(heading) + '</h1>'
      + '<div class="wl-tabs" role="tablist" aria-label="' + escapeHtml(heading) + '">'
      + lists.map(function (list) {
        var selected = list.id === active.id;
        return '<button type="button" role="tab" class="wl-tab" data-list="' + escapeHtml(list.id) + '" aria-selected="' + selected + '"' + (selected ? '' : ' tabindex="-1"') + '>'
          + '<span class="wl-tab__name">' + escapeHtml(list.name) + '</span><span class="wl-tab__count">' + list.items.length + '</span></button>';
      }).join('')
      + '<button type="button" class="wl-tab wl-tab--new" data-new-list>+ ' + escapeHtml(TEXT.newList) + '</button>'
      + '</div>'
      + '<div class="wl-bar" role="tabpanel">'
      + '<div class="wl-bar__info"><h2 class="wl-bar__name">' + escapeHtml(active.name) + '</h2>'
      + '<p class="wl-bar__count">' + escapeHtml(count === 1 ? TEXT.item : t('items', { count: count })) + '</p></div>'
      + '<div class="wl-bar__actions">'
      + '<button type="button" class="wl-link-button" data-share>' + SHARE_SVG + '<span>' + escapeHtml(TEXT.share) + '</span></button>'
      + '<button type="button" class="wl-link-button" data-rename>' + escapeHtml(TEXT.rename) + '</button>'
      + '<button type="button" class="wl-link-button" data-delete>' + escapeHtml(TEXT.delete) + '</button>'
      + '</div></div>'
      + (count
        ? '<ul class="wl-grid">' + active.items.map(function (item) { return itemShell(item.h); }).join('') + '</ul>'
          + '<div class="wl-footer"><button type="button" class="' + buttonClass('primary') + ' wl-buy-all" data-buy-all disabled>' + escapeHtml(t('buyAll', { count: count })) + '</button></div>'
        : emptyState())
      + '</div>';

    root.querySelectorAll('[data-list]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        store.setActive(tab.dataset.list);
        renderLists(root, heading);
        var selected = root.querySelector('.wl-tab[aria-selected="true"]');
        if (selected) selected.focus();
      });
    });
    root.querySelector('.wl-tabs').addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-list]'));
      var index = tabs.indexOf(document.activeElement);
      if (index === -1) return;
      var next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.click();
    });
    root.querySelector('[data-new-list]').addEventListener('click', function () {
      askForName(TEXT.newList, '', function (name) { store.create(name); });
    });
    root.querySelector('[data-share]').addEventListener('click', function () { openShare(active); });
    root.querySelector('[data-rename]').addEventListener('click', function () {
      askForName(TEXT.rename, active.name, function (name) { store.rename(active.id, name); });
    });
    root.querySelector('[data-delete]').addEventListener('click', function () {
      confirmDialog(t('deleteConfirm', { list: active.name }), TEXT.delete, function () { store.remove(active.id); });
    });

    fillItems(root, active.items, {
      editable: true,
      listId: active.id,
      otherLists: lists.filter(function (list) { return list.id !== active.id; }),
    });
  }

  function renderShared(root, heading, shared) {
    if (!shared) {
      root.innerHTML = '<div class="wl-page"><h1 class="wl-page__title">' + escapeHtml(heading) + '</h1>'
        + '<p class="wl-empty__body">' + escapeHtml(TEXT.badLink) + '</p>'
        + '<p><a class="' + buttonClass('secondary') + '" href="' + escapeHtml(PAGE_PATH) + '">' + escapeHtml(heading) + '</a></p></div>';
      return;
    }
    var count = shared.items.length;
    root.innerHTML = '<div class="wl-page wl-page--shared">'
      + '<p class="wl-eyebrow">' + escapeHtml(TEXT.sharedEyebrow) + '</p>'
      + '<h1 class="wl-page__title">' + escapeHtml(shared.name) + '</h1>'
      + '<div class="wl-bar"><p class="wl-bar__count">' + escapeHtml(count === 1 ? TEXT.item : t('items', { count: count })) + '</p>'
      + '<div class="wl-bar__actions"><button type="button" class="wl-link-button" data-save-copy>' + HEART_SVG.replace('wl-heart__icon', 'wl-link-button__heart') + '<span>' + escapeHtml(TEXT.saveCopy) + '</span></button></div></div>'
      + (count
        ? '<ul class="wl-grid">' + shared.items.map(function (item) { return itemShell(item.h); }).join('') + '</ul>'
          + '<div class="wl-footer"><button type="button" class="' + buttonClass('primary') + ' wl-buy-all" data-buy-all disabled>' + escapeHtml(t('buyAll', { count: count })) + '</button></div>'
        : emptyState())
      + '</div>';

    root.querySelector('[data-save-copy]').addEventListener('click', function () {
      var list = store.create(shared.name);
      if (!list) return;
      list.items = shared.items.map(function (item) { return { h: item.h, v: item.v, t: Date.now() }; });
      store.save();
      toast(TEXT.savedCopy, { label: TEXT.view, href: PAGE_PATH });
    });

    fillItems(root, shared.items, { editable: false });
  }

  function emptyState() {
    return '<div class="wl-empty">' + HEART_SVG.replace('wl-heart__icon', 'wl-empty__icon')
      + '<p class="wl-empty__title">' + escapeHtml(TEXT.emptyTitle) + '</p>'
      + '<p class="wl-empty__body">' + escapeHtml(TEXT.emptyBody) + '</p>'
      + '<a class="' + buttonClass('secondary') + '" href="' + escapeHtml(config.continueUrl || ROOT + 'collections/all') + '">' + escapeHtml(TEXT.continueShopping) + '</a></div>';
  }

  function itemShell(handle) {
    return '<li class="wl-item wl-is-loading" data-handle="' + escapeHtml(handle) + '">'
      + '<div class="wl-item__media"></div><div class="wl-item__info"><span class="wl-skeleton"></span><span class="wl-skeleton wl-skeleton--short"></span></div></li>';
  }

  // Fills each item card once its product data arrives, then enables "Buy all".
  function fillItems(root, items, options) {
    var chosen = {};
    var buyAll = root.querySelector('[data-buy-all]');
    // A newer render (another list, an item removed) replaces this one; its
    // late product responses must not fill the new cards
    var renderId = uid();
    root.setAttribute('data-wl-render', renderId);
    function current() { return root.getAttribute('data-wl-render') === renderId; }

    var pending = items.map(function (item) {
      return fetchProduct(item.h).then(function (product) {
        var el = current() && root.querySelector('.wl-item[data-handle="' + cssEscape(item.h) + '"]');
        if (!el) return;
        var variant = product ? pickVariant(product, item.v) : null;
        chosen[item.h] = { product: product, variant: variant };
        el.outerHTML = itemCard(item, product, variant, options);
        bindItem(root.querySelector('.wl-item[data-handle="' + cssEscape(item.h) + '"]'), item, product, chosen, options);
      });
    });

    if (!buyAll) return;
    Promise.all(pending).then(function () {
      if (!current()) return;
      var available = items.filter(function (item) {
        var entry = chosen[item.h];
        return entry && entry.variant && entry.variant.available;
      });
      buyAll.disabled = available.length === 0;
      buyAll.textContent = t('buyAll', { count: available.length });
      buyAll.addEventListener('click', function () {
        var lines = items.map(function (item) { return chosen[item.h]; })
          .filter(function (entry) { return entry && entry.variant && entry.variant.available; })
          .map(function (entry) { return entry.variant.id; });
        var skipped = items.length - lines.length;
        if (skipped) toast(t('someUnavailable', { count: skipped }));
        buyNow(lines, buyAll);
      });
    });
  }

  function itemCard(item, product, variant, options) {
    var removeButton = options.editable
      ? '<button type="button" class="wl-icon-button wl-item__remove" data-remove aria-label="' + escapeHtml(t('remove', { title: product ? product.title : item.h })) + '">' + CLOSE_SVG + '</button>'
      : '';

    if (!product) {
      return '<li class="wl-item wl-item--gone" data-handle="' + escapeHtml(item.h) + '">'
        + '<div class="wl-item__media"></div>' + removeButton
        + '<div class="wl-item__info"><p class="wl-item__title">' + escapeHtml(item.h.replace(/-/g, ' ')) + '</p>'
        + '<p class="wl-item__note">' + escapeHtml(TEXT.unavailable) + '</p></div></li>';
    }

    var url = ROOT + 'products/' + encodeURIComponent(product.handle) + (variant && !hasOnlyDefaultVariant(product) ? '?variant=' + variant.id : '');
    var image = (variant && variant.featured_image && variant.featured_image.src) || product.featured_image;
    var imageAlt = (variant && variant.featured_image && variant.featured_image.alt) || product.title;

    var variantSelect = '';
    if (!hasOnlyDefaultVariant(product)) {
      variantSelect = '<label class="wl-item__variant"><span class="wl-visually-hidden">' + escapeHtml(product.options && product.options.length === 1 ? product.options[0].name || TEXT.variant : TEXT.variant) + '</span>'
        + '<select class="wl-select" data-variant>' + product.variants.map(function (option) {
          return '<option value="' + option.id + '"' + (variant && option.id === variant.id ? ' selected' : '') + '>'
            + escapeHtml(option.title) + (option.available ? '' : ' \u2014 ' + escapeHtml(TEXT.soldOut)) + '</option>';
        }).join('') + '</select></label>';
    }

    var moveSelect = '';
    if (options.editable && options.otherLists.length) {
      moveSelect = '<select class="wl-select wl-select--quiet" data-move aria-label="' + escapeHtml(TEXT.moveTo) + '"><option value="">' + escapeHtml(TEXT.moveTo) + '</option>'
        + options.otherLists.map(function (list) {
          return '<option value="' + escapeHtml(list.id) + '">' + escapeHtml(list.name) + '</option>';
        }).join('') + '</select>';
    }

    var available = variant && variant.available;
    return '<li class="wl-item" data-handle="' + escapeHtml(item.h) + '">'
      + '<a class="wl-item__media" href="' + escapeHtml(url) + '" tabindex="-1" aria-hidden="true">'
      + (image ? '<img src="' + escapeHtml(sizedImage(image, 600)) + '" srcset="' + escapeHtml(sizedImage(image, 300)) + ' 300w, ' + escapeHtml(sizedImage(image, 600)) + ' 600w, ' + escapeHtml(sizedImage(image, 900)) + ' 900w" sizes="(min-width: 990px) 300px, 50vw" alt="' + escapeHtml(imageAlt) + '" loading="lazy">' : '')
      + '</a>' + removeButton
      + '<div class="wl-item__info">'
      + '<a class="wl-item__title" href="' + escapeHtml(url) + '">' + escapeHtml(product.title) + '</a>'
      + '<p class="wl-item__price">' + priceHtml(variant) + '</p>'
      + variantSelect
      + '<button type="button" class="' + buttonClass('primary') + ' wl-item__buy" data-buy' + (available ? '' : ' disabled') + '>'
      + escapeHtml(available ? TEXT.buyNow : TEXT.soldOut) + '</button>'
      + moveSelect
      + '</div></li>';
  }

  function priceHtml(variant) {
    if (!variant) return '';
    var onSale = variant.compare_at_price && variant.compare_at_price > variant.price;
    return (onSale ? '<s class="wl-item__compare">' + escapeHtml(formatMoney(variant.compare_at_price)) + '</s> ' : '')
      + '<span>' + escapeHtml(formatMoney(variant.price)) + '</span>';
  }

  function bindItem(el, item, product, chosen, options) {
    if (!el) return;
    var remove = el.querySelector('[data-remove]');
    if (remove) remove.addEventListener('click', function () { store.removeItem(options.listId, item.h); });
    if (!product) return;

    var buy = el.querySelector('[data-buy]');
    buy.addEventListener('click', function () {
      var variant = chosen[item.h].variant;
      if (variant && variant.available) buyNow([variant.id], buy);
    });

    var select = el.querySelector('[data-variant]');
    if (select) {
      select.addEventListener('change', function () {
        var variant = pickVariant(product, select.value);
        chosen[item.h].variant = variant;
        if (options.editable) store.setVariant(options.listId, item.h, variant.id);
        el.querySelector('.wl-item__price').innerHTML = priceHtml(variant);
        buy.disabled = !variant.available;
        buy.textContent = variant.available ? TEXT.buyNow : TEXT.soldOut;
        var image = variant.featured_image && variant.featured_image.src;
        var img = el.querySelector('.wl-item__media img');
        if (image && img) {
          img.src = sizedImage(image, 600);
          img.srcset = [300, 600, 900].map(function (w) { return sizedImage(image, w) + ' ' + w + 'w'; }).join(', ');
        }
      });
    }

    var move = el.querySelector('[data-move]');
    if (move) {
      move.addEventListener('change', function () {
        if (!move.value) return;
        var target = store.get(move.value);
        store.move(options.listId, move.value, item.h);
        if (target) toast(t('saved', { list: target.name }));
      });
    }
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
  }

  // ---------------------------------------------------------------------------
  // Start-up
  // ---------------------------------------------------------------------------

  function decorate() {
    decorateCards(document);
    decorateProductPage();
    decorateHeader();
    updateAllHearts();
  }

  function start() {
    store.load();
    decorate();
    mountPage();

    document.addEventListener('wishlist:change', function () {
      updateAllHearts();
      updateCount();
    });

    // Another tab changed the wishlists
    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY) return;
      store.load();
      emitChange();
    });

    // Filters, infinite scroll, recommendations and quick view add cards later
    var scheduled = false;
    new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        decorate();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // A small API for theme customisations, e.g. Wishlist.open()
  window.Wishlist = {
    count: function () { return store.totalCount(); },
    lists: function () { return JSON.parse(JSON.stringify(store.lists())); },
    add: function (handle, variantId) { return store.add(store.active().id, handle, variantId); },
    refresh: decorate,
    open: function () { window.location.href = PAGE_PATH; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
