# Approach Breakdown: Gemini's Targeted Domain-Blocking Design

This document analyzes the ad-blocking approach proposed by **Gemini**, which mirrors production blockers like uBlock Origin Lite and AdGuard MV3 by matching requests against curated lists of known ad and tracker domains.

---

## Summary of Design

Gemini's architecture focuses on **high-precision network filtering** powered by Chrome Manifest V3's `declarativeNetRequest` (DNR) engine:

1. **Targeted Domain Matching (`urlFilter: "||domain.com^"`)**: Blocks requests only when the target URL matches a known ad server, telemetry endpoint, or tracking domain—leaving benign third-party CDNs, payment gateways, fonts, and SSO providers untouched.
2. **Automated Filter-List Compilation (`scripts/build_rules.py`)**: A Python script ingests standard community blocklists (hosts files, Adblock Plus lists, plain domain lists), validates and deduplicates entries, and emits MV3 DNR JSON rulesets.
3. **MV3 Quota Chunking**: Automatically splits large compiled lists into chunks of `<= 30,000` rules per file so they conform to Chrome's static ruleset limits.

---

## Starter Domains & Upstream Data Sources

### High-Impact Starter Domains (`scripts/sample_hosts.txt`)
To provide immediate baseline protection without external downloads, the starter seed list targets major programmatic ad exchanges, native ad widgets, and session-replay/analytics vendors:

- **Ad Networks & Exchanges**: `doubleclick.net`, `googlesyndication.com`, `googleadservices.com`, `adnxs.com`, `rubiconproject.com`, `pubmatic.com`, `openx.net`, `criteo.com`, `amazon-adsystem.com`, `taboola.com`, `outbrain.com`, `mgid.com`, `revcontent.com`.
- **Trackers & Session Replay**: `google-analytics.com`, `googletagmanager.com`, `hotjar.com`, `fullstory.com`, `mouseflow.com`, `clarity.ms`, `mixpanel.com`, `segment.io`, `scorecardresearch.com`, `quantserve.com`, `pixel.facebook.com`, `analytics.tiktok.com`.

### Supported Upstream Filter Lists
`scripts/build_rules.py` is designed to compile full community-maintained blocklists into static MV3 JSON rulesets:

| Source | Format | Focus |
| :--- | :--- | :--- |
| **StevenBlack Hosts** | `0.0.0.0 domain` | Unified adware & malware hosts file |
| **EasyList (Domains)** | Hosts / ABP `\|\|domain^` | Primary display, banner, and video ad blocking |
| **EasyPrivacy (Domains)** | Hosts / ABP `\|\|domain^` | Analytics, telemetry, and cross-site trackers |
| **AdGuard DNS / HaGeZi / OISD** | Hosts / ABP `\|\|domain^` | Broad, low-false-positive multi-purpose ad & tracker blocking |

### Compiled Rule Structure
Each domain is compiled into a deterministic DNR rule scoped to common non-document sub-resource types:
```json
{
  "id": 1,
  "priority": 1,
  "action": { "type": "block" },
  "condition": {
    "urlFilter": "||ad.doubleclick.net^",
    "resourceTypes": [
      "script",
      "image",
      "xmlhttprequest",
      "sub_frame",
      "ping",
      "media",
      "websocket"
    ]
  }
}
```

---

## Chrome MV3 Quota Analysis

Chrome Manifest V3 places strict static and dynamic caps on `declarativeNetRequest` rulesets to guarantee browser performance:

- **30,000 Guaranteed Static Rules per Ruleset**: Each static JSON file declared under `declarative_net_request.rule_resources` is guaranteed up to 30,000 rules (`MAX_NUMBER_OF_STATIC_RULES` / guaranteed minimum).
- **Chunking Across Multiple Rulesets**: Large community lists (e.g., StevenBlack or OISD, which commonly exceed 50,000–150,000 domains) cannot fit in a single JSON file. `scripts/build_rules.py` uses `--max-rules-per-file 30000` to automatically emit `prefix_1.json`, `prefix_2.json`, etc., preserving unique sequential rule `id`s across chunks.
- **Native Engine Evaluation**: Once compiled, Chrome loads the static rulesets directly into C++ memory. Requests are matched in microseconds without waking a background Service Worker (`background.js`), avoiding MV3 service-worker lifecycle overhead.

---

## Advantages

- **High Precision & Compatibility**: Virtually zero false positives on legitimate third-party dependencies (Stripe, PayPal, Google/Apple SSO, Cloudflare Turnstile, Google Fonts, jsDelivr).
- **Industry-Standard Paradigm**: Follows the proven uBlock Origin / AdGuard domain-matching model backed by large open-source filter communities.
- **Scalable & Maintainable**: Updating ad coverage only requires re-running `scripts/build_rules.py` against fresh upstream lists rather than editing JSON by hand.
- **Low Runtime Overhead**: Static DNR rulesets run natively inside Chrome with negligible CPU and battery impact.

---

## Limitations (When Used Alone)

1. **No User Interface or Granular Toggles**:
   - A pure static DNR ruleset extension offers no popup UI to inspect blocked counts or toggle categories like ads vs. trackers independently.
2. **No Per-Site Allowlisting Out of the Box**:
   - Without a service worker managing `updateDynamicRules` (`allow` rules with higher `priority`), users cannot temporarily trust or unbreak a single website without disabling the entire extension.
3. **Leaves Empty Ad Placeholders (No Cosmetic Filtering)**:
   - Blocking a network request prevents an ad script or iframe from loading, but the host page's wrapper `<div>` (often styled with fixed width/height) remains visible as a blank box. Cosmetic CSS (`content/cosmetic.css`) is required to collapse those leftover frames.
4. **Depends on List Freshness**:
   - Newly rotated ad-serving domains are not blocked until upstream filter lists add them and the static rulesets are recompiled.

---

## Role in ShieldBlock

In **ShieldBlock**, Gemini's targeted DNR engine (`rules/ads.json`, `rules/trackers.json`, and `scripts/build_rules.py`) serves as the **core network-blocking layer**, while Claude's popup UX, dynamic per-site allowlisting, selective third-party cookie stripping, and cosmetic CSS filtering fill in the usability and visual-cleanup gaps.

