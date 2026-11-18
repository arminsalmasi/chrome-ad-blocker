// Ad-network stubs & anti-adblock defusers.
// Registered by background.js with world: "MAIN", runAt: "document_start",
// allFrames: true — only while the Ad Networks module is enabled.

(() => {
  "use strict";

  const FLAG = "__shieldblock_ads_stubs";
  if (window[FLAG]) return;
  try {
    Object.defineProperty(window, FLAG, { value: true });
  } catch (_) {
    return;
  }

  const noop = () => {};
  const noopReturnThis = function () { return this; };
  const safeAsync = (fn, ...args) => {
    if (typeof fn === "function") {
      setTimeout(() => {
        try { fn(...args); } catch (_) {}
      }, 0);
    }
  };

  // Pin a global to a value. Uses an accessor with a no-op setter so page
  // assignments (even in strict mode) silently keep our value instead of throwing.
  const pin = (obj, prop, value) => {
    try {
      Object.defineProperty(obj, prop, {
        get: () => value,
        set: noop,
        configurable: true,
        enumerable: false
      });
    } catch (_) {}
  };

  // ==========================================
  // 1. Canary anti-adblock flags
  // ==========================================
  pin(window, "canRunAds", true);
  pin(window, "canRunAdvertise", true);
  pin(window, "isAdBlockActive", false);
  pin(window, "adblockEnabled", false);
  pin(window, "googleAdSenseLoaded", true);

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

  // SDK surfaces are large and keep growing (e.g. GPT's getConfig/setConfig,
  // Prebid's getConfig). Any method we don't model explicitly resolves to a
  // safe fallback instead of throwing "x is not a function".
  const withFallback = (target, fallback) => new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === "symbol" || prop === "then" || prop === "toJSON") return undefined;
      return fallback;
    }
  });

  const mockSlot = withFallback({
    addService: noopReturnThis,
    setTargeting: noopReturnThis,
    defineSizeMapping: noopReturnThis,
    setCollapseEmptyDiv: noopReturnThis,
    clearTargeting: noopReturnThis,
    setConfig: noopReturnThis,
    getTargeting: () => [],
    getTargetingKeys: () => [],
    getSlotElementId: () => "",
    getAdUnitPath: () => ""
  }, noopReturnThis);
  const mockPubAds = withFallback({
    enableSingleRequest: noop,
    collapseEmptyDivs: noop,
    disableInitialLoad: noop,
    setTargeting: noopReturnThis,
    clearTargeting: noopReturnThis,
    refresh: noop,
    addEventListener: noopReturnThis,
    removeEventListener: noopReturnThis,
    getSlots: () => [],
    getTargeting: () => [],
    getTargetingKeys: () => []
  }, noopReturnThis);

  const gptBase = window.googletag || {};
  const pendingGptCmds = Array.isArray(gptBase.cmd) ? gptBase.cmd.slice() : [];
  Object.assign(gptBase, {
    apiReady: true,
    pubadsReady: true,
    cmd: Object.assign([], { push: (...fns) => { fns.forEach((fn) => safeAsync(fn)); return 0; } }),
    pubads: () => mockPubAds,
    defineSlot: () => mockSlot,
    defineOutOfPageSlot: () => mockSlot,
    enableServices: noop,
    display: noop,
    destroySlots: () => true,
    getConfig: () => ({}),
    setConfig: noop
  });
  window.googletag = withFallback(gptBase, noop);
  pendingGptCmds.forEach((fn) => safeAsync(fn));

  // ==========================================
  // 3. Header bidding (Prebid & Amazon TAM)
  // ==========================================
  const pbjsBase = window.pbjs || {};
  const pendingPbjs = Array.isArray(pbjsBase.que) ? pbjsBase.que.slice() : [];
  Object.assign(pbjsBase, {
    libLoaded: true,
    version: "",
    adUnits: [],
    bidderSettings: {},
    que: Object.assign([], { push: (...fns) => { fns.forEach((fn) => safeAsync(fn)); return 0; } }),
    requestBids: (opts) => {
      if (opts && typeof opts.bidsBackHandler === "function") safeAsync(opts.bidsBackHandler, {});
    },
    getConfig: (key) => (key === undefined ? {} : undefined),
    setConfig: noop,
    addAdUnits: noop,
    removeAdUnit: noop,
    getBidResponses: () => ({}),
    getHighestCpmBids: () => [],
    getAdserverTargeting: () => ({}),
    getUserIds: () => ({}),
    getEvents: () => [],
    onEvent: noop,
    offEvent: noop
  });
  window.pbjs = withFallback(pbjsBase, noop);
  pendingPbjs.forEach((fn) => safeAsync(fn));

  window.apstag = window.apstag || {
    init: noop,
    fetchBids: (opts, cb) => safeAsync(cb, []),
    setDisplayBids: noop
  };

  // ==========================================
  // 4. Native ad widgets (Taboola, Outbrain)
  // No Google IMA stub: creating window.google here breaks pages that
  // feature-detect it (e.g. Google Sign-In/Maps loaders), and a partial IMA
  // surface throws in players. Players already fall back to content when the
  // blocked IMA SDK fails to load.
  // ==========================================
  window._taboola = window._taboola || [];
  window._taboola.push = () => 0;
  window.OBR = window.OBR || { loaded: true, on: noop };

  // ==========================================
  // 5. BlockAdBlock / FuckAdBlock defusers
  // ==========================================
  const mockAntiAdblock = {
    onDetected: noopReturnThis,
    onNotDetected: function (fn) { safeAsync(fn); return this; },
    on: function (detected, fn) { if (!detected) safeAsync(fn); return this; },
    check: noop,
    emitEvent: noopReturnThis,
    clearEvent: noopReturnThis,
    setOption: noopReturnThis
  };
  pin(window, "blockAdBlock", mockAntiAdblock);
  pin(window, "fuckAdBlock", mockAntiAdblock);
  pin(window, "sniffAdBlock", mockAntiAdblock);

  // ==========================================
  // 6. Bait element spoofing (offsetHeight / getComputedStyle)
  // ==========================================
  const BAIT_CLASS_REGEX = /(?:^|\s)(?:adsbox|ad-banner|pub_300x250|ad-placement|banner-ad)(?:\s|$)/i;
  // Cheap pre-filter: every bait class contains "ad", so skip the regex otherwise.
  const isBait = (el) => {
    const cn = el && el.className;
    return typeof cn === "string" && cn.length > 1 && /ad/i.test(cn) && BAIT_CLASS_REGEX.test(cn);
  };

  const origGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function getComputedStyle(el, pseudoElt) {
    const style = origGetComputedStyle.call(window, el, pseudoElt);
    if (!isBait(el)) return style;
    return new Proxy(style, {
      get(target, prop) {
        if (prop === "display") return "block";
        if (prop === "visibility") return "visible";
        if (prop === "height") return "250px";
        if (prop === "width") return "300px";
        const v = target[prop];
        return typeof v === "function" ? v.bind(target) : v;
      }
    });
  };

  const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  if (origOffsetHeight && origOffsetHeight.get) {
    const origGet = origOffsetHeight.get;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      get() {
        return isBait(this) ? 250 : origGet.call(this);
      },
      configurable: true,
      enumerable: origOffsetHeight.enumerable
    });
  }

  // ==========================================
  // 7. Anti-adblock polling timer defuser
  // ==========================================
  // Only identifiers specific to anti-adblock scripts; a generic "adblock"
  // match would also kill unrelated timers that merely mention the word.
  const ADBLOCK_TIMER_REGEX = /\b(?:canRunAds|isAdBlockActive|fuckAdBlock|blockAdBlock|sniffAdBlock)\b/;
  const timerVerdicts = new WeakMap(); // fn -> boolean, so each callback is stringified once
  const isAdblockPoller = (fn) => {
    if (typeof fn !== "function") return false;
    let verdict = timerVerdicts.get(fn);
    if (verdict === undefined) {
      try {
        verdict = ADBLOCK_TIMER_REGEX.test(Function.prototype.toString.call(fn));
      } catch (_) {
        verdict = false;
      }
      timerVerdicts.set(fn, verdict);
    }
    return verdict;
  };

  const origSetInterval = window.setInterval;
  window.setInterval = function setInterval(fn, delay, ...args) {
    if (isAdblockPoller(fn)) {
      // Return a real (inert) handle so clearInterval() on it stays valid.
      return origSetInterval.call(window, noop, 2147483647);
    }
    return origSetInterval.call(window, fn, delay, ...args);
  };
})();
