// Complete Suite of Scriptlet Stubs & Anti-Adblock Defusers
// Executes in the page's MAIN world context at document_start

(() => {
  "use strict";

  // Prevent duplicate execution
  if (Object.prototype.hasOwnProperty.call(window, "__shieldblock_defusers_active")) return;
  Object.defineProperty(window, "__shieldblock_defusers_active", {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false
  });

  const noop = () => {};
  const noopReturnThis = function () { return this; };
  const safeAsync = (fn) => {
    if (typeof fn === "function") {
      setTimeout(() => {
        try { fn(); } catch (_) {}
      }, 0);
    }
  };

  // Helper to lock immutable properties
  const defineImmutable = (obj, prop, value) => {
    try {
      Object.defineProperty(obj, prop, {
        value,
        writable: false,
        configurable: false
      });
    } catch (_) {}
  };

  // ==========================================
  // 1. Canary Anti-Adblock Flags
  // ==========================================
  defineImmutable(window, "canRunAds", true);
  defineImmutable(window, "canRunAdvertise", true);
  defineImmutable(window, "isAdBlockActive", false);
  defineImmutable(window, "adblockEnabled", false);
  defineImmutable(window, "googleAdSenseLoaded", true);

  // ==========================================
  // 2. Google AdSense & Google Publisher Tag (GPT)
  // ==========================================
  window.google_ad_client = window.google_ad_client || "ca-pub-0000000000000000";
  window.google_ad_slot = window.google_ad_slot || "0000000000";
  window.google_ad_width = window.google_ad_width || 300;
  window.google_ad_height = window.google_ad_height || 250;

  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.loaded = true;
  window.adsbygoogle.push = function (item) {
    if (item && typeof item === "object") {
      if (typeof item.callback === "function") safeAsync(item.callback);
      if (item.params && typeof item.params.onload === "function") safeAsync(item.params.onload);
    }
    return 0;
  };

  const mockSlot = {
    addService: noopReturnThis,
    setTargeting: noopReturnThis,
    defineSizeMapping: noopReturnThis,
    setCollapseEmptyDiv: noopReturnThis,
    clearTargeting: noopReturnThis
  };
  const mockPubAds = {
    enableSingleRequest: noop,
    collapseEmptyDivs: noop,
    setTargeting: noopReturnThis,
    clearTargeting: noopReturnThis,
    refresh: noop,
    addEventListener: noopReturnThis,
    getSlots: () => []
  };

  window.googletag = window.googletag || {};
  window.googletag.apiReady = true;
  window.googletag.cmd = window.googletag.cmd || [];
  window.googletag.cmd.push = (fn) => safeAsync(fn);
  window.googletag.pubads = () => mockPubAds;
  window.googletag.defineSlot = () => mockSlot;
  window.googletag.defineOutOfPageSlot = () => mockSlot;
  window.googletag.enableServices = noop;
  window.googletag.display = noop;
  window.googletag.destroySlots = noop;

  // ==========================================
  // 3. Header Bidding & SSP Wrappers (Prebid & Amazon)
  // ==========================================
  window.pbjs = window.pbjs || {};
  window.pbjs.que = window.pbjs.que || [];
  window.pbjs.que.push = (fn) => safeAsync(fn);
  window.pbjs.requestBids = (opts) => {
    if (opts && typeof opts.bidsBackHandler === "function") {
      safeAsync(() => opts.bidsBackHandler({}));
    }
  };
  window.pbjs.setConfig = noop;
  window.pbjs.addAdUnits = noop;
  window.pbjs.adUnits = [];

  window.apstag = window.apstag || {
    init: noop,
    fetchBids: (opts, cb) => {
      if (typeof cb === "function") safeAsync(() => cb([]));
    },
    setDisplayBids: noop
  };

  // ==========================================
  // 4. Native & Video Ad Players (Google IMA, Taboola, Outbrain)
  // ==========================================
  window.google = window.google || {};
  window.google.ima = window.google.ima || {
    AdDisplayContainer: function () {
      this.initialize = noop;
      this.destroy = noop;
    },
    AdsLoader: function () {
      this.contentComplete = noop;
      this.requestAds = noop;
      this.addEventListener = (type, handler) => {
        // Trigger all ads completed/error immediately so player jumps to content
        if (type === "allAdsCompleted" || type === "adError") safeAsync(handler);
      };
    },
    AdsManager: function () {
      this.init = noop;
      this.start = noop;
      this.stop = noop;
      this.destroy = noop;
      this.addEventListener = noop;
    },
    AdsRenderingSettings: function () {},
    AdsRequest: function () {}
  };

  window._taboola = window._taboola || [];
  window._taboola.push = noop;
  window.OBR = window.OBR || { loaded: true, on: noop };

  // ==========================================
  // 5. Analytics, Pixels & Telemetry
  // ==========================================
  window.dataLayer = window.dataLayer || [];
  const origDataLayerPush = window.dataLayer.push.bind(window.dataLayer);
  window.dataLayer.push = function (...args) {
    for (const arg of args) {
      if (arg && typeof arg === "object" && typeof arg.eventCallback === "function") {
        safeAsync(arg.eventCallback);
      }
    }
    return origDataLayerPush(...args);
  };

  window.gtag = window.gtag || function (...args) {
    const params = args[2];
    if (params && typeof params === "object" && typeof params.event_callback === "function") {
      safeAsync(params.event_callback);
    }
  };

  window.ga = window.ga || function (...args) {
    const lastArg = args[args.length - 1];
    if (lastArg && typeof lastArg === "object" && typeof lastArg.hitCallback === "function") {
      safeAsync(lastArg.hitCallback);
    }
  };
  window.ga.q = window.ga.q || [];
  window.ga.l = Date.now();
  window.ga.getAll = () => [];
  window.ga.create = () => ({ get: noop, set: noop, send: noop });

  // Social Pixels
  window.fbq = window.fbq || function () {};
  window.fbq.loaded = true;
  window.fbq.version = "2.0";
  window.fbq.queue = [];
  window._fbq = window.fbq;

  window.twq = window.twq || noop;
  window.lintrk = window.lintrk || noop;
  window.ttq = window.ttq || { track: noop, page: noop, identify: noop, load: noop };

  // Telemetry & Product Analytics
  window.hj = window.hj || noop;
  window.FS = window.FS || { identify: noop, track: noop, event: noop };
  window.mixpanel = window.mixpanel || { track: noop, identify: noop, init: noop };
  window.analytics = window.analytics || {
    track: (e, p, o, cb) => safeAsync(cb),
    page: (c, n, p, o, cb) => safeAsync(cb),
    identify: (id, t, o, cb) => safeAsync(cb)
  };
  window.clarity = window.clarity || noop;
  window.ym = window.ym || noop;

  // ==========================================
  // 6. BlockAdBlock / FuckAdBlock Defusers
  // ==========================================
  const mockAntiAdblock = {
    onDetected: noopReturnThis,
    onNotDetected: function (fn) { safeAsync(fn); return this; },
    on: function (detected, fn) { if (!detected) safeAsync(fn); return this; },
    check: noop,
    setOption: noopReturnThis
  };
  defineImmutable(window, "blockAdBlock", mockAntiAdblock);
  defineImmutable(window, "fuckAdBlock", mockAntiAdblock);
  defineImmutable(window, "sniffAdBlock", mockAntiAdblock);

  // ==========================================
  // 7. Bait Element Spoofing (offsetHeight / getComputedStyle)
  // ==========================================
  const BAIT_CLASS_REGEX = /(?:^|\s)(?:adsbox|ad-banner|pub_300x250|ad-placement|banner-ad)(?:\s|$)/i;

  const origGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function (el, pseudoElt) {
    const style = origGetComputedStyle.call(window, el, pseudoElt);
    if (el && el.className && typeof el.className === "string" && BAIT_CLASS_REGEX.test(el.className)) {
      return new Proxy(style, {
        get(target, prop) {
          if (prop === "display") return "block";
          if (prop === "visibility") return "visible";
          if (prop === "height") return "250px";
          if (prop === "width") return "300px";
          return typeof target[prop] === "function" ? target[prop].bind(target) : target[prop];
        }
      });
    }
    return style;
  };

  const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  if (origOffsetHeight && origOffsetHeight.get) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      get() {
        if (this.className && typeof this.className === "string" && BAIT_CLASS_REGEX.test(this.className)) {
          return 250;
        }
        return origOffsetHeight.get.call(this);
      },
      configurable: true
    });
  }

  // ==========================================
  // 8. Anti-Adblock Polling Timer & Scroll-Lock Defusers
  // ==========================================
  const origSetInterval = window.setInterval;
  const ADBLOCK_TIMER_REGEX = /adblock|canRunAds|isAdBlockActive|fuckAdBlock|blockAdBlock/i;
  window.setInterval = function (fn, delay, ...args) {
    if (typeof fn === "function" && ADBLOCK_TIMER_REGEX.test(fn.toString())) {
      return 0;
    }
    return origSetInterval.call(window, fn, delay, ...args);
  };

  // Restore scroll if anti-adblock overlay locks body overflow
  const restoreScroll = () => {
    if (document.body && document.body.style && document.body.style.overflow === "hidden") {
      document.body.style.removeProperty("overflow");
    }
    if (document.documentElement && document.documentElement.style && document.documentElement.style.overflow === "hidden") {
      document.documentElement.style.removeProperty("overflow");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", restoreScroll, { once: true });
  } else {
    restoreScroll();
  }
})();
