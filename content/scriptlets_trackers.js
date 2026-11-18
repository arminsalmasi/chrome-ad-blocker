// Analytics & pixel stubs.
// Registered by background.js with world: "MAIN", runAt: "document_start",
// allFrames: true — only while the Trackers & Telemetry module is enabled.
// Their job is to keep page flows working (callbacks fire, no ReferenceErrors)
// when the tracker's real library is blocked at the network layer.

(() => {
  "use strict";

  const FLAG = "__shieldblock_tracker_stubs";
  if (window[FLAG]) return;
  try {
    Object.defineProperty(window, FLAG, { value: true });
  } catch (_) {
    return;
  }

  const noop = () => {};
  const safeAsync = (fn) => {
    if (typeof fn === "function") {
      setTimeout(() => {
        try { fn(); } catch (_) {}
      }, 0);
    }
  };

  // Google Tag Manager dataLayer: fire eventCallback so links/forms waiting on it proceed.
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

  if (!window.ga) {
    window.ga = function (...args) {
      const lastArg = args[args.length - 1];
      if (lastArg && typeof lastArg === "object" && typeof lastArg.hitCallback === "function") {
        safeAsync(lastArg.hitCallback);
      }
    };
    window.ga.q = [];
    window.ga.l = Date.now();
    window.ga.getAll = () => [];
    window.ga.create = () => ({ get: noop, set: noop, send: noop });
  }

  // Social pixels
  if (!window.fbq) {
    window.fbq = function () {};
    window.fbq.loaded = true;
    window.fbq.version = "2.0";
    window.fbq.queue = [];
    window._fbq = window.fbq;
  }
  window.twq = window.twq || noop;
  window.lintrk = window.lintrk || noop;

  // Universal no-op: any property chain or call (mixpanel.people.set(...),
  // FS.getCurrentSessionURL(), ...) resolves to the same callable proxy, so
  // partially-known SDK surfaces never throw TypeErrors. `overrides` supplies
  // real behavior (callbacks) for specific top-level methods.
  const makeNoopApi = (overrides = {}) => {
    let proxy;
    const target = function () {};
    proxy = new Proxy(target, {
      get(_, prop) {
        if (Object.prototype.hasOwnProperty.call(overrides, prop)) return overrides[prop];
        if (prop === "then") return undefined; // never look like a Promise
        if (prop === Symbol.toPrimitive) return () => "";
        if (prop === "toString" || prop === "valueOf") return () => "";
        if (typeof prop === "symbol") return undefined;
        return proxy;
      },
      set: () => true,
      apply: () => proxy,
      construct: () => proxy
    });
    return proxy;
  };

  window.ttq = window.ttq || makeNoopApi();

  // Product analytics & session replay
  window.hj = window.hj || noop;
  window.FS = window.FS || makeNoopApi();
  window.mixpanel = window.mixpanel || makeNoopApi();
  // Segment: fire the trailing callback argument, whatever its position.
  const callLastFn = (...args) => {
    const cb = args.reverse().find((a) => typeof a === "function");
    safeAsync(cb);
  };
  window.analytics = window.analytics || makeNoopApi({
    track: callLastFn,
    page: callLastFn,
    identify: callLastFn,
    group: callLastFn,
    alias: callLastFn,
    ready: (cb) => safeAsync(cb)
  });
  window.clarity = window.clarity || noop;
  window.ym = window.ym || noop;
})();
