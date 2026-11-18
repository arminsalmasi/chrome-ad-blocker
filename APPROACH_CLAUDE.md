# Approach Breakdown: Claude's Blanket Third-Party Design

This document analyzes the original ad-blocking approach proposed by **Claude**, which prioritizes minimal configuration and broad third-party request/cookie restriction over curated domain blocklists.

---

## Summary of Design

Claude's architecture treats **all third-party network activity as untrusted by default** rather than maintaining lists of known ad and tracking domains:

1. **Blanket Third-Party Blocking (`domainType: "thirdParty"`)**: Blocks cross-origin sub-resources (scripts, frames, tracking pixels, XHRs) whenever the request host differs from the top-level site's domain.
2. **Third-Party Cookie Stripping**: Uses `declarativeNetRequest` `modifyHeaders` rules to strip `cookie` request headers and `set-cookie` response headers on all `thirdParty` requests.
3. **Manual Exception Allowlisting**: Relies on explicit `allow` rules or `excludedRequestDomains` for essential third-party infrastructure (e.g., `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`).
4. **User-Facing Controls**: Pairs the engine with a clean popup UI for global toggling and per-site allowlisting via dynamic DNR rules.

---

## Exact Configuration & Rule Definitions

In Claude's standalone design, network filtering is expressed with only a handful of static JSON rules instead of thousands of domain entries.

### 1. Blanket Third-Party Blocking Rule (Original Concept)
```json
{
  "id": 1,
  "priority": 1,
  "action": { "type": "block" },
  "condition": {
    "domainType": "thirdParty",
    "resourceTypes": ["script", "sub_frame", "xmlhttprequest", "ping", "image"]
  }
}
```

### 2. Third-Party Cookie & Set-Cookie Stripping Rule
*(Adapted with auth/payment exclusions in ShieldBlock's `rules/cookie_protection.json`)*:
```json
{
  "id": 1,
  "priority": 1,
  "action": {
    "type": "modifyHeaders",
    "requestHeaders": [
      { "header": "cookie", "operation": "remove" }
    ],
    "responseHeaders": [
      { "header": "set-cookie", "operation": "remove" }
    ]
  },
  "condition": {
    "domainType": "thirdParty",
    "excludedRequestDomains": [
      "accounts.google.com",
      "login.microsoftonline.com",
      "appleid.apple.com",
      "github.com",
      "api.stripe.com",
      "js.stripe.com",
      "paypal.com",
      "paypalobjects.com"
    ]
  }
}
```

### 3. Manual CDN Allowlist Rule (Example)
```json
{
  "id": 2,
  "priority": 10,
  "action": { "type": "allow" },
  "condition": {
    "requestDomains": [
      "cdn.jsdelivr.net",
      "cdnjs.cloudflare.com",
      "unpkg.com"
    ]
  }
}
```

---

## Advantages

- **Extreme Simplicity**: Requires only a few dozen lines of JSON rather than tens of thousands of filter rules.
- **Zero Build Pipeline**: No Python compiler, regex validation, or periodic list-syncing workflow is needed to ship or update the extension.
- **Zero-Day Tracker Protection**: Blocks newly registered or obscure tracking/ad domains immediately without waiting for upstream blocklist maintainers to catalog them.
- **Minimal Memory & Quota Footprint**: Uses almost none of Chrome MV3's 30,000-rule-per-ruleset static quota.

---

## Critical Flaws & Practical Pitfalls

Using `domainType: "thirdParty"` as a blanket block causes severe collateral damage across the modern web, where legitimate applications are distributed across multiple domains:

1. **Breaks Single Sign-On (SSO) & OAuth Flows**:
   - Federated login widgets and token exchanges (`accounts.google.com`, `appleid.apple.com`, `login.microsoftonline.com`, Auth0, Okta) operate across third-party domains and rely on third-party cookies or cross-origin scripts/frames.
2. **Breaks Payment Processors & Checkouts**:
   - Hosted checkout iframes and fraud-detection scripts from `js.stripe.com`, `api.stripe.com`, `paypal.com`, and `adyen.com` fail to load or submit transactions.
3. **Breaks Anti-Bot & CAPTCHA Challenges**:
   - Services like Cloudflare Turnstile, Google reCAPTCHA, and hCaptcha load scripts and iframes from external domains; blocking them locks users out of logins, forms, and protected websites.
4. **Breaks Embedded Video Players & Media CDNs**:
   - Streaming platforms and news sites frequently serve video streams and player JS from separate CDN domains (`cloudfront.net`, `akamaized.net`, `vimeo.com`, `youtube-nocookie.com`).
5. **Breaks Web Fonts, Stylesheets & UI Libraries**:
   - Sites loading assets from `fonts.googleapis.com`, `fonts.gstatic.com`, `use.fontawesome.com`, or `cdn.jsdelivr.net` render with broken layouts or missing icons unless every CDN is manually allowlisted.
6. **Misses First-Party / CNAME-Cloaked Ads**:
   - Ads served from first-party paths (e.g., `example.com/ads/...`) or CNAME-cloaked subdomains bypass `domainType: "thirdParty"` checks.

---

## Why It Is Insufficient on Its Own for Daily Browsing

While blanket third-party blocking is useful in strict, single-purpose browser profiles, it is **unusable as a standalone daily ad blocker**. The high false-positive rate forces users into constant troubleshooting—either manually curating an ever-growing CDN/API allowlist or toggling the blocker off entirely on major sites, which defeats the purpose of passive protection.

In **ShieldBlock**, Claude's blanket *network blocking* is replaced by Gemini's targeted domain blocklists, while Claude's **third-party cookie stripping** (with explicit auth/payment exclusions), **popup UX**, and **dynamic per-site allowlisting** are retained where they provide high privacy value without breaking the web.

