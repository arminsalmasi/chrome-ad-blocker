# ShieldBlock - High-Performance Ad & Tracker Blocker (Manifest V3)

**ShieldBlock** is a lightweight, privacy-focused Chrome Extension built on **Manifest V3 (MV3)**. It combines native `declarativeNetRequest` (DNR) domain filtering, procedural cosmetic CSS element collapsing, comprehensive anti-adblock scriptlet defusers, and dynamic per-site allowlisting.

---

## Key Features & Architecture

### 1. High-Performance Network Blocking (DNR Engine)
- **Zero-Overhead Native Evaluation**: Evaluates network requests directly within Chrome's native C++ engine via `declarativeNetRequest`.
- **Modular Static Rulesets**:
  - `rules/ads.json`: Major programmatic ad exchanges, banner networks, pop-under services, and video ad providers.
  - `rules/trackers.json`: Telemetry endpoints, analytics collectors, session-replay recorders, and disguised CNAME tracking subdomains.
  - `rules/cookie_protection.json`: Strips third-party `Cookie` and `Set-Cookie` headers while safeguarding federated SSO (Google, Microsoft, Apple, GitHub) and payment gateways (Stripe, PayPal).
- **Rule Chunking & Compiler**: Bundles `scripts/build_rules.py` to ingest standard hosts and Adblock Plus filter lists, enforce the 30,000-rules-per-ruleset MV3 quota, and output validated JSON rulesets.

### 2. Procedural Cosmetic Filtering (`content/cosmetic.js`)
- **Native Relational Selectors (`:has()`)**: Collapses empty parent containers surrounding blocked ad units (`div:has(> .adsbygoogle)`, `aside:has(> [class~="ad-banner"])`, `article:has(> .sponsored-tag)`).
- **Dynamic State Management**: Injects styles at `document_start` and removes them immediately if the site is allowlisted or cosmetic filtering is toggled off.

### 3. Scriptlet Stubs & Anti-Adblock Defusers (`content/scriptlets.js`)
Runs in the page's execution context (`world: "MAIN"`) at `document_start` to neutralize anti-adblock detection and prevent broken page workflows:
- **Header Bidding & Ad Stubs**: Mocks `adsbygoogle`, Google Publisher Tag (`googletag`), Prebid.js (`pbjs`), Amazon TAM (`apstag`), and Google IMA Video SDK (`google.ima`) with safe no-op callbacks.
- **Analytics Callback Safety**: Resolves `event_callback` (gtag), `hitCallback` (ga), and `eventCallback` (dataLayer) immediately so purchase flows and buttons never stall waiting on blocked network endpoints.
- **Canary & Bait Spoofing**: Locks `canRunAds = true`, `isAdBlockActive = false`, and defuses `blockAdBlock`/`fuckAdBlock`. Intercepts `getComputedStyle` and `offsetHeight` queries on bait element classes (`adsbox`, `ad-banner`, `pub_300x250`) to simulate non-zero element dimensions.
- **Timer & Modal Overrides**: Suppresses anti-adblock polling loops inside `setInterval` and automatically removes scroll-lock (`overflow: hidden`) on `body`/`html`.

### 4. Interactive Popup UI & Dynamic Allowlisting
- **Global Master Switch**: Enables or disables all protection layers simultaneously.
- **Per-Site Allowlist**: Generates dynamic DNR allow rules (`allowAllRequests` & `initiatorDomains`) with priority 9999 to unbreak sensitive sites in one click.
- **Granular Module Controls**: Independently toggle Ad Networks, Trackers & Telemetry, Third-Party Cookie Stripping, or Cosmetic Filtering.
- **Blocked Request Counter**: Displays live per-tab blocked request counts on the extension badge and inside the popup.

---

## Installation (Load Unpacked in Chrome)

1. Clone or download this repository.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the repository root directory.
5. Pin **ShieldBlock** to your Chrome toolbar.

---

## Extension Controls & Usage

Click the **ShieldBlock** toolbar icon to access:

| Control | Type | Description |
| :--- | :--- | :--- |
| **Master Toggle** | Header switch | Master switch toggling all DNR static rulesets and content scripts. |
| **Site Allowlist** | Domain card | Toggles dynamic allow rules (`priority: 9999`) for the active domain. |
| **Ad Networks** | Module | Controls `ruleset_ads` (`rules/ads.json`). |
| **Trackers & Telemetry** | Module | Controls `ruleset_trackers` (`rules/trackers.json`). |
| **Strip 3rd-Party Cookies** | Module | Controls `ruleset_cookies` (`rules/cookie_protection.json`). |
| **Cosmetic Filtering** | Module | Controls procedural `:has()` CSS injection and element collapse. |
| **Badge Counter** | Status badge | Shows real-time count of blocked sub-resources on the current page. |

---

## Filter-List Compiler (`scripts/build_rules.py`)

Compile community hosts or filter lists into chunked MV3 DNR rulesets:

```bash
# Compile from local sample lists
python3 scripts/build_rules.py -i scripts/sample_hosts.txt -o rules -p custom_blocklist

# Compile from upstream lists (e.g. StevenBlack, EasyList, AdGuard CNAME)
python3 scripts/build_rules.py \
  --input stevenblack \
  --input easyprivacy \
  --input cname_trackers \
  --output-dir rules \
  --prefix trackers \
  --max-rules-per-file 30000
```

---

## Repository Structure

```text
├── manifest.json                  # Manifest V3 configuration, permissions, ruleset declarations
├── background.js                  # Service worker: dynamic allowlist, ruleset syncing, badge counts
├── content/
│   ├── cosmetic.js                # Procedural CSS (:has) injector and dynamic style controller
│   └── scriptlets.js              # Comprehensive anti-adblock defusers & analytics stubs (MAIN world)
├── icons/
│   ├── icon16.png                 # Toolbar icon (16x16)
│   ├── icon32.png                 # High-DPI icon (32x32)
│   ├── icon48.png                 # Extensions management icon (48x48)
│   └── icon128.png                # Chrome Web Store icon (128x128)
├── popup/
│   ├── popup.html                 # Popup user interface
│   ├── popup.css                  # Dark-themed styling
│   └── popup.js                   # State synchronization and toggle event handlers
├── rules/
│   ├── ads.json                   # Static DNR rules for ad networks and programmatic exchanges
│   ├── trackers.json              # Static DNR rules for trackers, analytics, and disguised CNAMEs
│   └── cookie_protection.json     # DNR modifyHeaders rules stripping third-party cookies
├── scripts/
│   ├── build_rules.py             # Python compiler converting filter lists into chunked DNR rulesets
│   ├── sample_hosts.txt           # Starter seed list for ad networks and trackers
│   ├── sample_cname.txt           # Disguised CNAME tracker subdomain list
│   └── make_icons.py              # Icon generation utility
├── APPROACH_CLAUDE.md             # In-depth architectural analysis of Claude's blanket 3rd-party design
└── APPROACH_GEMINI.md             # In-depth architectural analysis of Gemini's targeted DNR design
```

---

## License

This project is licensed under the [MIT License](LICENSE).
