/* Procedural Cosmetic Filtering & Scriptlet Injector */

const PROCEDURAL_COSMETIC_CSS = `
/* Standard Ad Element Selectors */
.adsbygoogle,
[id^="google_ads"],
[id^="div-gpt-ad"],
[class~="ad-banner"],
[class^="ad-banner-"],
[class~="ad-container"],
[class^="ad-container-"],
[class~="advertisement"],
.taboola,
.trc_related_container,
.outbrain,
.OUTBRAIN,
.revcontent,
.mgid,
amp-ad,
amp-embed[type="adsense"] {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* Procedural Relational Selectors (:has) - Collapses Empty Parent Containers */
div:has(> .adsbygoogle),
div:has(> [id^="google_ads"]),
div:has(> [id^="div-gpt-ad"]),
div:has(> iframe[src*="doubleclick.net"]),
div:has(> iframe[src*="googlesyndication.com"]),
div:has(> iframe[src*="adnxs.com"]),
div:has(> iframe[src*="rubiconproject.com"]),
aside:has(> .adsbygoogle),
aside:has(> [class~="ad-banner"]) {
  display: none !important;
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
}
`;

(function () {
  const STYLE_ID = "shieldblock-cosmetic-style";
  const SCRIPTLET_ID = "shieldblock-scriptlets";
  const currentHost = window.location.hostname;

  function injectScriptlets() {
    if (document.getElementById(SCRIPTLET_ID)) return;
    try {
      const script = document.createElement("script");
      script.id = SCRIPTLET_ID;
      script.src = chrome.runtime.getURL("content/scriptlets.js");
      (document.head || document.documentElement).appendChild(script);
      script.onload = () => script.remove();
      script.onerror = () => script.remove();
    } catch (e) {}
  }

  function applyProtections() {
    chrome.storage.local.get(
      ["masterEnabled", "cosmeticEnabled", "allowlistedDomains"],
      (data) => {
        if (chrome.runtime.lastError) return;

        const master = data.masterEnabled !== false;
        const cosmetic = data.cosmeticEnabled !== false;
        const allowlist = data.allowlistedDomains || [];
        const isAllowlisted = currentHost ? allowlist.includes(currentHost) : false;

        const styleEl = document.getElementById(STYLE_ID);

        if (master && !isAllowlisted) {
          // 1. Inject scriptlets (anti-adblock & tracker stubs)
          injectScriptlets();

          // 2. Inject procedural cosmetic CSS
          if (cosmetic) {
            if (!styleEl) {
              const style = document.createElement("style");
              style.id = STYLE_ID;
              style.textContent = PROCEDURAL_COSMETIC_CSS;
              (document.head || document.documentElement).appendChild(style);
            }
          } else if (styleEl) {
            styleEl.remove();
          }
        } else if (styleEl) {
          styleEl.remove();
        }
      }
    );
  }

  // Run at document_start
  applyProtections();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyProtections, { once: true });
  }

  // React to configuration changes dynamically
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.masterEnabled || changes.cosmeticEnabled || changes.allowlistedDomains) {
        applyProtections();
      }
    }
  });
})();
